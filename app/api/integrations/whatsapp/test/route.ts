import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isWhatsappConfigured, sendWhatsappForTenant } from '@/lib/whatsapp';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';

const Body = z.object({ tenantId: z.string().min(1), to: z.string().min(9).max(20) });

/**
 * Envía un WhatsApp REAL de prueba al móvil indicado (y lo guarda en ajustes).
 * Pasa por el mismo motor de cuotas que los envíos productivos:
 * 402 sin suscripción · 403 si el plan no incluye alertas · 429 sin cuota.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Móvil inválido (usa formato 34612345678).' }, { status: 400 });
  }
  if (!isWhatsappConfigured()) {
    return NextResponse.json(
      { error: 'Falta WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID en el servidor.' },
      { status: 503 },
    );
  }

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

  const sent = await sendWhatsappForTenant(
    { admin, tenantId },
    {
      to: parsed.data.to,
      body:
        '✅ WhatsApp conectado con ReviewFlow AI. A partir de ahora recibirás aquí ' +
        'las reseñas de ≤3★ al instante y tus clientes la petición de valoración al entregar.',
      kind: 'prueba',
      feature: 'whatsappAlerts',
      action: 'WhatsApp de prueba',
    },
  );

  if (!sent.ok) {
    await systemLog('warn', 'whatsapp.test', sent.error, { tenantId, code: sent.code });
    return NextResponse.json(sent.body, { status: sent.status, headers: sent.headers });
  }

  // Guarda el móvil como destino de alertas de esta empresa.
  const { data: tenant } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  await admin
    .from('tenants')
    .update({ settings: { ...((tenant?.settings as object) ?? {}), whatsapp_to: parsed.data.to } })
    .eq('id', tenantId);
  await admin.from('integrations').upsert(
    {
      tenant_id: tenantId,
      provider: 'whatsapp',
      status: 'connected',
      last_sync_at: new Date().toISOString(),
      last_error: null,
      external_label: parsed.data.to,
    },
    { onConflict: 'tenant_id,provider' },
  );

  return NextResponse.json({
    ok: true,
    message: 'WhatsApp de prueba enviado. Revisa tu móvil.',
    messageId: sent.messageId,
    quota: sent.quota,
  });
}
