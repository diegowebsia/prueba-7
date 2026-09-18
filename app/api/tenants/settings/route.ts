import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const Body = z.object({
  tenantId: z.string().min(1),
  tone: z.enum(['profesional', 'cercano', 'formal']).optional(),
  place_id: z.string().max(120).optional(),
  whatsapp_to: z.string().max(20).optional(),
  tripadvisor_url: z.string().max(300).optional(),
  trustpilot_url: z.string().max(300).optional(),
  funnel_enabled: z.boolean().optional(),
});

/** Guarda ajustes de la empresa (tono IA, Place ID, móvil WhatsApp, URLs del embudo). */
export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const { tenantId, ...patch } = parsed.data;

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
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  const { data: tenant } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  const settings = { ...((tenant?.settings as object) ?? {}), ...patch };
  const { error } = await admin.from('tenants').update({ settings }).eq('id', tenantId);
  if (error) return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });

  return NextResponse.json({ ok: true, settings });
}
