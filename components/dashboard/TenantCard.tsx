'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  Bot,
  CheckCircle2,
  ChevronDown,
  KeyRound,
  Link2,
  MapPin,
  Plug,
  RefreshCw,
  Settings2,
  Store,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { Accordion } from '@/components/Accordion';
import { UsagePanel } from '@/components/dashboard/UsagePanel';
import { StoreConnect } from '@/components/dashboard/StoreConnect';
import { EASE } from '@/components/Motion';
import { describeApiError, type TenantInfo } from '@/components/dashboard/types';
import { planHasFeature, planOf } from '@/lib/plans';
import { cn } from '@/lib/utils';

/**
 * Tarjeta de empresa: estado de suscripción, consumo del ciclo y todas las
 * conexiones reales (Google Business / Places, Trustpilot, TripAdvisor, WhatsApp, Maps,
 * tono de la IA, tienda y API key).
 */
export function TenantCard({
  tenant: t,
  syncing,
  onSync,
  demo,
}: {
  tenant: TenantInfo;
  syncing: string | null;
  onSync: (p: 'google' | 'trustpilot' | 'tripadvisor' | 'places', id: string) => void;
  demo: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tone, setTone] = useState(t.settings.tone ?? 'profesional');
  const [placeId, setPlaceId] = useState(t.settings.place_id ?? '');
  const [waTo, setWaTo] = useState(t.settings.whatsapp_to ?? '');
  const [tpKey, setTpKey] = useState('');
  const [tpUnit, setTpUnit] = useState('');
  const [taLoc, setTaLoc] = useState('');
  const [copied, setCopied] = useState(false);

  const plan = planOf(t.plan);
  const integ = (p: string) => t.integrations.find((i) => i.provider === p);
  const busy = (key: string) => syncing === key;

  function buyAddon(pack: string) {
    window.location.href = `/dashboard?tab=facturacion&pack=${pack}`;
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: t.id,
          tone,
          place_id: placeId,
          whatsapp_to: waTo || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body });
        return;
      }
      toast({ kind: 'success', title: 'Ajustes guardados', body: 'Tono, Place ID y móvil actualizados.' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo guardar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function connectTrustpilot() {
    if (!tpKey || !tpUnit) {
      toast({ kind: 'warning', title: 'Faltan datos', body: 'Pega tu API key y tu Business Unit ID.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/trustpilot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: t.id, apiKey: tpKey, businessUnitId: tpUnit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body });
        return;
      }
      toast({ kind: 'success', title: 'Trustpilot conectado', body: data.message });
      setTpKey('');
      setTpUnit('');
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo conectar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function connectTripadvisor() {
    if (!taLoc.trim()) {
      toast({ kind: 'warning', title: 'Falta el Location ID', body: 'Es el número «dXXXXXX» de la URL de tu ficha en TripAdvisor.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/tripadvisor/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: t.id, locationId: taLoc.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body });
        return;
      }
      toast({ kind: 'success', title: 'TripAdvisor conectado', body: data.message });
      setTaLoc('');
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo conectar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function testWhatsapp() {
    if (!waTo) {
      toast({ kind: 'warning', title: 'Escribe primero el móvil', body: 'Formato internacional: 34612345678.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: t.id, to: waTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        toast({ kind: described.kind, title: described.title, body: described.body, action: described.action });
        return;
      }
      toast({ kind: 'success', title: 'WhatsApp enviado', body: data.message });
      window.dispatchEvent(new Event('rf:quota-refresh'));
    } catch (e: any) {
      toast({ kind: 'error', title: 'No se pudo enviar', body: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function copyApiKey() {
    if (!t.api_key) return;
    try {
      await navigator.clipboard.writeText(t.api_key);
      setCopied(true);
      toast({ kind: 'success', title: 'API key copiada', body: 'Úsala en los webhooks de tu tienda.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ kind: 'error', title: 'Tu navegador bloqueó el portapapeles' });
    }
  }

  return (
    <div className={cn('card', !t.access && 'border-rose-400/25')}>
      {/* Cabecera plegable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-bold tracking-tightish text-white">
            <span className="truncate">{t.name}</span>
            <span className="badge-brand">{plan.tier}</span>
            {!t.access && (
              <span className="badge-danger">
                <XCircle size={11} /> sin acceso
              </span>
            )}
            {t.subscription_status === 'trialing' && t.trial_ends_at && (
              <span className="badge-brand">
                prueba hasta {new Date(t.trial_ends_at).toLocaleDateString('es-ES')}
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-ink-400">
            {plan.label} · {t.subscription_status}
            {t.integrations.length > 0 && ` · ${t.integrations.length} conexión(es)`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-ink-300">
          <Settings2 size={15} className="hidden sm:block" />
          <span className="hidden sm:inline">Conexiones y ajustes</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10"
          >
            <ChevronDown size={14} />
          </motion.span>
        </span>
      </button>

      <div className="mt-4">
        <UsagePanel tenantId={t.id} demo={demo} onBuyAddon={buyAddon} compact />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.36, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 border-t border-white/[0.07] pt-4">
              <Accordion
                exclusive={false}
                defaultOpen={[0]}
                items={[
                  {
                    id: `${t.id}-store`,
                    title: 'Tienda online (Shopify · WooCommerce · TPV)',
                    icon: <Store size={15} />,
                    meta: planHasFeature(t.plan, 'storeIntegration')
                      ? integ('shopify') || integ('woocommerce') || integ('store')
                        ? 'Conectada · WhatsApp al entregar activo'
                        : 'Plan Completo · WhatsApp automático al entregar'
                      : 'Requiere el plan Completo E-commerce',
                    content: <StoreConnect tenant={t} demo={demo} />,
                  },
                  {
                    id: `${t.id}-google`,
                    title: 'Google Business Profile',
                    icon: <Plug size={15} />,
                    meta: integ('google')
                      ? `Conectado${integ('google')?.last_sync_at ? ` · sincronizado ${new Date(integ('google')!.last_sync_at!).toLocaleString('es-ES')}` : ''}`
                      : 'OAuth en 1 clic · importar y publicar respuestas',
                    content: (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {!integ('google') ? (
                            <a href={`/api/integrations/google/connect?tenantId=${t.id}`} className="btn-light btn-sm">
                              <Link2 size={13} /> Conectar con Google
                            </a>
                          ) : (
                            <>
                              <span className="badge-ok">
                                <CheckCircle2 size={11} /> conectado
                              </span>
                              <button
                                onClick={() => onSync('google', t.id)}
                                disabled={busy(`google-${t.id}`)}
                                className="btn-secondary btn-sm"
                              >
                                {busy(`google-${t.id}`) ? (
                                  <Spinner label="Sincronizando…" size={13} />
                                ) : (
                                  <>
                                    <RefreshCw size={13} /> Sincronizar reseñas
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-ink-400">
                          La sincronización importa tus reseñas reales y permite publicar las
                          respuestas directamente en Google. Cada opinión importada consume de tu
                          cuota mensual de opiniones; cada sincronización cuenta contra el límite de
                          sincronizaciones automáticas del plan ({plan.limits.syncsPerMonth}/mes).
                        </p>
                      </div>
                    ),
                  },
                  {
                    id: `${t.id}-places`,
                    title: 'Google Places API (por Place ID)',
                    icon: <MapPin size={15} />,
                    meta: placeId ? `Place ID configurado · ${placeId.slice(0, 18)}…` : 'Sin Place ID guardado',
                    content: (
                      <div className="space-y-3">
                        <div>
                          <label className="label" htmlFor={`${t.id}-place`}>Place ID de tu negocio</label>
                          <input
                            id={`${t.id}-place`}
                            className="input"
                            placeholder="ChIJN1t_tDeuEmsRUsoyG83frY4"
                            value={placeId}
                            onChange={(e) => setPlaceId(e.target.value)}
                          />
                          <p className="hint">
                            Se guarda con «Guardar ajustes». Requiere <code>GOOGLE_PLACES_API_KEY</code> en el servidor.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => onSync('places', t.id)}
                            disabled={busy(`places-${t.id}`) || !placeId}
                            className="btn-secondary btn-sm"
                          >
                            {busy(`places-${t.id}`) ? (
                              <Spinner label="Sincronizando…" size={13} />
                            ) : (
                              <>
                                <RefreshCw size={13} /> Sincronizar con Places
                              </>
                            )}
                          </button>
                          <button onClick={saveSettings} disabled={saving} className="btn-primary btn-sm">
                            {saving ? <Spinner label="Guardando…" size={13} /> : 'Guardar ajustes'}
                          </button>
                          {placeId && (
                            <a
                              href={`https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-quiet btn-sm"
                            >
                              Enlace «déjanos una reseña» ↗
                            </a>
                          )}
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: `${t.id}-trustpilot`,
                    title: 'Trustpilot Business',
                    icon: <Store size={15} />,
                    meta: integ('trustpilot') ? 'Conectado con tu API key' : 'Plan Business de Trustpilot',
                    content: integ('trustpilot') ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge-ok">
                          <CheckCircle2 size={11} /> conectado
                        </span>
                        <button
                          onClick={() => onSync('trustpilot', t.id)}
                          disabled={busy(`trustpilot-${t.id}`)}
                          className="btn-secondary btn-sm"
                        >
                          {busy(`trustpilot-${t.id}`) ? (
                            <Spinner label="Sincronizando…" size={13} />
                          ) : (
                            <>
                              <RefreshCw size={13} /> Sincronizar reseñas
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <label className="label" htmlFor={`${t.id}-tp-key`}>API key</label>
                          <input
                            id={`${t.id}-tp-key`}
                            className="input"
                            placeholder="API key de Trustpilot Business"
                            value={tpKey}
                            onChange={(e) => setTpKey(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`${t.id}-tp-unit`}>Business Unit ID</label>
                          <input
                            id={`${t.id}-tp-unit`}
                            className="input"
                            placeholder="507f1f77bcf86cd799439011"
                            value={tpUnit}
                            onChange={(e) => setTpUnit(e.target.value)}
                          />
                        </div>
                        <div className="flex items-end">
                          <button onClick={connectTrustpilot} disabled={saving} className="btn-primary btn-sm h-[42px]">
                            {saving ? <Spinner label="…" size={13} /> : 'Conectar'}
                          </button>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: `${t.id}-tripadvisor`,
                    title: 'TripAdvisor',
                    icon: <MapPin size={15} />,
                    meta: integ('tripadvisor') ? 'Conectado con tu Location ID' : 'Reseñas vía SerpAPI/Outscraper',
                    content: integ('tripadvisor') ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge-ok">
                          <CheckCircle2 size={11} /> conectado
                        </span>
                        <button
                          onClick={() => onSync('tripadvisor', t.id)}
                          disabled={busy(`tripadvisor-${t.id}`)}
                          className="btn-secondary btn-sm"
                        >
                          {busy(`tripadvisor-${t.id}`) ? (
                            <Spinner label="Sincronizando…" size={13} />
                          ) : (
                            <>
                              <RefreshCw size={13} /> Sincronizar reseñas
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <div>
                          <label className="label" htmlFor={`${t.id}-ta-loc`}>Location ID</label>
                          <input
                            id={`${t.id}-ta-loc`}
                            className="input"
                            placeholder="dXXXXXX (número de la URL de tu ficha)"
                            value={taLoc}
                            onChange={(e) => setTaLoc(e.target.value)}
                          />
                          <p className="hint">
                            Ábrela en tripadvisor.es y copia el código «d…» de la dirección.
                          </p>
                        </div>
                        <div className="flex items-end">
                          <button onClick={connectTripadvisor} disabled={saving} className="btn-primary btn-sm h-[42px]">
                            {saving ? <Spinner label="…" size={13} /> : 'Conectar'}
                          </button>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: `${t.id}-whatsapp`,
                    title: 'Alertas WhatsApp (móvil del negocio)',
                    icon: <BellRing size={15} />,
                    meta: waTo ? `Destino ${waTo}` : 'Sin móvil configurado',
                    content: (
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <label className="label" htmlFor={`${t.id}-wa`}>Móvil que recibe las alertas ≤3★</label>
                          <input
                            id={`${t.id}-wa`}
                            className="input"
                            placeholder="34612345678"
                            value={waTo}
                            onChange={(e) => setWaTo(e.target.value)}
                          />
                          <p className="hint">
                            Formato internacional sin + ni espacios. Cada alerta consume 1 evento de WhatsApp.
                          </p>
                        </div>
                        <div className="flex items-end gap-2">
                          <button onClick={testWhatsapp} disabled={saving} className="btn-secondary btn-sm h-[42px]">
                            {saving ? <Spinner label="Enviando…" size={13} /> : 'Probar envío real'}
                          </button>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: `${t.id}-tone`,
                    title: 'Tono de la IA',
                    icon: <Bot size={15} />,
                    meta: `Actual: ${tone}`,
                    content: (
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <div>
                          <label className="label" htmlFor={`${t.id}-tone`}>Cómo debe sonar tu marca</label>
                          <select
                            id={`${t.id}-tone`}
                            className="select"
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                          >
                            <option value="profesional">Profesional — cordial y resolutivo</option>
                            <option value="cercano">Cercano — amable y próximo</option>
                            <option value="formal">Formal — distinguido y serio</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button onClick={saveSettings} disabled={saving} className="btn-primary btn-sm h-[42px]">
                            {saving ? <Spinner label="Guardando…" size={13} /> : 'Guardar ajustes'}
                          </button>
                        </div>
                      </div>
                    ),
                  },
                ]}
              />

              {/* API key */}
              {t.api_key && (
                <div className="panel flex flex-wrap items-center gap-2">
                  <KeyRound size={14} className="text-brand-300" />
                  <span className="text-xs text-ink-300">API key de esta empresa (webhooks e ingesta):</span>
                  <code className="rounded-lg bg-white/[0.07] px-2 py-1 font-mono text-2xs text-ink-100">
                    {t.api_key.slice(0, 10)}…{t.api_key.slice(-4)}
                  </code>
                  <button onClick={copyApiKey} className="btn-secondary btn-sm">
                    {copied ? 'Copiada ✓' : 'Copiar'}
                  </button>
                  <span className="ml-auto font-mono text-2xs text-ink-500">POST /api/integrations/ingest</span>
                </div>
              )}

              {!t.access && (
                <p className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  Las integraciones están bloqueadas porque la suscripción no está activa. Reactívala
                  desde Facturación para volver a sincronizar, generar respuestas y enviar WhatsApp.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
