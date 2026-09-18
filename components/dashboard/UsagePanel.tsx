'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingCart, Zap } from 'lucide-react';
import { AddonPicker, type AddonSelection } from '@/components/AddonPicker';
import { AiBudget, METRIC_META, METRIC_ORDER, QuotaMeter, StorageCaps, quotaTone } from '@/components/Quota';
import { QuotaSkeleton } from '@/components/Skeleton';
import { EASE } from '@/components/Motion';
import { describeApiError, type UsageResponse } from '@/components/dashboard/types';
import { formatEur } from '@/lib/plans';
import type { UsageMetric } from '@/lib/plans';

/**
 * Widget de consumo del ciclo (lee `/api/tenants/usage`).
 *
 * Modelo simplificado v3.7.0: 4 cuotas mensuales fáciles de entender
 * (peticiones, opiniones, IA y sincronizaciones) + los topes de base de datos
 * por empresa (opiniones guardadas, auditoría y conexiones) con su purga
 * automática. Un único CTA de ampliación puntual (pago único, sin suscripciones
 * paralelas).
 */

type UsagePanelProps = {
  tenantId: string;
  demo: boolean;
  onBuyAddon?: (pack: string) => void;
  compact?: boolean;
};

export function UsagePanel({ tenantId, demo, onBuyAddon, compact = false }: UsagePanelProps) {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/usage?tenantId=${encodeURIComponent(tenantId)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const described = describeApiError(res.status, data);
        setError(described.body ?? 'No se pudo leer el consumo.');
        return;
      }
      if (data?.ok) setUsage(data as UsageResponse);
    } catch (e: any) {
      setError(e?.message ?? 'Error de red leyendo el consumo.');
    } finally {
      setLoading(false);
    }
  }, [demo, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresco suave tras acciones que consumen cuota (publicadas por el panel).
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('rf:quota-refresh', handler);
    return () => window.removeEventListener('rf:quota-refresh', handler);
  }, [load]);

  /** Cuota más ajustada (≥80 %) para el aviso de ampliación. */
  const critical = useMemo(() => {
    if (!usage) return null;
    let worst: { metric: UsageMetric; pct: number; remaining: number } | null = null;
    for (const m of METRIC_ORDER) {
      const data = usage.metrics[m];
      if (!data) continue;
      if (data.pct >= 80 && (!worst || data.pct > worst.pct)) {
        worst = { metric: m, pct: data.pct, remaining: data.remaining };
      }
    }
    // El presupuesto de tokens de IA es igual de crítico: si se agota, la IA se pausa.
    if (usage.aiUsage && usage.aiUsage.pct >= 80 && (!worst || usage.aiUsage.pct > worst.pct)) {
      worst = { metric: 'ai', pct: usage.aiUsage.pct, remaining: usage.aiUsage.tokensRemaining };
    }
    return worst;
  }, [usage]);

  /** Recarga sugerida cuando no hay una métrica crítica concreta. */
  const suggestedForPicker = useMemo(() => {
    if (!critical) return 'extra_requests_1000';
    return suggestedFor(critical.metric);
  }, [critical]);

  if (demo) return null;
  if (loading && !usage) return <QuotaSkeleton />;
  if (!usage) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-ink-400">{error ?? 'No se pudo cargar el consumo del ciclo.'}</p>
        <button onClick={load} className="btn-secondary btn-sm">
          Reintentar
        </button>
      </div>
    );
  }

  const cheapest = usage.catalog?.[0]?.priceCents ?? 900;

  return (
    <div className="panel space-y-4">
      <QuotaMeter
        metrics={usage.metrics}
        cycle={usage.cycle}
        renewalLabel={usage.renewalLabel}
        blockedBy={usage.blockedBy}
        showBreakdown={!compact}
      />

      {/* Consumo real de IA: tokens medidos por llamada + coste estimado */}
      {usage.aiUsage && <AiBudget ai={usage.aiUsage} />}

      <StorageCaps storage={usage.storage} />

      {/* Aviso + ampliación puntual */}
      <AnimatePresence>
        {critical && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/35 bg-[linear-gradient(120deg,rgba(245,158,11,0.14),rgba(239,68,68,0.10))] px-3.5 py-3">
              <Zap size={17} className={quotaTone(critical.pct) === 'danger' ? 'text-rose-300' : 'text-amber-300'} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold text-white">
                  Te queda el {100 - critical.pct} % de {METRIC_META[critical.metric].label.toLowerCase()}
                </p>
                <p className="text-xs text-ink-300">
                  Restan {critical.remaining.toLocaleString('es-ES')} este mes. Amplía con una recarga puntual
                  (pago único) y sigue sin cortes.
                </p>
              </div>
              <button onClick={() => setPickerOpen(true)} className="btn-primary btn-sm shrink-0">
                <ShoppingCart size={13} /> Ampliar cuota
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onBuyAddon?.(suggestedForPicker)}
          className="btn-secondary btn-sm"
          title="Recargas puntuales desde 6 €, se consumen en este ciclo"
        >
          <ShoppingCart size={13} /> Recarga desde {formatEur(cheapest)}
        </button>
        <a href="/dashboard?tab=facturacion" className="btn-quiet btn-sm">
          Facturación y cuota
        </a>
        <span className="ml-auto text-2xs text-ink-500">
          {usage.packs > 0
            ? `${usage.packs} recarga${usage.packs === 1 ? '' : 's'} activa${usage.packs === 1 ? '' : 's'} este ciclo`
            : 'Sin recargas: usas la cuota de tu plan'}
        </span>
      </div>

      {(usage.extras.requests > 0 || usage.extras.reviews > 0 || usage.extras.ai > 0 || usage.extras.syncs > 0) && (
        <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
          ✓ Recargas activas este ciclo:
          {usage.extras.requests > 0 && ` +${usage.extras.requests.toLocaleString('es-ES')} peticiones`}
          {usage.extras.reviews > 0 && ` +${usage.extras.reviews.toLocaleString('es-ES')} opiniones`}
          {usage.extras.ai > 0 && ` +${usage.extras.ai.toLocaleString('es-ES')} IA`}
          {usage.extras.syncs > 0 && ` +${usage.extras.syncs.toLocaleString('es-ES')} syncs`}. Caducan al cerrar
          el ciclo.
        </p>
      )}
      {!usage.hasAccess && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          Suscripción sin acceso: activa un plan para que las integraciones vuelvan a funcionar.
        </p>
      )}

      {/* Selector de recargas (modal) */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/75 p-4 backdrop-blur-sm sm:p-6"
            onClick={() => setPickerOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Ampliar cuota"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="my-4 w-full max-w-3xl sm:my-10"
              onClick={(e) => e.stopPropagation()}
            >
              <AddonPicker
                variant="dashboard"
                tenantId={tenantId}
                suggested={suggestedForPicker}
                modal
                onClose={() => setPickerOpen(false)}
                onPurchased={(_items: AddonSelection) => {
                  window.dispatchEvent(new Event('rf:quota-refresh'));
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Recarga que amplía una métrica concreta. */
function suggestedFor(metric: UsageMetric): string {
  switch (metric) {
    case 'requests':
      return 'extra_requests_1000';
    case 'reviews':
      return 'extra_reviews_2000';
    case 'ai':
      return 'extra_ai_500';
    case 'syncs':
      return 'extra_syncs_500';
    default:
      return 'extra_requests_1000';
  }
}
