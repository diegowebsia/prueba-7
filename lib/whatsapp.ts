import { fetchWithTimeout } from '@/lib/http';
/**
 * WhatsApp Cloud API (Meta) — alertas reales al móvil del negocio.
 * Configuración (Meta for Developers → tu app → WhatsApp):
 *   WHATSAPP_TOKEN               = token de acceso (permanente en producción)
 *   WHATSAPP_PHONE_NUMBER_ID     = ID del número remitente
 *   WHATSAPP_BUSINESS_ACCOUNT_ID = ID de la cuenta de negocio (opcional, métricas)
 *   WHATSAPP_API_VERSION         = versión del Graph API (por defecto v21.0)
 * El destino (móvil del negocio, formato 34612345678) se guarda por empresa
 * en tenants.settings.whatsapp_to desde el panel.
 */

export function whatsappApiVersion(): string {
  return (process.env.WHATSAPP_API_VERSION ?? 'v21.0').replace(/^\/+|\/+$/g, '');
}

export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Envío RAW a la Cloud API. Devuelve el `wamid` del mensaje.
 * ⚠️ No comprueba cuota ni plan: usa `sendWhatsappForTenant()` desde el negocio.
 */
export async function sendWhatsapp(to: string, body: string): Promise<string | undefined> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error('WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');

  const res = await fetchWithTimeout(
    `https://graph.facebook.com/${whatsappApiVersion()}/${phoneId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { preview_url: false, body: body.slice(0, 4000) },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`WhatsApp error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data: any = await res.json().catch(() => ({}));
  return (data?.messages?.[0]?.id as string | undefined) ?? undefined;
}

/**
 * Envío por PLANTILLA aprobada (HSM Template) — OBLIGATORIO fuera de la
 * ventana conversacional de 24 h (Meta rechaza el texto libre con error
 * 131047/132000). Las plantillas se crean en
 * Meta Developers → tu app → WhatsApp → Message Templates y deben aprobarse.
 *
 * Variables dinámicas: {{1}}..{{n}} del cuerpo (+ cabecera opcional).
 * Ejemplo «solicitud_valoracion» (ES):
 *   «Hola {{1}} 🎉, tu pedido {{2}} de {{3}} ha sido entregado.
 *    ¿Nos ayudas con tu valoración (30 segundos)? {{4}}»
 */
export type WhatsappTemplatePayload = {
  /** Nombre EXACTO aprobado en Meta. */
  name: string;
  /** Idioma aprobado (por defecto WHATSAPP_TEMPLATE_LANG o 'es'). */
  lang?: string;
  /** Valores de {{1}}..{{n}} del cuerpo, en orden. */
  bodyParams: string[];
  /** Valores de la cabecera (si la plantilla la usa). */
  headerParams?: string[];
};

export async function sendWhatsappTemplate(
  to: string,
  tpl: WhatsappTemplatePayload,
): Promise<string | undefined> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error('WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');

  const textParam = (text: string) => ({ type: 'text', text: String(text).slice(0, 1024) });
  const components: any[] = [
    { type: 'body', parameters: tpl.bodyParams.map(textParam) },
  ];
  if (tpl.headerParams?.length) {
    components.unshift({ type: 'header', parameters: tpl.headerParams.map(textParam) });
  }

  const res = await fetchWithTimeout(
    `https://graph.facebook.com/${whatsappApiVersion()}/${phoneId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: tpl.name,
          language: { code: tpl.lang ?? whatsappTemplateLang() },
          components,
        },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`WhatsApp plantilla «${tpl.name}» error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data: any = await res.json().catch(() => ({}));
  return (data?.messages?.[0]?.id as string | undefined) ?? undefined;
}

/** Nombre de plantilla por caso de uso (configurable por entorno). */
export function whatsappTemplateName(kind: 'pedido' | 'alerta' | 'generic'): string {
  if (kind === 'pedido') return process.env.WHATSAPP_TEMPLATE_REVIEW_REQUEST ?? 'solicitud_valoracion';
  if (kind === 'alerta') return process.env.WHATSAPP_TEMPLATE_ALERT ?? 'alerta_resena';
  return process.env.WHATSAPP_TEMPLATE_GENERIC ?? 'aviso_generico';
}

