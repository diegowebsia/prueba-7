import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addonPackFromPriceId, getStripe, planFromPriceId } from '@/lib/stripe';
import { currentCycle, resolveAddonPack, type AddonPack, type PlanId } from '@/lib/plans';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { sendMail } from '@/lib/mail';
import { requireSuperAdmin } from '@/lib/auth';
import { payloadErrorResponse, readTextLimited } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * Webhook de Stripe — FUENTE DE VERDAD del estado comercial
 * ============================================================
 * Modelo 100% DE PAGO v3.9.0 (2 planes: Pro / Business, sin plan gratuito):
 *
 *   · checkout.session.completed  → alta de suscripción Pro o Business
 *                                   (trial 7 días) o compra de una recarga.
 *   · invoice.payment_succeeded   → cobro correcto: refresca el estado de la
 *                                   suscripción y aplica las recargas facturadas.
 *   · customer.subscription.updated / deleted → cambio de plan y bajas.
 *                                   La baja marca INMEDIATAMENTE
 *                                   `subscription_status = 'inactive'`.
 *   · customer.subscription.trial_will_end    → aviso por email 3 días antes.
 *   · invoice.payment_failed      → `past_due` INMEDIATO: el middleware y cada
 *                                   API cortan el acceso (panel + 402).
 *
 * Ya NO existen suscripciones paralelas de add-ons, cuotas «ilimitadas» ni
 * packs de localización: las ampliaciones son SIEMPRE de pago único y suman
 * capacidad al ciclo en curso (`tenants.extra_*` + ledger `addons`).
 */

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

/** Eventos que el endpoint procesa (y que hay que activar en Stripe). */
const STRIPE_EVENTS = [
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
] as const;

/**
 * Diagnóstico del endpoint (uso interno, sin secretos).
 * Permite comprobar de un vistazo que el webhook está listo tras desplegar:
 *
 *   GET /api/stripe/webhook → { ok, configured, events: [...], prices: {...} }
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return NextResponse.json({ error: 'Acceso denegado.' }, { status: guard.status });

  return NextResponse.json({
    ok: true,
    configured: Boolean(getStripe() && env.stripeWebhookSecret),
    signatureHeader: 'stripe-signature',
    mode: env.stripeSecretKey.startsWith('sk_live_') ? 'live' : env.stripeSecretKey ? 'test' : 'sin-clave',
    events: STRIPE_EVENTS,
    prices: {
      pro: Boolean(env.stripePricePro),
      business: Boolean(env.stripePriceBusiness),
      addons: {
        requests: Boolean(env.stripePriceAddonRequests),
        reviews: Boolean(env.stripePriceAddonReviews),
        ai: Boolean(env.stripePriceAddonAi),
        syncs: Boolean(env.stripePriceAddonSyncs),
      },
    },
    hints: [
      'Stripe → Developers → Webhooks: la URL debe ser https://tu-dominio.com/api/stripe/webhook (HTTPS).',
      'El signing secret (whsec_…) de cada endpoint es DISTINTO en test y en live.',
      'Si el webhook falla con 400: firma inválida (secreto cambiado o body modificado por un proxy).',
      'Si el webhook falla con 500: revisa los logs del panel interno (fuente stripe.webhook).',
      'Un evento se puede reenviar desde Stripe → Webhooks → intentos; el proceso es idempotente.',
    ],
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: 'Stripe no configurado en el servidor.' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Sin firma.' }, { status: 400 });

  let rawBody: string;
  try { rawBody = await readTextLimited(req, 1024 * 1024); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.stripeWebhookSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'firma inválida';
    await systemLog('error', 'stripe.webhook', `Firma inválida: ${message}`);
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Base de datos no configurada.' }, { status: 503 });
  const { data: claimed, error: claimError } = await admin.rpc('claim_webhook_event', {
    p_provider: 'stripe', p_event_id: event.id, p_event_type: event.type,
  });
  if (claimError) return NextResponse.json({ error: 'No se pudo reclamar el evento.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });

  await systemLog('info', 'stripe.webhook', `Evento recibido: ${event.type}`, { id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'payment' || session.metadata?.type === 'addon') {
          await applyAddonPurchase(session);
        } else {
          await applyCheckoutCompleted(stripe, session);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        await applyInvoicePaid(stripe, event.data.object as Stripe.Invoice);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscriptionChange(stripe, sub, event.type === 'customer.subscription.deleted');
        break;
      }
      case 'customer.subscription.trial_will_end': {
        await applyTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.payment_failed': {
        await applyPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'error desconocido';
    await admin.rpc('fail_webhook_event', { p_provider: 'stripe', p_event_id: event.id, p_error: message });
    await systemLog('error', 'stripe.webhook', `Error procesando ${event.type}: ${message}`);
    return NextResponse.json({ error: 'Error interno procesando el evento.' }, { status: 500 });
  }

  const { error: finishError } = await admin.rpc('finish_webhook_event', {
    p_provider: 'stripe', p_event_id: event.id,
  });
  if (finishError) return NextResponse.json({ error: 'Evento procesado pero no finalizado.' }, { status: 500 });
  return NextResponse.json({ received: true });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'negocio'
  );
}

/**
 * Mapea el estado de Stripe al campo `subscription_status` del tenant.
 * Valores con acceso: solo `active` y `trialing` (vigente).
 * Sin acceso: `past_due` (impago), `inactive` (cancelada/finalizada),
 * `paused` (pausada por Stripe al fallar el cobro del día 8), `none`.
 */
