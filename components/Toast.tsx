'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sistema de notificaciones (feedback de acciones).
 * - Pila en la esquina inferior derecha, máximo 4 visibles.
 * - Barra de progreso con el tiempo restante (se pausa al pasar el cursor).
 * - Tipos: success · error · warning · info, con acción opcional.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export type ToastInput = {
  kind: ToastKind;
  title: string;
  body?: string;
  /** Segundos visibles (0 = persistente hasta cerrar). */
  duration?: number;
  action?: { label: string; onClick: () => void };
};

type ToastItem = Required<Pick<ToastInput, 'kind' | 'title'>> & {
  id: number;
  body?: string;
  duration: number;
  action?: ToastInput['action'];
};

type ToastContextValue = {
  toast: (t: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const KIND_STYLE: Record<
  ToastKind,
  { icon: React.ReactNode; ring: string; bar: string; tint: string }
> = {
  success: {
    icon: <CheckCircle2 size={18} className="text-emerald-300" />,
    ring: 'border-emerald-400/25',
    bar: 'bg-emerald-400/80',
    tint: 'shadow-[0_0_38px_-20px_rgba(52,211,153,0.85)]',
  },
  error: {
    icon: <XCircle size={18} className="text-rose-300" />,
    ring: 'border-rose-400/30',
    bar: 'bg-rose-400/80',
    tint: 'shadow-[0_0_38px_-20px_rgba(251,113,133,0.85)]',
  },
  warning: {
    icon: <AlertTriangle size={18} className="text-amber-300" />,
    ring: 'border-amber-400/30',
    bar: 'bg-amber-400/80',
    tint: 'shadow-[0_0_38px_-20px_rgba(251,191,36,0.8)]',
  },
  info: {
    icon: <Info size={18} className="text-brand-300" />,
    ring: 'border-brand-400/30',
    bar: 'bg-brand-400/80',
    tint: 'shadow-[0_0_38px_-20px_rgba(59,118,240,0.9)]',
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const item: ToastItem = {
        id,
        kind: input.kind,
        title: input.title,
        body: input.body,
        action: input.action,
        duration:
          input.duration ?? (input.kind === 'error' || input.kind === 'warning' ? 7000 : 4800),
      };
      setToasts((list) => [...list.slice(-3), item]);
      return id;
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(94vw,390px)] flex-col gap-2.5"
        role="region"
        aria-label="Notificaciones"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const style = KIND_STYLE[item.kind];

  useEffect(() => {
    if (paused || item.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.duration, item.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-2xl border bg-ink-900/92 p-4 backdrop-blur-xl',
        style.ring,
        style.tint,
      )}
    >
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tightish text-white">{item.title}</p>
          {item.body && <p className="mt-1 text-[13px] leading-relaxed text-ink-300">{item.body}</p>}
          {item.action && (
            <button
              onClick={() => {
                item.action?.onClick();
                onDismiss(item.id);
              }}
              className="mt-2 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
            >
              {item.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onDismiss(item.id)}
          className="h-fit shrink-0 rounded-lg p-1 text-ink-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar notificación"
        >
          <X size={15} />
        </button>
      </div>
      {item.duration > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.06]">
          <motion.span
            className={cn('block h-full origin-left', style.bar)}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: item.duration / 1000, ease: 'linear' }}
          />
        </span>
      )}
    </motion.div>
  );
}

/** Devuelve `toast()` (compatible con el uso anterior) y `dismiss()`. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx.toast;
}

