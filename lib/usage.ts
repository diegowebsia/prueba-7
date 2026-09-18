import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_AI_MODEL,
  estimateCostUsd,
  isTrialExpired,
  METRIC_LABEL,
  PLANS,
  PLAN_CATALOG,
  TRIAL_DAYS,
  currentCycle,
  estimateStorageMb,
  nextCycleStart,
  planHasFeature,
  renewalLabel,
  resolvePlan,
  secondsUntilRenewal,
  type AddonPack,
  type PlanDefinition,
  type PlanFeatures,
  type PlanId,
  type UsageMetric,
} from '@/lib/plans';

/**
 * ============================================================
 * Motor de cuotas y PROTECCIÓN DE LA BASE DE DATOS (v3.9.0)
 * ============================================================
 * Conecta la tabla `usage_counters` (+ el ledger `quota_events`) de Supabase
 * con CADA llamada externa: OpenAI, WhatsApp, email, Google Business / Places
 * y Trustpilot. Ninguna integración sale al exterior sin pasar por aquí:
 *
 *   enforce()        → ¿puede este tenant consumir N unidades de esta métrica?
 *   consume()        → incrementa el contador de forma ATÓMICA (RPC Postgres,
 *                      con fallback JS si la función no está migrada).
 *   enforceStorage() → TOPES POR TABLA: purga lo que sobra (opiniones
 *                      antiguas, ledger de auditoría y logs) y bloquea la
 *                      escritura si el tenant ya está en su máximo. Así una
 *                      empresa no puede desbordar Supabase/PostgreSQL ni
 *                      disparar los sobrecostes de la instancia.
 *
 * REGLA ESTRICTA DE ACCESO (modelo 100% de pago):
 *   Si el tenant NO tiene suscripción activa (`active`) NI prueba vigente
 *   (`trialing` con `trial_ends_at` en el futuro), `enforce()` y `enforceAi()`
 *   bloquean la llamada con 402 (Payment Required). Sin excepciones: no hay
 *   plan gratuito que dé acceso.
 *
 * Códigos de respuesta acordados:
 *   402 Payment Required  → suscripción sin acceso (impago, trial caducado…).
 *   403 Forbidden         → la feature no forma parte del plan contratado.
 *   429 Too Many Requests → cuota del ciclo agotada (con `Retry-After`).
 *   507 Insufficient Storage → tope de filas/almacenamiento alcanzado.
 */

export type AdminLike = SupabaseClient<any, 'public', any>;

export type UsageField = 'ai_responses' | 'whatsapp_sent' | 'reviews_ingested' | 'google_calls';

/** Clave de feature del plan (re-export para las puertas de IA). */
export type PlanFeaturesKey = keyof PlanFeatures;

/** Columna física de `usage_counters` para cada métrica. */
export const METRIC_COLUMN: Record<UsageMetric, UsageField> = {
  requests: 'whatsapp_sent',
  reviews: 'reviews_ingested',
  ai: 'ai_responses',
  syncs: 'google_calls',
};


/**
 * Nombre de la métrica en la función Postgres `consume_quota()`.
 * (Se conservan los identificadores SQL históricos para no romper la RPC.)
 */
const RPC_METRIC: Record<UsageMetric, string> = {
  requests: 'whatsapp',
  reviews: 'reviews',
  ai: 'ai',
  syncs: 'google_call',
};

export type MetricQuota = {
  used: number;
  quota: number;
  remaining: number;
  allowed: boolean;
  pct: number;
};

/** Estado de una tabla protegida por tope (opiniones, auditoría, conexiones). */
export type TableCap = {
  /** Nombre legible para la UI. */
  label: string;
  /** Filas usadas por esta empresa. */
  used: number;
  /** Tope duro del plan. */
  cap: number;
  remaining: number;
  pct: number;
  /** ¿Se puede escribir una fila más? */
  allowed: boolean;
};

export type StorageCheck = {
  reviews: TableCap;
  audit: TableCap;
  integrations: TableCap;
  /** Contabilidad de tokens (`ai_interactions`) retenida por empresa. */
  ai: TableCap;
  /** Cuota de almacenamiento activo asignada (MB). */
  limitMb: number;
  /** Estimación de MB usados (filas reales × coste medio por fila). */
  usedMb: number;
  remainingMb: number;
  pct: number;
  /** Días de retención de `system_logs` del plan. */
  logRetentionDays: number;
  /** Filas purgadas en la última pasada de mantenimiento. */
  purged: { reviews: number; audit: number; ai: number; logs: number };
};

export type QuotaCheck = {
  /** ¿Puede consumir al menos 1 unidad más de la métrica solicitada? */
  allowed: boolean;
  plan: PlanId;
  planDefinition: PlanDefinition;
  cycle: string;
  /** Cuotas mensuales por métrica (plan + extras del ciclo). */
  metrics: Record<UsageMetric, MetricQuota>;
  /**
   * Consumo REAL de tokens de IA del ciclo (lo escribe `lib/ai.ts`).
   * `tokens` = entrada + salida; se cobra contra `aiTokensPerMonth` del plan.
   */
  aiUsage: {
    tokensUsed: number;
    tokensLimit: number;
    tokensRemaining: number;
    pct: number;
    /** Coste estimado acumulado del ciclo (USD, precio público de gpt-4o-mini). */
    costUsd: number;
    requests: number;
    model: string;
  };
  /** Topes por tabla / almacenamiento activo. */
  storage: StorageCheck;
  counters: {
    reviews_ingested: number;
    ai_responses: number;
    whatsapp_sent: number;
    google_calls: number;
    /** Tokens de IA del ciclo (entrada y salida). */
    ai_tokens_in: number;
    ai_tokens_out: number;
  };
  /** Extra aportado por las ampliaciones compradas en el ciclo. */
  extras: { requests: number; reviews: number; ai: number; syncs: number; stored: number };
  /** Nº de ampliaciones compradas en el ciclo. */
  packs: number;
  renewalAt: string;
  renewalLabel: string;
  retryAfterSeconds: number;
  /** Métrica que ha provocado el bloqueo (si aplica). */
  blockedBy: UsageMetric | 'storage' | null;
  subscriptionStatus: string;
  suspended: boolean;
  hasAccess: boolean;
  /** true si la prueba de TRIAL_DAYS días venció sin pago (corte el día 8). */
  trialExpired: boolean;
  /** Fin de la prueba (`tenants.trial_ends_at`), si aplica. */
  trialEndsAt: string | null;
};

