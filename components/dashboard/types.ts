import type { UsageMetric } from '@/lib/plans';

/** Tipos compartidos por el panel privado (/dashboard). */

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  subscription_status: string;
  suspended: boolean;
  trial_ends_at: string | null;
  access: boolean;
  settings: { tone?: string; place_id?: string; whatsapp_to?: string; place_rating?: number | null; tripadvisor_url?: string; trustpilot_url?: string; funnel_enabled?: boolean };
  api_key: string | null;
  integrations: Array<{ provider: string; status: string; last_sync_at: string | null }>;
};

export type MetricQuotaView = {
  used: number;
  quota: number;
  remaining: number;
  allowed: boolean;
  pct: number;
};

/** Tope de una tabla protegida (opiniones, auditoría, conexiones). */
export type TableCapView = MetricQuotaView & {
  label: string;
  cap: number;
};

export type AiUsageView = {
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  pct: number;
  costUsd: number;
  requests: number;
  model: string;
};

export type StorageView = {
  reviews: TableCapView;
  audit: TableCapView;
  integrations: TableCapView;
  /** Contabilidad de tokens (`ai_interactions`). */
  ai: TableCapView;
  limitMb: number;
  usedMb: number;
  remainingMb: number;
  pct: number;
  logRetentionDays: number;
  purged?: { reviews: number; audit: number; ai: number; logs: number };
};

export type UsageResponse = {
  ok: boolean;
  plan: string;
  planLabel: string;
  tier: string;
  cycle: string;
  /** Cuotas mensuales por métrica (peticiones, opiniones, IA, sincronizaciones). */
  metrics: Record<UsageMetric, MetricQuotaView>;
  /** Consumo real de tokens de IA del ciclo (medido por llamada) + coste estimado. */
  aiUsage: AiUsageView;
  limits: {
    requestsPerMonth: number;
    reviewsPerMonth: number;
    aiRepliesPerMonth: number;
    aiTokensPerMonth: number;
    syncsPerMonth: number;
    locations: number;
  };
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  blockedBy: UsageMetric | 'storage' | null;
  /** Topes de base de datos por empresa. */
  storage: StorageView;
  storageLimitMb: number;
  storageUsedMb: number;
  /** Ampliaciones del ciclo en curso. */
  extras: { requests: number; reviews: number; ai: number; syncs: number; stored: number };
  packs: number;
  catalog: Array<{
    id: string;
    name: string;
    description: string;
    priceCents: number;
    price: string;
    metric: UsageMetric;
    amount: number;
    badge: string | null;
  }>;
  counters: {
    reviews_ingested: number;
    ai_replies: number;
    whatsapp_sent: number;
    google_calls: number;
    ai_tokens_in: number;
    ai_tokens_out: number;
  };
  features: Record<string, boolean | string>;
  renewalAt: string;
  renewalLabel: string;
  hasAccess: boolean;
};

export type ApiError = {
  error?: string;
  code?: string;
  quota?: {
    used?: number;
    limit?: number;
    remaining?: number;
    renewalLabel?: string;
    planLabel?: string;
    storage?: { reviews?: { used: number; cap: number } };
  };
  upgrade?: { addonUrl?: string; billingUrl?: string; suggestedPack?: string | null };
};

/** Traduce una respuesta de API fallida a un mensaje accionable para el toast. */
export function describeApiError(status: number, data: ApiError | null): {
  kind: 'error' | 'warning' | 'info';
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
} {
  const rawMessage = data?.error ?? `Error ${status}`;
  const exposesTechnicalSetup = /supabase|service_role|next_public|stripe[^.]*configur|\.env|smtp|price[_ ]id/i.test(rawMessage);
  const message = status >= 500 || exposesTechnicalSetup
    ? 'El servicio no está disponible temporalmente. Reinténtalo o contacta con soporte si continúa.'
    : rawMessage;
  if (status === 429) {
    return {
      kind: 'warning',
      title: 'Cuota del ciclo agotada',
      body: message,
      action: {
        label: 'Ampliar cuota',
        onClick: () => {
          window.location.href = '/dashboard?tab=facturacion';
        },
      },
    };
  }
  if (status === 507) {
    return {
      kind: 'warning',
      title: 'Límite de almacenamiento del plan',
      body: message,
      action: {
        label: 'Ver límites',
        onClick: () => {
          window.location.href = '/dashboard?tab=facturacion';
        },
      },
    };
  }
  if (status === 402) {
    return {
      kind: 'warning',
      title: 'Suscripción sin acceso',
      body: message,
      action: { label: 'Activar plan', onClick: () => (window.location.href = '/bienvenido') },
    };
  }
  if (status === 403) {
    return { kind: 'warning', title: 'No incluido en tu plan', body: message };
  }
  if (status === 401) {
    return {
      kind: 'error',
      title: 'Sesión caducada',
      body: message,
      action: { label: 'Entrar de nuevo', onClick: () => (window.location.href = '/login') },
    };
  }
  return { kind: 'error', title: 'Algo ha fallado', body: message };
}
