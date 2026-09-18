/**
 * ============================================================
 * ReviewFlow AI — Cliente centralizado de OpenAI (v3.8.0)
 * ============================================================
 * TODAS las llamadas a la API de IA pasan por aquí. Un solo sitio donde
 * se controlan: modelo, coste, timeouts, rate limiting, reintentos y
 * contabilidad de tokens. Nada de `new OpenAI()` repartido por el código.
 *
 *   · MODELO por defecto: `gpt-4o-mini` (el más económico de la familia GPT-4o).
 *     Se puede cambiar con `OPENAI_MODEL` sin tocar código.
 *   · TIMEOUT por petición (`OPENAI_TIMEOUT_MS`, 20 s por defecto).
 *   · RATE LIMIT por empresa (`OPENAI_RPM_PER_TENANT`, 20 rpm por defecto):
 *     ventana distribuida en PostgreSQL; la cuota real y persistente también
 *     la aplica `lib/usage.ts`.
 *   · CONCURRENCIA máxima global (`OPENAI_MAX_CONCURRENCY`, 6 por defecto)
 *     para no disparar cientos de peticiones simultáneas en un pico.
 *   · REINTENTOS con backoff exponencial + jitter ante 429/5xx/timeouts,
 *     respetando `Retry-After` cuando OpenAI lo envía.
 *   · FALLBACK: si la API no responde, el llamador recibe `ok: false` y usa
 *     su plantilla/heurística local (la plataforma nunca se queda sin
 *     respuesta). Ver `lib/ai.ts`.
 *   · CONTABILIDAD: tokens de entrada/salida + coste estimado en USD por
 *     llamada; `lib/ai.ts` los persiste por tenant (`ai_interactions` +
 *     `usage_counters.ai_tokens_*`) con `recordAiUsage()`.
 */

import { consumeRateLimit } from '@/lib/rate-limit';
import OpenAI from 'openai';
import { env, isOpenAIConfigured } from '@/lib/env';
import {
  DEFAULT_AI_MODEL,
  aiModelPricing,
  estimateCostUsd as estimateCostUsdPure,
} from '@/lib/plans';

// La tabla de precios y el cálculo de coste viven en `lib/plans.ts` (client-safe)
// para que el panel pueda mostrarlos sin importar el SDK del proveedor.
export { aiModelPricing, estimateCostUsd } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */


/** Modelo efectivo (por defecto `gpt-4o-mini`; configurable con OPENAI_MODEL). */
export const OPENAI_MODEL = (process.env.OPENAI_MODEL ?? DEFAULT_AI_MODEL).trim();

/** Proveedores soportados por el SDK (por si usas Azure/OpenRouter/proxy). */
export const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? '').trim() || undefined;

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Peticiones por minuto y por empresa (protege el gasto ante bucles). */
export const OPENAI_RPM_PER_TENANT = Math.round(num(process.env.OPENAI_RPM_PER_TENANT, 20));
/** Peticiones simultáneas máximas al proveedor (todas las empresas). */
export const OPENAI_MAX_CONCURRENCY = Math.round(num(process.env.OPENAI_MAX_CONCURRENCY, 6));
/** Timeout por petición (ms). */
export const OPENAI_TIMEOUT_MS = Math.round(num(process.env.OPENAI_TIMEOUT_MS, 20_000));
/** Intentos totales ante errores recuperables (1 = sin reintentos). */
export const OPENAI_MAX_ATTEMPTS = Math.round(num(process.env.OPENAI_MAX_ATTEMPTS, 3));

/** Atajo local: mismo cálculo que `lib/plans.ts`, con el modelo activo. */
function estimateCostUsd(promptTokens: number, completionTokens: number, model = OPENAI_MODEL): number {
  return estimateCostUsdPure(promptTokens, completionTokens, model);
}

/** Alias retro-compatible. */

export type OpenAiStatus = {
  /** ¿Hay clave configurada? */
  configured: boolean;
  model: string;
  baseUrl: string | null;
  timeoutMs: number;
  maxAttempts: number;
  rpmPerTenant: number;
  maxConcurrency: number;
  /** Precio de referencia (USD por 1M tokens). */
  pricing: { input: number; output: number };
};

