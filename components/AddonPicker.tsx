'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CirclePlus, Loader2, Minus, Plus, ShoppingCart, Sparkles, X, Zap } from 'lucide-react';
import { ADDON_CATALOG, formatEur, type AddonPack, type AddonPackId } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { EASE } from '@/components/Motion';

export type AddonSelection = Array<{ key: AddonPackId; quantity: number }>;

/**
 * Selector de RECARGAS PUNTUALES (v3.7.0, modelo simplificado).
 *
 * - Todas las recargas son de PAGO ÚNICO y se consumen en el ciclo en curso:
 *   nada de suscripciones paralelas ni cuotas «ilimitadas».
 * - En la tabla de precios pública (`variant="landing"`) es informativo: el
 *   CTA lleva al registro.
 * - En el panel (`variant="dashboard"`) crea UNA sesión de Stripe por POST
 *   (`/api/stripe/addon`, body `{ tenantId, addons: [{ key, quantity }] }`).
 */

export type AddonPickerProps = {
  variant?: 'landing' | 'dashboard';
  tenantId?: string;
  /** Recarga sugerida por el backend cuando salta un 429/507 (premarcada). */
  suggested?: AddonPackId | string | null;
  /** Cuota restante total (para el copy de urgencia). */
  remaining?: number | null;
  blocked?: boolean;
  className?: string;
  /** Dibuja el botón de cerrar (uso dentro de un modal). */
  modal?: boolean;
  onClose?: () => void;
  onPurchased?: (items: AddonSelection) => void;
};

const MAX_QTY = 10;

export function AddonPicker({
  variant = 'dashboard',
  tenantId,
  suggested,
  remaining,
  blocked = false,
  className,
  modal = false,
  onClose,
  onPurchased,
}: AddonPickerProps) {
  const toast = useToast();
  const initial = useMemo(() => {
    const match = ADDON_CATALOG.find((p) => p.id === suggested);
    return match ? { [match.id]: 1 } : {};
  }, [suggested]);
  const [cart, setCart] = useState<Partial<Record<AddonPackId, number>>>(initial);
  const [busy, setBusy] = useState(false);

  const selection: AddonSelection = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => (q ?? 0) > 0)
        .map(([key, quantity]) => ({ key: key as AddonPackId, quantity: quantity as number })),
    [cart],
  );
  const selectedPacks = useMemo(
    () => selection.map((s) => ({ ...s, pack: ADDON_CATALOG.find((p) => p.id === s.key)! })).filter((s) => s.pack),
    [selection],
  );

  const total = selectedPacks.reduce((a, s) => a + s.pack.priceCents * s.quantity, 0);
  const units = selectedPacks.reduce((a, s) => a + s.quantity, 0);

  function toggle(id: AddonPackId) {
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) > 0) delete next[id];
      else next[id] = 1;
      return next;
    });
  }

  function setQty(id: AddonPackId, qty: number) {
    setCart((c) => {
      const next = { ...c };
      const q = Math.max(1, Math.min(MAX_QTY, qty));
      next[id] = q;
      return next;
    });
  }

  async function buy() {
    if (variant === 'landing' || !tenantId || selection.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, addons: selection }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ?? `Error ${res.status}`;
        toast({
          kind: res.status === 402 ? 'warning' : 'error',
          title: res.status === 402 ? 'Necesitas un plan activo' : 'No se pudo abrir el pago',
          body: message,
          action:
            res.status === 402
              ? { label: 'Ver planes', onClick: () => (window.location.href = '/bienvenido') }
              : undefined,
        });
        return;
      }
      if (data.url) {
        const label = selectedPacks.map((s) => `${s.pack.name}×${s.quantity}`).join(' + ');
        toast({ kind: 'info', title: 'Abriendo Stripe…', body: label });
        onPurchased?.(selection);
        window.location.href = data.url;
        return;
      }
      toast({ kind: 'error', title: 'Stripe no devolvió una URL de pago' });
    } catch (e: any) {
      toast({ kind: 'error', title: 'Error de red', body: e?.message });
    } finally {
      setBusy(false);
    }
  }

  const isLanding = variant === 'landing' || !tenantId;
  const firstSelected = selection[0]?.key;

  return (
    <div className={cn('card relative overflow-hidden', modal && 'border-brand-400/30', className)}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-600/20 blur-3xl" aria-hidden />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker">Recargas puntuales</p>
          <h3 className="mt-1.5 flex items-center gap-2 text-lg font-bold tracking-tightish text-white">
            <CirclePlus size={18} className="text-brand-300" />
            ¿Te has quedado corto este mes?
          </h3>
          <p className="mt-1 max-w-lg text-sm text-ink-300">
            Amplía solo lo que necesites con un <strong className="text-ink-100">pago único</strong>: la
            capacidad extra se activa al instante y se consume en este ciclo. Sin permanencia ni cargos
            recurrentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {blocked && (
            <span className="badge-danger">
              <Zap size={12} /> Límite alcanzado
            </span>
          )}
          {modal && onClose && (
            <button type="button" onClick={onClose} className="btn-quiet btn-sm" aria-label="Cerrar selector de recargas">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {ADDON_CATALOG.map((p) => (
          <AddonCard key={p.id} pack={p} qty={cart[p.id] ?? 0} onToggle={() => toggle(p.id)} onQty={(q) => setQty(p.id, q)} />
        ))}
      </div>

      {/* Desglose + CTA */}
      <div className="relative mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        {selectedPacks.length === 0 ? (
          <p className="text-sm text-ink-400">Selecciona al menos una recarga para ver el desglose.</p>
        ) : (
          <div className="space-y-1.5">
            {selectedPacks.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-300">
                  {s.pack.name}
                  {s.quantity > 1 && <span className="text-ink-500"> × {s.quantity}</span>}
                  <span className="ml-2 rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-200">
                    pago único
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-white">
                  {formatEur(s.pack.priceCents * s.quantity)}
                </span>
              </p>
            ))}
            <div className="divider my-2" />
            <p className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-300">Total hoy</span>
              <span className="text-lg font-extrabold tabular-nums text-white">{formatEur(total)}</span>
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {typeof remaining === 'number' && (
            <p className="text-xs text-ink-500">
              Te quedan{' '}
              <strong className={remaining <= 0 ? 'text-rose-300' : 'text-ink-200'}>
                {remaining.toLocaleString('es-ES')}
              </strong>{' '}
              unidades de cuota en este ciclo.
            </p>
          )}
          {isLanding ? (
            <Link
              href={`/registro?plan=pro${firstSelected ? `&addon=${firstSelected}` : ''}`}
              className="btn-primary"
              title="Las recargas se contratan con el plan activo"
            >
              <Sparkles size={15} /> Empezar con un plan
            </Link>
          ) : (
            <button onClick={buy} disabled={busy || selection.length === 0} className="btn-primary min-w-[220px]">
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Abriendo pago…
                </>
              ) : (
                <>
                  <ShoppingCart size={15} />
                  {units > 1 ? `Activar ${units} recargas · ${formatEur(total)}` : `Activar recarga · ${formatEur(total)}`}
                </>
              )}
            </button>
          )}
        </div>
        {isLanding && (
          <p className="mt-2.5 text-xs text-ink-500">
            Las recargas se contratan desde el panel, con tu plan activo (Facturación y cuota).
          </p>
        )}
      </div>
    </div>
  );
}

