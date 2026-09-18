import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';

const Body = z.object({
  op: z.enum(['suspend', 'unsuspend', 'delete', 'set-plan', 'ping']),
  tenantId: z.string().optional(),
  plan: z.enum(['pro', 'business']).optional(),
});

/**
 * Acciones de super-admin sobre tenants.
 * Protegida por requireSuperAdmin() (además del middleware).
 */
export async function POST(req: Request) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Operación inválida.' }, { status: 400 });
  const { op, tenantId, plan } = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });
  }

  if (op === 'ping') {
    const { error } = await admin.from('tenants').select('id', { head: true, count: 'exact' });
    if (error) return NextResponse.json({ error: `BD error: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, message: 'Conexión a Supabase OK ✅' });
  }

  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  if (op === 'suspend' || op === 'unsuspend') {
    const { error } = await admin
      .from('tenants')
      .update({ suspended: op === 'suspend' })
      .eq('id', tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await systemLog('warn', 'admin.tenants', `${op} tenant ${tenantId}`, { by: guard.email });
    return NextResponse.json({
      ok: true,
      message: op === 'suspend' ? 'Empresa suspendida.' : 'Empresa reactivada.',
    });
  }

  if (op === 'set-plan') {
    if (!plan) return NextResponse.json({ error: 'Falta plan.' }, { status: 400 });
    const { error } = await admin.from('tenants').update({ plan }).eq('id', tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await systemLog('info', 'admin.tenants', `Plan de ${tenantId} → ${plan}`, { by: guard.email });
    return NextResponse.json({ ok: true, message: `Plan cambiado a ${plan}.` });
  }

  if (op === 'delete') {
    // Borrado en cascada manual (además del ON DELETE CASCADE del schema).
    await admin.from('reviews').delete().eq('tenant_id', tenantId);
    await admin.from('memberships').delete().eq('tenant_id', tenantId);
    const { error } = await admin.from('tenants').delete().eq('id', tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await systemLog('warn', 'admin.tenants', `Tenant eliminado: ${tenantId}`, { by: guard.email });
    return NextResponse.json({ ok: true, message: 'Empresa eliminada con todos sus datos.' });
  }

  return NextResponse.json({ error: 'Operación no soportada.' }, { status: 400 });
}
