import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Resultado de un borrador IA asíncrono.
 * `GET /api/ai/result?jobId=…` → `{ status: 'pending' | 'ready' | 'error', … }`.
 * Requiere sesión + membresía en la empresa del trabajo.
 */
export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  if (!jobId) return NextResponse.json({ error: 'Falta jobId.' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: row } = await admin
    .from('ai_interactions')
    .select('tenant_id, model, provider, prompt_tokens, completion_tokens, cost_usd, latency_ms, ok, error_code, result_text, result_status, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Sin fila: el worker aún no ha escrito (o el jobId es desconocido).
  if (!row) return NextResponse.json({ ok: true, status: 'pending', jobId });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', row.tenant_id)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  if (row.result_status === 'error' || !row.ok) {
    return NextResponse.json({
      ok: false,
      status: 'error',
      jobId,
      code: row.error_code ?? 'generation_failed',
      error: 'La generación asíncrona falló (ver cuota y logs).',
    });
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    jobId,
    reply: row.result_text,
    usage: {
      tokens: (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      model: row.model,
      provider: row.provider,
      latencyMs: row.latency_ms,
    },
  });
}
