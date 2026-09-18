import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenantByApiKey } from '@/lib/store';
import { enqueue } from '@/lib/queue';

const Body = z.object({
  api_key: z.string().min(10),
  order_id: z.string().min(1).max(100),
  customer_name: z.string().min(1).max(120),
  customer_phone: z.string().min(5).max(25),
  /** Consentimiento explícito del checkout (RGPD). Sin opt-in previo no se envía. */
  whatsapp_optin: z.boolean().optional(),
  optin_text: z.string().max(500).optional(),
});

/**
 * Endpoint GENÉRICO «pedido entregado» para cualquier tienda/TPV/Stripe:
 * llámalo al entregar y enviamos el WhatsApp de valoración al cliente.
 * (Solo plan Business + cuota + opt-in RGPD.)
 * El pedido se ENCOLA y se responde al instante; el worker lo procesa.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });

  const tenant = await tenantByApiKey(admin, parsed.data.api_key);
  if (!tenant) return NextResponse.json({ error: 'API key inválida.' }, { status: 401 });

  const { queued, jobId } = await enqueue({
    type: 'store.delivered',
    tenantId: tenant.id,
    order: {
      orderId: parsed.data.order_id,
      customerName: parsed.data.customer_name,
      customerPhone: parsed.data.customer_phone,
      provider: 'store',
      optin: parsed.data.whatsapp_optin,
      optinText: parsed.data.optin_text,
    },
  });
  return NextResponse.json({ ok: true, accepted: true, queued, jobId });
}