function mapStripeStatus(s: Stripe.Subscription.Status): string {
  if (s === 'active') return 'active';
  if (s === 'trialing') return 'trialing';
  if (s === 'past_due') return 'past_due';
  if (s === 'incomplete') return 'past_due';
  if (s === 'paused') return 'paused';
  if (s === 'canceled' || s === 'unpaid' || s === 'incomplete_expired') return 'inactive';
  return 'none';
}

/** Plan (`pro`/`business`) de una suscripción o sesión de Checkout. */
function resolveSubPlan(priceId?: string | null, metaPlan?: string | null): PlanId {
  const byPrice = planFromPriceId(priceId);
  if (byPrice) return byPrice;
  if (metaPlan === 'business') return 'business';
  return 'pro';
}

/* ------------------------------------------------------------------ */
/* Ampliaciones (pago único por ciclo)                                 */
/* ------------------------------------------------------------------ */

type AddonItem = { pack: AddonPack; quantity: number };

/** Extrae el key de la ampliación desde el metadata del producto (price_data inline). */
function productMetaAddon(price: Stripe.Price | { product?: unknown } | null | undefined): string | null {
  const product = (price as any)?.product;
  if (typeof product === 'object' && product) return (product as any).metadata?.addon ?? null;
  return null;
}

/** Mapea una línea de Checkout/factura a un pack del catálogo. */
function packFromLine(line: {
  price?: Stripe.Price | { id?: string | null; product?: unknown } | null | string;
}): AddonPack | null {
  const price = line.price as any;
  if (!price) return null;
  if (typeof price.id === 'string' && addonPackFromPriceId(price.id)) return addonPackFromPriceId(price.id)!;
  const metaAddon = productMetaAddon(price);
  return metaAddon ? (resolveAddonPack(metaAddon) ?? null) : null;
}

/** Líneas de ampliación compradas en una sesión de Checkout. */
function sessionAddonItems(session: Stripe.Checkout.Session): AddonItem[] {
  let metaItems: Array<{ key: string; quantity: number }> = [];
  try {
    const raw = (session.metadata as Record<string, string> | null)?.addons;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        metaItems = parsed
          .filter((x: any) => x && typeof x.key === 'string')
          .map((x: any) => ({
            key: String(x.key),
            quantity: Math.max(1, Math.min(10, Number(x.quantity) || 1)),
          }));
      }
    }
  } catch {
    /* metadata corrupta → nos apoyamos en el catálogo */
  }

  const items: AddonItem[] = [];
  for (const m of metaItems) {
    const pack = resolveAddonPack(m.key);
    if (pack) items.push({ pack, quantity: m.quantity });
  }

  // Fallback: sesiones creadas sin metadata (o reintentos antiguos).
  if (items.length === 0) {
    const lines = (session as unknown as { display_items?: Array<{ quantity?: number | null; price?: any }> })
      .display_items;
    for (const line of lines ?? []) {
      const pack = packFromLine(line);
      if (!pack) continue;
      items.push({ pack, quantity: Math.max(1, Math.min(10, Number(line.quantity ?? 1) || 1)) });
    }
  }
  return items;
}

