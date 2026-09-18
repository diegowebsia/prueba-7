import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishGoogleReplyForTenant } from '@/lib/google';
import { requirePaidAccess } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

const Body = z.object({
  reviewId: z.string().min(1),
  reply: z.string().min(2).max(4000),
});

/**
 * Publica (guarda) la respuesta editada de una reseña.
 * Verifica sesión + membresía y, si la reseña es de Google con integración
 * conectada, la publica EN Google a través de la capa con control de cuota
 * (`publishGoogleReplyForTenant` → feature `publishToGoogle` + contador
 * `usage_counters.google_calls`).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Respuesta inválida (2-4000 caracteres).' }, { status: 400 });
  }
  const { reviewId, reply } = parsed.data;

  if (reviewId.startsWith('demo-')) {
    return NextResponse.json({ ok: true, demo: true, message: 'Modo demo: respuesta no persistida.' });
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
    .select('id, tenant_id, source, external_id')
    .eq('id', reviewId)
    .single();
  if (!review) return NextResponse.json({ error: 'Reseña no encontrada.' }, { status: 404 });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', review.tenant_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  // Regla estricta: sin suscripción activa o con la prueba caducada → 402.
  // (Sin feature: el guardado local siempre se permite con acceso; la subida
  // a Google se filtra dentro de `publishGoogleReplyForTenant`.)
  const gate = await requirePaidAccess(admin, String(review.tenant_id), {
    action: 'Publicar respuesta',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  const { error } = await admin
    .from('reviews')
    .update({ reply_text: reply, replied_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (error) return NextResponse.json({ error: 'No se pudo guardar la respuesta.' }, { status: 500 });

  // Publicación en Google (best-effort, con gate de plan y contador de llamadas).
  let pushedToGoogle = false;
  let googleError: string | null = null;
  if (review.source === 'google' && review.external_id) {
    try {
      const { data: integ } = await admin
        .from('integrations')
        .select('credentials')
        .eq('tenant_id', review.tenant_id)
        .eq('provider', 'google')
        .single();
      const creds = (integ?.credentials as any) ?? {};
      if (creds.refresh_token || creds.access_token) {
        const published = await publishGoogleReplyForTenant(
          { admin, tenantId: String(review.tenant_id) },
          { externalId: review.external_id, reply, credentials: creds },
        );
        if (published.ok) {
          pushedToGoogle = true;
        } else {
          googleError = published.error;
          await systemLog('warn', 'reviews.publish', `Guardada pero no publicada en Google: ${published.error}`, {
            reviewId,
            code: published.code,
          });
        }
      }
    } catch (e: any) {
      googleError = e?.message ?? 'Error desconocido publicando en Google';
      await systemLog('warn', 'reviews.publish', `Guardada pero no publicada en Google: ${googleError}`, {
        reviewId,
      });
    }
  }

  await systemLog('info', 'reviews.publish', `Respuesta publicada en reseña ${reviewId}`, {
    user: user.email,
    pushedToGoogle,
  });

  return NextResponse.json({
    ok: true,
    pushedToGoogle,
    googleError,
    message: pushedToGoogle
      ? 'Respuesta publicada en Google correctamente.'
      : 'Respuesta guardada. (Conecta Google para publicarla automáticamente en la plataforma).',
  });
}
