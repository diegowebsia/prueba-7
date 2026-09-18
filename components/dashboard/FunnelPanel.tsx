'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  MessageSquareWarning,
  QrCode,
  Star,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { normalizeCampaign } from '@/lib/campaign';
import { Spinner } from '@/components/Skeleton';
import type { TenantInfo } from '@/components/dashboard/types';

/**
 * Flujo Neutral de Valoración: enlace público /valorar/[slug],
 * estadísticas (media, 1-5★, canales), tickets 1-3★ y ajustes de URLs.
 */
export function FunnelPanel({ tenant: t, demo }: { tenant: TenantInfo; demo: boolean }) {
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [taUrl, setTaUrl] = useState(t.settings.tripadvisor_url ?? '');
  const [tpUrl, setTpUrl] = useState(t.settings.trustpilot_url ?? '');
  const [campaign, setCampaign] = useState('mostrador');
  const [enabled, setEnabled] = useState(t.settings.funnel_enabled !== false);

  const publicLink = typeof window !== 'undefined' ? `${window.location.origin}/valorar/${t.slug}` : `/valorar/${t.slug}`;
  const campaignSlug = normalizeCampaign(campaign) ?? '';
  const attributedLink = campaignSlug ? `${publicLink}?campaign=${encodeURIComponent(campaignSlug)}` : publicLink;

  async function load() {
    setLoading(true);
    try {
      const [s, k] = await Promise.all([
        fetch(`/api/feedback/stats?tenantId=${t.id}`).then((r) => r.json()),
        fetch(`/api/feedback/tickets?tenantId=${t.id}&status=all`).then((r) => r.json()),
      ]);
      if (s?.ok) setStats(s);
      if (k?.ok) setTickets(k.tickets ?? []);
    } catch {
      /* se muestra el estado vacío */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!demo) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(attributedLink);
      setCopied(true);
      toast({ kind: 'success', title: 'Enlace copiado', body: 'Pégalo en tu QR, ticket o web.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ kind: 'warning', title: 'No se pudo copiar', body: publicLink });
    }
  }

  async function saveUrls() {
    for (const [label, v] of [['TripAdvisor', taUrl], ['Trustpilot', tpUrl]] as const) {
      if (v && !/^https?:\/\//i.test(v)) {
        toast({ kind: 'warning', title: `URL de ${label} inválida`, body: 'Debe empezar por https://' });
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: t.id, tripadvisor_url: taUrl, trustpilot_url: tpUrl, funnel_enabled: enabled }),
      });
      if (!res.ok) throw new Error('No se pudo guardar.');
      toast({ kind: 'success', title: 'Embudo actualizado', body: 'URLs y estado guardados.' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo guardar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function setTicketStatus(id: string, status: 'open' | 'closed') {
    try {
      const res = await fetch('/api/feedback/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: t.id, id, status }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar.');
      setTickets((prev) => prev.map((k) => (k.id === id ? { ...k, status } : k)));
      load();
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo actualizar', body: e?.message });
    }
  }

  const dist = stats?.byStars ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxDist = Math.max(1, ...([1, 2, 3, 4, 5].map((s) => dist[s] ?? 0) as number[]));

  return (
    <div className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-white">
            <Filter size={16} className="text-brand-300" /> Embudo de {t.name}
          </h3>
          <p className="mt-1 text-sm text-ink-400">
            Todas las puntuaciones pueden ir a Google/TripAdvisor/Trustpilot · el ticket privado es opcional y adicional.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          Embudo activo
        </label>
      </div>

      {/* Enlace público */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate text-sm text-brand-200">{attributedLink}</code>
        <div className="flex gap-2">
          <button onClick={copyLink} className="btn-secondary btn-sm">
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />} {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <a href={attributedLink} target="_blank" rel="noopener" className="btn-quiet btn-sm">
            <ExternalLink size={13} /> Ver
          </a>
        </div>
      </div>

      {!demo && (
        <div className="grid gap-2 rounded-xl border border-brand-400/20 bg-brand-500/[0.04] p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor={`campaign-${t.id}`}>Campaña o punto de origen</label>
            <input id={`campaign-${t.id}`} className="input" maxLength={48} value={campaign}
              onChange={(e) => setCampaign(e.target.value)} placeholder="mostrador, ticket, evento-septiembre…" />
            <p className={`hint mt-1 ${campaign.trim() && !campaignSlug ? 'text-amber-300' : ''}`}>
              {campaign.trim() && !campaignSlug
                ? 'Etiqueta no válida: no uses URLs, emails, teléfonos ni identificadores largos.'
                : 'Etiqueta operativa sin datos personales. Se atribuirán votos, clics y tickets.'}
            </p>
          </div>
          <a href={`/api/tenants/qr?tenantId=${encodeURIComponent(t.id)}${campaignSlug ? `&campaign=${encodeURIComponent(campaignSlug)}` : ''}`}
            className="btn-primary btn-sm">
            <QrCode size={13} /> Descargar QR SVG
          </a>
        </div>
      )}

      {!demo && (
        <div className="flex flex-wrap gap-2" aria-label="Exportación de datos">
          <a href={`/api/tenants/export?tenantId=${encodeURIComponent(t.id)}&dataset=reviews`} className="btn-secondary btn-sm">
            <Download size={13} /> Exportar reseñas CSV
          </a>
          <a href={`/api/tenants/export?tenantId=${encodeURIComponent(t.id)}&dataset=feedback`} className="btn-secondary btn-sm">
            <Download size={13} /> Exportar feedback CSV
          </a>
          <a href={`/api/reports/reputation?tenantId=${encodeURIComponent(t.id)}`} target="_blank" rel="noopener" className="btn-quiet btn-sm">
            <ExternalLink size={13} /> Informe de reputación
          </a>
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-400">
          <Loader2 size={15} className="animate-spin" /> Cargando estadísticas…
        </p>
      ) : demo ? (
        <p className="text-sm text-ink-400">
          Modo demo: conecta Supabase para ver votos, canales y tickets reales.
        </p>
      ) : !stats || stats.total === 0 ? (
        <p className="text-sm text-ink-400">
          Sin votos todavía. Comparte tu enlace (QR en mostrador, ticket o WhatsApp post-venta automático) y
          verás aquí la media, los canales elegidos y los tickets privados.
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Votos', value: String(stats.total), icon: <Star size={14} /> },
              { label: 'Nota media', value: stats.avgStars != null ? `${stats.avgStars}★` : '—', icon: <Star size={14} /> },
              { label: 'Clics públicos', value: String(stats.clicks ?? 0), icon: <ExternalLink size={14} /> },
              { label: 'Tickets abiertos', value: String(stats.ticketsOpen), icon: <MessageSquareWarning size={14} /> },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-ink-400">
                  {k.icon} {k.label}
                </p>
                <p className="mt-1 text-2xl font-extrabold text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Reparto 1-5★ */}
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Reparto de estrellas</p>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((s) => (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <span className="w-6 shrink-0 text-right font-semibold text-ink-300">{s}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={s >= 4 ? 'h-full rounded-full bg-emerald-400' : 'h-full rounded-full bg-amber-400'}
                      style={{ width: `${Math.round(((dist[s] ?? 0) / maxDist) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 tabular-nums text-ink-400">{dist[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Canales */}
          <div>
            <p className="mb-2 text-sm font-semibold text-white">Dónde continúan las valoraciones</p>
            <div className="flex flex-wrap gap-2 text-sm">
              {[
                ['Google', stats.byChannel?.google ?? 0],
                ['TripAdvisor', stats.byChannel?.tripadvisor ?? 0],
                ['Trustpilot', stats.byChannel?.trustpilot ?? 0],
                ['Sin clic', stats.byChannel?.none ?? 0],
              ].map(([label, n]) => (
                <span key={label as string} className="badge">
                  {label}: <strong className="tabular-nums">{n as number}</strong>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {!demo && stats?.campaigns?.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-white">Rendimiento por campaña</p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-ink-400"><tr><th className="p-2">Campaña</th><th className="p-2">Votos</th><th className="p-2">Clics</th><th className="p-2">Tickets</th></tr></thead>
              <tbody>{stats.campaigns.map((item: any) => (
                <tr key={item.campaign} className="border-t border-white/10"><td className="p-2 font-medium text-white">{item.campaign}</td><td className="p-2">{item.votes}</td><td className="p-2">{item.clicks}</td><td className="p-2">{item.tickets}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* URLs públicas + estado */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">URL pública de TripAdvisor</label>
          <input
            className="input"
            placeholder="https://www.tripadvisor.es/…"
            value={taUrl}
            onChange={(e) => setTaUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="label">URL pública de Trustpilot</label>
          <input
            className="input"
            placeholder="https://es.trustpilot.com/review/…"
            value={tpUrl}
            onChange={(e) => setTpUrl(e.target.value)}
          />
        </div>
      </div>
      <div>
        <button onClick={saveUrls} disabled={saving || demo} className="btn-primary btn-sm">
          {saving ? <Spinner label="Guardando…" size={13} /> : 'Guardar embudo'}
        </button>
        <p className="hint mt-1.5">
          Google sale de tu Place ID (pestaña Empresa). Sin URL, ese botón no se muestra al cliente.
        </p>
      </div>

      {/* Tickets privados opcionales */}
      {!demo && tickets.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-white">
            Tickets privados ({tickets.filter((k) => k.status === 'open').length} abiertos)
          </p>
          <div className="space-y-2">
            {tickets.map((k) => (
              <div
                key={k.id}
                className={`rounded-xl border p-3 text-sm ${k.status === 'open' ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.02] opacity-70'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-white">
                    {k.stars}★ · {k.customer_name || 'Anónimo'}
                    {k.contact && <span className="font-normal text-ink-400"> · {k.contact}</span>}
                    {k.order_id && <span className="font-normal text-ink-400"> · pedido {k.order_id}</span>}
                  </p>
                  <span className="text-2xs text-ink-500">{new Date(k.created_at).toLocaleString('es-ES')}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-ink-200">{k.message}</p>
                <div className="mt-2">
                  {k.status === 'open' ? (
                    <button onClick={() => setTicketStatus(k.id, 'closed')} className="btn-secondary btn-sm">
                      <CheckCircle2 size={13} /> Marcar resuelto
                    </button>
                  ) : (
                    <button onClick={() => setTicketStatus(k.id, 'open')} className="btn-quiet btn-sm">
                      Reabrir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