/** Líneas de ampliación de una factura (compatibilidad con Stripe Billing). */
function invoiceAddonItems(invoice: Stripe.Invoice): AddonItem[] {
  const out: AddonItem[] = [];
  for (const line of (invoice.lines?.data ?? []) as Stripe.InvoiceLineItem[]) {
    const pack = packFromLine(line as any);
    if (!pack) continue;
    out.push({ pack, quantity: Math.max(1, Math.min(10, Number(line.quantity ?? 1) || 1)) });
  }
  return out;
}

/** Capacidad total aportada por un grupo de líneas. */
function aggregateAddonItems(items: AddonItem[]) {
  const totals = { requests: 0, reviews: 0, ai: 0, syncs: 0, units: 0 };
  for (const { pack, quantity } of items) {
    totals.units += quantity;
    totals[pack.metric] += pack.amount * quantity;
  }
  return totals;
}

/* ------------------------------------------------------------------ */
/* Suscripción base (trial 7 días con tarjeta)                         */
/* ------------------------------------------------------------------ */

async function applyCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  if (!admin) return;

  const userId = (session.metadata?.userId as string | undefined) ?? null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const customerId = (session.customer as string) ?? null;
  const subscriptionId = (session.subscription as string) ?? null;
  if (!email) return;

  let plan = resolveSubPlan(session.metadata?.priceId, session.metadata?.plan);
  let status = 'active';
  let trialEndsAt: string | null = null;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      plan = resolveSubPlan(sub.items.data[0]?.price?.id, (sub.metadata?.plan as string) ?? null);
      const inTrial = sub.trial_end != null && sub.trial_end * 1000 > Date.now();
      status = inTrial ? 'trialing' : mapStripeStatus(sub.status);
      trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
    } catch {
      /* seguimos con los valores por defecto */
    }
  }

  const tenant = await findTenant(admin, userId, email);

  if (tenant) {
    await admin
      .from('tenants')
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan,
        subscription_status: status,
        trial_ends_at: trialEndsAt,
        suspended: false,
        ...(userId ? { owner_id: userId } : {}),
      })
      .eq('id', tenant.id);
    if (userId) {
      await admin
        .from('memberships')
        .upsert(
          { tenant_id: tenant.id, user_id: userId, role: 'owner' },
          { onConflict: 'tenant_id,user_id' },
        );
    }
    await systemLog('info', 'stripe.webhook', `Tenant actualizado a ${plan}/${status}`, {
      tenantId: tenant.id,
    });
    return;
  }

  const baseName = email.split('@')[0] ?? 'Mi negocio';
  const { data: created, error } = await admin
    .from('tenants')
    .insert({
      name: `Negocio de ${baseName}`,
      slug: `${slugify(baseName)}-${Date.now().toString(36)}`,
      owner_id: userId,
      owner_email: email,
      plan,
      subscription_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      trial_ends_at: trialEndsAt,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(`No se pudo crear el tenant: ${error?.message}`);
  if (userId) {
    await admin.from('memberships').insert({ tenant_id: created.id, user_id: userId, role: 'owner' });
  }
  await systemLog('info', 'stripe.webhook', `Tenant auto-creado para ${email} (${plan}/${status})`, {
    tenantId: created.id,
  });
}

async function findTenant(
  admin: AdminClient,
  userId: string | null,
  email: string,
): Promise<{ id: string } | null> {
  if (userId) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (data?.id) return { id: data.id as string };
  }
  const { data } = await admin
    .from('tenants')
    .select('id')
    .eq('owner_email', email)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.id ? { id: data.id as string } : null;
}

