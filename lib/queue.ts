/**
 * ============================================================
 * Gestor de colas en segundo plano (Upstash QStash)
 * ============================================================
 * Los trabajos pesados o limitados por rate-limit salen del camino
 * síncrono de la petición y se procesan de forma asíncrona:
 *
 *   · `store.delivered`  → pedido entregado → WhatsApp al cliente.
 *   · `whatsapp.send`    → alertas/notificaciones WhatsApp (plantilla o texto).
 *   · `sync.provider`    → sincronización Google/Places/Trustpilot/TripAdvisor.
 *   · `ai.generate`      → borrador IA (OpenAI) con resultado consultable.
 *   · `notify.owner`     → aviso interno al dueño (email + WhatsApp opcional).
 *
 * Configuración (https://console.upstash.com → QStash):
 *   QSTASH_TOKEN                 → publicar trabajos.
 *   QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY → verificar firma
 *   del worker (`/api/queue/worker`).
 *
 * SIN QStash la plataforma funciona IGUAL: `enqueue()` ejecuta el trabajo
 * en línea (inline) por el mismo código (`dispatchJob`). La cola solo añade
 * desacoplo, reintentos con backoff y control de caudal (flow control) para
 * no superar los rate limits de Meta/OpenAI/proveedores de reseñas.
 */

import { Client as QStashClient } from '@upstash/qstash';
import { z } from 'zod';
import type { AdminLike } from '@/lib/usage';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { sendMail } from '@/lib/mail';
import { generateReplyForTenant } from '@/lib/ai';
import { handleDeliveredOrder, type DeliveredOrder } from '@/lib/store';
import {
  sendWhatsappForTenant,
  type WhatsappTemplatePayload,
} from '@/lib/whatsapp';
import { syncGoogleBusinessForTenant, syncGooglePlacesForTenant } from '@/lib/google';
import { syncTrustpilotForTenant } from '@/lib/trustpilot';
import { syncTripadvisorForTenant } from '@/lib/tripadvisor';

/* ------------------------------------------------------------------ */
/* Tipos de trabajo                                                    */
/* ------------------------------------------------------------------ */

const TemplateSchema = z.object({
  name: z.string().min(1).max(100),
  lang: z.string().min(2).max(8).optional(),
  bodyParams: z.array(z.string().max(1024)).max(10),
  headerParams: z.array(z.string().max(1024)).max(5).optional(),
});

export const QueueJobSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('whatsapp.send'),
    tenantId: z.string().uuid(),
    to: z.string().min(5).max(25),
    body: z.string().min(1).max(4000),
    kind: z.enum(['alerta', 'pedido', 'prueba', 'campana']).default('alerta'),
    feature: z.string().min(1).max(40).default('whatsappAlerts'),
    action: z.string().max(120).optional(),
    template: TemplateSchema.optional(),
    forceTemplate: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('store.delivered'),
    tenantId: z.string().uuid(),
    order: z.object({
      orderId: z.string().min(1).max(100),
      customerName: z.string().min(1).max(120),
      customerPhone: z.string().min(5).max(25),
      provider: z.enum(['shopify', 'woocommerce', 'store']),
      optin: z.boolean().optional(),
      optinText: z.string().max(500).optional(),
    }),
  }),
  z.object({
    type: z.literal('sync.provider'),
    tenantId: z.string().uuid(),
    provider: z.enum(['google', 'places', 'trustpilot', 'tripadvisor']),
    /** Origen (auditoría): 'cron' | 'manual'. */
    origin: z.string().max(20).default('cron'),
  }),
  z.object({
    type: z.literal('ai.generate'),
    tenantId: z.string().uuid(),
    /** Identificador para `GET /api/ai/result?jobId=`. */
    jobId: z.string().min(8).max(80),
    businessName: z.string().min(1).max(120),
    authorName: z.string().min(1).max(120),
    rating: z.number().min(1).max(5),
    reviewText: z.string().min(1).max(4000),
    tone: z.enum(['profesional', 'cercano', 'formal']).optional(),
    private: z.boolean().optional(),
    reviewId: z.string().min(1).max(80).optional(),
  }),
  z.object({
    type: z.literal('notify.owner'),
    tenantId: z.string().uuid(),
    subject: z.string().min(1).max(140),
    html: z.string().min(1).max(20000),
    text: z.string().max(20000).optional(),
    whatsappBody: z.string().max(1500).optional(),
    whatsappTemplate: TemplateSchema.optional(),
  }),
]);

export type QueueJob = z.infer<typeof QueueJobSchema>;

export type JobResult = {
  ok: boolean;
  /** true → el worker responde 5xx para que QStash reintente con backoff. */
  retryable: boolean;
  detail?: string;
};

export function isQueueConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}


function workerUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/queue/worker`;
}

/* ------------------------------------------------------------------ */
/* Publicar                                                            */
/* ------------------------------------------------------------------ */

export type EnqueueResult = { queued: boolean; jobId: string };

/**
 * Publica un trabajo. Sin QStash (o si publicar falla) se ejecuta en línea
 * con el MISMO despachador: el comportamiento nunca cambia, solo la
 * latencia de la petición original.
 */
export async function enqueue(job: QueueJob, opts: { delaySeconds?: number } = {}): Promise<EnqueueResult> {
  const parsed = QueueJobSchema.parse(job);

  if (!isQueueConfigured()) {
    const admin = createAdminClient();
    if (!admin) throw new Error('Supabase no configurado.');
    await dispatchJob(admin, parsed);
    return { queued: false, jobId: `inline-${Date.now().toString(36)}` };
  }

  try {
    const client = new QStashClient({ token: process.env.QSTASH_TOKEN as string });
    // notify.owner no reintenta: evita emails duplicados al dueño.
    const retries = parsed.type === 'notify.owner' ? 0 : 3;
    // Control de caudal: la IA no supera ~30 llamadas/min por empresa y las
    // sincronizaciones van de 3 en 3 para no castigar a los proveedores.
    const flowControl =
      parsed.type === 'ai.generate'
        ? { key: `rf-ai-${parsed.tenantId}`, parallelism: 2, rate: 30, period: '1m' }
        : parsed.type === 'sync.provider'
          ? { key: 'rf-sync', parallelism: 3 }
          : undefined;
    const res = await client.publishJSON({
      url: workerUrl(),
      body: parsed,
      retries,
      delay: opts.delaySeconds && opts.delaySeconds > 0 ? opts.delaySeconds : undefined,
      ...(flowControl ? { flowControl } : {}),
    } as any);
    return { queued: true, jobId: (res as any)?.messageId ?? `qstash-${Date.now().toString(36)}` };
  } catch (e: any) {
    await systemLog('warn', 'queue.publish', `QStash falló, ejecuto inline: ${e?.message ?? e}`, {
      type: parsed.type,
    }).catch(() => undefined);
    const admin = createAdminClient();
    if (!admin) throw new Error('Supabase no configurado.');
    await dispatchJob(admin, parsed);
    return { queued: false, jobId: `inline-${Date.now().toString(36)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Despachador (lo usan el worker HTTP y el modo inline)               */
/* ------------------------------------------------------------------ */

async function touchIntegration(
  admin: AdminLike,
  tenantId: string,
  provider: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    await admin
      .from('integrations')
      .update(
        ok
          ? { status: 'connected', last_sync_at: new Date().toISOString(), last_error: null }
          : { status: 'error', last_error: (error ?? 'sync fallido').slice(0, 300) },
      )
      .eq('tenant_id', tenantId)
      .eq('provider', provider);
  } catch {
    /* best-effort */
  }
}

async function handleWhatsappSend(admin: AdminLike, job: Extract<QueueJob, { type: 'whatsapp.send' }>): Promise<JobResult> {
  const sent = await sendWhatsappForTenant(
    { admin, tenantId: job.tenantId },
    {
      to: job.to,
      body: job.body,
      kind: job.kind,
      feature: job.feature as any,
      action: job.action,
      template: job.template as WhatsappTemplatePayload | undefined,
      forceTemplate: job.forceTemplate,
    },
  );
  if (sent.ok) return { ok: true, retryable: false, detail: sent.messageId };
  // Solo el fallo del proveedor reintenta; 402/403/429 son definitivos.
  return { ok: false, retryable: sent.status === 502, detail: `${sent.code}: ${sent.error}`.slice(0, 300) };
}

async function handleStoreDelivered(
  admin: AdminLike,
  job: Extract<QueueJob, { type: 'store.delivered' }>,
): Promise<JobResult> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, plan, subscription_status, suspended, settings')
    .eq('id', job.tenantId)
    .single();
  if (!tenant) return { ok: false, retryable: false, detail: 'tenant no encontrado' };
  const result = await handleDeliveredOrder(admin, tenant as any, job.order as DeliveredOrder);
  const skipped = (result.body as any)?.skipped as string | undefined;
  if (result.ok || skipped) return { ok: true, retryable: false, detail: skipped ?? 'enviado' };
  return {
    ok: false,
    retryable: result.status >= 500,
    detail: JSON.stringify(result.body).slice(0, 300),
  };
}

