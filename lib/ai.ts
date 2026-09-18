import { chatOnce, type ChatOutcome } from '@/lib/openai';
import { estimateCostUsd } from '@/lib/plans';

export type RespondInput = {
  businessName: string;
  authorName: string;
  rating: number; // 1-5
  reviewText: string;
  language?: string;
  tone?: 'profesional' | 'cercano' | 'formal';
  /** Mensaje PRIVADO conciliador (filtro de malas experiencias), no respuesta pública. */
  privateMessage?: boolean;
};

/** Contabilidad de tokens/coste que devuelve cada generación. */
export type AiUsage = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  attempts: number;
  provider: 'openai' | 'local-template' | 'local-heuristic' | 'unavailable';
  /** Motivo del fallback cuando no se pudo usar el modelo. */
  errorCode?: string | null;
};

/** Convierte el resultado del cliente centralizado en contabilidad de negocio. */
function usageFrom(outcome: ChatOutcome, provider: AiUsage['provider']): AiUsage {
  return {
    model: outcome.model,
    promptTokens: outcome.tokens.prompt,
    completionTokens: outcome.tokens.completion,
    totalTokens: outcome.tokens.total,
    costUsd: outcome.costUsd || estimateCostUsd(outcome.tokens.prompt, outcome.tokens.completion, outcome.model),
    latencyMs: outcome.latencyMs,
    attempts: outcome.attempts,
    provider,
    errorCode: outcome.ok ? null : (outcome.code ?? 'provider_error'),
  };
}

/**
 * Genera una respuesta a una opinión.
 * - Con OPENAI_API_KEY: `gpt-4o-mini` vía `lib/openai.ts` (timeout, reintentos
 *   con backoff, rate limit y contabilidad de tokens).
 * - Si la API no responde o no hay clave: plantilla local (fallback). La
 *   plataforma NUNCA deja al cliente sin borrador.
 */
export async function generateReviewReply(input: RespondInput): Promise<{
  reply: string;
  provider: 'openai' | 'local-template';
  usage: AiUsage;
}> {
  const tone = input.tone ?? 'profesional';
  const lang = input.language ?? 'español';

  const system = input.privateMessage
    ? `Eres el responsable de atención al cliente de "${input.businessName}". Redactas un MENSAJE PRIVADO (no público) en ${lang} con tono ${tone} para reconducir una mala experiencia de ${input.authorName} (${input.rating}/5). Breve (máx. 80 palabras), empático, pide disculpas, propone una solución concreta y un canal de contacto directo. Sin comillas envolventes.`
    : `Eres el community manager de "${input.businessName}". Respondes reseñas de clientes en ${lang} con tono ${tone}. Respuestas breves (máx. 80 palabras), sin comillas envolventes, firmadas con el nombre del negocio. Si la reseña es negativa (<=3 estrellas), empatiza, pide disculpas y ofrece una solución/contacto sin sonar robótico.`;

  const outcome = await chatOnce({
    system,
    user: `Reseña de ${input.authorName} (${input.rating}/5 estrellas):\n${input.reviewText}`,
    purpose: input.privateMessage ? 'respond.private' : 'respond.public',
    temperature: 0.7,
    maxTokens: 220,
  });

  if (outcome.ok && outcome.text) {
    return { reply: outcome.text, provider: 'openai', usage: usageFrom(outcome, 'openai') };
  }

  const reply = input.privateMessage ? localPrivateReply(input) : localTemplateReply(input, tone);
  return {
    reply,
    provider: 'local-template',
    usage: usageFrom(outcome, 'local-template'),
  };
}

function localPrivateReply(input: RespondInput): string {
  return (
    `Hola ${input.authorName}, soy ${input.businessName}. Hemos leído tu valoración (${input.rating}/5) ` +
    `y sentimos mucho lo ocurrido. Queremos solucionarlo contigo en privado: ¿nos indicas un teléfono ` +
    `o email donde contactarte hoy mismo? Gracias por darnos la oportunidad de compensarte.`
  );
}

