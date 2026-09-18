import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrialExpired, resolvePlan, type PlanId } from '@/lib/plans';
import { checkQuota } from '@/lib/usage';
import { enqueue } from '@/lib/queue';
import { systemLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ============================================================
 * Sincronización automática de reseñas (Cron)
 * ============================================================
 * `GET|POST /api/cron/sync-reviews` — programado cada hora:
 *   · Vercel Cron → `vercel.json` (Vercel envía `Authorization: Bearer
 *     CRON_SECRET` solo si la variable existe: créala en el proyecto).
 *   · Supabase Cron → pg_cron + pg_net con el mismo Bearer (ver
 *     `supabase/migration_3_10_0.sql` §8 y GUIA_AUTOMATIZACION.md).
 *
 * El cron NO sincroniza directamente: decide QUÉ toca sincronizar y
 * publica un trabajo `sync.provider` por (empresa, proveedor) en la cola.
 * Así la petición del planificador termina en segundos y cada proveedor
 * se procesa con reintentos y control de caudal en el worker.
 *
 * Cadencia por plan (sobre `integrations.last_sync_at`):
 *   · business → cada hora · pro → cada 6 horas.
 * Google: si hay OAuth se usa Business; si no, Places por `place_id`.
 */

type Provider = 'google' | 'places' | 'trustpilot' | 'tripadvisor';

const CADENCE_MINUTES: Record<PlanId, number> = { business: 60, pro: 360 };

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

type Skip = { tenantId: string; provider: Provider; reason: string };

export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}

async function runCron(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      {
        error: 'No autorizado. Configura CRON_SECRET y llámame con `Authorization: Bearer …` (Vercel Cron lo envía solo) o `?secret=…`.',
        code: 'unauthorized',
      },
      { status: process.env.CRON_SECRET ? 401 : 503 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: tenants } = await admin
    .from('tenants')
    .select('id, name, plan, subscription_status, suspended, trial_ends_at, settings')
    .eq('suspended', false)
    .in('subscription_status', ['active', 'trialing']);

  const eligible = (tenants ?? []).filter((t: any) => !isTrialExpired(t.subscription_status, t.trial_ends_at));
  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, tenants: 0, enqueued: 0, skipped: [] });
  }

  const tenantIds = eligible.map((t: any) => t.id);
  const { data: integrations } = await admin
    .from('integrations')
    .select('tenant_id, provider, status, credentials, last_sync_at')
    .in('tenant_id', tenantIds)
    .eq('status', 'connected')
    .in('provider', ['google', 'trustpilot', 'tripadvisor']);

  const byTenant = new Map<string, any[]>();
  for (const row of integrations ?? []) {
    const list = byTenant.get(row.tenant_id) ?? [];
    list.push(row);
    byTenant.set(row.tenant_id, list);
  }

  let enqueued = 0;
  let stagger = 0;
  const skipped: Skip[] = [];

  for (const tenant of eligible) {
    const plan = resolvePlan((tenant as any).plan);
    const cadenceMs = CADENCE_MINUTES[plan] * 60 * 1000;
    const rows = byTenant.get(tenant.id) ?? [];
    const settings = ((tenant as any).settings as any) ?? {};

    // Candidatos: Google (OAuth→Business, si no→Places), Trustpilot, TripAdvisor.
    const googleRow = rows.find((r) => r.provider === 'google');
    const googleCreds = (googleRow?.credentials as any) ?? {};
    const hasGoogleOAuth = Boolean(googleCreds.refresh_token ?? googleCreds.access_token);
    const candidates: Provider[] = [];
    if (hasGoogleOAuth) candidates.push('google');
    else if (settings.place_id) candidates.push('places');
    if (rows.some((r) => r.provider === 'trustpilot')) candidates.push('trustpilot');
    if (rows.some((r) => r.provider === 'tripadvisor')) candidates.push('tripadvisor');

    // Una sola lectura de cuota por empresa y ejecución.
    const quota = await checkQuota(admin, tenant.id).catch(() => null);
    const syncsLeft = quota ? quota.metrics.syncs.quota - quota.metrics.syncs.used : 0;

    for (const provider of candidates) {
      const row = provider === 'places' ? googleRow : rows.find((r) => r.provider === provider);
      const lastSync = row?.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
      if (Date.now() - lastSync < cadenceMs) {
        skipped.push({ tenantId: tenant.id, provider, reason: 'cadence' });
        continue;
      }
      if (!quota?.hasAccess || syncsLeft <= 0) {
        skipped.push({ tenantId: tenant.id, provider, reason: !quota?.hasAccess ? 'no-access' : 'sync-quota' });
        continue;
      }
      try {
        await enqueue(
          { type: 'sync.provider', tenantId: tenant.id, provider, origin: 'cron' },
          { delaySeconds: Math.min(stagger, 300) },
        );
        enqueued += 1;
        stagger += 3; // escalona para no golpear a los proveedores a la vez
      } catch (e: any) {
        skipped.push({ tenantId: tenant.id, provider, reason: `enqueue:${String(e?.message ?? e).slice(0, 60)}` });
      }
    }
  }

  await systemLog('info', 'cron.sync', `Cron: ${enqueued} syncs encolados (${eligible.length} empresas)`, {
    enqueued,
    skipped: skipped.length,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, tenants: eligible.length, enqueued, skipped });
}
