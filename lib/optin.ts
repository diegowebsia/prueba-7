/**
 * Opt-in de WhatsApp (cumplimiento RGPD / ePrivacy).
 * Ningún WhatsApp de marketing/post-venta sale al CLIENTE sin su
 * consentimiento explícito registrado en `whatsapp_optins`:
 *
 *   · El checkout de la tienda muestra un checkbox («Acepto recibir por
 *     WhatsApp el seguimiento de mi pedido y una solicitud de valoración»)
 *     y envía `whatsapp_optin: true` al webhook de pedido entregado.
 *   · `recordOptin()` guarda la prueba (texto aceptado + pedido + fecha).
 *   · `hasOptin()` se comprueba antes de cada envío (ver `lib/store.ts`).
 *   · El cliente revoca respondiendo STOP/BAJA (webhook entrante) o desde
 *     el panel (`revokeOptin()`): `revoked_at` bloquea futuros envíos.
 *
 * Escape temporal para tiendas ya integradas sin checkbox:
 *   WHATSAPP_REQUIRE_OPTIN=false  (por defecto 'true')
 */

import type { AdminLike } from '@/lib/usage';

export type OptinSource = 'checkout' | 'order' | 'manual' | 'import';

/** Normaliza un móvil a solo dígitos (con prefijo país). */
export function normalizePhone(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

export function requireWhatsappOptin(): boolean {
  return (process.env.WHATSAPP_REQUIRE_OPTIN ?? 'true').toLowerCase() !== 'false';
}

export type OptinRecord = {
  phone: string;
  customerName?: string;
  orderId?: string;
  source?: OptinSource;
  /** Texto del checkbox aceptado (auditoría). */
  proofText?: string;
};

/**
 * Registra (o renueva, limpiando una revocación anterior) el consentimiento.
 * Idempotente por (tenant_id, phone).
 */
export async function recordOptin(admin: AdminLike, tenantId: string, input: OptinRecord): Promise<boolean> {
  const phone = normalizePhone(input.phone);
  if (phone.length < 9) return false;
  const { error } = await admin.from('whatsapp_optins').upsert(
    {
      tenant_id: tenantId,
      phone,
      customer_name: input.customerName?.slice(0, 120) ?? null,
      order_id: input.orderId?.slice(0, 100) ?? null,
      source: input.source ?? 'checkout',
      proof_text: input.proofText?.slice(0, 500) ?? null,
      revoked_at: null,
    },
    { onConflict: 'tenant_id,phone' },
  );
  return !error;
}

/** ¿Existe consentimiento vigente (no revocado) para este móvil? */
export async function hasOptin(admin: AdminLike, tenantId: string, phone: string): Promise<boolean> {
  const digits = normalizePhone(phone);
  if (digits.length < 9) return false;
  const { data } = await admin
    .from('whatsapp_optins')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', digits)
    .is('revoked_at', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/** Revoca el consentimiento (STOP del cliente o baja manual). */
export async function revokeOptin(admin: AdminLike, tenantId: string, phone: string): Promise<boolean> {
  const digits = normalizePhone(phone);
  if (!digits) return false;
  const { error } = await admin
    .from('whatsapp_optins')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('phone', digits)
    .is('revoked_at', null);
  return !error;
}

/** Palabras que el cliente puede usar para darse de baja por WhatsApp. */
const OPTOUT_WORDS = ['stop', 'baja', 'baja!', 'no mas', 'no más', 'unsuscribe', 'unsubscribe', 'salir', 'borrarme'];

export function isOptoutMessage(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase().slice(0, 60);
  return OPTOUT_WORDS.some((w) => t === w || t.startsWith(`${w} `) || t.startsWith(`${w}.`));
}
