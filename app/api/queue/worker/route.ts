import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { QueueJobSchema, dispatchJob } from '@/lib/queue';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ============================================================
 * Worker de la cola (`POST /api/queue/worker`)
 * ============================================================
 * Lo invoca Upstash QStash con cada trabajo publicado por `enqueue()`.
 * Autorización (una de las dos):
 *   1. Firma QStash (`upstash-signature` + signing keys) — camino normal.
 *   2. `Authorization: Bearer CRON_SECRET` — lanzamientos manuales.
 *
 * Códigos: 200 = hecho o fallo definitivo · 500 = reintentar con backoff
 * (QStash reintenta los 5xx; los fallos de validación devuelven 200 para
 * no quemar reintentos en trabajos malformados).
 */
async function isAuthorized(req: Request, rawBody: string): Promise<boolean> {
  const sig = req.headers.get('upstash-signature');
  const cur = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nxt = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (sig && cur && nxt) {
    try {
      const ok = await new Receiver({ currentSigningKey: cur, nextSigningKey: nxt }).verify({
        signature: sig,
        body: rawBody,
      });
      if (ok) return true;
    } catch {
      /* sigue al plan B */
    }
  }
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth === `Bearer ${secret}`) return true;
  return false;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await isAuthorized(req, raw))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 200 });
  }
  const job = QueueJobSchema.safeParse(payload);
  if (!job.success) {
    await systemLog('warn', 'queue.worker', 'Trabajo inválido descartado', {
      issues: job.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5),
    });
    return NextResponse.json({ ok: false, error: 'Trabajo inválido.' }, { status: 200 });
  }

  try {
    const result = await dispatchJob(admin, job.data);
    return NextResponse.json(result, { status: result.ok || !result.retryable ? 200 : 500 });
  } catch (e: any) {
    await systemLog('error', 'queue.worker', e?.message ?? 'Excepción en el worker', {
      type: job.data.type,
      tenantId: (job.data as any).tenantId,
    });
    return NextResponse.json(
      { ok: false, retryable: true, detail: String(e?.message ?? e).slice(0, 300) },
      { status: 500 },
    );
  }
}
