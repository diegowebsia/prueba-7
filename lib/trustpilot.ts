/**
 * Trustpilot Business API (reseñas reales de tu tienda/negocio).
 * Cada empresa guarda su API key + Business Unit ID en `integrations`
 * (se configuran en el panel; Trustpilot las da en su plan Business).
 * Docs: https://developers.trustpilot.com
 */

export type TrustpilotReview = {
  externalId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  verified: boolean;
};

export async function fetchTrustpilotReviews(
  apiKey: string,
  businessUnitId: string,
): Promise<TrustpilotReview[]> {
  const url =
    `https://api.trustpilot.com/v1/business-units/${encodeURIComponent(businessUnitId)}` +
    `/reviews?perPage=100&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Trustpilot error (${res.status}): revisa API key y Business Unit ID.`);
  const data = await res.json();
  return (data.reviews ?? []).map((r: any) => ({
    externalId: `trustpilot:${r.id}`,
    author: r.consumer?.displayName ?? 'Cliente de Trustpilot',
    rating: Number(r.stars ?? 5),
    text: r.text ?? r.title ?? '',
    createdAt: r.createdAt ?? new Date().toISOString(),
    verified: Boolean(r.isVerified),
  }));
}

/* ================================================================== */
/* Capa de negocio: Trustpilot conectado al contador de cuota          */
/* ================================================================== */

import type { AdminLike, GateBlocked } from '@/lib/usage';
import { checkQuota, consume, enforce, publicQuota } from '@/lib/usage';
import { ingestReviews, type IngestResult } from '@/lib/ingest';
import { systemLog } from '@/lib/logger';

export type TrustpilotContext = { admin: AdminLike; tenantId: string };

export type TrustpilotSyncOk = {
  ok: true;
  status: 200;
  result: IngestResult;
  provider: 'trustpilot';
  quota: ReturnType<typeof publicQuota>;
};

export type TrustpilotSyncBlocked = {
  ok: false;
  status: number;
  code: string;
  error: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type TrustpilotSyncResult = TrustpilotSyncOk | TrustpilotSyncBlocked;

function tpGateBlocked(gate: GateBlocked): TrustpilotSyncBlocked {
  return {
    ok: false,
    status: gate.status,
    code: gate.code,
    error: gate.error,
    headers: gate.headers,
    body: gate.body,
  };
}

async function tpProviderError(
  ctx: TrustpilotContext,
  message: string,
  status = 502,
  code = 'provider_error',
): Promise<TrustpilotSyncBlocked> {
  const check = await checkQuota(ctx.admin, ctx.tenantId).catch(() => null);
  return {
    ok: false,
    status,
    code,
    error: message,
    headers: {},
    body: { error: message, code, quota: check ? publicQuota(check) : undefined },
  };
}

/**
 * Sincroniza reseñas de Trustpilot respetando la cuota.
 * Cada sincronización cuenta 1 `sync`; cada reseña importada, 1 evento.
 * La usan la ruta manual `/sync` y el cron automático (vía cola).
 */
export async function syncTrustpilotForTenant(
  ctx: TrustpilotContext,
  credentials: { apiKey?: string; businessUnitId?: string },
): Promise<TrustpilotSyncResult> {
  const check = await checkQuota(ctx.admin, ctx.tenantId);
  if (!check.hasAccess) {
    return {
      ok: false,
      status: 402,
      code: 'no_subscription',
      error: 'Suscripción sin acceso. Reactívala para sincronizar reseñas.',
      headers: { 'Retry-After': String(check.retryAfterSeconds) },
      body: { error: 'Suscripción sin acceso.', code: 'no_subscription', quota: publicQuota(check) },
    };
  }
  if (check.metrics.syncs.used >= check.metrics.syncs.quota) {
    return {
      ok: false,
      status: 429,
      code: 'quota_exhausted',
      error:
        `Has alcanzado el límite de sincronizaciones automáticas de tu plan ` +
        `(${check.metrics.syncs.used}/${check.metrics.syncs.quota} este ciclo). ` +
        `El contador se reinicia el ${check.renewalLabel} o puedes ampliarlo con una recarga.`,
      headers: { 'Retry-After': String(check.retryAfterSeconds) },
      body: { error: 'Límite de sincronizaciones alcanzado.', code: 'quota_exhausted', quota: publicQuota(check) },
    };
  }

  const canUse = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'reviews',
    feature: 'trustpilot',
    action: 'Sincronizar Trustpilot',
  });
  if (!canUse.ok) return tpGateBlocked(canUse);

  if (!credentials.apiKey || !credentials.businessUnitId) {
    return tpProviderError(ctx, 'Trustpilot no conectado. Guarda tu API key primero.', 400);
  }

  try {
    const reviews = await fetchTrustpilotReviews(credentials.apiKey, credentials.businessUnitId);
    await consume(ctx.admin, ctx.tenantId, 'syncs', 1);
    const result = await ingestReviews(ctx.admin, ctx.tenantId, reviews, 'trustpilot');
    if (result.storageCut) {
      return tpProviderError(ctx, result.errors[0] ?? 'Tope de opiniones guardadas del plan alcanzado.', 507, 'storage_limit');
    }
    await systemLog('info', 'integrations.trustpilot', `${result.imported} reseñas de Trustpilot`, {
      tenantId: ctx.tenantId,
    });
    return {
      ok: true,
      status: 200,
      result,
      provider: 'trustpilot',
      quota: publicQuota(await checkQuota(ctx.admin, ctx.tenantId)),
    };
  } catch (e: any) {
    return tpProviderError(ctx, e?.message ?? 'Sincronización con Trustpilot fallida.');
  }
}
