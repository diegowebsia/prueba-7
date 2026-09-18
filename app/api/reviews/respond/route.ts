import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateReplyForTenant, generateReviewReply } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasAccess } from '@/lib/plans';
import { checkQuota, publicQuota, quotaExhaustedMessage, quotaHeaders, upgradeHints } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

const Body = z.object({
  reviewId: z.string().min(1),
  businessName: z.string().min(1).max(120),
  authorName: z.string().min(1).max(120),
  rating: z.number().min(1).max(5),
  reviewText: z.string().min(1).max(4000),
  tone: z.enum(['profesional', 'cercano', 'formal']).optional(),
  /** true = borrador PRIVADO conciliador (filtro de malas experiencias), no público. */
  private: z.boolean().optional(),
});

/**
 * Genera un borrador IA (público o privado).
 *
 * Cadena de control REAL antes de llamar a OpenAI:
 *   sesión → membresía → suscripción con acceso (402) → cuota del ciclo (429).
 * Cada borrador generado descuenta 1 evento de `usage_counters.ai_responses`
 * dentro de `generateReplyForTenant` (lib/ai.ts).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }
  const input = parsed.data;
  const isDemo = input.reviewId.startsWith('demo-');

  let tenantId: string | null = null;
  if (!isDemo) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

    const { data: review } = await admin
      .from('reviews')
      .select('id, tenant_id')
      .eq('id', input.reviewId)
      .single();
    if (!review) return NextResponse.json({ error: 'Reseña no encontrada.' }, { status: 404 });
    tenantId = String(review.tenant_id);

    const { data: member } = await admin
      .from('memberships')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .single();
    if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

    const { data: tenant } = await admin
      .from('tenants')
      .select('subscription_status, suspended, trial_ends_at')
      .eq('id', tenantId)
      .single();
    // Regla estricta: sin suscripción activa o con la prueba caducada → 402.
    const trialExpired =
      tenant?.subscription_status === 'trialing' &&
      tenant?.trial_ends_at != null &&
      new Date(tenant.trial_ends_at).getTime() <= Date.now();
    if (!tenant || !hasAccess(tenant.subscription_status, tenant.suspended) || trialExpired) {
      return NextResponse.json(
        {
          error: trialExpired
            ? 'Tu prueba de 7 días terminó y el pago no se completó. Reactiva tu suscripción para seguir usando la IA.'
            : 'Suscripción sin acceso. Reactívala para seguir usando la IA.',
          code: trialExpired ? 'trial_expired' : 'no_subscription',
          checkoutUrl: '/bienvenido',
        },
        { status: 402 },
      );
    }

    // Puerta de cuota: 429 + Retry-After si el ciclo está agotado.
    const quota = await checkQuota(admin, tenantId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: quotaExhaustedMessage(quota, 'ai'),
          code: 'quota_exhausted',
          quota: publicQuota(quota),
          upgrade: { ...upgradeHints(quota), billingUrl: '/dashboard?tab=facturacion' },
        },
        { status: 429, headers: quotaHeaders(quota) },
      );
    }

    const guarded = await generateReplyForTenant(
      { admin, tenantId },
      {
        businessName: input.businessName,
        authorName: input.authorName,
        rating: input.rating,
        reviewText: input.reviewText,
        tone: input.tone,
        privateMessage: input.private === true,
      },
    );

    if (!guarded.ok) {
      return NextResponse.json(guarded.body, {
        status: guarded.status,
        headers: guarded.headers,
      });
    }

    // Persistencia del borrador (público o nota privada de triaje).
    try {
      if (input.private === true) {
        await admin.from('reviews').update({ private_note: guarded.reply }).eq('id', input.reviewId);
      } else {
        await admin
          .from('reviews')
          .update({ reply_text: guarded.reply, replied_at: new Date().toISOString() })
          .eq('id', input.reviewId);
      }
    } catch {
      /* no bloquea la respuesta */
    }

    await systemLog(
      'info',
      'ai.responder',
      `Borrador ${input.private ? 'privado' : 'público'} generado (${guarded.provider})`,
      { reviewId: input.reviewId, tenantId },
    );

    return NextResponse.json({
      reply: guarded.reply,
      provider: guarded.provider,
      quota: guarded.quota,
    });
  }

  // Modo demo (sin BD): plantilla local o OpenAI, sin consumo de cuota.
  const { reply, provider } = await generateReviewReply({
    businessName: input.businessName,
    authorName: input.authorName,
    rating: input.rating,
    reviewText: input.reviewText,
    tone: input.tone,
    privateMessage: input.private === true,
  });
  await systemLog('info', 'ai.responder', `Borrador demo generado (${provider})`, {
    reviewId: input.reviewId,
  });
  return NextResponse.json({ reply, provider, demo: true });
}
