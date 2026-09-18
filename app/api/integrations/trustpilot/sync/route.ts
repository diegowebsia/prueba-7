import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchTrustpilotReviews } from '@/lib/trustpilot';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestReviews } from '@/lib/ingest';
import { checkQuota, publicQuota } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

const Body = z.object({ tenantId: z.string().min(1) });

/**
 * Importa reseñas REALES de Trustpilot Business API.
 * El corte de cuota lo aplica `ingestReviews` (misma lógica que Google):
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
    .eq('provider', 'trustpilot')
    .single();
  const creds = (integ?.credentials as any) ?? {};
  if (!creds.apiKey || !creds.businessUnitId) {
    return NextResponse.json({ error: 'Trustpilot no configurado. Guarda tu API key primero.' }, { status: 400 });
  }

  // Corte anticipado: si no hay acceso o la cuota está a cero, no se llama a la API.
  const pre = await checkQuota(admin, tenantId);
  if (!pre.hasAccess || !pre.allowed) {
    return NextResponse.json(
      {
        error: pre.hasAccess
          ? `Cuota agotada (${pre.metrics.reviews.used}/${pre.metrics.reviews.quota}). Se renueva el ${pre.renewalLabel}.`
          : 'Suscripción sin acceso.',
        code: pre.hasAccess ? 'quota_exhausted' : 'no_subscription',
        quota: publicQuota(pre),
      },
      { status: pre.hasAccess ? 429 : 402 },
    );
  }

  try {
    const reviews = await fetchTrustpilotReviews(creds.apiKey, creds.businessUnitId);
    const result = await ingestReviews(admin, tenantId, reviews, 'trustpilot');

    // Tope de filas/almacenamiento del plan: se informa con 507 (no es un fallo del proveedor).
    if (result.storageCut) {
      const quota = await checkQuota(admin, tenantId);
      await systemLog('warn', 'integrations.trustpilot', result.errors[0] ?? 'tope de almacenamiento', {
        tenantId,
        code: 'storage_limit',
      });
      return NextResponse.json(
        {
          error: result.errors[0] ?? 'Tope de opiniones guardadas del plan alcanzado.',
          code: 'storage_limit',
          quota: publicQuota(quota),
        },
        { status: 507 },
      );
    }

    if (result.imported === 0 && result.errors.length > 0 && !result.quotaCut) {
      throw new Error(result.errors[0]);
    }

    await admin
      .from('integrations')
      .update({ status: 'connected', last_sync_at: new Date().toISOString(), last_error: null })
      .eq('tenant_id', tenantId)
      .eq('provider', 'trustpilot');

    const quota = await checkQuota(admin, tenantId);
    await systemLog('info', 'integrations.trustpilot', `${result.imported} reseñas sincronizadas`, {
      tenantId,
      quotaCut: result.quotaCut,
    });

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      quotaCut: result.quotaCut,
      quota: publicQuota(quota),
      message: result.quotaCut
        ? `Importadas ${result.imported} reseñas. Cuota del ciclo agotada: amplíala con un add-on para seguir.`
        : `${result.imported} reseñas sincronizadas.`,
    });
  } catch (e: any) {
    await admin
      .from('integrations')
      .update({ status: 'error', last_error: String(e?.message ?? e).slice(0, 300) })
      .eq('tenant_id', tenantId)
      .eq('provider', 'trustpilot');
    const quota = await checkQuota(admin, tenantId).catch(() => null);
    if (quota && !quota.allowed) {
      return NextResponse.json(
        {
          error: `Cuota agotada (${quota.metrics.reviews.used}/${quota.metrics.reviews.quota}).`,
          code: 'quota_exhausted',
          quota: publicQuota(quota),
        },
        { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } },
      );
    }
    return NextResponse.json({ error: e?.message ?? 'Sincronización fallida.' }, { status: 502 });
  }
}