/* ------------------------------------------------------------------ */
/* Recargas de cuota (pago único)                                      */
/* ------------------------------------------------------------------ */

async function applyAddonPurchase(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  if (!admin) return;

  const tenantId = session.metadata?.tenantId ?? session.client_reference_id ?? null;
  if (!tenantId) {
    await systemLog('warn', 'stripe.addon', 'Checkout de recarga sin tenantId en metadata', {
      session: session.id,
    });
    return;
  }

  const items = sessionAddonItems(session);
  if (items.length === 0) {
    await systemLog('warn', 'stripe.addon', 'Checkout de recarga sin líneas reconocibles', {
      session: session.id,
    });
    return;
  }

  await grantAddon(admin, {
    tenantId,
    items,
    paymentId: session.id,
    invoiceId: (session.invoice as string | null) ?? null,
    cycle: session.metadata?.cycle ?? currentCycle(),
    totalCents: session.amount_total ?? null,
  });
}

/** Factura pagada: aplica recargas facturadas y refresca el estado de la suscripción. */
async function applyInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice) {
  const admin = createAdminClient();
  if (!admin) return;

  const items = invoiceAddonItems(invoice);
  if (items.length > 0) {
    const tenantId = await tenantIdFromInvoice(admin, stripe, invoice);
    if (tenantId) {
      await grantAddon(admin, {
        tenantId,
        items,
        paymentId: (invoice.payment_intent as string | null) ?? invoice.id,
        invoiceId: invoice.id,
        cycle: currentCycle(),
        totalCents: invoice.amount_paid ?? null,
      });
    } else {
      await systemLog('warn', 'stripe.addon', 'Factura de recarga sin empresa asociada', {
        invoice: invoice.id,
      });
    }
  }

  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id ?? null);
  const customerId = (invoice.customer as string | null) ?? null;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscriptionChange(stripe, sub, false);
    } catch {
      if (customerId) {
        await admin
          .from('tenants')
          .update({ subscription_status: 'active', suspended: false })
          .eq('stripe_customer_id', customerId);
      }
    }
  } else if (customerId) {
    await admin
      .from('tenants')
      .update({ subscription_status: 'active', suspended: false })
      .eq('stripe_customer_id', customerId);
  }
}