export function openAiStatus(): OpenAiStatus {
  return {
    configured: isOpenAIConfigured,
    model: OPENAI_MODEL,
    baseUrl: OPENAI_BASE_URL ?? null,
    timeoutMs: OPENAI_TIMEOUT_MS,
    maxAttempts: OPENAI_MAX_ATTEMPTS,
    rpmPerTenant: OPENAI_RPM_PER_TENANT,
    maxConcurrency: OPENAI_MAX_CONCURRENCY,
    pricing: aiModelPricing(),
  };
}

/* ------------------------------------------------------------------ */
/* Cliente cacheado                                                    */
/* ------------------------------------------------------------------ */

let cachedClient: OpenAI | null = null;

/** Cliente OpenAI único por proceso (reutiliza el pool HTTP interno del SDK). */
function getOpenAIClient(): OpenAI | null {
  if (!isOpenAIConfigured) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new OpenAI({
    apiKey: env.openaiApiKey,
    ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {}),
    // Nuestros reintentos y timeouts son propios: desactivamos los del SDK.
    maxRetries: 0,
    timeout: OPENAI_TIMEOUT_MS,
  });
  return cachedClient;
}

/* ------------------------------------------------------------------ */
/* Rate limit por empresa + concurrencia global                        */
/* ------------------------------------------------------------------ */

let inFlight = 0;

export type RateVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** Rate limit distribuido: consistente entre instancias serverless y reinicios. */
async function checkTenantRateLimit(tenantId: string): Promise<RateVerdict> {
  const verdict = await consumeRateLimit('openai', tenantId, OPENAI_RPM_PER_TENANT, 60);
  return {
    allowed: verdict.allowed,
    remaining: verdict.allowed ? Math.max(0, OPENAI_RPM_PER_TENANT - 1) : 0,
    retryAfterSeconds: verdict.retryAfter,
  };
}

/** Librea el hueco de concurrencia (siempre en `finally`). */
function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
}


/* ------------------------------------------------------------------ */
/* Llamada principal                                                   */
/* ------------------------------------------------------------------ */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatRequest = {
  messages: ChatMessage[];
  /** Etiqueta de negocio para logs («respuesta pública», «triaje»…). */
  purpose: string;
  /** Empresa que consume (para el rate limit). */
  tenantId?: string;
  temperature?: number;
  maxTokens?: number;
  /** Fuerza salida JSON válida (`response_format: json_object`). */
  jsonMode?: boolean;
  timeoutMs?: number;
  attempts?: number;
};