function localTemplateReply(input: RespondInput, tone: string): string {
  const { businessName, authorName, rating, reviewText } = input;
  const greeting =
    tone === 'formal'
      ? `Estimado/a ${authorName},`
      : tone === 'cercano'
        ? `¡Hola ${authorName}!`
        : `Hola ${authorName},`;

  if (rating >= 4) {
    return (
      `${greeting} muchísimas gracias por tu reseña de ${rating} estrellas. ` +
      `Nos alegra saber que tu experiencia fue positiva${reviewText ? ' y tomamos nota de tu comentario' : ''}. ` +
      `¡Te esperamos pronto! — ${businessName}`
    );
  }
  if (rating === 3) {
    return (
      `${greeting} gracias por compartir tu experiencia. Lamentamos no haber alcanzado ` +
      `las 5 estrellas esta vez; tu feedback nos ayuda a mejorar cada día. ` +
      `¿Nos cuentas por privado qué podríamos hacer mejor? — ${businessName}`
    );
  }
  return (
    `${greeting} sentimos mucho que tu experiencia no fuera la esperada. ` +
    `Tu caso es prioritario para nosotros: escríbenos a nuestro email o llámanos ` +
    `y lo resolvemos personalmente. Gracias por darnos la oportunidad de mejorar. — ${businessName}`
  );
}

/* ================================================================== */
/* Capa de negocio: IA conectada al contador de cuota (usage_counters) */
/* ================================================================== */

import type { AdminLike, GateBlocked, PlanFeaturesKey, QuotaCheck } from '@/lib/usage';
import { consume, enforceAi, publicQuota, recordAiUsage } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

export type AiContext = { admin: AdminLike; tenantId: string };

export type AiOk<T> = {
  ok: true;
  status: 200;
  quota: ReturnType<typeof publicQuota>;
} & T;

