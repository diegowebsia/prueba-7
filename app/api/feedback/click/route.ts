import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Mide en qué plataforma pública (Google/TripAdvisor/Trustpilot) pulsa el
 * cliente tras votar 4-5★. Sin sesión; solo actualiza `channel` del voto.
 */
const Body = z.object({
  responseId: z.string().uuid(),
  channel: z.enum(['google', 'tripadvisor', 'trustpilot']),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });

  await admin
    .from('feedback_responses')
    .update({ channel: parsed.data.channel })
    .eq('id', parsed.data.responseId)
    .eq('kind', 'redirect');
  return NextResponse.json({ ok: true });
}
