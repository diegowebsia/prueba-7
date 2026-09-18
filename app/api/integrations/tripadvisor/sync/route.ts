import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncTripadvisorForTenant } from '@/lib/tripadvisor';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkQuota, publicQuota } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

const Body = z.object({ tenantId: z.string().min(1) });

/**
 * Importa reseñas REALES de TripAdvisor (vía SerpAPI/Outscraper).
 * El corte de cuota lo aplica `syncTripadvisorForTenant`:
 * 402 sin suscripción · 403 feature fuera de plan · 429 cuota agotada.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const tenantId = parsed.data.tenantId;

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });

  const { data: integ } = await admin
    .from('integrations')
    .select('credentials')
    .eq('tenant_id', tenantId)
    .eq('provider', 'tripadvisor')
    .single();
  const creds = (integ?.credentials as any) ?? {};
  if (!creds.locationId) {
    return NextResponse.json({ error: 'TripAdvisor no configurado. Guarda tu Location ID primero.' }, { status: 400 });
  }

  const synced = await syncTripadvisorForTenant({ admin, tenantId }, { locationId: creds.locationId });
  if (!synced.ok) {
    if (synced.status >= 500 || synced.status === 400) {
      await admin
        .from('integrations')
        .update({ status: 'error', last_error: synced.error.slice(0, 300) })
        .eq('tenant_id', tenantId)
        .eq('provider', 'tripadvisor');
    }
    await systemLog('warn', 'integrations.tripadvisor', synced.error, { tenantId, code: synced.code });
    return NextResponse.json(synced.body, { status: synced.status, headers: synced.headers });
  }

  await admin
    .from('integrations')
    .update({ status: 'connected', last_sync_at: new Date().toISOString(), last_error: null })
    .eq('tenant_id', tenantId)
    .eq('provider', 'tripadvisor');

  const quota = await checkQuota(admin, tenantId);
  return NextResponse.json({
    ok: true,
    imported: synced.result.imported,
    skipped: synced.result.skipped,
    quotaCut: synced.result.quotaCut,
    quota: publicQuota(quota),
    message: synced.result.quotaCut
      ? `Importadas ${synced.result.imported} reseñas. Cuota del ciclo agotada: amplíala con un add-on para seguir.`
      : `${synced.result.imported} reseñas sincronizadas.`,
  });
}
