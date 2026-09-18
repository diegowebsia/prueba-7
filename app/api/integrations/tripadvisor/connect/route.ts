import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';
import { encryptCredentials } from '@/lib/credentials';

const Body = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(3).max(60),
});

/** Guarda el Location ID de TripAdvisor (el número `dXXXXXX` de la URL de tu ficha). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Location ID inválido.' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', parsed.data.tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso.' }, { status: 403 });

  // Regla estricta: sin suscripción activa o con la prueba caducada → 402.
  const gate = await requirePaidAccess(admin, parsed.data.tenantId, {
    feature: 'tripadvisor',
    action: 'Conexión con TripAdvisor',
    metric: 'syncs',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  const { error: saveError } = await admin.from('integrations').upsert(
    {
      tenant_id: parsed.data.tenantId,
      provider: 'tripadvisor',
      status: 'connected',
      credentials: encryptCredentials({ locationId: parsed.data.locationId.trim() }),
      external_label: 'TripAdvisor',
      last_error: null,
    },
    { onConflict: 'tenant_id,provider' },
  );
  if (saveError) return NextResponse.json({ error: 'No se pudo guardar la integración.' }, { status: 500 });

  return NextResponse.json({ ok: true, message: 'TripAdvisor conectado. Pulsa «Sincronizar» para importar.' });
}
