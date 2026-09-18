import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';

const Body = z.object({ tenantId: z.string().uuid(), reason: z.string().min(10).max(500), ticket: z.string().min(3).max(100) });

/**
 * "Acceder como empresa": genera un magic-link del propietario del tenant
 * para que el super-admin pueda entrar a su cuenta sin pedirle la contraseña
 * y sin tocar Supabase manualmente.
 * Devuelve { url } que el panel abre en pestaña nueva.
 */
export async function POST(req: Request) {
  if (process.env.ADMIN_IMPERSONATION_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Impersonación deshabilitada.' }, { status: 403 });
  }
  const guard = await requireSuperAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const supabase = await createClient();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'Esta operación exige MFA reciente (AAL2).' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Faltan tenantId, motivo o ticket válidos.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, owner_email')
    .eq('id', parsed.data.tenantId)
    .single();

  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: tenant.owner_email,
  });
  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: `No se pudo generar el acceso: ${error?.message}` },
      { status: 500 },
    );
  }

  await systemLog('warn', 'admin.impersonate', `Acceso generado a ${tenant.name}`, {
    by: guard.email,
    tenantId: tenant.id,
    reason: parsed.data.reason, ticket: parsed.data.ticket,
  });
  const { error: auditError } = await admin.from('admin_audit_events').insert({
    actor_email: guard.email, action: 'impersonation_link_created', tenant_id: tenant.id,
    reason: parsed.data.reason, ticket: parsed.data.ticket,
  });
  if (auditError) return NextResponse.json({ error: 'No se pudo registrar la auditoría inmutable.' }, { status: 500 });

  // El cliente abre esta URL; redirige al dashboard con la sesión del propietario.
  return NextResponse.json({
    ok: true,
    message: `Acceso a "${tenant.name}" generado. Abriendo en pestaña nueva…`,
    url: data.properties.action_link,
  });
}