export type AiBlocked = {
  ok: false;
  status: number;
  code: string;
  error: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type AiResult<T> = AiOk<T> | AiBlocked;

function blockedResult(gate: GateBlocked): AiBlocked {
  return {
    ok: false,
    status: gate.status,
    code: gate.code,
    error: gate.error,
    headers: gate.headers,
    body: gate.body,
  };
}

function quotaOf(check: QuotaCheck, consumed: number) {
  const q = publicQuota(check);
  return { ...q, used: q.used + consumed, remaining: Math.max(0, q.remaining - consumed) };
}

/**
 * Genera una respuesta de reseña CON control de cuota.
 * Flujo real: enforce() (402/403/429) → OpenAI/plantilla → consume('ai').
 * Solo se descuenta crédito si el borrador llega a generarse.
 */
export async function generateReplyForTenant(
  ctx: AiContext,
  input: RespondInput,
  options: { feature?: PlanFeaturesKey; asyncJob?: { jobId: string } } = {},
): Promise<AiResult<{ reply: string; provider: 'openai' | 'local-template'; usage: AiUsage }>> {
  // Puerta de IA: suscripción + feature + créditos + presupuesto de TOKENS.
  const gate = await enforceAi(ctx.admin, ctx.tenantId, {
    feature: options.feature ?? 'aiReplies',
    action: input.privateMessage ? 'Mensaje privado IA' : 'Respuesta IA',
  });
  if (!gate.ok) {
    await systemLog('warn', 'ai.quota', gate.error, { tenantId: ctx.tenantId, code: gate.code });
    return blockedResult(gate);
  }

  const { reply, provider, usage } = await generateReviewReply(input);

  // Contabilidad REAL: crédito del plan + tokens/coste del proveedor.
  await consume(ctx.admin, ctx.tenantId, 'ai', 1);
  await recordAiUsage(ctx.admin, ctx.tenantId, {
    ...usage,
    model: usage.model,
    purpose: options.asyncJob ? 'respond.async' : input.privateMessage ? 'respond.private' : 'respond.public',
    jobId: options.asyncJob?.jobId,
    resultText: reply,
    resultStatus: 'ready',
    ok: usage.provider === 'openai',
    latencyMs: usage.latencyMs,
    costUsd: usage.costUsd,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });

  await systemLog('info', 'ai.responder', `Borrador generado (${provider}) · ${usage.totalTokens} tokens`, {
    tenantId: ctx.tenantId,
    private: Boolean(input.privateMessage),
    costUsd: usage.costUsd,
  });

  return {
    ok: true,
    status: 200,
    reply,
    provider,
    usage,
    quota: quotaOf(gate.check, 1),
  };
}

/* ------------------------------------------------------------------ */
/* Inspección de quejas (triaje privado ≤3★)                           */
/* ------------------------------------------------------------------ */

export type ComplaintSeverity = 'baja' | 'media' | 'alta' | 'critica';

/** Triaje sin contabilidad (lo que devuelve el modelo o la heurística local). */
export type ComplaintAnalysis = {
  severity: ComplaintSeverity;
  category: string;
  legalRisk: boolean;
  suggestedChannel: 'privado' | 'telefono' | 'publico';
  summary: string;
  actionPlan: string[];
  provider: 'openai' | 'local-heuristic';
};

/** Triaje + tokens/coste estimado de la llamada (contabilidad por empresa). */
export type ComplaintInspection = ComplaintAnalysis & { usage: AiUsage };

const COMPLAINT_SCHEMA_HINT =
  'Responde SOLO con JSON válido sin markdown con estas claves: ' +
  'severity ("baja"|"media"|"alta"|"critica"), category (string corta en español), ' +
  'legalRisk (boolean), suggestedChannel ("privado"|"telefono"|"publico"), ' +
  'summary (máx. 200 caracteres), actionPlan (array de 2-4 strings imperativos).';

/**
 * Inspecciona una queja y devuelve un triaje accionable.
 * Con OPENAI_API_KEY usa el modelo; sin clave, heurística local determinista
 * (la plataforma nunca se cae por falta de proveedor).
 */
export async function inspectComplaint(input: {
  businessName: string;
  authorName: string;
  rating: number;
  reviewText: string;
  language?: string;
}): Promise<ComplaintInspection> {
  const lang = input.language ?? 'español';

  const outcome = await chatOnce({
    system:
      `Eres el responsable de calidad de "${input.businessName}". Analizas quejas de clientes ` +
      `en ${lang} y priorizas su resolución. ${COMPLAINT_SCHEMA_HINT}`,
    user: `Queja de ${input.authorName} (${input.rating}/5):\n${input.reviewText}`,
    purpose: 'triage.inspect',
    temperature: 0.2,
    maxTokens: 400,
    jsonMode: true,
  });

  if (outcome.ok && outcome.text) {
    try {
      const parsed = JSON.parse(outcome.text);
      return { ...normalizeInspection(parsed, input), usage: usageFrom(outcome, 'openai') };
    } catch {
      /* JSON inválido → heurística local */
    }
  }
  return { ...localComplaintInspection(input), usage: usageFrom(outcome, 'local-heuristic') };
}

/** Inspección de queja CON control de cuota (1 evento `ai`). */
export async function inspectComplaintForTenant(
  ctx: AiContext,
  input: { businessName: string; authorName: string; rating: number; reviewText: string; language?: string },
): Promise<AiResult<{ inspection: ComplaintInspection }>> {
  // Misma puerta de IA que las respuestas, con la feature del triaje privado.
  const gate = await enforceAi(ctx.admin, ctx.tenantId, {
    feature: 'privateFilter',
    action: 'Inspección de queja',
  });
  if (!gate.ok) {
    await systemLog('warn', 'ai.quota', gate.error, { tenantId: ctx.tenantId, code: gate.code });
    return blockedResult(gate);
  }

  const inspection = await inspectComplaint(input);
  await consume(ctx.admin, ctx.tenantId, 'ai', 1);
  await recordAiUsage(ctx.admin, ctx.tenantId, {
    ...inspection.usage,
    purpose: 'triage.inspect',
    ok: inspection.usage.provider === 'openai',
  });
  await systemLog('info', 'ai.triage', `Queja inspeccionada (${inspection.severity}/${inspection.category})`, {
    tenantId: ctx.tenantId,
    provider: inspection.provider,
    costUsd: inspection.usage.costUsd,
  });

  return { ok: true, status: 200, inspection, quota: quotaOf(gate.check, 1) };
}

const LEGAL_HINTS = [
  'denuncia', 'demanda', 'consumo', 'omic', 'sanidad', 'intoxic', 'lesion', 'lesión',
  'estafa', 'fraude', 'publicidad engañosa', 'hoja de reclamaciones', 'abogado', 'demandar',
];

function localComplaintInspection(input: {
  businessName: string;
  authorName: string;
  rating: number;
  reviewText: string;
}): ComplaintAnalysis {
  const text = (input.reviewText ?? '').toLowerCase();
  const legalRisk = LEGAL_HINTS.some((h) => text.includes(h));
  const severity: ComplaintSeverity = legalRisk
    ? 'critica'
    : input.rating <= 1
      ? 'alta'
      : input.rating === 2
        ? 'media'
        : 'baja';
  const category = text.includes('retras') || text.includes('tard')
    ? 'Retraso en el servicio'
    : text.includes('trato') || text.includes('atencion') || text.includes('atención')
      ? 'Trato al cliente'
      : text.includes('precio') || text.includes('cobr') || text.includes('factur')
        ? 'Precio o facturación'
        : text.includes('producto') || text.includes('pedido') || text.includes('calidad')
          ? 'Producto o pedido'
          : 'Experiencia general';

  return {
    severity,
    category,
    legalRisk,
    suggestedChannel: severity === 'critica' || severity === 'alta' ? 'telefono' : 'privado',
    summary: text.slice(0, 197) || 'Queja sin texto.',
    actionPlan: [
      `Contactar a ${input.authorName} en menos de 24 h por el canal sugerido.`,
      'Escuchar el caso y reconocer el fallo sin justificarse.',
      'Ofrecer una compensación proporcional y dejarla por escrito.',
      legalRisk
        ? 'Escalar a dirección: posible reclamación formal.'
        : 'Anotar el seguimiento en la nota privada de la reseña.',
    ],
    provider: 'local-heuristic',
  };
}

function normalizeInspection(
  raw: any,
  input: { authorName: string; rating: number; reviewText: string },
): ComplaintAnalysis {
  const fallback = localComplaintInspection({
    businessName: '',
    authorName: input.authorName,
    rating: input.rating,
    reviewText: input.reviewText,
  });
  const sev = ['baja', 'media', 'alta', 'critica'].includes(raw?.severity) ? raw.severity : fallback.severity;
  const channel = ['privado', 'telefono', 'publico'].includes(raw?.suggestedChannel)
    ? raw.suggestedChannel
    : fallback.suggestedChannel;
  const plan = Array.isArray(raw?.actionPlan)
    ? raw.actionPlan.filter((x: unknown) => typeof x === 'string').slice(0, 4)
    : fallback.actionPlan;
  return {
    severity: sev as ComplaintSeverity,
    category: typeof raw?.category === 'string' && raw.category.trim() ? raw.category.trim() : fallback.category,
    legalRisk: typeof raw?.legalRisk === 'boolean' ? raw.legalRisk : fallback.legalRisk,
    suggestedChannel: channel as ComplaintInspection['suggestedChannel'],
    summary: typeof raw?.summary === 'string' ? raw.summary.slice(0, 200) : fallback.summary,
    actionPlan: plan.length > 0 ? plan : fallback.actionPlan,
    provider: 'openai',
  };
}
