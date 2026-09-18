import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addonLineItem, getStripe } from '@/lib/stripe';
import { ADDON_CATALOG, resolveAddonPack } from '@/lib/plans';
import { env, isStripeConfigured } from '@/lib/env';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkQuota, publicQuota } from '@/lib/usage';
import { systemLog } from '@/lib/logger';
import { currentCycle, type AddonPack, type AddonPackId } from '@/lib/plans';

export const dynamic = 'force-dynamic';

const MAX_QUANTITY = 10;

const Payload = z.object({
  tenantId: z.string().min(1),
  addons: z
    .array(
      z.object({
        key: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY).default(1),
      }),
    )
    .min(1)
    .max(4),
});

/**
 * ============================================================
 * Ampliaciones de cuota (v3.7.0 — modelo simplificado)
 * ============================================================
 *  · POST /api/stripe/addon  { tenantId, addons: [{ key, quantity }] }
 *      → { url, total } con UNA sesión de Checkout `mode: 'payment'` que
 *        incluye todas las recargas seleccionadas. El webhook las aplica al
 *        ciclo en curso (`tenants.extra_*` + ledger `addons`).
 *  · GET  /api/stripe/addon?packs=1 → catálogo + estado de Stripe.
 *  · GET  /api/stripe/addon?pack=extra_requests_1000&tenantId=… → redirect 303
 *        (atajo de un solo pack, útil en emails y soporte).
 *
 * No hay suscripciones paralelas: TODAS las ampliaciones son de pago único y
 * caducan al cerrar el ciclo mensual, así que no generan costes recurrentes
 * inesperados ni casos límite de Proration.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Catálogo público (lo usa el selector del panel y la landing).
  if (url.searchParams.get('packs')) {
    return NextResponse.json({
      ok: true,
      stripeConfigured: isStripeConfigured,
      cycle: currentCycle(),
      packs: ADDON_CATALOG.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        price: `${(p.priceCents / 100).toFixed(0)} €`,
        metric: p.metric,
        amount: p.amount,
        badge: p.badge ?? null,
        billing: 'one_time' as const,
      })),
    });
  }

  const tenantId = url.searchParams.get('tenantId') ?? '';
  const single = url.searchParams.get('pack') ?? url.searchParams.get('type') ?? '';
  const pack = resolveAddonPack(single);
  if (!pack) {
    return NextResponse.json(
      { error: 'Pack no válido. Usa ?packs=1 para ver el catálogo.', code: 'invalid_pack' },
      { status: 400 },
    );
  }

  const created = await createCheckout(tenantId, [{ pack, quantity: 1 }]);
  if (created instanceof NextResponse) return created;
  return NextResponse.redirect(created.url, { status: 303 });
}

export async function POST(req: Request) {
  const parsed = Payload.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Petición inválida: se espera { tenantId, addons: [{ key, quantity }] }.', code: 'bad_request' },
      { status: 400 },
    );
  }

  const items: Array<{ pack: AddonPack; quantity: number }> = [];
  for (const entry of parsed.data.addons) {
    const pack = resolveAddonPack(entry.key);
    if (!pack) continue;
    items.push({ pack, quantity: entry.quantity });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'Ninguna recarga válida en la selección.', code: 'invalid_pack' }, { status: 400 });
  }

  const created = await createCheckout(parsed.data.tenantId, items);
  if (created instanceof NextResponse) return created;

  return NextResponse.json({
    ok: true,
    url: created.url,
    total: `${(created.total / 100).toFixed(2)} €`,
    packs: items.map(({ pack, quantity }) => ({
      id: pack.id,
      quantity,
      metric: pack.metric,
      amount: pack.amount * quantity,
    })),
  });
}

/** Crea la sesión de Checkout (pago único) con todas las recargas elegidas. */
async function createCheckout(
  tenantId: string,
  items: Array<{ pack: AddonPack; quantity: number }>,
): Promise<{ url: string; total: number } | NextResponse> {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe no configurado.' }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase no configurado en el servidor.' }, { status: 503 });
  }

  // La empresa debe existir y pertenecer al usuario.
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, owner_id, owner_email, subscription_status, suspended, stripe_customer_id')
    .eq('id', tenantId)
    .single();
  if (!tenant?.id || (tenant.owner_id && tenant.owner_id !== user.id)) {
    return NextResponse.json({ error: 'Empresa no encontrada o sin permiso.' }, { status: 403 });
  }

  // Las recargas requieren suscripción activa (modelo 100% de pago).
  const check = await checkQuota(admin, tenantId);
  if (!check.hasAccess) {
    return NextResponse.json(
      {
        error: 'Necesitas un plan activo para ampliar la cuota.',
        code: 'no_subscription',
        checkoutUrl: '/bienvenido',
        quota: publicQuota(check),
      },
      { status: 402 },
    );
  }

  const cycle = currentCycle();
  const lines = items.map(({ pack, quantity }) => addonLineItem(pack, quantity));
  const total = items.reduce((a, { pack, quantity }) => a + pack.priceCents * quantity, 0);
  const summary = JSON.stringify(items.map(({ pack, quantity }) => ({ key: pack.id, quantity })));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(tenant.stripe_customer_id
        ? { customer: tenant.stripe_customer_id as string }
        : { customer_email: (tenant.owner_email as string) ?? user.email ?? undefined }),
      client_reference_id: tenantId,
      line_items: lines,
      metadata: {
        type: 'addon',
        tenantId,
        userId: user.id,
        cycle,
        addons: summary,
      },
      success_url: `${env.appUrl}/dashboard?tab=facturacion&addon=success`,
      cancel_url: `${env.appUrl}/dashboard?tab=facturacion&addon=canceled`,
    });

    await systemLog('info', 'stripe.addon', `Checkout de recargas creado (${summary})`, {
      tenantId,
      session: session.id,
      total,
    });

    return { url: session.url!, total };
  } catch (e: any) {
    await systemLog('error', 'stripe.addon', e?.message ?? 'Error creando el checkout de recargas', {
      tenantId,
    });
    return NextResponse.json(
      { error: e?.message ?? 'No se pudo abrir el pago de la recarga.', code: 'stripe_error' },
      { status: 502 },
    );
  }
}

/** Re-export del tipo para consumidores que lo importaban desde aquí. */
export type { AddonPackId };
