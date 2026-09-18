import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrialExpired } from '@/lib/plans';
import { googleReviewLink } from '@/lib/maps';
import { enqueue } from '@/lib/queue';
import { whatsappTemplateLang, whatsappTemplateName } from '@/lib/whatsapp';
import { systemLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * ============================================================
 * Embudo Privado de Satisfacción — voto público (sin sesión)
 * ============================================================
 * `POST /api/feedback/respond`
 *   · `{ slug, stars: 4|5 }` → guarda `redirect` y devuelve los enlaces
 *     públicos (Google Maps, TripAdvisor, Trustpilot) configurados.
 *   · `{ slug, stars: 1|2|3, message, name?, contact?, orderId? }` →
 *     guarda `ticket` PRIVADO y avisa al dueño (email + WhatsApp).
 *
 * Reglas: embudo activado + suscripción usable (sin free-riding) +
 * rate-limit anti-spam por IP (10 votos/min, best-effort en serverless).
 */
const Body = z.object({
  slug: z.string().min(1).max(120),
  stars: z.number().int().min(1).max(5),
  message: z.string().max(2000).optional(),
  name: z.string().max(120).optional(),
  contact: z.string().max(160).optional(),
  orderId: z.string().max(100).optional(),
});

// Rate-limit en memoria por IP (cada instancia; suficiente anti-spam).
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_HITS = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  HITS.set(ip, list);
  return list.length > MAX_HITS;
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  const input = parsed.data;

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Demasiados votos. Espera un minuto.' }, { status: 429 });
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

  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 200);

  // ---- 4-5 ★: redirección a plataformas públicas ----
  if (input.stars >= 4) {
    const links = {
      google: settings.place_id ? googleReviewLink(settings.place_id) : null,
      tripadvisor: (settings.tripadvisor_url as string) || null,
      trustpilot: (settings.trustpilot_url as string) || null,
    };
    const { data: row, error } = await admin
      .from('feedback_responses')
      .insert({
        tenant_id: tenant.id,
        stars: input.stars,
        kind: 'redirect',
        ip_hash: ipHash,
        user_agent: userAgent,
      })
      .select('id')
      .single();
    if (error || !row) return NextResponse.json({ error: 'No se pudo registrar tu voto.' }, { status: 500 });
    return NextResponse.json({ ok: true, responseId: row.id, kind: 'redirect', links });
  }

  // ---- 1-3 ★: ticket PRIVADO + aviso interno al dueño ----
  const message = (input.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Cuéntanos qué ha fallado (mensaje obligatorio).' }, { status: 400 });
  }
  const { data: row, error } = await admin
    .from('feedback_responses')
    .insert({
      tenant_id: tenant.id,
      stars: input.stars,
      kind: 'ticket',
      customer_name: input.name?.trim() || null,
      contact: input.contact?.trim() || null,
      message,
      order_id: input.orderId?.trim() || null,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select('id')
    .single();
  if (error || !row) return NextResponse.json({ error: 'No se pudo enviar tu mensaje.' }, { status: 500 });

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

  return NextResponse.json({ ok: true, responseId: row.id, kind: 'ticket' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
