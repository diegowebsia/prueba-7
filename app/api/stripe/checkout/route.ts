import { NextResponse } from 'next/server';
import { getStripe, priceIdFor } from '@/lib/stripe';
import { TRIAL_DAYS } from '@/lib/plans';
import { env } from '@/lib/env';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { resolvePlan, type PlanId } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * Checkout de suscripción con PRUEBA GRATIS de 7 días.
 * Uso: GET /api/stripe/checkout?plan=pro|business
 *
 * Reglas comerciales (v3.9.0 — modelo 100% de pago, 2 planes):
 *  · Solo hay DOS planes de pago (Pro 29 €/mes y Business 79 €/mes). No existe
 *    plan gratuito: todo pasa por Stripe.
 *  · `payment_method_collection: 'always'` → la tarjeta es OBLIGATORIA para
 *    iniciar la prueba (evita cuentas fantasma y permite el cobro automático).
 *  · `trial_period_days: 7` → no se cobra nada durante la prueba.
 *  · `trial_settings.end_behavior.missing_payment_method: 'pause'` → si el
 *    cobro del día 8 no se completa, Stripe PAUSA la suscripción: el webhook
 *    la marca como no-activa y `middleware.ts` corta el acceso (panel + APIs).
 *  · Tras el pago, el webhook crea/activa el tenant y redirige a /bienvenido.
 */
export async function GET(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe no configurado.' }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('redirect', '/bienvenido');
    return NextResponse.redirect(login);
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get('plan');

  // Solo planes de pago (resolvePlan mapea cualquier alias legacy a pago).
  const plan: PlanId = resolvePlan(requested) === 'business' ? 'business' : 'pro';

  const price = priceIdFor(plan);
  if (!price) {
    return NextResponse.json(
      {
        error: 'El pago de este plan no está disponible temporalmente. Contacta con soporte.',
        code: 'missing_price_id',
      },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  let existingCustomer: string | undefined;
  let tenantId = '';
  if (admin) {
    const { data } = await admin
      .from('tenants')
      .select('id, stripe_customer_id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    existingCustomer = (data?.stripe_customer_id as string) ?? undefined;
    tenantId = (data?.id as string) ?? '';
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(existingCustomer ? { customer: existingCustomer } : { customer_email: user.email ?? undefined }),
      client_reference_id: tenantId || user.id,
      allow_promotion_codes: false,
      payment_method_collection: 'always',
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { userId: user.id, plan, priceId: price, tenantId },
        trial_settings: {
          end_behavior: { missing_payment_method: 'pause' },
        },
      },
      metadata: { tenantId, priceId: price, userId: user.id, plan },
      success_url: `${env.appUrl}/bienvenido?checkout=success`,
      cancel_url: `${env.appUrl}/bienvenido?checkout=canceled&plan=${plan}`,
    });

    await systemLog('info', 'stripe.checkout', `Checkout ${plan} (trial ${TRIAL_DAYS} días)`, {
      user: user.email,
      session: session.id,
    });

    return NextResponse.redirect(session.url!, { status: 303 });
  } catch (e: any) {
    await systemLog('error', 'stripe.checkout', e?.message ?? 'Error creando el checkout', {
      user: user.email,
    });
    return NextResponse.json(
      { error: e?.message ?? 'No se pudo abrir el checkout de Stripe.', code: 'stripe_error' },
      { status: 502 },
    );
  }
}
