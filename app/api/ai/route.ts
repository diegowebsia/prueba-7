import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { generateReplyForTenant, inspectComplaintForTenant } from '@/lib/ai';
import { OPENAI_MODEL, openAiRuntime, openAiStatus } from '@/lib/openai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth';
import { enforceAi } from '@/lib/usage';
import { systemLog } from '@/lib/logger';
import { PLAN_CATALOG } from '@/lib/plans';
import { enqueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * Endpoint de IA (v3.10.0)
 *
 * Modo asíncrono: `{ ..., "async": true }` (solo `task: 'reply'`) encola el
 * trabajo en QStash y responde 202 `{ queued: true, jobId }`; el resultado se
 * consulta en `GET /api/ai/result?jobId=…`. Sin QStash se ejecuta en línea.
 * ============================================================
 * `POST /api/ai` → un único punto de entrada a la IA con TODOS los filtros de
 * acceso aplicados en el backend, en este orden:
 *
 *   1. Sesión de Supabase (401).
 *   2. Membresía del usuario en la empresa solicitada (403).
 *   3. Suscripción con acceso: 402 si está suspendida/impagada/cancelada.
 *   4. Feature del plan: 403 si la acción no está incluida.
 *   5. Créditos de IA del ciclo: 429 con `Retry-After` y `X-RateLimit-*`.
 *   6. Presupuesto de TOKENS del ciclo: 429 `token_budget_exhausted`.
 *   7. Tope de filas de contabilidad (`ai_interactions`): 507.
 *
 * Nada llega a OpenAI sin pasar por `enforceAi()`; además `lib/openai.ts`
 * aplica timeout, reintentos con backoff, rate limit por empresa y
 * contabilidad de tokens (`usage_counters.ai_tokens_*` + `ai_interactions`).
 *
 * Cuerpo:
 *   { tenantId, task: 'reply' | 'triage', businessName, authorName,
 *     rating, reviewText, tone?, private?, reviewId? }
 *
 * `reviewId` es OPCIONAL: si se envía y pertenece a la empresa, el resultado
 * se guarda en la opinión (respuesta pública, nota privada o triaje).
 */

const Body = z
  .object({
    tenantId: z.string().uuid(),
    task: z.enum(['reply', 'triage']).default('reply'),
    businessName: z.string().min(1).max(120),
    authorName: z.string().min(1).max(120),
    rating: z.number().min(1).max(5),
    reviewText: z.string().min(1).max(4000),
    tone: z.enum(['profesional', 'cercano', 'formal']).optional(),
    /** true = borrador privado conciliador (no público). */
    private: z.boolean().optional(),
    /** Si se indica, se persiste el resultado en esa opinión. */
    reviewId: z.string().min(1).optional(),
    /** true (solo task=reply) = encolar en segundo plano y responder 202. */
    async: z.boolean().optional(),
  })
  .strict();

/** GET → estado del motor de IA (uso interno del panel, sin secretos). */
export async function GET() {
  const guard = await requireSuperAdmin();
  const runtime = openAiRuntime();
  const body = {
    ok: true,
    model: OPENAI_MODEL,
    configured: openAiStatus().configured,
    timeoutMs: runtime.timeoutMs,
    maxAttempts: runtime.maxAttempts,
    rpmPerTenant: runtime.rpmPerTenant,
    maxConcurrency: runtime.maxConcurrency,
    inFlight: runtime.inFlight,
    pricingUsdPerMillionTokens: runtime.pricing,
    planBudgets: PLAN_CATALOG.map((p) => ({
      plan: p.id,
      label: p.label,
      aiRepliesPerMonth: p.limits.aiRepliesPerMonth,
      aiTokensPerMonth: p.limits.aiTokensPerMonth,
      aiRows: p.limits.aiRows,
    })),
  };
  // El detalle de presupuestos solo se expone al panel interno.
  if (!guard.ok) return NextResponse.json({ ok: true, model: body.model, configured: body.configured });
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Parámetros inválidos.',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ---- 1. Sesión --------------------------------------------------
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase no configurado en el servidor.', demo: true }, { status: 503 });
  }

  // ---- 2. Membresía ----------------------------------------------
  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) {
    await systemLog('warn', 'ai.access', 'Intento de uso de IA sin membresía', {
      tenantId: input.tenantId,
      user: user.email,
    });
    return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });
  }

  // ---- 2b. Modo asíncrono (solo borradores; el triaje sigue en línea) --
  if (input.async === true) {
    if (input.task !== 'reply') {
      return NextResponse.json({ error: 'El modo async solo admite task=reply.' }, { status: 400 });
    }
    // La puerta se comprueba ANTES de encolar: 402/403/429 inmediatos.
    const pre = await enforceAi(admin, input.tenantId, { feature: 'aiReplies', action: 'Respuesta IA (async)' });
    if (!pre.ok) {
      await systemLog('warn', 'ai.gate', pre.error, { tenantId: input.tenantId, code: pre.code, user: user.email });
      return NextResponse.json(pre.body, { status: pre.status, headers: pre.headers });
    }
    const jobId = randomUUID();
    const { queued } = await enqueue({
      type: 'ai.generate',
      tenantId: input.tenantId,
      jobId,
      businessName: input.businessName,
      authorName: input.authorName,
      rating: input.rating,
      reviewText: input.reviewText,
      tone: input.tone,
      private: input.private,
      reviewId: input.reviewId,
    });
    return NextResponse.json(
      {
        ok: true,
        queued,
        jobId,
        resultUrl: `/api/ai/result?jobId=${jobId}`,
        message: queued
          ? 'Borrador en cola: consúltalo en resultUrl.'
          : 'Borrador generado en línea (sin cola configurada): consúltalo en resultUrl.',
      },
      { status: 202 },
    );
  }

  // ---- 3-7. Suscripción, feature, créditos, tokens y topes de BD ---
  const feature = input.task === 'triage' ? 'privateFilter' : 'aiReplies';
  const gate = await enforceAi(admin, input.tenantId, {
    feature,
    action: input.task === 'triage' ? 'Inspección de queja' : 'Respuesta IA',
  });
  if (!gate.ok) {
    await systemLog('warn', 'ai.gate', gate.error, {
      tenantId: input.tenantId,
      code: gate.code,
      user: user.email,
    });
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  // ---- Ejecución --------------------------------------------------
  if (input.task === 'triage') {
    const result = await inspectComplaintForTenant(
      { admin, tenantId: input.tenantId },
      {
        businessName: input.businessName,
        authorName: input.authorName,
        rating: input.rating,
        reviewText: input.reviewText,
      },
    );
    if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers: result.headers });

    await persistReview(admin, input, {
      private_note: JSON.stringify(result.inspection),
    });

    return NextResponse.json({
      ok: true,
      task: 'triage',
      inspection: result.inspection,
      usage: {
        tokens: result.inspection.usage.totalTokens,
        costUsd: result.inspection.usage.costUsd,
        model: result.inspection.usage.model,
        provider: result.inspection.provider,
      },
      quota: result.quota,
    });
  }

  const result = await generateReplyForTenant(
    { admin, tenantId: input.tenantId },
    {
      businessName: input.businessName,
      authorName: input.authorName,
      rating: input.rating,
      reviewText: input.reviewText,
      tone: input.tone,
      privateMessage: input.private === true,
    },
    { feature: 'aiReplies' },
  );
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers: result.headers });

  await persistReview(
    admin,
    input,
    input.private === true
      ? { private_note: result.reply }
      : { reply_text: result.reply, replied_at: new Date().toISOString() },
  );

  return NextResponse.json({
    ok: true,
    task: 'reply',
    reply: result.reply,
    provider: result.provider,
    usage: {
      tokens: result.usage.totalTokens,
      costUsd: result.usage.costUsd,
      model: result.usage.model,
      latencyMs: result.usage.latencyMs,
      attempts: result.usage.attempts,
      fallback: result.provider !== 'openai',
    },
    quota: result.quota,
  });
}

/** Guarda el resultado en la opinión, solo si se pidió y pertenece a la empresa. */
async function persistReview(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  input: { reviewId?: string; tenantId: string },
  patch: Record<string, unknown>,
): Promise<void> {
  if (!input.reviewId) return;
  try {
    await admin.from('reviews').update(patch).eq('id', input.reviewId).eq('tenant_id', input.tenantId);
  } catch {
    /* la respuesta al cliente no se bloquea por un fallo de persistencia */
  }
}

/**
 * Cabeceras y ayudas que la UI puede usar cuando la IA está bloqueada:
 * `GET /api/ai?tenantId=…` sin super-admin devuelve la cuota y las salidas
 * comerciales (recargas y planes) para pintar el aviso correcto.
 */
export async function OPTIONS() {
  return NextResponse.json(
    {
      ok: true,
      hint: 'Usa POST /api/ai con { tenantId, task, businessName, authorName, rating, reviewText }.',
      rateLimit: {
        headers: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      },
    },
    { headers: { Allow: 'GET, POST, OPTIONS' } },
  );
}