async function handleSyncProvider(
  admin: AdminLike,
  job: Extract<QueueJob, { type: 'sync.provider' }>,
): Promise<JobResult> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, settings')
    .eq('id', job.tenantId)
    .single();
  if (!tenant) return { ok: false, retryable: false, detail: 'tenant no encontrado' };
  const settings = (tenant.settings as any) ?? {};

  const { data: integ } = await admin
    .from('integrations')
    .select('credentials')
    .eq('tenant_id', job.tenantId)
    .eq('provider', job.provider === 'places' ? 'google' : job.provider)
    .single();
  const creds = (integ?.credentials as any) ?? {};
  const ctx = { admin, tenantId: job.tenantId };

  const synced =
    job.provider === 'google'
      ? await syncGoogleBusinessForTenant(ctx, {
          refresh_token: creds.refresh_token,
          access_token: creds.access_token,
        })
      : job.provider === 'places'
        ? await syncGooglePlacesForTenant(ctx, settings.place_id ?? '')
        : job.provider === 'trustpilot'
          ? await syncTrustpilotForTenant(ctx, { apiKey: creds.apiKey, businessUnitId: creds.businessUnitId })
          : await syncTripadvisorForTenant(ctx, { locationId: creds.locationId });

  if (synced.ok) {
    await touchIntegration(admin, job.tenantId, job.provider === 'places' ? 'google' : job.provider, true);
    return { ok: true, retryable: false, detail: `importadas ${synced.result.imported}` };
  }
  // 402/403/429/400/507 no reintentan; 5xx del proveedor sí.
  const retryable = synced.status >= 500 && synced.status !== 507;
  if (!retryable || synced.status === 400) {
    await touchIntegration(admin, job.tenantId, job.provider === 'places' ? 'google' : job.provider, false, synced.error);
  }
  await systemLog('warn', 'queue.sync', `${job.provider}: ${synced.error}`, {
    tenantId: job.tenantId,
    code: synced.code,
    origin: job.origin,
  });
  return { ok: false, retryable, detail: `${synced.code}: ${synced.error}`.slice(0, 300) };
}

async function handleAiGenerate(admin: AdminLike, job: Extract<QueueJob, { type: 'ai.generate' }>): Promise<JobResult> {
  const result = await generateReplyForTenant(
    { admin, tenantId: job.tenantId },
    {
      businessName: job.businessName,
      authorName: job.authorName,
      rating: job.rating,
      reviewText: job.reviewText,
      tone: job.tone,
      privateMessage: job.private === true,
    },
    { feature: 'aiReplies', asyncJob: { jobId: job.jobId } },
  );
  if (!result.ok) {
    const retryable = result.status >= 500;
    // Deja constancia del fallo definitivo para `GET /api/ai/result`.
    if (!retryable) {
      try {
        await admin.from('ai_interactions').insert({
          tenant_id: job.tenantId,
          model: 'gpt-4o-mini',
          purpose: 'respond.async',
          job_id: job.jobId,
          result_status: 'error',
          error_code: result.body && typeof result.body === 'object' ? String((result.body as any).code ?? 'gate') : 'gate',
          ok: false,
        });
      } catch {
        /* best-effort */
      }
    }
    return { ok: false, retryable, detail: JSON.stringify(result.body).slice(0, 300) };
  }
  if (job.reviewId) {
    try {
      await admin
        .from('reviews')
        .update(
          job.private === true
            ? { private_note: result.reply }
            : { reply_text: result.reply, replied_at: new Date().toISOString() },
        )
        .eq('id', job.reviewId)
        .eq('tenant_id', job.tenantId);
    } catch {
      /* la respuesta al cliente no se bloquea por un fallo de persistencia */
    }
  }
  return { ok: true, retryable: false, detail: `${result.provider} · ${result.usage.totalTokens} tokens` };
}

async function handleNotifyOwner(
  admin: AdminLike,
  job: Extract<QueueJob, { type: 'notify.owner' }>,
): Promise<JobResult> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, owner_email, settings')
    .eq('id', job.tenantId)
    .single();
  if (!tenant) return { ok: false, retryable: false, detail: 'tenant no encontrado' };
  const settings = (tenant.settings as any) ?? {};

  const mail = await sendMail({
    to: tenant.owner_email,
    subject: job.subject,
    html: job.html,
    text: job.text,
  }).catch((e: any) => ({ sent: false, message: String(e?.message ?? e) }));

  let waDetail = 'sin-whatsapp';
  if (job.whatsappBody && settings.whatsapp_to) {
    const sent = await sendWhatsappForTenant(
      { admin, tenantId: job.tenantId },
      {
        to: settings.whatsapp_to,
        body: job.whatsappBody,
        kind: 'alerta',
        feature: 'whatsappAlerts',
        action: 'Aviso interno al dueño',
        template: job.whatsappTemplate as WhatsappTemplatePayload | undefined,
      },
    ).catch((e: any) => ({ ok: false as const, error: String(e?.message ?? e) }));
    waDetail = sent.ok ? `wa:${(sent as any).messageId ?? 'ok'}` : `wa-error:${(sent as any).error ?? '?'}`.slice(0, 120);
  }

  await systemLog('info', 'queue.notify', `Aviso al dueño (${mail.sent ? 'email ok' : mail.message}; ${waDetail})`, {
    tenantId: job.tenantId,
  });
  // Nunca reintenta: un aviso duplicado al dueño es peor que uno perdido
  // (el ticket queda guardado y visible en el panel de todos modos).
  return { ok: true, retryable: false, detail: waDetail };
}

export async function dispatchJob(admin: AdminLike, job: QueueJob): Promise<JobResult> {
  switch (job.type) {
    case 'whatsapp.send':
      return handleWhatsappSend(admin, job);
    case 'store.delivered':
      return handleStoreDelivered(admin, job);
    case 'sync.provider':
      return handleSyncProvider(admin, job);
    case 'ai.generate':
      return handleAiGenerate(admin, job);
    case 'notify.owner':
      return handleNotifyOwner(admin, job);
  }
}
