import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';

const Body = z.object({
  reviewId: z.string().min(1),
  note: z.string().max(4000),
  flagged: z.boolean().optional(),
});

/** Guarda la nota privada / marca de gestión privada de una reseña. */
export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  if (parsed.data.reviewId.startsWith('demo-')) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: review } = await admin
    .from('reviews')
    .select('id, tenant_id')
    .eq('id', parsed.data.reviewId)
    .single();
  if (!review) return NextResponse.json({ error: 'Reseña no encontrada.' }, { status: 404 });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', review.tenant_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });

  // Regla estricta: sin suscripción activa o con la prueba caducada → 402.
  const gate = await requirePaidAccess(admin, String(review.tenant_id), {
    feature: 'privateFilter',
    action: 'Gestión privada de reseñas',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  const patch: any = { private_note: parsed.data.note || null };
  if (typeof parsed.data.flagged === 'boolean') patch.flagged_private = parsed.data.flagged;
  const { error } = await admin.from('reviews').update(patch).eq('id', parsed.data.reviewId);
  if (error) return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
