import { fetchWithTimeout } from '@/lib/http';

/**
 * Google Business Profile (reseñas reales de Google).
 * Flujo: OAuth (connect) → callback guarda tokens → sync importa reseñas.
 * Requiere en Google Cloud Console (APIs & Services → Credentials):
 *   - OAuth client ID (tipo Web) con redirect:
 *     https://TU-DOMINIO/api/integrations/google/callback
 *   - Scope: https://www.googleapis.com/auth/business.manage
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GBP_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/integrations/google/callback`;
}

export function getGoogleOAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token error (${res.status})`);
  return res.json();
}

export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google refresh error (${res.status})`);
  const data = await res.json();
  return data.access_token as string;
}

export type GoogleReview = {
  externalId: string;
  author: string;
  rating: number; // 1-5
  text: string;
  createdAt: string;
  verified: boolean;
};

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Recorre cuentas → ubicaciones → reseñas. */
export async function fetchGoogleReviews(accessToken: string): Promise<GoogleReview[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const out: GoogleReview[] = [];

  const accRes = await fetchWithTimeout(`${GBP_API}/accounts`, { headers });
  if (!accRes.ok) throw new Error(`Google accounts error (${accRes.status})`);
  const accounts: Array<{ name: string }> = (await accRes.json()).accounts ?? [];

  for (const acc of accounts) {
    const locRes = await fetchWithTimeout(`${GBP_API}/${acc.name}/locations?readMask=name,title`, { headers });
    if (!locRes.ok) continue;
    const locations: Array<{ name: string }> = (await locRes.json()).locations ?? [];
    for (const loc of locations) {
      const revRes = await fetchWithTimeout(`https://mybusinessreviews.googleapis.com/v1/${loc.name}/reviews`, {
        headers,
      });
      if (!revRes.ok) continue;
      const reviews = (await revRes.json()).reviews ?? [];
      for (const r of reviews) {
        out.push({
          externalId: r.name ?? `${loc.name}/${r.reviewId ?? Date.now()}`,
          author: r.reviewer?.displayName ?? 'Cliente de Google',
          rating: STAR_MAP[r.starRating] ?? 5,
          text: r.comment ?? '',
          createdAt: r.createTime ?? new Date().toISOString(),
          verified: true, // Google solo muestra reseñas de su plataforma
        });
      }
    }
  }
  return out;
}

