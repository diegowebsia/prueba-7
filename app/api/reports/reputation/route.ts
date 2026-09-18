import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/authz';

const Query = z.object({ tenantId: z.string().uuid() });

type Review = { rating: number; reply_text: string | null; created_at: string };
type Feedback = { stars: number; kind: string; status: string; created_at: string };

function average(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

/** Resumen estable y accionable para dashboard, informes o BI externo. */
export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'tenantId inválido.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
  const auth = await requireOwner(admin, parsed.data.tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const since60 = new Date(Date.now() - 60 * 86400_000).toISOString();
  const [{ data: reviews, error: reviewsError }, { data: feedback, error: feedbackError }, { data: integrations }] = await Promise.all([
    admin.from('reviews').select('rating,reply_text,created_at').eq('tenant_id', parsed.data.tenantId)
      .gte('created_at', since60).order('created_at', { ascending: false }).limit(5000),
    admin.from('feedback_responses').select('stars,kind,status,created_at').eq('tenant_id', parsed.data.tenantId)
      .gte('created_at', since60).order('created_at', { ascending: false }).limit(5000),
    admin.from('integrations').select('provider,status,last_sync_at,last_error').eq('tenant_id', parsed.data.tenantId),
  ]);
  if (reviewsError || feedbackError) return NextResponse.json({ error: 'No se pudo calcular el informe.' }, { status: 500 });

  const reviewRows = (reviews ?? []) as Review[];
  const feedbackRows = (feedback ?? []) as Feedback[];
  const boundary = Date.now() - 30 * 86400_000;
  const current = reviewRows.filter((row) => new Date(row.created_at).getTime() >= boundary);
  const previous = reviewRows.filter((row) => new Date(row.created_at).getTime() < boundary);
  const currentAverage = average(current.map((row) => row.rating));
  const previousAverage = average(previous.map((row) => row.rating));
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map((star) => [star, current.filter((row) => row.rating === star).length]));
  const replied = current.filter((row) => Boolean(row.reply_text)).length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    reviews: {
      total: current.length,
      average: currentAverage,
      previousAverage,
      averageChange: currentAverage != null && previousAverage != null ? Math.round((currentAverage - previousAverage) * 100) / 100 : null,
      distribution,
      replied,
      pendingReply: current.length - replied,
      responseRate: current.length ? Math.round((replied / current.length) * 1000) / 10 : 0,
    },
    feedback: {
      total: feedbackRows.filter((row) => new Date(row.created_at).getTime() >= boundary).length,
      openTickets: feedbackRows.filter((row) => row.kind === 'ticket' && row.status === 'open').length,
      average: average(feedbackRows.filter((row) => new Date(row.created_at).getTime() >= boundary).map((row) => row.stars)),
    },
    integrations: (integrations ?? []).map((row: any) => ({
      provider: row.provider,
      status: row.status,
      lastSyncAt: row.last_sync_at,
      // Solo indica presencia: el detalle completo queda en logs internos.
      hasError: Boolean(row.last_error),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
