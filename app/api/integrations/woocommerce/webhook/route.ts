import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWooHmac } from '@/lib/store';
import { enqueue } from '@/lib/queue';
import { systemLog } from '@/lib/logger';
import { decryptCredentials } from '@/lib/credentials';
import { payloadErrorResponse, readTextLimited } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * Webhook REAL de WooCommerce: WooCommerce → Settings → Advanced → Webhooks →
 * Add webhook (Topic: Order updated, Status: Active) con esta URL:
 * /api/integrations/woocommerce/webhook?tenant=TU_TENANT_ID
 *
 * El pedido se ENCOLA (`store.delivered`) y se responde 200 al instante
 * (worker en segundo plano; en línea sin QStash).
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
    .eq('provider', 'woocommerce')
    .single();
  const secret = decryptCredentials<{ webhook_secret?: string }>(integ?.credentials).webhook_secret;

  let raw: string;
  try { raw = await readTextLimited(req, 1048576); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (!verifyWooHmac(raw, secret ?? '', req.headers.get('x-wc-webhook-signature'))) {
    await systemLog('warn', 'store.webhook', 'Firma WooCommerce inválida', { tenantId: tenant.id });
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
  }

  let order: any;
  try {
    order = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (order.status !== 'completed') return NextResponse.json({ ok: true, skipped: 'not-completed' });

  const phone = order.billing?.phone ?? '';
  const name =
    [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ') || 'cliente';

  // Opt-in RGPD del checkout (meta `whatsapp_optin` del pedido).
  const { optin, optinText } = parseCheckoutOptin(order.meta_data);

  const { queued, jobId } = await enqueue({
    type: 'store.delivered',
    tenantId: tenant.id,
    order: {
      orderId: String(order.id ?? Date.now()),
      customerName: name,
      customerPhone: phone,
      provider: 'woocommerce',
      optin,
      optinText,
    },
  });

  return NextResponse.json({ ok: true, accepted: true, queued, jobId });
}

/** Lee el checkbox de WhatsApp de los meta_data del pedido. */
function parseCheckoutOptin(metaData: any): { optin?: boolean; optinText?: string } {
  if (!Array.isArray(metaData)) return {};
  const hit = metaData.find((m: any) => /whats?app/i.test(String(m?.key ?? '')));
  if (!hit) return {};
  const value = String(hit.value ?? '').trim().toLowerCase();
  const yes = ['true', '1', 'yes', 'sí', 'si', 'acepto', 'accepted'].includes(value);
  return { optin: yes, optinText: `WooCommerce meta «${hit.key}» = «${hit.value}»`.slice(0, 300) };
}
