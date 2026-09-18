import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Tickets privados del embudo (1-3★). Requiere membresía.
 *   GET   ?tenantId=…&status=open|closed|all  → lista (100).
 *   PATCH { tenantId, id, status }            → abrir/cerrar ticket.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const gate = await memberGate(tenantId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let query = gate.admin
    .from('feedback_responses')
    .select('id, stars, customer_name, contact, message, order_id, status, created_at, resolved_at')
    .eq('tenant_id', tenantId)
    .eq('kind', 'ticket')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status === 'open' || status === 'closed') query = query.eq('status', status);

  const { data } = await query;
  return NextResponse.json({ ok: true, tickets: data ?? [] });
}

const PatchBody = z.object({
  tenantId: z.string().min(1),
  id: z.string().uuid(),
  status: z.enum(['open', 'closed']),
});

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });

  const gate = await memberGate(parsed.data.tenantId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await gate.admin
    .from('feedback_responses')
    .update({
      status: parsed.data.status,
      resolved_at: parsed.data.status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.id)
    .eq('tenant_id', parsed.data.tenantId)
    .eq('kind', 'ticket');
  if (error) return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
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