/** Throttle de la purga global de logs (evita borrados en cada petición). */
let lastGlobalPurgeAt = 0;
const GLOBAL_PURGE_INTERVAL_MS = 60 * 60 * 1000;

const EMPTY_COUNTERS = {
  reviews_ingested: 0,
  ai_responses: 0,
  whatsapp_sent: 0,
  google_calls: 0,
  ai_tokens_in: 0,
  ai_tokens_out: 0,
};

function pct(used: number, quota: number): number {
  if (quota <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

function metricQuota(used: number, quota: number): MetricQuota {
  return {
    used,
    quota,
    remaining: Math.max(0, quota - used),
    allowed: used < quota,
    pct: pct(used, quota),
  };
}

function tableCap(label: string, used: number, cap: number): TableCap {
  return {
    label,
    used,
    cap,
    remaining: Math.max(0, cap - used),
    pct: pct(used, cap),
    allowed: used < cap,
  };
}

/* ------------------------------------------------------------------ */
/* Lectura del estado                                                  */
/* ------------------------------------------------------------------ */

type TenantQuotaRow = {
  id: string;
  plan?: string | null;
  subscription_status?: string | null;
  suspended?: boolean | null;
  trial_ends_at?: string | null;
  /* Ampliaciones del ciclo (columnas v3.7.0). */
  extra_requests?: number | null;
  extra_reviews?: number | null;
  extra_ai?: number | null;
  extra_syncs?: number | null;
  extra_stored?: number | null;
  extra_quota_cycle?: string | null;
  /* Contabilidad de IA del ciclo (v3.8.0). */
  ai_tokens_in?: number | null;
  ai_tokens_out?: number | null;
  ai_requests?: number | null;
  ai_cost_usd?: number | null;
  /* Columnas legacy de v3.6.0 (se ignoran si existen). */
  extra_quota?: number | null;
  extra_whatsapp?: number | null;
};

/**
 * Lee la fila del tenant con `select('*')`: así funciona igual con la BD
 * migrada a v3.7.0 y con instalaciones antiguas (las columnas que falten
 * simplemente llegan como `undefined`).
 */
async function readTenant(admin: AdminLike, tenantId: string): Promise<TenantQuotaRow> {
  const { data } = await admin.from('tenants').select('*').eq('id', tenantId).single();
  return (data ?? { id: tenantId }) as TenantQuotaRow;
}

/**
 * Si el ciclo guardado en `tenants.extra_quota_cycle` ya no es el actual, las
 * ampliaciones caducaron: se ponen a 0 (son del ciclo en que se compran).
 * Idempotente y barato; se ejecuta en cada lectura de cuota.
 */
async function rollOverExtras(admin: AdminLike, tenant: TenantQuotaRow, cycle: string): Promise<void> {
  const hasExtras =
    (tenant.extra_requests ?? 0) > 0 ||
    (tenant.extra_reviews ?? 0) > 0 ||
    (tenant.extra_ai ?? 0) > 0 ||
    (tenant.extra_syncs ?? 0) > 0;
  if (!hasExtras && !tenant.extra_quota_cycle) return;
  if (tenant.extra_quota_cycle === cycle) return;

  const patch: Record<string, unknown> = {
    extra_requests: 0,
    extra_reviews: 0,
    extra_ai: 0,
    extra_syncs: 0,
    extra_quota_cycle: cycle,
  };
  await admin.from('tenants').update(patch).eq('id', tenant.id);
  Object.assign(tenant, patch);
}

async function readCounters(admin: AdminLike, tenantId: string, cycle: string) {
  const { data } = await admin
    .from('usage_counters')
    .select('ai_responses, whatsapp_sent, reviews_ingested, google_calls, ai_tokens_in, ai_tokens_out')
    .eq('tenant_id', tenantId)
    .eq('cycle', cycle)
    .single();
  // Si la BD aún no tiene el contador de tokens (migración 3.8.0 pendiente),
  // se reconstruye desde el ledger `ai_interactions` para no mentir en el panel.
  const counters = { ...EMPTY_COUNTERS, ...((data ?? {}) as Partial<typeof EMPTY_COUNTERS>) };
  if (counters.ai_tokens_in === 0 && counters.ai_tokens_out === 0) {
    const ledger = await readAiLedgerTokens(admin, tenantId, cycle);
    if (ledger.tokens > 0) {
      counters.ai_tokens_in = ledger.tokensIn;
      counters.ai_tokens_out = ledger.tokensOut;
    }
  }
  return counters;
}

/** Suma de tokens del ledger `ai_interactions` del ciclo (fallback/auditoría). */
async function readAiLedgerTokens(
  admin: AdminLike,
  tenantId: string,
  cycle: string,
): Promise<{ tokens: number; tokensIn: number; tokensOut: number }> {
  try {
    const { data } = await admin
      .from('ai_interactions')
      .select('prompt_tokens, completion_tokens')
      .eq('tenant_id', tenantId)
      .eq('cycle', cycle)
      .limit(5000);
    const rows = (data ?? []) as Array<{ prompt_tokens?: number | null; completion_tokens?: number | null }>;
    const tokensIn = rows.reduce((a, r) => a + Number(r.prompt_tokens ?? 0), 0);
    const tokensOut = rows.reduce((a, r) => a + Number(r.completion_tokens ?? 0), 0);
    return { tokens: tokensIn + tokensOut, tokensIn, tokensOut };
  } catch {
    return { tokens: 0, tokensIn: 0, tokensOut: 0 };
  }
}

async function readAddonEvents(admin: AdminLike, tenantId: string, cycle: string) {
  const { data } = await admin
    .from('addons')
    .select('events, reviews, ai, whatsapp')
    .eq('tenant_id', tenantId)
    .eq('cycle', cycle);
  const rows = (data ?? []) as Array<Partial<Record<'events' | 'reviews' | 'ai' | 'whatsapp', number>>>;
  // Ledger histórico: `whatsapp` guarda las peticiones y `events` los syncs
  // (ver `grantAddon` en el webhook de Stripe).
  return {
    packs: rows.length,
    requests: rows.reduce((a, r) => a + (r.whatsapp ?? 0), 0),
    reviews: rows.reduce((a, r) => a + (r.reviews ?? 0), 0),
    ai: rows.reduce((a, r) => a + (r.ai ?? 0), 0),
    syncs: rows.reduce((a, r) => a + (r.events ?? 0), 0),
  };
}

/** Cuenta filas de una tabla scoped por tenant (o global si no hay columna). */
async function countRows(admin: AdminLike, table: string, tenantId?: string): Promise<number> {
  try {
    let query = admin.from(table).select('id', { count: 'exact', head: true });
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { count } = await query;
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Topes por tabla y purga automática                                  */
/* ------------------------------------------------------------------ */

/**
 * Retención global de `system_logs` (tabla compartida por toda la instancia).
 * Se usa el horizonte más largo de los planes para no borrar el histórico que
 * un cliente Business sí tiene contratado.
 */
export const GLOBAL_LOG_RETENTION_DAYS = 365;

/** Borra las filas más antiguas de una tabla hasta dejar `keep` por tenant. */
async function trimOldest(
  admin: AdminLike,
  table: string,
  tenantId: string,
  keep: number,
  olderThanDays?: number,
): Promise<number> {
  // 1) Purga por antigüedad (historial de actividad del plan).
  if (olderThanDays && olderThanDays > 0) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { count } = await admin
        .from(table)
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId)
        .lt('created_at', cutoff);
      if ((count ?? 0) > 0) {
        // sigue con la purga por volumen para respetar el tope duro
      }
    } catch {
      /* sin permiso o tabla ausente */
    }
  }

  try {
    // Fila frontera: la primera que sobra (keep + 1 más reciente).
    const { data: boundaryRows } = await admin
      .from(table)
      .select('created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(keep, keep);
    const boundary = boundaryRows?.[0]?.created_at as string | undefined;
    if (!boundary) return 0;

    const { count } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId)
      .lt('created_at', boundary);
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

/** Purga global de `system_logs` anterior a `retentionDays`. */
export async function purgeSystemLogs(
  admin: AdminLike,
  retentionDays: number = GLOBAL_LOG_RETENTION_DAYS,
): Promise<number> {
  const days = Math.max(7, Math.round(retentionDays));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { count } = await admin.from('system_logs').delete({ count: 'exact' }).lt('created_at', cutoff);
    return Number(count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Aplica la estrategia de purga del plan y devuelve el estado REAL de las
 * tres tablas protegidas. Se llama antes de importar opiniones o de abrir una
 * conexión, y desde `checkQuota()` (con throttle) para mantenimiento continuo.
 */
export async function enforceStorage(
  admin: AdminLike,
  tenantId: string,
  options: { purge?: boolean; withLogs?: boolean } = {},
): Promise<StorageCheck> {
  const { purge = true, withLogs = false } = options;
  const tenant = await readTenant(admin, tenantId);
  const limits = PLANS[resolvePlan(tenant.plan)].limits;

  const storedCap = limits.reviewsStored + Math.max(0, tenant.extra_stored ?? 0);

  let purged = { reviews: 0, audit: 0, ai: 0, logs: 0 };
  if (purge) {
    purged = {
      reviews: await trimOldest(admin, 'reviews', tenantId, storedCap),
      audit: await trimOldest(admin, 'quota_events', tenantId, limits.auditRows, limits.logRetentionDays),
      ai: await trimOldest(admin, 'ai_interactions', tenantId, limits.aiRows, limits.logRetentionDays),
      logs: withLogs ? await purgeSystemLogs(admin) : 0,
    };
  }

  const [reviewsUsed, auditUsed, integrationsUsed, aiUsed] = await Promise.all([
    countRows(admin, 'reviews', tenantId),
    countRows(admin, 'quota_events', tenantId),
    countRows(admin, 'integrations', tenantId),
    countRows(admin, 'ai_interactions', tenantId),
  ]);

  const reviews = tableCap('Opiniones guardadas', reviewsUsed, storedCap);
  const audit = tableCap('Registros de auditoría', auditUsed, limits.auditRows);
  const integrations = tableCap('Conexiones activas', integrationsUsed, limits.integrations);
  const ai = tableCap('Registros de IA', aiUsed, limits.aiRows);
  const usedMb = estimateStorageMb({
    reviewsStored: reviewsUsed,
    auditRows: auditUsed,
    integrations: integrationsUsed,
    aiRows: aiUsed,
  });

  return {
    reviews,
    audit,
    integrations,
    ai,
    limitMb: limits.storageMb,
    usedMb,
    remainingMb: Math.max(0, Math.round((limits.storageMb - usedMb) * 10) / 10),
    pct: pct(usedMb, limits.storageMb),
    logRetentionDays: limits.logRetentionDays,
    purged,
  };
}

/**
 * ¿Puede esta empresa guardar una opinión más (o abrir una conexión más)?
 * Purga primero lo que sobra; si sigue en el tope, bloquea con 507.
 */
export async function enforceTableCap(
  admin: AdminLike,
  tenantId: string,
  table: 'reviews' | 'integrations',
): Promise<{ ok: true; storage: StorageCheck } | (GateBlocked & { storage: StorageCheck })> {
  const storage = await enforceStorage(admin, tenantId, { purge: true, withLogs: table === 'reviews' });
  const cap = table === 'reviews' ? storage.reviews : storage.integrations;

  if (!cap.allowed) {
    return {
      ok: false,
      status: 507,
      code: 'storage_limit',
      error:
        table === 'reviews'
          ? `Tu plan guarda hasta ${cap.cap.toLocaleString('es-ES')} opiniones (ahora tienes ${cap.used.toLocaleString('es-ES')}). ` +
            `Las más antiguas ya se archivaron/purgaron automáticamente: amplía el almacenamiento o pasa a un plan superior.`
          : `Tu plan permite ${cap.cap} conexiones simultáneas y ya las tienes todas activas. ` +
            `Desconecta una o pasa a un plan superior para añadir más.`,
      headers: {},
      body: {},
      storage,
    } as GateBlocked & { storage: StorageCheck };
  }
  return { ok: true, storage };
}

/* ------------------------------------------------------------------ */
/* Puerta específica de IA (créditos + presupuesto de TOKENS)          */
/* ------------------------------------------------------------------ */

/**
 * Comprueba si la empresa puede hacer una llamada de IA:
 *   402 sin suscripción / prueba caducada · 403 feature fuera de plan ·
 *   429 sin créditos de IA · 429 sin presupuesto de tokens ·
 *   507 con la tabla `ai_interactions` en su tope.
 * ORDEN IMPORTANTE: se comprueba ANTES de llamar al proveedor, para no
 * gastar dinero en peticiones que se van a rechazar.
 */
export async function enforceAi(
  admin: AdminLike,
  tenantId: string,
  options: { feature?: PlanFeaturesKey; action?: string } = {},
): Promise<GateResult> {
  const check = await checkQuota(admin, tenantId);
  const plan = check.planDefinition;
  const action = options.action ?? 'Generar con IA';

  if (check.suspended) {
    return blocked(check, 402, 'suspended', 'Empresa suspendida. Contacta con soporte para reactivarla.');
  }
  // REGLA ESTRICTA: sin suscripción activa o con la prueba de 7 días
  // caducada → 402. No hay plan gratuito que dé acceso.
  if (check.trialExpired) {
    return blocked(
      check,
      402,
      'trial_expired',
      `Tu prueba de ${TRIAL_DAYS} días terminó y el pago no se completó. Reactiva tu suscripción para seguir usando la IA.`,
    );
  }
  if (!check.hasAccess) {
    return blocked(
      check,
      402,
      'no_subscription',
      'Suscripción sin acceso (impago, cancelación o sin plan de pago). Reactívala para seguir usando la IA.',
    );
  }
  const feature: PlanFeaturesKey = options.feature ?? 'aiReplies';
  if (!planHasFeature(plan.id, feature)) {
    const upgradeTo = PLAN_CATALOG.find((p) => p.features[feature] && p.priceCents > plan.priceCents);
    return blocked(
      check,
      403,
      'feature_not_included',
      upgradeTo
        ? `«${action}» no está incluido en el plan ${plan.label}. Pasa al plan ${upgradeTo.label} (${upgradeTo.price}/mes) para desbloquearlo.`
        : `«${action}» no está disponible en tu plan ${plan.label}. Contacta con soporte para revisarlo.`,
    );
  }

  const credits = check.metrics.ai;
  if (!credits.allowed) {
    return blocked(check, 429, 'quota_exhausted', quotaExhaustedMessage(check, 'ai'));
  }

  // Presupuesto de tokens del ciclo (freno de coste real frente a OpenAI).
  if (check.aiUsage.tokensUsed >= check.aiUsage.tokensLimit) {
    return blocked(
      check,
      429,
      'token_budget_exhausted',
      `Has agotado el presupuesto de tokens de IA de tu plan ${plan.label} ` +
        `(${check.aiUsage.tokensUsed.toLocaleString('es-ES')}/${check.aiUsage.tokensLimit.toLocaleString('es-ES')} tokens). ` +
        `Se reinicia el ${check.renewalLabel} o puedes ampliar tus créditos de IA con una recarga.`,
    );
  }

  // Tope de filas de contabilidad de IA (protección de la BD).
  if (!check.storage.ai.allowed) {
    return blocked(
      check,
      507,
      'storage_limit',
      `Tu plan guarda hasta ${check.storage.ai.cap.toLocaleString('es-ES')} registros de IA y ya está al límite. ` +
        `Los más antiguos se purgan automáticamente; si necesitas más histórico, pasa a un plan superior.`,
    );
  }

  return { ok: true, status: 200, check, plan };
}

/**
 * Registra el consumo de tokens de una llamada de IA:
 *   · `usage_counters.ai_tokens_in/out` (contador del ciclo, lo lee la cuota).
 *   · `tenants.ai_tokens_*`, `ai_requests`, `ai_cost_usd` (totales rápidos).
 *   · `ai_interactions` (ledger auditable por llamada: modelo, latencia, coste).
 * NUNCA lanza: es contabilidad, no debe tumbar la respuesta al cliente.
 */
export async function recordAiUsage(
  admin: AdminLike,
  tenantId: string,
  usage: {
    model: string;
    purpose: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
    provider: 'openai' | 'local-template' | 'local-heuristic' | 'unavailable';
    ok: boolean;
    errorCode?: string | null;
    /** IA asíncrona (cola): enlaza la fila con el job para `GET /api/ai/result`. */
    jobId?: string;
    resultText?: string;
    resultStatus?: 'pending' | 'ready' | 'error';
  },
): Promise<void> {
  const cycle = currentCycle();
  const tokensIn = Math.max(0, Math.round(usage.promptTokens));
  const tokensOut = Math.max(0, Math.round(usage.completionTokens));

  try {
    // 1) Ledger auditable por llamada.
    await admin.from('ai_interactions').insert({
      tenant_id: tenantId,
      cycle,
      model: usage.model,
      purpose: usage.purpose.slice(0, 60),
      prompt_tokens: tokensIn,
      completion_tokens: tokensOut,
      total_tokens: tokensIn + tokensOut,
      cost_usd: usage.costUsd,
      latency_ms: Math.max(0, Math.round(usage.latencyMs)),
      provider: usage.provider,
      ok: usage.ok,
      error_code: usage.errorCode ?? null,
      job_id: usage.jobId ?? null,
      result_text: usage.resultText?.slice(0, 4000) ?? null,
      result_status: usage.resultStatus ?? 'ready',
    });
  } catch {
    /* tabla ausente (migración pendiente): seguimos con los contadores */
  }

  try {
    // 2) Contador del ciclo (atómico vía RPC si existe; si no, upsert).
    const { error } = await admin.rpc('consume_ai_tokens', {
      p_tenant: tenantId,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
    });
    if (error) {
      const counters = await readCounters(admin, tenantId, cycle);
      await admin.from('usage_counters').upsert(
        {
          tenant_id: tenantId,
          cycle,
          ai_tokens_in: counters.ai_tokens_in + tokensIn,
          ai_tokens_out: counters.ai_tokens_out + tokensOut,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,cycle' },
      );
    }
  } catch {
    /* contabilidad best-effort */
  }

  try {
    // 3) Totales rápidos del tenant (los lee el panel interno y /api/health).
    const tenant = await readTenant(admin, tenantId);
    await admin
      .from('tenants')
      .update({
        ai_tokens_in: Math.max(0, Number(tenant.ai_tokens_in ?? 0)) + tokensIn,
        ai_tokens_out: Math.max(0, Number(tenant.ai_tokens_out ?? 0)) + tokensOut,
        ai_requests: Math.max(0, Number(tenant.ai_requests ?? 0)) + 1,
        ai_cost_usd: Math.round((Number(tenant.ai_cost_usd ?? 0) + usage.costUsd) * 1_000_000) / 1_000_000,
      })
      .eq('id', tenantId);
  } catch {
    /* opcional */
  }
}

/* ------------------------------------------------------------------ */
/* Cálculo de la cuota                                                 */
/* ------------------------------------------------------------------ */

/**
 * Calcula la cuota completa del tenant en el ciclo actual.
 * Nunca lanza: si falta la fila del tenant devuelve un check del plan Pro (de pago).
 */
export async function checkQuota(admin: AdminLike, tenantId: string): Promise<QuotaCheck> {
  const now = new Date();
  const cycle = currentCycle(now);

  const tenant = await readTenant(admin, tenantId);
  await rollOverExtras(admin, tenant, cycle).catch(() => undefined);

  const plan: PlanId = resolvePlan(tenant.plan);
  const definition = PLANS[plan];
  const limits = definition.limits;

  const counters = await readCounters(admin, tenantId, cycle);
  const ledger = await readAddonEvents(admin, tenantId, cycle);

  // Las ampliaciones viven en dos sitios por diseño:
  //  · `tenants.extra_*` → cache inmediata escrita por el webhook de Stripe.
  //  · `addons`          → ledger auditable de cada compra.
  // Se usa el MAYOR de los dos para no penalizar al cliente si uno falla.
  const extras = {
    requests: Math.max(tenant.extra_requests ?? 0, ledger.requests),
    reviews: Math.max(tenant.extra_reviews ?? 0, ledger.reviews),
    ai: Math.max(tenant.extra_ai ?? 0, ledger.ai),
    syncs: Math.max(tenant.extra_syncs ?? 0, ledger.syncs),
    stored: Math.max(0, tenant.extra_stored ?? 0),
  };

  const metrics: Record<UsageMetric, MetricQuota> = {
    requests: metricQuota(counters.whatsapp_sent, limits.requestsPerMonth + extras.requests),
    reviews: metricQuota(counters.reviews_ingested, limits.reviewsPerMonth + extras.reviews),
    ai: metricQuota(counters.ai_responses, limits.aiRepliesPerMonth + extras.ai),
    syncs: metricQuota(counters.google_calls, limits.syncsPerMonth + extras.syncs),
  };

  // CONTABILIDAD REAL DE TOKENS de IA del ciclo (escribe `lib/ai.ts`).
  const tokensUsed = counters.ai_tokens_in + counters.ai_tokens_out;
  const tokensLimit = limits.aiTokensPerMonth;
  const aiUsage = {
    tokensUsed,
    tokensLimit,
    tokensRemaining: Math.max(0, tokensLimit - tokensUsed),
    pct: pct(tokensUsed, tokensLimit),
    costUsd: estimateCostUsd(counters.ai_tokens_in, counters.ai_tokens_out),
    requests: counters.ai_responses,
    model: DEFAULT_AI_MODEL,
  };

  // Mantenimiento de la BD: purga lo que exceda los topes del plan.
  const storage = await enforceStorage(admin, tenantId, { purge: true, withLogs: false });

  // Purga global de `system_logs` (1 vez por hora y proceso como máximo).
  if (Date.now() - lastGlobalPurgeAt > GLOBAL_PURGE_INTERVAL_MS) {
    lastGlobalPurgeAt = Date.now();
    await purgeSystemLogs(admin).catch(() => 0);
  }

  let blockedBy: QuotaCheck['blockedBy'] = null;
  if (!storage.reviews.allowed) blockedBy = 'storage';
  else if (!metrics.requests.allowed) blockedBy = 'requests';
  else if (!metrics.reviews.allowed) blockedBy = 'reviews';
  else if (!metrics.ai.allowed) blockedBy = 'ai';
  else if (!metrics.syncs.allowed) blockedBy = 'syncs';

  const subscriptionStatus = tenant.subscription_status ?? 'none';
  const suspended = Boolean(tenant.suspended);
  const trialEndsAt: string | null = tenant.trial_ends_at ?? null;
  // REGLA ESTRICTA: `trialing` solo da acceso si la prueba NO ha caducado.
  // Día 8 sin pago completado → corte aunque Stripe aún diga `trialing`.
  const trialExpired = isTrialExpired(subscriptionStatus, trialEndsAt, now);
  const hasAccess =
    !suspended &&
    (subscriptionStatus === 'active' || (subscriptionStatus === 'trialing' && !trialExpired));

  return {
    allowed: blockedBy === null,
    plan,
    planDefinition: definition,
    cycle,
    metrics,
    aiUsage,
    storage,
    counters,
    extras,
    packs: ledger.packs,
    renewalAt: nextCycleStart(now).toISOString(),
    renewalLabel: renewalLabel(now),
    retryAfterSeconds: secondsUntilRenewal(now),
    blockedBy,
    subscriptionStatus,
    suspended,
    hasAccess,
    trialExpired,
    trialEndsAt,
  };
}

/* ------------------------------------------------------------------ */
/* Escritura (atómica)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Incrementa el contador del ciclo actual.
 * 1º intenta la función Postgres `consume_quota` (atómica, sin condiciones
 * de carrera); si la BD aún no tiene la migración, hace upsert JS.
 */
export async function consume(
  admin: AdminLike,
  tenantId: string,
  metric: UsageMetric,
  amount = 1,
): Promise<{ ok: boolean; via: 'rpc' | 'upsert'; counters?: QuotaCheck['counters'] }> {
  if (amount <= 0) return { ok: true, via: 'rpc' };
  const cycle = currentCycle();

  try {
    const { data, error } = await admin.rpc('consume_quota', {
      p_tenant: tenantId,
      p_metric: RPC_METRIC[metric],
      p_amount: amount,
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        ok: true,
        via: 'rpc',
        counters: {
          reviews_ingested: Number(row?.reviews_ingested ?? 0),
          ai_responses: Number(row?.ai_responses ?? 0),
          whatsapp_sent: Number(row?.whatsapp_sent ?? 0),
          google_calls: Number(row?.google_calls ?? 0),
          ai_tokens_in: Number(row?.ai_tokens_in ?? 0),
          ai_tokens_out: Number(row?.ai_tokens_out ?? 0),
        },
      };
    }
  } catch {
    /* sin función RPC → fallback */
  }

  const field = METRIC_COLUMN[metric];
  const counters = await readCounters(admin, tenantId, cycle);
  const next = {
    tenant_id: tenantId,
    cycle,
    ai_responses: counters.ai_responses + (field === 'ai_responses' ? amount : 0),
    whatsapp_sent: counters.whatsapp_sent + (field === 'whatsapp_sent' ? amount : 0),
    reviews_ingested: counters.reviews_ingested + (field === 'reviews_ingested' ? amount : 0),
    google_calls: counters.google_calls + (field === 'google_calls' ? amount : 0),
    updated_at: new Date().toISOString(),
  };
  await admin.from('usage_counters').upsert(next, { onConflict: 'tenant_id,cycle' });
  return { ok: true, via: 'upsert' };
}


/** Registra una sincronización con Google (Places/Business) sin coste de IA. */
export async function logGoogleCall(admin: AdminLike, tenantId: string, amount = 1): Promise<void> {
  await consume(admin, tenantId, 'syncs', amount);
}

/* ------------------------------------------------------------------ */
/* Puerta de acceso (gate)                                             */
/* ------------------------------------------------------------------ */

export type GateRequest = {
  /** Métrica que se va a consumir. */
  metric: UsageMetric;
  /** Cantidad (por defecto 1). */
  amount?: number;
  /** Feature del plan requerida (corte 403 si no la tiene). */
  feature?: keyof PlanFeatures;
  /** Etiqueta para logs/mensajes («respuesta IA», «petición por email»…). */
  action?: string;
};

export type GateOk = {
  ok: true;
  status: 200;
  check: QuotaCheck;
  plan: PlanDefinition;
};

export type GateBlocked = {
  ok: false;
  status: 402 | 403 | 429 | 507;
  code:
    | 'no_subscription'
    | 'trial_expired'
    | 'suspended'
    | 'feature_not_included'
    | 'quota_exhausted'
    | 'token_budget_exhausted'
    | 'storage_limit';
  error: string;
  /** Cabeceras recomendadas (Retry-After en el 429). */
  headers: Record<string, string>;
  body: Record<string, unknown>;
  check: QuotaCheck;
};

export type GateResult = GateOk | GateBlocked;

/**
 * Única puerta de entrada a las APIs externas.
 * Comprueba, en este orden: suscripción → prueba vigente → feature → cuota → topes BD.
 *
 * REGLA ESTRICTA (modelo 100% de pago): si el tenant no tiene suscripción
 * activa O su periodo de prueba de TRIAL_DAYS días ha expirado, la llamada se
 * bloquea con 402 (Payment Required). Sin excepciones.
 */
export async function enforce(
  admin: AdminLike,
  tenantId: string,
  req: GateRequest,
): Promise<GateResult> {
  // amount = 0 → solo comprueba acceso y feature (no consume ni exige saldo).
  const amount = Math.max(0, req.amount ?? 1);
  const check = await checkQuota(admin, tenantId);
  const plan = check.planDefinition;
  const action = req.action ?? METRIC_LABEL[req.metric];

  if (check.suspended) {
    return blocked(check, 402, 'suspended', 'Empresa suspendida. Contacta con soporte para reactivarla.');
  }
  if (check.trialExpired) {
    return blocked(
      check,
      402,
      'trial_expired',
      `Tu prueba de ${TRIAL_DAYS} días terminó y el pago no se completó. Reactiva tu suscripción para seguir usando «${action}».`,
    );
  }
  if (!check.hasAccess) {
    return blocked(
      check,
      402,
      'no_subscription',
      'Suscripción sin acceso (impago, cancelación o sin plan de pago). Reactívala para seguir usando la plataforma.',
    );
  }
  if (req.feature && !planHasFeature(plan.id, req.feature)) {
    // Se sugiere el plan MÁS BARATO que incluye la feature (no siempre es Business).
    const upgradeTo = PLAN_CATALOG.find((p) => p.features[req.feature!] && p.priceCents > plan.priceCents);
    return blocked(
      check,
      403,
      'feature_not_included',
      upgradeTo
        ? `«${action}» no está incluido en el plan ${plan.label}. Pasa al plan ${upgradeTo.label} (${upgradeTo.price}/mes) para desbloquearlo.`
        : `«${action}» no está disponible en tu plan ${plan.label}. Contacta con soporte para revisarlo.`,
    );
  }

  const metric = check.metrics[req.metric];
  if (amount > 0 && metric.used + amount > metric.quota) {
    return blocked(check, 429, 'quota_exhausted', quotaExhaustedMessage(check, req.metric, amount));
  }

  // Topes de base de datos (solo relevantes al guardar filas nuevas).
  if (req.metric === 'reviews' && amount > 0 && !check.storage.reviews.allowed) {
    return blocked(check, 507, 'storage_limit', storageExhaustedMessage(check));
  }

  return { ok: true, status: 200, check, plan };
}


/**
 * Puerta de SOLO suscripción para rutas que no consumen cuota
 * (`/api/reviews/private-note`, `/api/reviews/publish`, conexiones OAuth…).
 * Aplica la regla estricta: suspendida, prueba caducada o sin plan de pago
 * → 402. Devuelve el `GateResult` listo para responder al cliente.
 */
export async function requirePaidAccess(
  admin: AdminLike,
  tenantId: string,
  options: { feature?: keyof PlanFeatures; action?: string; metric?: UsageMetric } = {},
): Promise<GateResult> {
  return enforce(admin, tenantId, {
    metric: options.metric ?? 'reviews',
    amount: 0,
    feature: options.feature,
    action: options.action ?? 'Usar la plataforma',
  });
}

function blocked(
  check: QuotaCheck,
  status: 402 | 403 | 429 | 507,
  code: GateBlocked['code'],
  message: string,
): GateBlocked {
  const headers: Record<string, string> = {};
  const metric = check.blockedBy && check.blockedBy !== 'storage' ? check.metrics[check.blockedBy] : null;
  if (status === 429) headers['Retry-After'] = String(check.retryAfterSeconds);
  headers['X-RateLimit-Limit'] = String(metric?.quota ?? check.storage.limitMb);
  headers['X-RateLimit-Remaining'] = String(metric?.remaining ?? check.storage.remainingMb);
  headers['X-RateLimit-Reset'] = check.renewalAt;

  return {
    ok: false,
    status,
    code,
    error: message,
    headers,
    check,
    body: {
      error: message,
      code,
      quota: publicQuota(check),
      upgrade: upgradeHints(check),
    },
  };
}

export function quotaExhaustedMessage(check: QuotaCheck, metric: UsageMetric, amount = 1): string {
  const m = check.metrics[metric];
  return (
    `Has alcanzado el límite de ${METRIC_LABEL[metric]} de tu plan ${check.planDefinition.label} ` +
    `(${m.used.toLocaleString('es-ES')}/${m.quota.toLocaleString('es-ES')}). No se pueden procesar ${amount} más. ` +
    `El contador se reinicia el ${check.renewalLabel} o puedes ampliarlo ahora con una recarga.`
  );
}

function storageExhaustedMessage(check: QuotaCheck): string {
  const s = check.storage.reviews;
  return (
    `Has llegado al máximo de opiniones guardadas de tu plan (${s.cap.toLocaleString('es-ES')}). ` +
    `Las más antiguas se archivan/purgan automáticamente para proteger la base de datos. ` +
    `Amplía el almacenamiento o pasa a un plan superior para conservar más histórico.`
  );
}

/** Payload de cuota seguro para el cliente (sin datos internos). */
export function publicQuota(check: QuotaCheck) {
  // Alias agregados: suma de las 4 cuotas mensuales (compatibilidad con la UI
  // y los mensajes que antes hablaban de «eventos»).
  const used = Object.values(check.metrics).reduce((a, m) => a + m.used, 0);
  const limit = Object.values(check.metrics).reduce((a, m) => a + m.quota, 0);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan: check.plan,
    planLabel: check.planDefinition.label,
    tier: check.planDefinition.tier,
    cycle: check.cycle,
    allowed: check.allowed,
    blockedBy: check.blockedBy,
    renewalAt: check.renewalAt,
    renewalLabel: check.renewalLabel,
    metrics: check.metrics,
    /** Consumo real de tokens de IA del ciclo + coste estimado (USD). */
    aiUsage: check.aiUsage,
    counters: check.counters,
    extras: check.extras,
    packs: check.packs,
    storage: {
      reviews: check.storage.reviews,
      audit: check.storage.audit,
      integrations: check.storage.integrations,
      ai: check.storage.ai,
      limitMb: check.storage.limitMb,
      usedMb: check.storage.usedMb,
      remainingMb: check.storage.remainingMb,
      pct: check.storage.pct,
      logRetentionDays: check.storage.logRetentionDays,
    },
  };
}

/** Rutas de escape comerciales que se devuelven junto al error 402/429/507. */
export function upgradeHints(check: QuotaCheck) {
  return {
    addonUrl: '/api/stripe/addon',
    packsUrl: '/dashboard?tab=facturacion',
    plansUrl: '/#planes',
    portalUrl: '/api/stripe/portal',
    suggestedPack: suggestPack(check),
  };
}

function suggestPack(check: QuotaCheck): AddonPack['id'] | null {
  switch (check.blockedBy) {
    case 'requests':
      return 'extra_requests_1000';
    case 'reviews':
    case 'storage':
      return 'extra_reviews_2000';
    case 'ai':
      return 'extra_ai_500';
    case 'syncs':
      return 'extra_syncs_500';
    default:
      return null;
  }
}


/** Cabeceras recomendadas para el 429 de cuota. */
export function quotaHeaders(check: QuotaCheck): Record<string, string> {
  const metric = check.blockedBy && check.blockedBy !== 'storage' ? check.metrics[check.blockedBy] : null;
  return {
    'Retry-After': String(check.retryAfterSeconds),
    'X-RateLimit-Limit': String(metric?.quota ?? check.storage.limitMb),
    'X-RateLimit-Remaining': String(metric?.remaining ?? check.storage.remainingMb),
    'X-RateLimit-Reset': check.renewalAt,
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot para UI                                                    */
/* ------------------------------------------------------------------ */

export type UsageSnapshot = ReturnType<typeof publicQuota> & {
  /** Alias planos que consume el panel (compatibilidad v3.5/v3.6). */
  totalRemaining: number;
  planLimit: number;
  addonEvents: number;
};

/** Datos que consume `/api/tenants/usage` y el widget del dashboard. */
export function toSnapshot(check: QuotaCheck): UsageSnapshot {
  const quota = publicQuota(check);
  const limits = check.planDefinition.limits;
  return {
    ...quota,
    totalRemaining: Math.max(0, quota.limit - quota.used),
    planLimit:
      limits.requestsPerMonth + limits.reviewsPerMonth + limits.aiRepliesPerMonth + limits.syncsPerMonth,
    addonEvents:
      check.extras.requests + check.extras.reviews + check.extras.ai + check.extras.syncs,
  };
}

/**
 * Snapshot sintético para el **modo demo** (sin Supabase configurado).
 * Permite previsualizar los medidores y el selector de ampliaciones del panel
 * con datos coherentes con `lib/plans.ts`. Nunca autoriza consumo real.
 */
export function demoQuotaCheck(planId: PlanId = 'pro'): QuotaCheck {
  const plan = PLANS[planId] ?? PLANS.pro;
  const limits = plan.limits;
  const extras = { requests: 1_000, reviews: 0, ai: 0, syncs: 0, stored: 2_000 };
  const counters = {
    reviews_ingested: 128,
    ai_responses: 96,
    whatsapp_sent: 41,
    google_calls: 12,
    ai_tokens_in: 74_500,
    ai_tokens_out: 21_600,
  };
  const metrics: Record<UsageMetric, MetricQuota> = {
    requests: metricQuota(counters.whatsapp_sent, limits.requestsPerMonth + extras.requests),
    reviews: metricQuota(counters.reviews_ingested, limits.reviewsPerMonth + extras.reviews),
    ai: metricQuota(counters.ai_responses, limits.aiRepliesPerMonth + extras.ai),
    syncs: metricQuota(counters.google_calls, limits.syncsPerMonth + extras.syncs),
  };

  // CONTABILIDAD REAL DE TOKENS de IA del ciclo (escribe `lib/ai.ts`).
  const tokensUsed = counters.ai_tokens_in + counters.ai_tokens_out;
  const tokensLimit = limits.aiTokensPerMonth;
  const aiUsage = {
    tokensUsed,
    tokensLimit,
    tokensRemaining: Math.max(0, tokensLimit - tokensUsed),
    pct: pct(tokensUsed, tokensLimit),
    costUsd: estimateCostUsd(counters.ai_tokens_in, counters.ai_tokens_out),
    requests: counters.ai_responses,
    model: DEFAULT_AI_MODEL,
  };
  const reviews = tableCap('Opiniones guardadas', 342, limits.reviewsStored + extras.stored);
  const audit = tableCap('Registros de auditoría', 812, limits.auditRows);
  const integrations = tableCap('Conexiones activas', 2, limits.integrations);
  const aiRows = tableCap('Registros de IA', 96, limits.aiRows);
  const usedMb = estimateStorageMb({
    reviewsStored: reviews.used,
    auditRows: audit.used,
    integrations: integrations.used,
    aiRows: aiRows.used,
  });

  return {
    allowed: true,
    plan: plan.id,
    planDefinition: plan,
    cycle: currentCycle(),
    metrics,
    aiUsage,
    storage: {
      reviews,
      audit,
      integrations,
      ai: aiRows,
      limitMb: limits.storageMb,
      usedMb,
      remainingMb: Math.max(0, limits.storageMb - usedMb),
      pct: pct(usedMb, limits.storageMb),
      logRetentionDays: limits.logRetentionDays,
      purged: { reviews: 0, audit: 0, ai: 0, logs: 0 },
    },
    counters,
    extras,
    packs: 1,
    renewalAt: nextCycleStart().toISOString(),
    renewalLabel: renewalLabel(),
    retryAfterSeconds: secondsUntilRenewal(),
    blockedBy: null,
    subscriptionStatus: 'active',
    suspended: false,
    hasAccess: true,
    trialExpired: false,
    trialEndsAt: null,
  };
}


/** Compat: límites expuestos por plan (re-export). */
export { PLAN_LIMITS, currentCycle } from '@/lib/plans';