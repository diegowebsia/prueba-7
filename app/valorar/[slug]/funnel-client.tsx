'use client';

import { useState } from 'react';
import { Star, ExternalLink, CheckCircle2, MessageSquareWarning, Loader2 } from 'lucide-react';

type Props = {
  slug: string;
  businessName: string;
  campaign: string | null;
  hasGoogle: boolean;
  hasTripadvisor: boolean;
  hasTrustpilot: boolean;
  demo?: boolean;
};

type Links = { google: string | null; tripadvisor: string | null; trustpilot: string | null };

export default function FunnelClient({ slug, businessName, campaign, demo = false }: Props) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Links | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [clickToken, setClickToken] = useState<string | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketDone, setTicketDone] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', message: '', orderId: '' });

  async function submitStars(value: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        setStars(value);
        setLinks({ google: null, tripadvisor: null, trustpilot: null });
        setShowTicketForm(true);
        return;
      }
      const res = await fetch('/api/feedback/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, stars: value, campaign }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo registrar tu voto.');
      setResponseId(data.responseId);
      setClickToken(data.clickToken);
      setLinks(data.links);
      setStars(value);
      setShowTicketForm(Boolean(data.allowPrivateFeedback));
    } catch (e: any) {
      setError(e?.message ?? 'Error inesperado.');
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket() {
    if (busy || !form.message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (demo) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        setShowTicketForm(false);
        setTicketDone(true);
        return;
      }
      const res = await fetch('/api/feedback/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          stars,
          message: form.message.trim(),
          name: form.name.trim() || undefined,
          contact: form.contact.trim() || undefined,
          orderId: form.orderId.trim() || undefined,
          responseId: responseId || undefined,
          clickToken: clickToken || undefined,
          campaign,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo enviar tu mensaje.');
      setResponseId(data.responseId);
      setClickToken(data.clickToken);
      setLinks(data.links);
      setShowTicketForm(false);
      setTicketDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Error inesperado.');
    } finally {
      setBusy(false);
    }
  }

  async function openChannel(channel: 'google' | 'tripadvisor' | 'trustpilot', url: string) {
    try {
      await fetch('/api/feedback/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseId, clickToken, channel }),
      });
    } catch {
      /* la medición no bloquea la salida */
    }
    window.open(url, '_blank', 'noopener');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-4 py-16">
      <div className="panel w-full p-8 text-center sm:p-10">
        <p className="kicker">Tu opinión importa</p>
        <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white">
          ¿Cómo ha sido tu experiencia con {businessName}?
        </h1>

        {!links && !ticketDone && !showTicketForm && (
          <>
            <div className="mt-8 flex items-center justify-center gap-2" role="radiogroup" aria-label="Valoración de 1 a 5 estrellas">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={busy}
                  onClick={() => submitStars(v)}
                  onMouseEnter={() => setHover(v)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${v} ${v === 1 ? 'estrella' : 'estrellas'}`}
                  className="rounded-full p-1 transition-transform hover:scale-110 disabled:opacity-60"
                >
                  <Star
                    size={44}
                    className={(hover >= v ? 'fill-amber-300 text-amber-300' : 'fill-white/10 text-ink-500') + ' transition-colors'}
                  />
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-400">
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" /> Registrando tu voto…
                </span>
              ) : (
                'Pulsa las estrellas para votar (te llevará 10 segundos).'
              )}
            </p>
          </>
        )}

        {links && (
          <div className="mt-8 space-y-3 text-left">
            <p className="flex items-center gap-2 text-center text-sm text-emerald-300">
              <CheckCircle2 size={17} /> Gracias por tu {stars}★. Si quieres, comparte tu experiencia donde prefieras:
            </p>
            {links.google && (
              <button onClick={() => openChannel('google', links.google as string)} className="btn-light w-full">
                <ExternalLink size={15} /> Valorar en Google
              </button>
            )}
            {links.tripadvisor && (
              <button onClick={() => openChannel('tripadvisor', links.tripadvisor as string)} className="btn-secondary w-full">
                <ExternalLink size={15} /> Valorar en TripAdvisor
              </button>
            )}
            {links.trustpilot && (
              <button onClick={() => openChannel('trustpilot', links.trustpilot as string)} className="btn-secondary w-full">
                <ExternalLink size={15} /> Valorar en Trustpilot
              </button>
            )}
            {!links.google && !links.tripadvisor && !links.trustpilot && (
              <p className="text-center text-sm text-ink-300">
                Gracias por tu valoración: la hemos registrado correctamente.
              </p>
            )}
            <p className="pt-1 text-center text-2xs text-ink-500">
              Se abrirá la plataforma en una pestaña nueva.
            </p>
          </div>
        )}

        {showTicketForm && !ticketDone && (
          <div className="mt-8 space-y-3 text-left">
            <p className="flex items-start gap-2 text-sm text-amber-200">
              <MessageSquareWarning size={17} className="mt-0.5 shrink-0" />
              Si quieres atención directa, cuéntanos qué ha ocurrido. Este mensaje será privado; las opciones públicas siguen disponibles arriba.
            </p>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder="¿Qué ha ocurrido? (obligatorio)"
              className="input w-full"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
                placeholder="Tu nombre (opcional)"
                className="input w-full"
              />
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                maxLength={160}
                placeholder="Email o móvil para responderte"
                className="input w-full"
              />
            </div>
            <input
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              maxLength={100}
              placeholder="Nº de pedido (si aplica)"
              className="input w-full"
            />
            <button onClick={submitTicket} disabled={busy || !form.message.trim()} className="btn-primary w-full">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareWarning size={15} />}
              Enviar mensaje privado
            </button>
            <button onClick={() => setShowTicketForm(false)} className="btn-quiet mx-auto block">
              Volver a votar
            </button>
          </div>
        )}

        {ticketDone && (
          <div className="mt-8 space-y-3">
            <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
            <p className="font-semibold text-white">Mensaje recibido. Gracias.</p>
            <p className="text-sm text-ink-300">
              Lo hemos enviado al equipo de {businessName} y te contactarán lo antes posible. Tu mensaje es
              privado: no se ha publicado en ningún sitio.
            </p>
          </div>
        )}

        {error && <p className="mt-5 text-sm text-red-300">{error}</p>}
      </div>
      <p className="mt-6 text-center text-2xs text-ink-500">
        Valoración gestionada por {businessName} · tus datos solo se usan para atender tu mensaje.
      </p>
    </main>
  );
}
