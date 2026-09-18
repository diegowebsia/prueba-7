import type { PlanFeatures } from '@/lib/plans';
import {
  consume,
  checkQuota,
  enforce,
  enforceTableCap,
  type AdminLike,
} from '@/lib/usage';
import { systemLog } from '@/lib/logger';

type PlanFeaturesKey = keyof PlanFeatures;

/**
 * ============================================================
 * Ingesta unificada de reseñas externas
 * ============================================================
 * Google Business, Google Places, Trustpilot, TripAdvisor y la API pública
 * comparten este único camino para que el corte de cuota sea idéntico en todos:
 * cada reseña importada consume 1 evento de la métrica `reviews`.
 */

export type IncomingReview = {
  externalId: string;
  author: string;
  rating: number;
  text: string;
  createdAt?: string;
  verified?: boolean;
};

export type IngestResult = {
  imported: number;
  skipped: number;
  /** true si el proceso se detuvo por falta de cuota mensual. */
  quotaCut: boolean;
  /** true si el proceso se detuvo por el tope de filas/almacenamiento. */
  storageCut?: boolean;
  remaining: number;
  used: number;
  limit: number;
  errors: string[];
};

/**
 * Importa un lote de reseñas respetando la cuota restante del ciclo.
 * - Si no queda cuota, no importa nada y devuelve `quotaCut: true`.
 * - Si la cuota se agota a mitad del lote, corta y devuelve lo importado.
 * - El contador se incrementa UNA sola vez con el total (1 escritura).
 */
export async function ingestReviews(
  admin: AdminLike,
  tenantId: string,
  reviews: IncomingReview[],
  source: 'google' | 'trustpilot' | 'tripadvisor' | 'facebook' | 'manual' | 'places',
): Promise<IngestResult> {
  const result: IngestResult = {
    imported: 0,
    skipped: 0,
    quotaCut: false,
    remaining: 0,
    used: 0,
    limit: 0,
    errors: [],
  };

  const featureBySource: Record<typeof source, PlanFeaturesKey | undefined> = {
    google: 'googleBusiness',
    places: 'googlePlaces',
    trustpilot: 'trustpilot',
    tripadvisor: 'tripadvisor',
    facebook: undefined,
    manual: undefined,
  };

  const gate = await enforce(admin, tenantId, {
    metric: 'reviews',
    feature: featureBySource[source],
    amount: 1,
    action: `Importar reseñas de ${source}`,
  });
  if (!gate.ok) {
    result.quotaCut = gate.status === 429;
    result.errors.push(gate.error);
    result.limit = gate.check.metrics.reviews.quota;
    result.used = gate.check.metrics.reviews.used;
    result.remaining = gate.check.metrics.reviews.remaining;
    return result;
  }

  // TOPE DE BASE DE DATOS: purga lo antiguo y comprueba cuántas filas caben
  // en `reviews` según el plan (protege el tamaño de Supabase/PostgreSQL).
  const storage = await enforceTableCap(admin, tenantId, 'reviews');
  if (!storage.ok) {
    result.storageCut = true;
    result.errors.push(storage.error);
    result.limit = gate.check.metrics.reviews.quota;
    result.used = gate.check.metrics.reviews.used;
    result.remaining = 0;
    return result;
  }

  // Cuántas caben realmente: cuota mensual + espacio libre en la tabla.
  const room = Math.min(
    gate.check.metrics.reviews.remaining,
    storage.storage.reviews.remaining,
  );
  result.limit = gate.check.metrics.reviews.quota;
  result.used = gate.check.metrics.reviews.used;
  result.remaining = room;

  if (room <= 0) {
    result.quotaCut = true;
    return result;
  }

  const batch = reviews.slice(0, room);
  if (reviews.length > batch.length) {
    result.quotaCut = true;
    result.skipped = reviews.length - batch.length;
  }

  for (const r of batch) {
    const { error } = await admin.from('reviews').upsert(
      {
        tenant_id: tenantId,
        source: source === 'places' ? 'google' : source,
        external_id: r.externalId,
        author_name: r.author,
        rating: Math.min(5, Math.max(1, Math.round(r.rating || 5))),
        text: r.text ?? '',
        is_verified: Boolean(r.verified),
        // Filtro privado: las malas experiencias (≤3★) entran en la cola de triaje.
        flagged_private: (r.rating ?? 5) <= 3,
      },
      { onConflict: 'tenant_id,source,external_id' },
    );
    if (error) {
      result.errors.push(String(error.message ?? error).slice(0, 180));
      continue;
    }
    result.imported += 1;
  }

  if (result.imported > 0) {
    await consume(admin, tenantId, 'reviews', result.imported);
  }
  result.remaining = Math.max(0, room - result.imported);
  result.used = gate.check.metrics.reviews.used + result.imported;

  await systemLog('info', 'reviews.ingest', `${result.imported} reseñas de ${source}`, {
    tenantId,
    skipped: result.skipped,
    quotaCut: result.quotaCut,
  });

  return result;
}


/** Re-export cómodo para las rutas de sincronización. */
export { checkQuota };