async function tenantIdFromInvoice(
  admin: AdminClient,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const metaTenant = (invoice.metadata as Record<string, string> | null)?.tenantId;
  if (metaTenant) return metaTenant;

  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription?.id ?? null);
  if (subscriptionId) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .limit(1)
      .single();
    if (data?.id) return data.id as string;
  }
  const customerId = (invoice.customer as string | null) ?? null;
  if (customerId) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .single();
    if (data?.id) return data.id as string;
  }
  if (typeof invoice.payment_intent === 'string' && invoice.payment_intent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(invoice.payment_intent);
      const t = pi.metadata?.tenantId;
      if (t) return t;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Suma la capacidad comprada al ciclo en curso:
 *  · Ledger `addons` (una fila por línea, auditable e idempotente).
 *  · Campos rápidos `tenants.extra_*` (los lee `lib/usage.ts`).
 * Mapeo de columnas del ledger (compatibilidad con v3.5):
 *   requests → `whatsapp` · syncs → `events` · reviews → `reviews` · ai → `ai`.
 */
async function grantAddon(
  admin: AdminClient,
  input: {
    tenantId: string;
    items: AddonItem[];
    paymentId: string;
    invoiceId: string | null;
    cycle: string;
    totalCents: number | null;
  },
) {
  const { tenantId, items, paymentId, invoiceId, cycle, totalCents } = input;

  const totals = aggregateAddonItems(items);
  const unitCents = totalCents && totalCents > 0 && totals.units > 0 ? Math.round(totalCents / totals.units) : null;
  const rows = Array.from(new Map(items.map((item) => [item.pack.id, item])).values()).map(({ pack, quantity }) => ({
    pack: pack.id,
    events: pack.metric === 'syncs' ? pack.amount * quantity : 0,
    reviews: pack.metric === 'reviews' ? pack.amount * quantity : 0,
    ai: pack.metric === 'ai' ? pack.amount * quantity : 0,
    whatsapp: pack.metric === 'requests' ? pack.amount * quantity : 0,
    quantity,
  }));
  const { data: applied, error: grantError } = await admin.rpc('apply_addon_purchase', {
    p_tenant_id: tenantId, p_payment_id: paymentId, p_invoice_id: invoiceId,
    p_cycle: cycle, p_total_cents: unitCents, p_items: rows,
    p_requests: totals.requests, p_reviews: totals.reviews, p_ai: totals.ai, p_syncs: totals.syncs,
  });
  if (grantError) throw new Error(`No se pudo aplicar la recarga: ${grantError.message}`);
  if (!applied) {
    await systemLog('info', 'stripe.addon', 'Recarga ya aplicada (evento reintentado)', { tenantId, paymentId });
    return;
  }
  const { data: tenant, error: tenantError } = await admin.from('tenants')
    .select('owner_email, name').eq('id', tenantId).single();
  if (tenantError) throw tenantError;

  const label = items.map((i) => `${i.pack.name}×${i.quantity}`).join(' + ');
  await systemLog('info', 'stripe.addon', `Recarga aplicada: ${label} · ciclo ${cycle}`, {
    tenantId,
    paymentId,
  });

  if (tenant?.owner_email) {
    const summary = [
      totals.requests > 0 ? `+${totals.requests.toLocaleString('es-ES')} peticiones` : '',
      totals.reviews > 0 ? `+${totals.reviews.toLocaleString('es-ES')} opiniones` : '',
      totals.ai > 0 ? `+${totals.ai.toLocaleString('es-ES')} respuestas IA` : '',
      totals.syncs > 0 ? `+${totals.syncs.toLocaleString('es-ES')} sincronizaciones` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    await sendMail({
      to: tenant.owner_email,
      subject: `Ampliación confirmada · ${label}`,
      text:
        `Hola,\n\nHemos recibido tu pago: ${label} para ${tenant.name ?? 'tu empresa'}.\n` +
        `Capacidad activada: ${summary}. Ya está disponible en tu panel.\n\n` +
        `Puedes ver el consumo actualizado en tu panel → «Facturación y cuota».\n\n` +
        `Gracias por confiar en ReviewFlow AI.`,
      html:
        `<p>Hola,</p><p>Hemos recibido tu pago: <strong>${label}</strong> para ` +
        `<strong>${tenant.name ?? 'tu empresa'}</strong>.</p>` +
        `<p>Capacidad activada: <strong>${summary}</strong>. Ya está disponible en tu panel.</p>` +
        `<p>Puedes ver el consumo actualizado en tu panel → <em>Facturación y cuota</em>.</p>` +
        `<p>Gracias por confiar en ReviewFlow AI.</p>`,
    }).catch(() => ({ sent: false, message: 'mail failed' }));
  }
}

/* ------------------------------------------------------------------ */
/* Cambios de suscripción y cortes de acceso                           */
/* ------------------------------------------------------------------ */

async function applySubscriptionChange(stripe: Stripe, sub: Stripe.Subscription, deleted: boolean) {
  const admin = createAdminClient();
  if (!admin) return;

  const priceIds = sub.items.data.map((i) => i.price?.id).filter(Boolean) as string[];
  const basePrice = priceIds.find((id) => !addonPackFromPriceId(id)) ?? priceIds[0];
  const inTrial = !deleted && sub.trial_end != null && sub.trial_end * 1000 > Date.now();
  // CORTE INMEDIATO: la baja marca `inactive` en el acto (sin acceso).
  const status = deleted ? 'inactive' : inTrial ? 'trialing' : mapStripeStatus(sub.status);

  const patch: Record<string, unknown> = {
    subscription_status: status,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };

  // El plan solo se cambia si la línea base es un plan conocido. Si ya no hay
  // suscripción de pago (baja), se CONSERVA el último plan de pago contratado
  // (no hay plan gratuito al que volver): al reactivar se restaura tal cual.
  const plan = resolveSubPlan(basePrice, (sub.metadata?.plan as string) ?? null);
  if (deleted) {
    patch.stripe_subscription_id = null;
  } else if (basePrice && planFromPriceId(basePrice)) {
    patch.plan = plan;
  }

  const { error } = await admin.from('tenants').update(patch).eq('stripe_subscription_id', sub.id);
  if (error) {
    await systemLog('error', 'stripe.webhook', `No se pudo actualizar ${sub.id}: ${error.message}`);
    // Fallback por customer id (por si la suscripción se recreó).
    const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null);
    if (customerId) {
      await admin.from('tenants').update(patch).eq('stripe_customer_id', customerId);
    }
  }

  if (deleted || status === 'past_due' || status === 'inactive' || status === 'paused') {
    await systemLog('warn', 'stripe.webhook', `Acceso cortado (${status})`, { subscription: sub.id });
  } else {
    await systemLog('info', 'stripe.webhook', `Suscripción ${sub.id} → ${status}`, {
      subscription: sub.id,
    });
  }
}

/** 3 días antes del fin del trial: email recordatorio (cero sorpresas = menos disputas). */
async function applyTrialWillEnd(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data } = await admin
    .from('tenants')
    .select('owner_email, name')
    .eq('stripe_subscription_id', sub.id)
    .single();
  if (!data?.owner_email) return;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString('es-ES') : '';
  await sendMail({
    to: data.owner_email,
    subject: `Tu prueba de ReviewFlow AI termina el ${trialEnd}`,
    text:
      `Hola,\n\nTu prueba gratis de ${data.name} termina el ${trialEnd}. Si no haces nada, empezará tu suscripción. ` +
      `Puedes cancelar cuando quieras desde tu panel (Facturación y cuota → Portal de Stripe).\n\nGracias por probar ReviewFlow AI.`,
    html:
      `<p>Hola,</p><p>Tu prueba gratis de <strong>${data.name}</strong> termina el <strong>${trialEnd}</strong>. ` +
      `Si no haces nada, empezará tu suscripción. Puedes cancelar cuando quieras desde tu panel (Facturación y cuota → Portal de Stripe).</p>` +
      `<p>Gracias por probar ReviewFlow AI.</p>`,
  }).catch(() => ({ sent: false, message: 'mail failed' }));
}

