import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';

const Body = z.object({
  tenantId: z.string().min(1),
  apiKey: z.string().min(5).max(200),
  businessUnitId: z.string().min(5).max(100),
});

/** Guarda la API key + Business Unit ID de Trustpilot (plan Business). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'API key o Business Unit ID inválidos.' }, { status: 400 });

  const supabase = createClient();
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
    feature: 'trustpilot',
    action: 'Conexión con Trustpilot',
    metric: 'syncs',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  await admin.from('integrations').upsert(
    {
      tenant_id: parsed.data.tenantId,
      provider: 'trustpilot',
      status: 'connected',
      credentials: { apiKey: parsed.data.apiKey, businessUnitId: parsed.data.businessUnitId },
      external_label: 'Trustpilot Business',
      last_error: null,
    },
    { onConflict: 'tenant_id,provider' },
  );

  return NextResponse.json({ ok: true, message: 'Trustpilot conectado. Pulsa «Sincronizar» para importar.' });
}
