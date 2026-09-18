import { NextResponse } from 'next/server';
import { planOf } from '@/lib/plans';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';
import { env } from '@/lib/env';

const Body = z.object({
  tenantId: z.string().min(1),
  provider: z.enum(['shopify', 'woocommerce']),
  webhook_secret: z.string().min(8).max(200),
});

/**
 * Guarda el secreto del webhook de la tienda y devuelve la URL a pegar
 * en Shopify (Settings → Notifications → Webhooks) o WooCommerce
 * (WooCommerce → Settings → Advanced → Webhooks).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Proveedor o secreto inválidos (mín. 8 caracteres).' }, { status: 400 });
  }

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
    feature: 'storeIntegration',
    action: 'Conexión con tienda',
    metric: 'syncs',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('plan, api_key')
    .eq('id', parsed.data.tenantId)
    .single();
  if (planOf(tenant?.plan).id !== 'business') {
    return NextResponse.json(
      { error: 'La conexión con tienda requiere el plan Business.', checkoutUrl: '/bienvenido?plan=business' },
      { status: 403 },
    );
  }

  await admin.from('integrations').upsert(
    {
      tenant_id: parsed.data.tenantId,
      provider: parsed.data.provider,
      status: 'connected',
      credentials: { webhook_secret: parsed.data.webhook_secret },
      external_label: parsed.data.provider === 'shopify' ? 'Shopify' : 'WooCommerce',
      last_error: null,
    },
    { onConflict: 'tenant_id,provider' },
  );

  const base = env.appUrl.replace(/\/$/, '');
  const webhookUrl = `${base}/api/integrations/${parsed.data.provider}/webhook?key=${tenant?.api_key ?? ''}`;
  return NextResponse.json({
    ok: true,
    webhookUrl,
    message: 'Secreto guardado. Pega esta URL como webhook en tu tienda.',
  });
}
