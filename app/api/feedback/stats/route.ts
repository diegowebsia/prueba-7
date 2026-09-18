import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Estadísticas del Embudo Privado para el panel (requiere membresía):
 * totales, media, reparto 1-5★, canales elegidos y tickets abiertos.
 */
export async function GET(req: Request) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  const { data: rows } = await admin
    .from('feedback_responses')
    .select('stars, kind, channel, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(2000);

  const list = rows ?? [];
  const byStars: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byChannel: Record<string, number> = { google: 0, tripadvisor: 0, trustpilot: 0, none: 0 };
  let sum = 0;
  let redirects = 0;
  let ticketsOpen = 0;
  let ticketsClosed = 0;
  for (const r of list as any[]) {
    byStars[r.stars] = (byStars[r.stars] ?? 0) + 1;
    sum += r.stars;
    if (r.kind === 'redirect') {
      redirects += 1;
      byChannel[r.channel ?? 'none'] = (byChannel[r.channel ?? 'none'] ?? 0) + 1;
    } else if (r.status === 'closed') {
      ticketsClosed += 1;
    } else {
      ticketsOpen += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    total: list.length,
    avgStars: list.length > 0 ? Math.round((sum / list.length) * 100) / 100 : null,
    promoters: (byStars[4] ?? 0) + (byStars[5] ?? 0),
    detractors: (byStars[1] ?? 0) + (byStars[2] ?? 0) + (byStars[3] ?? 0),
    redirects,
    ticketsOpen,
    ticketsClosed,
    byStars,
    byChannel,
  });
}
