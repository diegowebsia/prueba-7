import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyOpaqueId } from '@/lib/security';
import { payloadErrorResponse, readJsonLimited } from '@/lib/request';

export const dynamic = 'force-dynamic';

/**
 * Mide en qué plataforma pública (Google/TripAdvisor/Trustpilot) pulsa el
 * cliente tras votar, con independencia de su puntuación. Sin sesión; solo actualiza `channel` del voto.
 */
const Body = z.object({
  responseId: z.string().uuid(),
  clickToken: z.string().min(20),
  channel: z.enum(['google', 'tripadvisor', 'trustpilot']),
});

export async function POST(req: Request) {
  let rawBody: unknown;
  try { rawBody = await readJsonLimited(req, 4096); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });

  if (!verifyOpaqueId(parsed.data.responseId, parsed.data.clickToken)) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });

  await admin
    .from('feedback_responses')
    .update({ channel: parsed.data.channel })
    .eq('id', parsed.data.responseId);
  return NextResponse.json({ ok: true });
}
