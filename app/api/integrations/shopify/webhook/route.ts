import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyShopifyHmac } from '@/lib/store';
import { enqueue } from '@/lib/queue';
import { systemLog } from '@/lib/logger';
import { decryptCredentials } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

/**
 * Webhook REAL de Shopify: pega esta URL en
 * Settings → Notifications → Webhooks → Evento `Fulfillment events`.
 * URL: /api/integrations/shopify/webhook?tenant=TU_TENANT_ID
 *
 * El pedido se ENCOLA (`store.delivered`) y se responde 200 al instante:
 * el envío del WhatsApp (con opt-in RGPD, cuota y plantilla HSM) lo
 * procesa el worker en segundo plano. Sin QStash se ejecuta en línea.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const tenantId = new URL(req.url).searchParams.get('tenant');
  if (!tenantId) return NextResponse.json({ error: 'Tienda desconocida.' }, { status: 404 });
  const { data: tenant } = await admin.from('tenants')
    .select('id, name, slug, plan, subscription_status, suspended, settings').eq('id', tenantId).single();
  if (!tenant) return NextResponse.json({ error: 'Tienda desconocida.' }, { status: 404 });

  const { data: integ } = await admin
    .from('integrations')
    .select('credentials')
    .eq('tenant_id', tenant.id)
    .eq('provider', 'shopify')
    .single();
  const secret = decryptCredentials<{ webhook_secret?: string }>(integ?.credentials).webhook_secret;

  const raw = await req.text();
  if (!verifyShopifyHmac(raw, secret ?? '', req.headers.get('x-shopify-hmac-sha256'))) {
    await systemLog('warn', 'store.webhook', 'HMAC Shopify inválido', { tenantId: tenant.id });
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
  }

  let order: any;
  try {
    order = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const topic = req.headers.get('x-shopify-topic') ?? '';
  const fulfilled =
    topic.includes('fulfillments/create') ||
    order.fulfillment_status === 'fulfilled' ||
    (Array.isArray(order.fulfillments) && order.fulfillments.length > 0);
  if (!fulfilled) return NextResponse.json({ ok: true, skipped: 'not-fulfilled' });

  const phone =
    order.customer?.phone ?? order.shipping_address?.phone ?? order.billing_address?.phone ?? '';
  const name =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') ||
    order.shipping_address?.name ||
    'cliente';

  // Opt-in RGPD del checkout (checkbox → note_attributes `whatsapp_optin`).
  const { optin, optinText } = parseCheckoutOptin(order.note_attributes);

  const { queued, jobId } = await enqueue({
    type: 'store.delivered',
    tenantId: tenant.id,
    order: {
      orderId: String(order.id ?? order.name ?? Date.now()),
      customerName: name,
      customerPhone: phone,
      provider: 'shopify',
      optin,
      optinText,
    },
  });

  // 200 + estado informativo: la cola de reintentos de Shopify no se satura
  // y el resultado (cuota, plan, opt-in…) queda visible en el panel/logs.
  return NextResponse.json({ ok: true, accepted: true, queued, jobId });
}

/** Lee el checkbox de WhatsApp de los note_attributes del pedido. */
function parseCheckoutOptin(noteAttributes: any): { optin?: boolean; optinText?: string } {
  if (!Array.isArray(noteAttributes)) return {};
  const hit = noteAttributes.find((a: any) => /whats?app/i.test(String(a?.name ?? '')));
  if (!hit) return {};
  const value = String(hit.value ?? '').trim().toLowerCase();
  const yes = ['true', '1', 'yes', 'sí', 'si', 'acepto', 'accepted'].includes(value);
  return { optin: yes, optinText: `Shopify note_attribute «${hit.name}» = «${hit.value}»`.slice(0, 300) };
}
