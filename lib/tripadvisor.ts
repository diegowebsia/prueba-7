import { fetchWithTimeout } from '@/lib/http';
/**
 * TripAdvisor (reseñas reales de tu ficha).
 * TripAdvisor no ofrece API pública de reseñas, así que la integración pasa
 * por un servicio intermediario (el dueño elige uno y pega su clave):
 *
 *   TRIPADVISOR_PROVIDER = 'serpapi' | 'outscraper'   (por defecto 'serpapi')
 *   SERPAPI_API_KEY      = clave de https://serpapi.com (plan de pago con
 *                          engine `tripadvisor_review`)
 *   OUTSCRAPER_API_KEY   = clave de https://outscraper.com (task de reviews)
 *
 * Cada empresa guarda su `locationId` de TripAdvisor en `integrations`
 * (se configura en el panel: es el número `dXXXXXX` de la URL de tu ficha,
 * p. ej. https://www.tripadvisor.es/Hotel_Review-g187514-dXXXXXX-...).
 *
 * Misma estructura y tipos que `lib/google.ts` / `lib/trustpilot.ts`:
 * tipo de reseña + fetch puro + capa de negocio con cuota (`sync…ForTenant`).
 */

export type TripadvisorReview = {
  externalId: string;
  author: string;
  rating: number; // 1-5
  text: string;
  createdAt: string;
  verified: boolean;
};

export type TripadvisorProvider = 'serpapi' | 'outscraper';

export function tripadvisorProvider(): TripadvisorProvider {
  return process.env.TRIPADVISOR_PROVIDER === 'outscraper' ? 'outscraper' : 'serpapi';
}

export function isTripadvisorConfigured(): boolean {
  return tripadvisorProvider() === 'outscraper'
    ? Boolean(process.env.OUTSCRAPER_API_KEY)
    : Boolean(process.env.SERPAPI_API_KEY);
}

function normalizeRating(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * SerpAPI — TripAdvisor Reviews API (`engine=tripadvisor_review`).
 * Docs: https://serpapi.com/tripadvisor-review-api
 */
async function fetchViaSerpApi(apiKey: string, locationId: string): Promise<TripadvisorReview[]> {
  const params = new URLSearchParams({
    engine: 'tripadvisor_review',
    location_id: locationId,
    api_key: apiKey,
  });
  const res = await fetchWithTimeout(`https://serpapi.com/search.json?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TripAdvisor/SerpAPI error (${res.status}): ${detail.slice(0, 160) || 'revisa SERPAPI_API_KEY y el Location ID.'}`);
  }
  const data: any = await res.json();
  if (data?.error) throw new Error(`TripAdvisor/SerpAPI: ${String(data.error).slice(0, 200)}`);
  const list: any[] = Array.isArray(data?.reviews) ? data.reviews : [];
  return list.map((r: any, i: number) => ({
    externalId: `tripadvisor:${locationId}:${r.id ?? r.review_id ?? i}`,
    author: r.user?.name ?? r.author ?? r.username ?? 'Cliente de TripAdvisor',
    rating: normalizeRating(r.rating ?? r.stars),
    text: [r.title, r.text ?? r.snippet ?? r.description].filter(Boolean).join(' — '),
    createdAt: r.date ?? r.published_date ?? r.iso_date ?? new Date().toISOString(),
    verified: true, // reseñas publicadas en la plataforma
  }));
}

/**
 * Outscraper — Reviews Scraper (tarea `tripadvisor-reviews`).
 * Docs: https://outscraper.com/tripadvisor-scraper/
 * La API es asíncrona: se crea la tarea, se espera y se recogen resultados.
 * Aquí se implementa en modo síncrono con espera limitada (el cron/cola
 * reintentan si el proveedor aún está raspando).
 */
async function fetchViaOutscraper(apiKey: string, locationId: string): Promise<TripadvisorReview[]> {
  const headers = { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };
  const create = await fetchWithTimeout('https://api.app.outscraper.com/requests', {
    method: 'POST',
    headers,
    body: JSON.stringify({ service: 'tripadvisor-reviews', location_id: locationId, limit: 100 }),
  });
  if (!create.ok) {
    throw new Error(`TripAdvisor/Outscraper error (${create.status}): revisa OUTSCRAPER_API_KEY y el Location ID.`);
  }
  const task: any = await create.json().catch(() => ({}));
  const taskId: string | undefined = task?.id ?? task?.request_id;
  if (!taskId) throw new Error('TripAdvisor/Outscraper: el proveedor no devolvió tarea.');
  // Espera limitada: 5 intentos × 4 s (la cola reintenta el job si expira).
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const poll = await fetchWithTimeout(`https://api.app.outscraper.com/requests/${encodeURIComponent(taskId)}`, { headers });
    if (!poll.ok) continue;
    const state: any = await poll.json().catch(() => ({}));
    if (state?.status !== 'Success' && state?.status !== 'Completed') continue;
    const list: any[] = Array.isArray(state?.data) ? state.data : (Array.isArray(state?.reviews) ? state.reviews : []);
    return list.map((r: any, idx: number) => ({
      externalId: `tripadvisor:${locationId}:${r.review_id ?? r.id ?? idx}`,
      author: r.author ?? r.user ?? 'Cliente de TripAdvisor',
      rating: normalizeRating(r.rating ?? r.stars),
      text: [r.title, r.text ?? r.review_text ?? r.snippet].filter(Boolean).join(' — '),
      createdAt: r.date ?? r.published_at ?? new Date().toISOString(),
      verified: true,
    }));
  }
  throw new Error('TripAdvisor/Outscraper: tarea en curso, reintenta en unos minutos.');
}