/**
 * Pago fallido → `past_due` INMEDIATO en la BD (bloquea panel y APIs).
 * Busca el tenant por suscripción (más preciso) y si no, por customer.
 */
async function applyPaymentFailed(invoice: Stripe.Invoice) {
  const admin = createAdminClient();
  if (!admin) return;
  const customerId = invoice.customer as string | null;
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : ((invoice.subscription as { id?: string } | null)?.id ?? null);
  if (!customerId && !subscriptionId) return;

  let tenantId: string | null = null;
  if (subscriptionId) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .limit(1)
      .single();
    tenantId = (data?.id as string) ?? null;
  }
  if (!tenantId && customerId) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .limit(1)
      .single();
    tenantId = (data?.id as string) ?? null;
  }
  if (!tenantId) {
    await systemLog('warn', 'stripe.webhook', 'Pago fallido sin empresa asociada', {
      customer: customerId,
      invoice: invoice.id,
    });
    return;
  }

  // Corte inmediato: el middleware y `enforce()` leen este campo en cada petición.
  const { error } = await admin
    .from('tenants')
    .update({ subscription_status: 'past_due' })
    .eq('id', tenantId);
  if (error) {
    await systemLog('error', 'stripe.webhook', `No se pudo marcar past_due: ${error.message}`, {
      tenantId,
    });
    return;
  }
  await systemLog('warn', 'stripe.webhook', 'Pago fallido → past_due (acceso bloqueado)', {
    tenantId,
    customer: customerId,
    invoice: invoice.id,
  });
}