/** Publica la respuesta en Google (externalId = accounts/…/locations/…/reviews/…). */
export async function replyGoogleReview(
  accessToken: string,
  externalId: string,
  replyText: string,
): Promise<void> {
  const res = await fetchWithTimeout(`https://mybusinessreviews.googleapis.com/v1/${externalId}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: replyText }),
  });
  if (!res.ok) throw new Error(`Google reply error (${res.status})`);
}

/* ================================================================== */
/* Google Places API (New) — sincronización por Place ID + API key     */
/* ================================================================== */

const PLACES_API = 'https://places.googleapis.com/v1';
const LEGACY_PLACES_API = 'https://maps.googleapis.com/maps/api/place/details/json';

export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export type PlacesReview = {
  externalId: string;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
  verified: boolean;
};

export type PlacesSummary = {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingCount: number | null;
  reviews: PlacesReview[];
  provider: 'places-v1' | 'places-legacy';
};

/**
 * Detalle + reseñas de una ficha por Place ID.
 * 1º Places API (New, `places.googleapis.com/v1`) y, si el proyecto aún usa
 * la key clásica, cae al endpoint legacy `maps/api/place/details`.
 * La Places API pública devuelve las 5 reseñas más recientes y más útiles.
 */
export async function fetchPlaceReviews(placeId: string): Promise<PlacesSummary> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Falta GOOGLE_PLACES_API_KEY en el servidor.');

  const modern = await fetchWithTimeout(
    `${PLACES_API}/places/${encodeURIComponent(placeId)}` +
      `?fields=id,displayName,rating,userRatingCount,reviews,googleMapsUri`,
    { headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' } },
  );

  if (modern.ok) {
    const data: any = await modern.json();
    const reviews: PlacesReview[] = (data?.reviews ?? []).map((r: any, i: number) => ({
      externalId: r.name ? `places:${r.name}` : `places:${placeId}:${i}:${r.publishTime ?? ''}`,
      author: r.authorAttribution?.displayName ?? 'Cliente de Google',
      rating: Number(r.rating ?? 5),
      text: r.text?.text ?? r.originalText ?? '',
      createdAt: r.publishTime ?? new Date().toISOString(),
      verified: true,
    }));
    return {
      placeId,
      name: data?.displayName ?? placeId,
      rating: typeof data?.rating === 'number' ? data.rating : null,
      userRatingCount: typeof data?.userRatingCount === 'number' ? data.userRatingCount : null,
      reviews,
      provider: 'places-v1',
    };
  }

  const legacy = await fetchWithTimeout(
    `${LEGACY_PLACES_API}?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total,reviews&key=${encodeURIComponent(key)}`,
  );
  if (!legacy.ok) {
    throw new Error(`Google Places error (${modern.status}/${legacy.status}): revisa la API key y el Place ID.`);
  }
  const data: any = await legacy.json();
  const result = data?.result ?? {};
  const reviews: PlacesReview[] = (result.reviews ?? []).map((r: any, i: number) => ({
    externalId: `places:${placeId}:${r.author_name ?? ''}:${r.time ?? i}`,
    author: r.author_name ?? 'Cliente de Google',
    rating: Number(r.rating ?? 5),
    text: r.text ?? '',
    createdAt: r.time ? new Date(r.time * 1000).toISOString() : new Date().toISOString(),
    verified: true,
  }));
  return {
    placeId,
    name: result.name ?? placeId,
    rating: typeof result.rating === 'number' ? result.rating : null,
    userRatingCount: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : null,
    reviews,
    provider: 'places-legacy',
  };
}

/* ================================================================== */
/* Capa de negocio: Google conectado al contador de cuota              */
/* ================================================================== */

import type { PlanFeatures } from '@/lib/plans';
import type { AdminLike, GateBlocked } from '@/lib/usage';
import { checkQuota, consume, enforce, logGoogleCall, publicQuota } from '@/lib/usage';
import { ingestReviews, type IngestResult } from '@/lib/ingest';
import { systemLog } from '@/lib/logger';

export type GoogleContext = { admin: AdminLike; tenantId: string };

export type GoogleSyncOk = {
  ok: true;
  status: 200;
  result: IngestResult;
  provider: 'google-business' | 'places';
  placeName?: string;
  rating?: number | null;
  userRatingCount?: number | null;
  quota: ReturnType<typeof publicQuota>;
};

export type GoogleSyncBlocked = {
  ok: false;
  status: number;
  code: string;
  error: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type GoogleSyncResult = GoogleSyncOk | GoogleSyncBlocked;

function gateBlocked(gate: GateBlocked): GoogleSyncBlocked {
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
  ctx: GoogleContext,
  message: string,
  status = 502,
  code = 'provider_error',
): Promise<GoogleSyncBlocked> {
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

/** Un importe cortado por el tope de filas/almacenamiento del plan → 507. */
function storageCutBlocked(ctx: GoogleContext, result: IngestResult): Promise<GoogleSyncBlocked> {
  return providerError(
    ctx,
    result.errors[0] ?? 'Tope de opiniones guardadas del plan alcanzado.',
    507,
    'storage_limit',
  );
}

/** Protege la cuota diaria/mensual de llamadas a Google (evita facturas sorpresa). */
async function assertGoogleSyncBudget(ctx: GoogleContext, _feature: keyof PlanFeatures): Promise<{
  gate: GoogleSyncBlocked | null;
  check: Awaited<ReturnType<typeof checkQuota>> | null;
}> {
  const check = await checkQuota(ctx.admin, ctx.tenantId);
  if (!check.hasAccess) {
    return {
      check,
      gate: {
        ok: false,
        status: 402,
        code: 'no_subscription',
        error: 'Suscripción sin acceso. Reactívala para sincronizar reseñas.',
        headers: { 'Retry-After': String(check.retryAfterSeconds) },
        body: { error: 'Suscripción sin acceso.', code: 'no_subscription', quota: publicQuota(check) },
      },
    };
  }
  if (check.metrics.syncs.used >= check.metrics.syncs.quota) {
    return {
      check,
      gate: {
        ok: false,
        status: 429,
        code: 'quota_exhausted',
        error:
          `Has alcanzado el límite de sincronizaciones automáticas de tu plan ` +
          `(${check.metrics.syncs.used}/${check.metrics.syncs.quota} este ciclo). ` +
          `El contador se reinicia el ${check.renewalLabel} o puedes ampliarlo con una recarga.`,
        headers: { 'Retry-After': String(check.retryAfterSeconds) },
        body: { error: 'Límite de sincronizaciones alcanzado.', code: 'quota_exhausted', quota: publicQuota(check) },
      },
    };
  }
  return { check, gate: null };
}

/**
 * Sincroniza reseñas de Google Business Profile (OAuth) respetando la cuota.
 * Cada sincronización cuenta 1 `google_call`; cada reseña importada, 1 evento.
 */
export async function syncGoogleBusinessForTenant(
  ctx: GoogleContext,
  credentials: { refresh_token?: string; access_token?: string },
): Promise<GoogleSyncResult> {
  const { gate } = await assertGoogleSyncBudget(ctx, 'googleBusiness');
  if (gate) return gate;

  const canUse = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'reviews',
    feature: 'googleBusiness',
    action: 'Sincronizar Google Business',
  });
  if (!canUse.ok) return gateBlocked(canUse);

  if (!credentials.refresh_token && !credentials.access_token) {
    return providerError(ctx, 'Google no conectado. Pulsa «Conectar Google» primero.', 400);
  }

  try {
    const accessToken = credentials.refresh_token
      ? await refreshGoogleToken(credentials.refresh_token)
      : (credentials.access_token as string);
    const reviews = await fetchGoogleReviews(accessToken);
    await logGoogleCall(ctx.admin, ctx.tenantId, 1);
    const result = await ingestReviews(ctx.admin, ctx.tenantId, reviews, 'google');
    if (result.storageCut) return storageCutBlocked(ctx, result);
    return {
      ok: true,
      status: 200,
      result,
      provider: 'google-business',
      quota: publicQuota(await checkQuota(ctx.admin, ctx.tenantId)),
    };
  } catch (e: any) {
    return providerError(ctx, e?.message ?? 'Sincronización con Google fallida.');
  }
}

/** Sincroniza reseñas vía Google Places API usando el Place ID de la empresa. */
export async function syncGooglePlacesForTenant(
  ctx: GoogleContext,
  placeId: string,
): Promise<GoogleSyncResult> {
  const { gate } = await assertGoogleSyncBudget(ctx, 'googlePlaces');
  if (gate) return gate;

  const canUse = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'reviews',
    feature: 'googlePlaces',
    action: 'Sincronizar Google Places',
  });
  if (!canUse.ok) return gateBlocked(canUse);

  if (!placeId) return providerError(ctx, 'Falta el Place ID en los ajustes de la empresa.', 400);
  if (!isGooglePlacesConfigured()) {
    return providerError(ctx, 'Falta GOOGLE_PLACES_API_KEY en el servidor.', 503);
  }

  try {
    const summary = await fetchPlaceReviews(placeId);
    await logGoogleCall(ctx.admin, ctx.tenantId, 1);
    const result = await ingestReviews(ctx.admin, ctx.tenantId, summary.reviews, 'places');
    if (result.storageCut) return storageCutBlocked(ctx, result);
    await systemLog('info', 'integrations.places', `${result.imported} reseñas de Places`, {
      tenantId: ctx.tenantId,
      placeId,
    });
    return {
      ok: true,
      status: 200,
      result,
      provider: 'places',
      placeName: summary.name,
      rating: summary.rating,
      userRatingCount: summary.userRatingCount,
      quota: publicQuota(await checkQuota(ctx.admin, ctx.tenantId)),
    };
  } catch (e: any) {
    return providerError(ctx, e?.message ?? 'Sincronización con Places fallida.');
  }
}

/**
 * Publica una respuesta EN Google con control de cuota.
 * Publicar no consume eventos de reseña, pero sí cuenta la llamada a Google
 * y exige la feature `publishToGoogle` del plan.
 */
export async function publishGoogleReplyForTenant(
  ctx: GoogleContext,
  payload: { externalId: string; reply: string; credentials: { refresh_token?: string; access_token?: string } },
): Promise<{ ok: true; quota: ReturnType<typeof publicQuota> } | GoogleSyncBlocked> {
  const canUse = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'ai',
    feature: 'publishToGoogle',
    amount: 0,
    action: 'Publicar respuesta en Google',
  });
  if (!canUse.ok) return gateBlocked(canUse);

  try {
    const token = payload.credentials.refresh_token
      ? await refreshGoogleToken(payload.credentials.refresh_token)
      : (payload.credentials.access_token as string);
    await replyGoogleReview(token, payload.externalId, payload.reply);
    await logGoogleCall(ctx.admin, ctx.tenantId, 1);
    return { ok: true, quota: publicQuota(await checkQuota(ctx.admin, ctx.tenantId)) };
  } catch (e: any) {
    return providerError(ctx, e?.message ?? 'No se pudo publicar en Google.');
  }
}

/** Re-export para comodidad de las rutas. */
export { consume };