/** Punto único de lectura: elige proveedor según `TRIPADVISOR_PROVIDER`. */
export async function fetchTripadvisorReviews(locationId: string): Promise<TripadvisorReview[]> {
  const id = locationId.trim();
  if (!id) throw new Error('Falta el Location ID de TripAdvisor en la conexión.');
  if (tripadvisorProvider() === 'outscraper') {
    const key = process.env.OUTSCRAPER_API_KEY;
    if (!key) throw new Error('Falta OUTSCRAPER_API_KEY en el servidor.');
    return fetchViaOutscraper(key, id);
  }
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error('Falta SERPAPI_API_KEY en el servidor.');
  return fetchViaSerpApi(key, id);
}

/* ================================================================== */
/* Capa de negocio: TripAdvisor conectado al contador de cuota         */
/* ================================================================== */

import type { AdminLike, GateBlocked } from '@/lib/usage';
import { checkQuota, consume, enforce, publicQuota } from '@/lib/usage';
import { ingestReviews, type IngestResult } from '@/lib/ingest';
import { systemLog } from '@/lib/logger';

export type TripadvisorContext = { admin: AdminLike; tenantId: string };

export type TripadvisorSyncOk = {
  ok: true;
  status: 200;
  result: IngestResult;
  provider: 'tripadvisor';
  quota: ReturnType<typeof publicQuota>;
};

export type TripadvisorSyncBlocked = {
  ok: false;
  status: number;
  code: string;
  error: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type TripadvisorSyncResult = TripadvisorSyncOk | TripadvisorSyncBlocked;

function gateBlocked(gate: GateBlocked): TripadvisorSyncBlocked {
  return {
    ok: false,
    status: gate.status,
    code: gate.code,
    error: gate.error,
    headers: gate.headers,
    body: gate.body,
  };
}

async function providerError(
  ctx: TripadvisorContext,
  message: string,
  status = 502,
  code = 'provider_error',
): Promise<TripadvisorSyncBlocked> {
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

/** Protege la cuota de sincronizaciones automáticas del ciclo. */
async function assertSyncBudget(ctx: TripadvisorContext): Promise<TripadvisorSyncBlocked | null> {
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
  return null;
}

/**
 * Sincroniza reseñas de TripAdvisor respetando la cuota.
 * Cada sincronización cuenta 1 `sync`; cada reseña importada, 1 evento.
 */
export async function syncTripadvisorForTenant(
  ctx: TripadvisorContext,
  credentials: { locationId?: string },
): Promise<TripadvisorSyncResult> {
  const budget = await assertSyncBudget(ctx);
  if (budget) return budget;

  const canUse = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'reviews',
    feature: 'tripadvisor',
    action: 'Sincronizar TripAdvisor',
  });
  if (!canUse.ok) return gateBlocked(canUse);

  if (!credentials.locationId) {
    return providerError(ctx, 'TripAdvisor no conectado. Guarda tu Location ID primero.', 400);
  }
  if (!isTripadvisorConfigured()) {
    return providerError(
      ctx,
      tripadvisorProvider() === 'outscraper'
        ? 'Falta OUTSCRAPER_API_KEY en el servidor.'
        : 'Falta SERPAPI_API_KEY en el servidor.',
      503,
    );
  }

  try {
    const reviews = await fetchTripadvisorReviews(credentials.locationId);
    await consume(ctx.admin, ctx.tenantId, 'syncs', 1);
    const result = await ingestReviews(ctx.admin, ctx.tenantId, reviews, 'tripadvisor');
    if (result.storageCut) {
      return providerError(ctx, result.errors[0] ?? 'Tope de opiniones guardadas del plan alcanzado.', 507, 'storage_limit');
    }
    await systemLog('info', 'integrations.tripadvisor', `${result.imported} reseñas de TripAdvisor`, {
      tenantId: ctx.tenantId,
    });
    return {
      ok: true,
      status: 200,
      result,
      provider: 'tripadvisor',
      quota: publicQuota(await checkQuota(ctx.admin, ctx.tenantId)),
    };
  } catch (e: any) {
    return providerError(ctx, e?.message ?? 'Sincronización con TripAdvisor fallida.');
  }
}
