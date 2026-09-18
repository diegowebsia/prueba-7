import { NextResponse } from 'next/server';
import { z } from 'zod';
import { syncGoogleBusinessForTenant, syncGooglePlacesForTenant } from '@/lib/google';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { decryptCredentials } from '@/lib/credentials';

const Body = z.object({
  tenantId: z.string().min(1),
  /** `business` (OAuth de Google Business Profile) o `places` (API key + Place ID). */
  provider: z.enum(['business', 'places', 'auto']).default('auto'),
  placeId: z.string().max(200).optional(),
});

/**
 * Sincroniza reseñas REALES de Google a la bandeja.
 * Dos vías, ambas con control de cuota en `lib/google.ts`:
 *   · Google Business Profile (OAuth) → importar + publicar respuestas.
 *   · Google Places API (New) con el Place ID de la empresa y API key de servidor.
 *
 * Respuestas de error estándar:
 *   402 suscripción sin acceso · 403 feature fuera de plan · 429 cuota agotada
 *   (con cabecera `Retry-After` = segundos hasta la renovación del ciclo).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const supabase = await createClient();
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

  const { data: tenant } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  const settings = (tenant?.settings as any) ?? {};
  const placeId = (parsed.data.placeId ?? settings.place_id ?? '').trim();

  const { data: integ } = await admin
    .from('integrations')
    .select('credentials')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google')
    .single();
  const creds = decryptCredentials<any>(integ?.credentials);
  const hasOAuth = Boolean(creds.refresh_token || creds.access_token);

  // `auto`: prefiere OAuth (permite publicar respuestas) y cae a Places.
  const usePlaces =
    parsed.data.provider === 'places' || (parsed.data.provider === 'auto' && !hasOAuth && Boolean(placeId));

  if (!hasOAuth && !usePlaces) {
    return NextResponse.json(
      { error: 'Google no conectado. Pulsa «Conectar Google» o guarda tu Place ID para usar Places API.' },
      { status: 400 },
    );
  }

  try {
    const sync = usePlaces
      ? await syncGooglePlacesForTenant({ admin, tenantId }, placeId)
      : await syncGoogleBusinessForTenant({ admin, tenantId }, creds);

    if (!sync.ok) {
      await admin
        .from('integrations')
        .update({ status: 'error', last_error: sync.error.slice(0, 300) })
        .eq('tenant_id', tenantId)
        .eq('provider', 'google');
      return NextResponse.json(sync.body, { status: sync.status, headers: sync.headers });
    }

    await admin
      .from('integrations')
      .upsert(
        {
          tenant_id: tenantId,
          provider: 'google',
          status: 'connected',
          last_sync_at: new Date().toISOString(),
          last_error: null,
          external_label: sync.provider === 'places' ? `Places · ${sync.placeName ?? placeId}` : 'Google Business',
        },
        { onConflict: 'tenant_id,provider' },
      );

    if (sync.provider === 'places' && placeId) {
      await admin
        .from('tenants')
        .update({ settings: { ...settings, place_id: placeId, place_rating: sync.rating ?? null } })
        .eq('id', tenantId);
    }

    await systemLog('info', 'integrations.google', `${sync.result.imported} reseñas sincronizadas (${sync.provider})`, {
      tenantId,
      quotaCut: sync.result.quotaCut,
    });

    return NextResponse.json({
      ok: true,
      provider: sync.provider,
      imported: sync.result.imported,
      skipped: sync.result.skipped,
      quotaCut: sync.result.quotaCut,
      placeName: sync.placeName ?? null,
      rating: sync.rating ?? null,
      userRatingCount: sync.userRatingCount ?? null,
      quota: sync.quota,
      errors: sync.result.errors,
      message: sync.result.quotaCut
        ? `Importadas ${sync.result.imported} reseñas. La cuota del ciclo se ha agotado: el resto queda pendiente.`
        : `${sync.result.imported} reseñas sincronizadas.`,
    });
  } catch (e: any) {
    await admin
      .from('integrations')
      .update({ status: 'error', last_error: String(e?.message ?? e).slice(0, 300) })
      .eq('tenant_id', tenantId)
      .eq('provider', 'google');
    return NextResponse.json({ error: e?.message ?? 'Sincronización fallida.' }, { status: 502 });
  }
}
