import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkQuota, consume, enforce, enforceTableCap, publicQuota } from '@/lib/usage';
import { negativeReviewAlert } from '@/lib/whatsapp';
import { enqueue } from '@/lib/queue';
import { systemLog } from '@/lib/logger';
import { payloadErrorResponse, readJsonLimited } from '@/lib/request';

const Body = z.object({
  api_key: z.string().min(10),
  source: z.enum(['google', 'trustpilot', 'tripadvisor', 'facebook', 'manual', 'places']),
  external_id: z.string().min(1).max(300),
  author_name: z.string().min(1).max(120),
  rating: z.number().min(1).max(5),
  text: z.string().max(4000).default(''),
  verified: z.boolean().default(false),
  /** Móvil del cliente (solo plan Business): dispara el WhatsApp post-venta. */
  customer_phone: z.string().max(25).optional(),
  order_id: z.string().max(100).optional(),
});

/**
 * Ingesta REAL de reseñas vía API pública (autenticada con la `api_key`
 * de cada empresa). Cada evento pasa por el motor de cuotas:
 *
 *   402 → suscripción sin acceso (impago / cancelada / suspendida)
 *   403 → la feature no está en el plan contratado
 *   429 → cuota mensual agotada (cabecera `Retry-After`)
 *   507 → tope de opiniones guardadas de la base de datos alcanzado
 *
 * Consumo: 1 unidad `reviews_ingested` (+1 `whatsapp_sent` si salta alerta).
 */
export async function POST(req: Request) {
  let rawBody: unknown;
  try { rawBody = await readJsonLimited(req, 262144); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos.', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, plan, subscription_status, suspended, settings')
    .eq('api_key', input.api_key)
    .single();
  if (!tenant) return NextResponse.json({ error: 'API key inválida.' }, { status: 401 });

  // Puerta única: suscripción + feature `publicApi` + cuota de reseñas.
  const gate = await enforce(admin, tenant.id, {
    metric: 'reviews',
    feature: 'publicApi',
    amount: 1,
    action: 'Ingesta de reseña por API',
  });
  if (!gate.ok) {
    await systemLog('warn', 'reviews.ingest', gate.error, { tenantId: tenant.id, code: gate.code });
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  // Tope de base de datos: purga las opiniones más antiguas si hace falta y
  // rechaza la escritura cuando la empresa ya está en su máximo (507).
  const storage = await enforceTableCap(admin, tenant.id, 'reviews');
  if (!storage.ok) {
    await systemLog('warn', 'reviews.ingest', storage.error, { tenantId: tenant.id, code: storage.code });
    return NextResponse.json(storage.body, { status: storage.status, headers: storage.headers });
  }

  const { error } = await admin.from('reviews').upsert(
    {
      tenant_id: tenant.id,
      source: input.source,
      external_id: input.external_id,
      author_name: input.author_name,
      rating: input.rating,
      text: input.text,
      is_verified: input.verified,
      flagged_private: input.rating <= 3,
    },
    { onConflict: 'tenant_id,source,external_id' },
  );
  if (error) return NextResponse.json({ error: 'No se pudo guardar la reseña.' }, { status: 500 });

  // Descuento ATÓMICO del evento (RPC `consume_quota` con fallback upsert).
  await consume(admin, tenant.id, 'reviews', 1);

  const settings = (tenant.settings as any) ?? {};
  let alertSent: { ok: boolean; error?: string; code?: string } = { ok: false };

  // Alerta ≤3★ al móvil del negocio (feature `whatsappAlerts`).
  // Se ENCOLA: sin QStash se envía en línea (mismo resultado en `alertSent`).
  if (input.rating <= 3 && settings.whatsapp_to) {
    try {
      const { queued, jobId } = await enqueue({
        type: 'whatsapp.send',
        tenantId: tenant.id,
        to: settings.whatsapp_to,
        body: negativeReviewAlert(tenant.name, input.author_name, input.rating, input.text),
        kind: 'alerta',
        feature: 'whatsappAlerts',
        action: 'Alerta de reseña ≤3★',
      });
      alertSent = queued ? { ok: true } : { ok: true };
      await systemLog('info', 'whatsapp.alert', `Alerta ≤3★ ${queued ? 'encolada' : 'enviada'} (${jobId})`, {
        tenantId: tenant.id,
      });
    } catch (e: any) {
      alertSent = { ok: false, error: String(e?.message ?? e).slice(0, 200), code: 'queue_error' };
      await systemLog('warn', 'whatsapp.alert', alertSent.error ?? 'Fallo al encolar alerta', {
        tenantId: tenant.id,
      });
    }
  }

  // WhatsApp post-venta al CLIENTE (solo si viene móvil + pedido: plan Business).
  let orderMessage: { ok: boolean; error?: string } = { ok: false };
  if (input.customer_phone && input.order_id) {
    try {
      await enqueue({
        type: 'store.delivered',
        tenantId: tenant.id,
        order: {
          orderId: input.order_id,
          customerName: input.author_name,
          customerPhone: input.customer_phone,
          provider: 'store',
        },
      });
      orderMessage = { ok: true };
    } catch (e: any) {
      orderMessage = { ok: false, error: String(e?.message ?? e).slice(0, 200) };
    }
  }

  const fresh = await checkQuota(admin, tenant.id);
  return NextResponse.json({
    ok: true,
    quota: publicQuota(fresh),
    alertSent,
    orderMessage,
  });
}
