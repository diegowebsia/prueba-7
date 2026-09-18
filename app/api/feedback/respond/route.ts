import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrialExpired } from '@/lib/plans';
import { googleReviewLink } from '@/lib/maps';
import { enqueue } from '@/lib/queue';
import { whatsappTemplateLang, whatsappTemplateName } from '@/lib/whatsapp';
import { systemLog } from '@/lib/logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { escapeHtml, hashPersonalValue, requestIp, signOpaqueId, verifyOpaqueId } from '@/lib/security';
import { payloadErrorResponse, readJsonLimited } from '@/lib/request';
import { normalizeCampaign } from '@/lib/campaign';

export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * Flujo Neutral de Valoración — voto público (sin sesión)
 * ============================================================
 * `POST /api/feedback/respond`
 *   · Toda puntuación guarda el voto y recibe los mismos enlaces públicos.
 *   · Un mensaje opcional crea además un ticket privado y avisa al dueño.
 *
 * Reglas: embudo activado + suscripción usable (sin free-riding) +
 * rate-limit anti-spam por IP (10 votos/min, distribuido en PostgreSQL).
 */
const Body = z.object({
  slug: z.string().min(1).max(120),
  stars: z.number().int().min(1).max(5),
  message: z.string().max(2000).optional(),
  name: z.string().max(120).optional(),
  contact: z.string().max(160).optional(),
  orderId: z.string().max(100).optional(),
  responseId: z.string().uuid().optional(),
  clickToken: z.string().min(20).optional(),
  campaign: z.string().max(100).optional(),
});


export async function POST(req: Request) {
  let rawBody: unknown;
  try { rawBody = await readJsonLimited(req, 16384); } catch (error) {
    return payloadErrorResponse(error) ?? NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const input = parsed.data;
  const campaign = normalizeCampaign(input.campaign);

  const ip = requestIp(req);
  const rate = await consumeRateLimit('feedback', ip, 10, 60);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Demasiados votos. Espera un minuto.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, subscription_status, suspended, trial_ends_at, settings')
    .eq('slug', input.slug)
    .single();
  const settings = ((tenant as any)?.settings as any) ?? {};
  const usable =
    tenant &&
    !(tenant as any).suspended &&
    ((tenant as any).subscription_status === 'active' || (tenant as any).subscription_status === 'trialing') &&
    !isTrialExpired((tenant as any).subscription_status, (tenant as any).trial_ends_at) &&
    settings.funnel_enabled !== false;
  if (!usable || !tenant) {
    return NextResponse.json({ error: 'Este enlace de valoración no está disponible.' }, { status: 404 });
  }

  const ipHash = hashPersonalValue(ip).slice(0, 32);
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 200);

  // Las opciones públicas son idénticas para todas las puntuaciones (sin review gating).
  const links = {
    google: settings.place_id ? googleReviewLink(settings.place_id) : null,
    tripadvisor: (settings.tripadvisor_url as string) || null,
    trustpilot: (settings.trustpilot_url as string) || null,
  };
  const message = (input.message ?? '').trim();
  const isTicket = Boolean(message);
  const existingId = isTicket && input.responseId && input.clickToken &&
    verifyOpaqueId(input.responseId, input.clickToken) ? input.responseId : null;
  const values = {
    tenant_id: tenant.id, stars: input.stars, kind: isTicket ? 'ticket' : 'redirect',
    customer_name: isTicket ? input.name?.trim() || null : null,
    contact: isTicket ? input.contact?.trim() || null : null,
    message: isTicket ? message : null,
    order_id: isTicket ? input.orderId?.trim() || null : null,
    ip_hash: ipHash, user_agent: userAgent, campaign,
  };
  const query = existingId
    ? admin.from('feedback_responses').update(values).eq('id', existingId).eq('tenant_id', tenant.id).eq('kind', 'redirect').gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString()).select('id').single()
    : admin.from('feedback_responses').insert(values).select('id').single();
  const { data: row, error } = await query;
  if (error || !row) return NextResponse.json({ error: 'No se pudo registrar tu valoración.' }, { status: 500 });
  const clickToken = signOpaqueId(String(row.id));
  if (!isTicket) {
    return NextResponse.json({
      ok: true, responseId: row.id, clickToken, kind: 'redirect', links,
      allowPrivateFeedback: input.stars <= 3,
    });
  }

  // Aviso interno (nunca público): email + WhatsApp al dueño, encolado.
  const excerpt = message.length > 220 ? `${message.slice(0, 220)}…` : message;
  const who = [input.name?.trim(), input.contact?.trim()].filter(Boolean).join(' · ') || 'Anónimo';
  try {
    await enqueue({
      type: 'notify.owner',
      tenantId: tenant.id,
      subject: `🎫 Ticket privado (${input.stars}★) en ${tenant.name} — ${who}`,
      html:
        `<p>Nuevo <strong>ticket privado de ${input.stars}★</strong> desde tu embudo de satisfacción. ` +
        `No se ha publicado en ningún sitio.</p>` +
        `<p><strong>Cliente:</strong> ${escapeHtml(who)}${input.orderId ? ` · <strong>Pedido:</strong> ${escapeHtml(input.orderId)}` : ''}</p>` +
        `<blockquote>${escapeHtml(excerpt)}</blockquote>` +
        `<p>Gestiona el ticket en tu panel → Embudo.</p>`,
      text: `Ticket privado (${input.stars}★) de ${who}: ${excerpt}`,
      whatsappBody:
        `🎫 Ticket privado ${input.stars}★ en ${tenant.name}\n👤 ${who}\n💬 “${excerpt}”\nResuélvelo en tu panel → Embudo.`,
      whatsappTemplate: {
        name: whatsappTemplateName('alerta'),
        lang: whatsappTemplateLang(),
        bodyParams: [tenant.name, `${input.stars}★ de ${who}`, excerpt.slice(0, 500)],
      },
    });
  } catch (e: any) {
    await systemLog('warn', 'feedback.ticket', `Ticket guardado pero aviso fallido: ${e?.message ?? e}`, {
      tenantId: tenant.id,
    });
  }

  return NextResponse.json({ ok: true, responseId: row.id, clickToken, kind: 'ticket', links });
}
