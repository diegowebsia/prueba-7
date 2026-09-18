import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordWhatsappInbound } from '@/lib/whatsapp';
import { isOptoutMessage, normalizePhone } from '@/lib/optin';
import { systemLog } from '@/lib/logger';
import { createHmac, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * Webhook entrante de WhatsApp Cloud API (Meta → nosotros)
 * ============================================================
 * Configúralo en Meta Developers → tu app → WhatsApp →
 * Configuration → Webhook (`/api/integrations/whatsapp/webhook`):
 *   · Verify Token = `WHATSAPP_VERIFY_TOKEN` (lo inventas tú).
 *   · Campos: `messages` (requerido).
 *
 * Para qué sirve:
 *   1. Cada mensaje ENTRANTE del cliente abre/renueva la ventana de 24 h
 *      (`whatsapp_contacts`): dentro de ella vale texto libre; fuera, el
 *      código cambia solo a plantilla HSM aprobada.
 *   2. Si el cliente escribe STOP/BAJA se REVOCA su opt-in en todas sus
 *      empresas (RGPD) y no se le vuelve a escribir.
 * Los estados de entrega (`statuses`) solo se registran en logs.
 */

/** Verificación del webhook (la llama Meta al guardar la URL). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Token de verificación inválido.' }, { status: 403 });
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook no configurado.' }, { status: 503 });
  const raw = await req.text();
  const supplied = req.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Firma inválida.' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });
  let payload: any;
  try {
    payload = JSON.parse(raw);
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? {};
        if (String(value?.metadata?.phone_number_id ?? '') !== String(process.env.WHATSAPP_PHONE_NUMBER_ID ?? '')) {
          continue;
        }
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const eventId = String(msg?.id ?? '');
          if (!eventId) continue;
          const { error: dedupError } = await admin.from('processed_events').insert({
            provider: 'whatsapp', event_id: eventId,
          });
          if (dedupError?.code === '23505') continue;
          if (dedupError) throw dedupError;
          const phone = normalizePhone(String(msg?.from ?? ''));
          const text = String(msg?.text?.body ?? '').slice(0, 500);
          if (!phone || msg?.type !== 'text') continue;
          await handleInboundText(admin, phone, text);
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'payload inválido';
    await systemLog('error', 'whatsapp.webhook', `Payload no procesado: ${message}`, {});
    return NextResponse.json({ error: 'No se pudo procesar el webhook.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

async function handleInboundText(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string, text: string) {
  // Atribución: el webhook es global (una app Meta), así que se actualizan
  // TODAS las empresas que ya conocen ese móvil (contactos + opt-ins).
  const [{ data: contacts }, { data: optins }] = await Promise.all([
    admin.from('whatsapp_contacts').select('tenant_id').eq('phone', phone),
    admin.from('whatsapp_optins').select('tenant_id').eq('phone', phone).is('revoked_at', null),
  ]);
  const tenantIds = Array.from(
    new Set([...(contacts ?? []).map((c: any) => c.tenant_id), ...(optins ?? []).map((o: any) => o.tenant_id)]),
  );
  if (tenantIds.length === 0) return; // número desconocido: nada que atribuir

  if (isOptoutMessage(text)) {
    await admin
      .from('whatsapp_optins')
      .update({ revoked_at: new Date().toISOString() })
      .eq('phone', phone)
      .in('tenant_id', tenantIds)
      .is('revoked_at', null);
    await systemLog('info', 'whatsapp.webhook', `Baja STOP de ${phone} (${tenantIds.length} empresa(s))`, {
      phone: `${phone.slice(0, 4)}…`,
    });
    return;
  }

  for (const tenantId of tenantIds) {
    await recordWhatsappInbound(admin, tenantId, phone).catch(() => undefined);
  }
}
