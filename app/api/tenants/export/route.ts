import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/authz';
import { consumeRateLimit } from '@/lib/rate-limit';
import { systemLog } from '@/lib/logger';
import { csvDocument } from '@/lib/csv';

const Query = z.object({
  tenantId: z.string().uuid(),
  dataset: z.enum(['reviews', 'feedback']).default('reviews'),
});


async function allRows(admin: NonNullable<ReturnType<typeof createAdminClient>>, table: string, select: string, tenantId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await admin.from(table).select(select).eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

/** Exportación portable para análisis y ejercicio de derechos RGPD. */
export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
  const auth = await requireOwner(admin, parsed.data.tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rate = await consumeRateLimit('tenant-export', auth.userId, 10, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Demasiadas exportaciones.' }, {
    status: 429, headers: { 'Retry-After': String(rate.retryAfter) },
  });

  const reviewFields = 'id,source,external_id,author_name,rating,text,reply_text,replied_at,is_verified,created_at';
  const feedbackFields = 'id,stars,kind,channel,customer_name,contact,message,order_id,status,created_at';
  try {
    const rows = await allRows(
      admin,
      parsed.data.dataset === 'reviews' ? 'reviews' : 'feedback_responses',
      parsed.data.dataset === 'reviews' ? reviewFields : feedbackFields,
      parsed.data.tenantId,
    );
    const headers = (parsed.data.dataset === 'reviews' ? reviewFields : feedbackFields).split(',');
    const csv = csvDocument(headers, rows);
    await systemLog('info', 'tenant.export', `Exportación ${parsed.data.dataset}`, {
      tenantId: parsed.data.tenantId, rows: rows.length,
    });
    const filename = `reviewflow-${parsed.data.dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar la exportación.' }, { status: 500 });
  }
}