function AddonCard({
  pack,
  qty,
  onToggle,
  onQty,
}: {
  pack: AddonPack;
  qty: number;
  onToggle: () => void;
  onQty: (q: number) => void;
}) {
  const active = qty > 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-300',
        active
          ? 'border-brand-400/60 bg-brand-500/12 shadow-[0_0_36px_-18px_rgba(59,118,240,0.95)]'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]',
      )}
    >
      <span
        className={cn(
          'absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md border transition-all',
          active ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/25 text-transparent group-hover:border-white/50',
        )}
        aria-hidden
      >
        <Check size={13} strokeWidth={3.5} />
      </span>

      {pack.badge && (
        <span className="inline-block rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-200">
          {pack.badge}
        </span>
      )}

      <span className="mt-1 block text-sm font-bold tracking-tight text-white">{pack.name}</span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-extrabold tracking-tight text-white">{formatEur(pack.priceCents)}</span>
        <span className="text-xs font-medium text-ink-400">· pago único</span>
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-400">{pack.description}</span>

      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="mt-2.5 flex items-center justify-between"
          >
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-500">Cantidad</span>
            <span
              className="flex items-center gap-1 rounded-lg border border-white/12 bg-ink-950/70 p-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                role="button"
                tabIndex={0}
                onClick={() => onQty(qty - 1)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onQty(qty - 1)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-300 transition hover:bg-white/10 hover:text-white"
                aria-label={`Quitar una unidad de ${pack.name}`}
              >
                <Minus size={12} />
              </span>
              <span className="w-7 text-center text-sm font-bold tabular-nums text-white">{qty}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => onQty(qty + 1)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onQty(qty + 1)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-300 transition hover:bg-white/10 hover:text-white"
                aria-label={`Añadir una unidad de ${pack.name}`}
              >
                <Plus size={12} />
              </span>
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
