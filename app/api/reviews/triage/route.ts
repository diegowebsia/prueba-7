import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inspectComplaintForTenant } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';

const Body = z.object({
  reviewId: z.string().min(1),
  businessName: z.string().min(1).max(120).optional(),
  authorName: z.string().min(1).max(120).optional(),
  rating: z.number().min(1).max(5).optional(),
  reviewText: z.string().min(1).max(4000).optional(),
});

/**
 * Inspección IA de una queja (triaje privado ≤3★).
 * Devuelve severidad, categoría, riesgo legal, canal sugerido y plan de acción.
 * Consume 1 evento de IA y aplica los mismos cortes que /api/reviews/respond:
 * 402 sin suscripción · 403 feature `privateFilter` fuera de plan · 429 sin cuota.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const input = parsed.data;
  const isDemo = input.reviewId.startsWith('demo-');

  const rating = input.rating ?? 2;
  const authorName = input.authorName ?? 'Cliente';
  const reviewText = input.reviewText ?? '';

  if (isDemo) {
    const { inspectComplaint } = await import('@/lib/ai');
    const inspection = await inspectComplaint({
      businessName: input.businessName ?? 'Empresa demo',
      authorName,
      rating,
      reviewText,
    });
    return NextResponse.json({ ok: true, demo: true, inspection });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: review } = await admin
    .from('reviews')
    .select('id, tenant_id, author_name, rating, text, tenants(name)')
    .eq('id', input.reviewId)
    .single();
  if (!review) return NextResponse.json({ error: 'Reseña no encontrada.' }, { status: 404 });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', review.tenant_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  const result = await inspectComplaintForTenant(
    { admin, tenantId: String(review.tenant_id) },
    {
      businessName: input.businessName ?? (review.tenants as any)?.name ?? 'Tu negocio',
      authorName: input.authorName ?? review.author_name ?? authorName,
      rating: input.rating ?? review.rating ?? rating,
      reviewText: input.reviewText ?? review.text ?? reviewText,
    },
  );

  if (!result.ok) {
    await systemLog('warn', 'ai.triage', result.error, { reviewId: input.reviewId, code: result.code });
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  }

  // Marca la reseña como gestionada en privado (cola de triaje).
  await admin
    .from('reviews')
    .update({ flagged_private: true })
    .eq('id', input.reviewId);

  return NextResponse.json({
    ok: true,
    inspection: result.inspection,
    quota: result.quota,
  });
}