export type ChatOutcome = {
  ok: boolean;
  /** Texto devuelto por el modelo (vacío si `ok === false`). */
  text: string;
  provider: 'openai' | 'unavailable';
  model: string;
  purpose: string;
  tokens: { prompt: number; completion: number; total: number };
  costUsd: number;
  attempts: number;
  latencyMs: number;
  /** Motivo del fallo cuando `ok === false`. */
  code?: 'not_configured' | 'rate_limited' | 'timeout' | 'auth' | 'bad_request' | 'provider_error';
  error?: string;
  /** Cabecera `Retry-After` sugerida cuando el fallo es por límite. */
  retryAfterSeconds?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function classify(err: any): { code: ChatOutcome['code']; status: number; retryable: boolean; retryAfter?: number } {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  const name = String(err?.name ?? '');
  const code = String(err?.code ?? '');
  const retryAfterRaw = err?.headers?.['retry-after'] ?? err?.response?.headers?.['retry-after'];
  const retryAfter = Number(retryAfterRaw);

  if (name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return { code: 'timeout', status: 0, retryable: true };
  }
  if (code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { code: 'provider_error', status: 0, retryable: true };
  }
  if (status === 429) {
    return { code: 'rate_limited', status, retryable: true, retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined };
  }
  if (status === 401 || status === 403) return { code: 'auth', status, retryable: false };
  if (status >= 500) return { code: 'provider_error', status, retryable: true };
  if (status >= 400) return { code: 'bad_request', status, retryable: false };
  return { code: 'provider_error', status, retryable: true };
}

/**
 * Llamada a `chat.completions` con todo el blindaje:
 * timeout → rate limit por empresa → semáforo de concurrencia → reintentos.
 * NUNCA lanza: devuelve `{ ok: false, code }` para que el llamador aplique
 * su plantilla local (fallback) sin romper la petición del cliente.
 */
export async function chatComplete(req: ChatRequest): Promise<ChatOutcome> {
  const started = Date.now();
  const model = OPENAI_MODEL;
  const base: ChatOutcome = {
    ok: false,
    text: '',
    provider: 'unavailable',
    model,
    purpose: req.purpose,
    tokens: { prompt: 0, completion: 0, total: 0 },
    costUsd: 0,
    attempts: 0,
    latencyMs: 0,
  };

  const client = getOpenAIClient();
  if (!client) {
    return { ...base, code: 'not_configured', error: 'OPENAI_API_KEY no configurada (se usará la plantilla local).' };
  }

  // Rate limit por empresa ANTES de gastar red ni tokens.
  if (req.tenantId) {
    const verdict = await checkTenantRateLimit(req.tenantId);
    if (!verdict.allowed) {
      return {
        ...base,
        code: 'rate_limited',
        retryAfterSeconds: verdict.retryAfterSeconds,
        error: `Demasiadas peticiones de IA seguidas (${OPENAI_RPM_PER_TENANT}/min). Reintenta en ${verdict.retryAfterSeconds} s.`,
      };
    }
  }

  // Semáforo global de concurrencia (espera educada, nunca bloquea sin límite).
  const waited = Date.now();
  while (inFlight >= OPENAI_MAX_CONCURRENCY) {
    if (Date.now() - waited > (req.timeoutMs ?? OPENAI_TIMEOUT_MS)) {
      return { ...base, code: 'timeout', error: 'Servidor de IA saturado. Reintenta en unos segundos.' };
    }
    await sleep(50);
  }
  inFlight += 1;

  const attempts = Math.max(1, req.attempts ?? OPENAI_MAX_ATTEMPTS);
  const timeoutMs = req.timeoutMs ?? OPENAI_TIMEOUT_MS;
  let lastError = 'Error desconocido del proveedor de IA.';
  let lastCode: ChatOutcome['code'] = 'provider_error';
  let lastRetryAfter: number | undefined;

  try {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 220,
            ...(req.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
            messages: req.messages,
          },
          { timeout: timeoutMs, maxRetries: 0 },
        );

        const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
        const prompt = Number(completion.usage?.prompt_tokens ?? 0);
        const completionTokens = Number(completion.usage?.completion_tokens ?? 0);
        return {
          ok: true,
          text,
          provider: 'openai',
          model: completion.model ?? model,
          purpose: req.purpose,
          tokens: { prompt, completion: completionTokens, total: prompt + completionTokens },
          costUsd: estimateCostUsd(prompt, completionTokens, model),
          attempts: attempt,
          latencyMs: Date.now() - started,
        };
      } catch (err: any) {
        const info = classify(err);
        lastError = err?.message ?? String(err);
        lastCode = info.code;
        lastRetryAfter = info.retryAfter;
        const isLast = attempt === attempts || !info.retryable;
        if (isLast) break;

        // Backoff exponencial con jitter; respeta Retry-After si viene.
        const backoff = Math.min(8_000, 400 * 2 ** (attempt - 1));
        const jitter = Math.round(Math.random() * 250);
        const waitMs = info.retryAfter ? info.retryAfter * 1000 : backoff + jitter;
        console.warn(
          `[openai] ${req.purpose}: intento ${attempt}/${attempts} falló (${info.code}${info.status ? ` ${info.status}` : ''}); reintento en ${waitMs} ms`,
        );
        await sleep(waitMs);
      }
    }
  } finally {
    releaseSlot();
  }

  return {
    ...base,
    code: lastCode,
    error: lastError,
    attempts,
    retryAfterSeconds: lastRetryAfter,
    latencyMs: Date.now() - started,
  };
}

/** Atajo para una única pregunta (system + user) sin formato JSON. */
export function chatOnce(input: {
  system: string;
  user: string;
  purpose: string;
  tenantId?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<ChatOutcome> {
  return chatComplete({
    purpose: input.purpose,
    tenantId: input.tenantId,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    jsonMode: input.jsonMode,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
  });
}

/** Métricas del proceso para /api/health y el panel interno. */
export function openAiRuntime() {
  return {
    ...openAiStatus(),
    inFlight,
    distributedRateLimit: true,
    tenantsTracked: null,
  };
}