export function whatsappTemplateLang(): string {
  return process.env.WHATSAPP_TEMPLATE_LANG ?? 'es';
}

/**
 * Variables de la plantilla de solicitud de valoración:
 * {{1}} nombre del cliente · {{2}} nº de pedido · {{3}} negocio · {{4}} URL.
 */
export function orderDeliveredTemplateParams(
  business: string,
  customerName: string,
  orderId: string,
  reviewLink: string,
): string[] {
  return [customerName.slice(0, 60), orderId.slice(0, 40), business.slice(0, 60), reviewLink.slice(0, 500)];
}

/* ================================================================== */
/* Ventana conversacional de 24 h (Meta) — `whatsapp_contacts`          */
/* ================================================================== */

const WINDOW_MS = 24 * 60 * 60 * 1000;

function digits(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** Registra un mensaje ENTRANTE del cliente (abre/renueva la ventana de 24 h). */
export async function recordWhatsappInbound(admin: any, tenantId: string, phone: string): Promise<void> {
  const p = digits(phone);
  if (!p) return;
  await admin.from('whatsapp_contacts').upsert(
    {
      tenant_id: tenantId,
      phone: p,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,phone' },
  );
}

/** Registra un mensaje SALIENTE (auditoría; la ventana la abre el cliente). */
export async function recordWhatsappOutbound(admin: any, tenantId: string, phone: string): Promise<void> {
  const p = digits(phone);
  if (!p) return;
  const now = new Date().toISOString();
  const { data } = await admin
    .from('whatsapp_contacts')
    .select('phone')
    .eq('tenant_id', tenantId)
    .eq('phone', p)
    .limit(1);
  if (data && data.length > 0) {
    await admin
      .from('whatsapp_contacts')
      .update({ last_outbound_at: now, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('phone', p);
  } else {
    await admin.from('whatsapp_contacts').insert({
      tenant_id: tenantId,
      phone: p,
      last_outbound_at: now,
    });
  }
}

/** ¿Sigue abierta la ventana de 24 h con este contacto? */
export async function isWithinWhatsappWindow(admin: any, tenantId: string, phone: string): Promise<boolean> {
  const p = digits(phone);
  if (!p) return false;
  const { data } = await admin
    .from('whatsapp_contacts')
    .select('last_inbound_at')
    .eq('tenant_id', tenantId)
    .eq('phone', p)
    .single();
  if (!data?.last_inbound_at) return false;
  return Date.now() - new Date(data.last_inbound_at).getTime() < WINDOW_MS;
}

/** Alerta de reseña negativa (≤3★) al móvil configurado de la empresa. */
export function negativeReviewAlert(business: string, author: string, rating: number, text: string): string {
  return (
    `⚠️ Nueva reseña de ${rating}★ en ${business}\n` +
    `👤 ${author}\n💬 “${text.slice(0, 280)}”\n\n` +
    `Respóndela desde tu panel de ReviewFlow AI.`
  );
}

/* ================================================================== */
/* Capa de negocio: WhatsApp conectado al contador de cuota            */
/* ================================================================== */

import type { PlanFeatures } from '@/lib/plans';
import type { AdminLike, GateBlocked } from '@/lib/usage';
import { consume, enforce, publicQuota } from '@/lib/usage';
import { systemLog } from '@/lib/logger';

export type WhatsappContext = { admin: AdminLike; tenantId: string };

export type WhatsappOk = {
  ok: true;
  status: 200;
  messageId?: string;
  quota: ReturnType<typeof publicQuota>;
};

export type WhatsappBlocked = {
  ok: false;
  status: number;
  code: string;
  error: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

export type WhatsappResult = WhatsappOk | WhatsappBlocked;

function blocked(gate: GateBlocked): WhatsappBlocked {
  return {
    ok: false,
    status: gate.status,
    code: gate.code,
    error: gate.error,
    headers: gate.headers,
    body: gate.body,
  };
}

/**
 * Envío de WhatsApp CON control de cuota y de plan.
 * Ningún mensaje sale a la Cloud API de Meta sin pasar por aquí:
 *   1. enforce() → 402 (sin suscripción) / 403 (feature fuera de plan) / 429 (cuota).
 *   2. sendWhatsapp() → Meta Graph API.
 *   3. consume('requests') → usage_counters.whatsapp_sent +1 (atómico).
 * Si Meta falla, NO se descuenta crédito (solo se paga lo que se entrega).
 */
export async function sendWhatsappForTenant(
  ctx: WhatsappContext,
  payload: {
    to: string;
    body: string;
    /** Feature del plan que habilita este envío. */
    feature?: keyof PlanFeatures;
    /** Etiqueta para logs y auditoría. */
    kind?: 'alerta' | 'pedido' | 'prueba' | 'campana';
    action?: string;
    /**
     * Plantilla HSM aprobada para este envío. Se usa SIEMPRE fuera de la
     * ventana de 24 h (Meta la exige) y cuando `forceTemplate` es true;
     * dentro de la ventana se prefiere el texto libre (más natural).
     */
    template?: WhatsappTemplatePayload;
    /** Fuerza la plantilla aunque la ventana de 24 h siga abierta. */
    forceTemplate?: boolean;
  },
): Promise<WhatsappResult> {
  const kind = payload.kind ?? 'alerta';
  const gate = await enforce(ctx.admin, ctx.tenantId, {
    metric: 'requests',
    feature: payload.feature ?? 'whatsappAlerts',
    amount: 1,
    action: payload.action ?? `WhatsApp (${kind})`,
  });
  if (!gate.ok) {
    await systemLog('warn', 'whatsapp.quota', gate.error, { tenantId: ctx.tenantId, code: gate.code, kind });
    return blocked(gate);
  }

  if (!isWhatsappConfigured()) {
    return {
      ok: false,
      status: 503,
      code: 'whatsapp_not_configured',
      error: 'WhatsApp Cloud API no configurada en el servidor (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).',
      headers: {},
      body: { error: 'WhatsApp no configurado.', code: 'whatsapp_not_configured', quota: publicQuota(gate.check) },
    };
  }

  // Decisión texto-libre vs plantilla HSM (normativa Meta, 24 h).
  let useTemplate: WhatsappTemplatePayload | null = null;
  if (payload.template) {
    const inWindow = await isWithinWhatsappWindow(ctx.admin, ctx.tenantId, payload.to).catch(() => false);
    if (!inWindow || payload.forceTemplate) useTemplate = payload.template;
  }

  try {
    const messageId = useTemplate
      ? await sendWhatsappTemplate(payload.to, useTemplate)
      : await sendWhatsapp(payload.to, payload.body);
    await recordWhatsappOutbound(ctx.admin, ctx.tenantId, payload.to).catch(() => undefined);
    await consume(ctx.admin, ctx.tenantId, 'requests', 1);
    await systemLog('info', 'whatsapp.sent', `WhatsApp ${kind} enviado`, {
      tenantId: ctx.tenantId,
      messageId,
      via: useTemplate ? `plantilla:${useTemplate.name}` : 'texto',
    });
    const q = publicQuota(gate.check);
    return {
      ok: true,
      status: 200,
      messageId,
      quota: { ...q, used: q.used + 1, remaining: Math.max(0, q.remaining - 1) },
    };
  } catch (e: any) {
    await systemLog('error', 'whatsapp.sent', e?.message ?? 'Fallo enviando WhatsApp', {
      tenantId: ctx.tenantId,
    });
    return {
      ok: false,
      status: 502,
      code: 'provider_error',
      error: e?.message ?? 'No se pudo enviar el WhatsApp.',
      headers: {},
      body: { error: e?.message ?? 'No se pudo enviar el WhatsApp.', code: 'provider_error' },
    };
  }
}

/** Mensaje de petición de valoración tras entrega (plan Business). */
export function orderDeliveredMessage(business: string, customerName: string, reviewLink: string): string {
  return (
    `¡Hola ${customerName}! 🎉 Tu pedido de ${business} ha sido entregado.\n` +
    `¿Te ha gustado? Nos ayudarías muchísimo con tu valoración (30 segundos):\n${reviewLink}`
  );
}
