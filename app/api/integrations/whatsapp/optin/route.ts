import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';
import { hasOptin, normalizePhone, recordOptin, revokeOptin } from '@/lib/optin';
import { systemLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Gestión manual del opt-in de WhatsApp (RGPD).
 *   GET  ?tenantId=…                    → lista de consentimientos.
 *   POST { tenantId, phone, action }     → action 'grant' | 'revoke' | 'check'.
 * El camino normal es el checkout de la tienda (automático); esto es para
 * altas manuales, bajas y auditoría desde el panel.
 */
export async function GET(req: Request) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const gate = await memberGate(tenantId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { admin } = gate;

  const paid = await requirePaidAccess(admin, tenantId, { feature: 'whatsappAlerts', action: 'Ver opt-ins' });
  if (!paid.ok) return NextResponse.json(paid.body, { status: paid.status, headers: paid.headers });

  const { data } = await admin
    .from('whatsapp_optins')
    .select('phone, customer_name, order_id, source, proof_text, created_at, revoked_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200);
  return NextResponse.json({ ok: true, optins: data ?? [] });
}

const Body = z.object({
  tenantId: z.string().min(1),
  phone: z.string().min(5).max(25),
  action: z.enum(['grant', 'revoke', 'check']),
  name: z.string().max(120).optional(),
  proofText: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const input = parsed.data;

  const gate = await memberGate(input.tenantId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { admin } = gate;

  const paid = await requirePaidAccess(admin, input.tenantId, {
    feature: 'whatsappAlerts',
    action: 'Gestionar opt-in',
  });
  if (!paid.ok) return NextResponse.json(paid.body, { status: paid.status, headers: paid.headers });

  const phone = normalizePhone(input.phone);
  if (phone.length < 9) return NextResponse.json({ error: 'Móvil inválido.' }, { status: 400 });

  if (input.action === 'check') {
    return NextResponse.json({ ok: true, phone, optin: await hasOptin(admin, input.tenantId, phone) });
  }
  if (input.action === 'revoke') {
    await revokeOptin(admin, input.tenantId, phone);
    await systemLog('info', 'whatsapp.optin', `Opt-in revocado manual (${phone.slice(0, 4)}…)`, {
      tenantId: input.tenantId,
    });
    return NextResponse.json({ ok: true, phone, optin: false });
  }
  const saved = await recordOptin(admin, input.tenantId, {
    phone,
    customerName: input.name,
    source: 'manual',
    proofText: input.proofText ?? 'Alta manual desde el panel',
  });
  if (!saved) return NextResponse.json({ error: 'No se pudo registrar.' }, { status: 500 });
  await systemLog('info', 'whatsapp.optin', `Opt-in manual (${phone.slice(0, 4)}…)`, { tenantId: input.tenantId });
  return NextResponse.json({ ok: true, phone, optin: true });
}

async function memberGate(
  tenantId: string,
): Promise<
  | { ok: true; admin: NonNullable<ReturnType<typeof createAdminClient>> }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'No autenticado.' };
  const admin = createAdminClient();
  if (!admin) return { ok: false, status: 503, error: 'Supabase no configurado.' };
  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return { ok: false, status: 403, error: 'Sin permiso en esta empresa.' };
  return { ok: true, admin };
}
