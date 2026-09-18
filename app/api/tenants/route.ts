import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasAccess } from '@/lib/plans';
import { planOf } from '@/lib/plans';
import { systemLog } from '@/lib/logger';

const Body = z.object({ name: z.string().min(2).max(80) });

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/**
 * Crea una empresa. Modelo v3.9.0 (100% de pago): cada plan incluye N
 * sedes/empresas (Pro 3, Business 10) — ver lib/plans.ts `limits.locations`.
 * Requiere suscripción activa: sin ella responde 402.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Nombre inválido (2-80 caracteres).' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Supabase no configurado en el servidor.', demo: true },
      { status: 503 },
    );
  }

  const { data: mine } = await admin
    .from('tenants')
    .select('id, plan, subscription_status, suspended')
    .eq('owner_id', user.id);

  const active = (mine ?? []).filter((t: any) => hasAccess(t.subscription_status, t.suspended));
  if (active.length === 0) {
    return NextResponse.json(
      {
        error: 'Necesitas una suscripción activa para crear una empresa.',
        code: 'no_subscription',
        checkoutUrl: '/bienvenido',
        plan: 'pro',
      },
      { status: 402 },
    );
  }

  // Tope de sedes del plan más alto contratado por el usuario.
  const locationCap = Math.max(...active.map((t: any) => planOf(t.plan).limits.locations), 1);
  if ((mine ?? []).length >= locationCap) {
    return NextResponse.json(
      {
        error: `Tu plan incluye ${locationCap} ${locationCap === 1 ? 'empresa' : 'empresas'}. Amplía a un plan superior para añadir más negocios.`,
        checkoutUrl: '/bienvenido',
        plan: 'business',
      },
      { status: 403 },
    );
  }

  const slug = `${slugify(parsed.data.name)}-${Date.now().toString(36)}`;
  const { data: tenant, error } = await admin
    .from('tenants')
    .insert({
      name: parsed.data.name,
      slug,
      owner_email: user.email,
      owner_id: user.id,
      // Hereda el plan activo del usuario; el nuevo negocio nace operativo.
      plan: active[0].plan as string,
      subscription_status: active[0].subscription_status as string,
    })
    .select('id')
    .single();

  if (error || !tenant) {
    await systemLog('error', 'tenants.create', error?.message ?? 'Error creando tenant', {
      user: user.email,
    });
    return NextResponse.json({ error: 'No se pudo crear la empresa.' }, { status: 500 });
  }

  await admin.from('memberships').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    role: 'owner',
  });

  await systemLog('info', 'tenants.create', `Empresa creada: ${parsed.data.name}`, {
    tenantId: tenant.id,
    user: user.email,
  });

  return NextResponse.json({ ok: true, tenantId: tenant.id });
}
