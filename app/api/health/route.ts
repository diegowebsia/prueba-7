import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env, isStripeConfigured, isStripeWebhookConfigured, isSupabaseAdminConfigured, isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Liveness público mínimo; no revela configuración ni consulta dependencias. */
export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get('mode') ?? 'live';
  if (mode !== 'ready') {
    return NextResponse.json({ ok: true, service: 'reviewflow-ai', version: '3.11.0' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const expected = process.env.HEALTHCHECK_SECRET ?? '';
  const supplied = req.headers.get('authorization') ?? '';
  if (!expected || supplied !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 401 });
  }

  const configReady = Boolean(
    isSupabaseConfigured && isSupabaseAdminConfigured && isStripeConfigured &&
    isStripeWebhookConfigured && env.appUrl && !env.appUrl.includes('localhost'),
  );
  const admin = createAdminClient();
  const dbResult = admin ? await admin.from('tenants').select('id', { head: true, count: 'exact' }).limit(1) : null;
  const dbReady = Boolean(dbResult && !dbResult.error);
  const ok = configReady && dbReady;
  return NextResponse.json({ ok, checks: { configuration: configReady, database: dbReady } }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
