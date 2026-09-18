'use client';

import { useCallback, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Primitivas de movimiento compartidas por toda la interfaz.
 * Todas respetan `prefers-reduced-motion` (ver globals.css).
 */

export const EASE = [0.21, 0.6, 0.35, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};


/** Aparición al entrar en viewport (una sola vez). */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 26,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-70px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Tarjeta con borde que se ilumina siguiendo al cursor (efecto Linear).
 * Escribe `--mx/--my` en el elemento; `.glow-border::after` los consume.
 */
export function GlowCard({
  children,
  className,
  as: Tag = 'div',
  gradient = false,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  as?: any;
  gradient?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = (ref.current ?? (e.currentTarget as HTMLElement)) as HTMLElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <Tag
      ref={ref as any}
      onMouseMove={onMove}
      className={cn('card glow-border', gradient && 'ring-gradient', className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Fondo ambiental (auroras + rejilla) reutilizable en heroes y paneles. */
export function Aurora({ className, grid = true }: { className?: string; grid?: boolean }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute -top-40 left-1/2 h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-brand-600/22 blur-[130px] animate-pulse-glow" />
      <div className="absolute -right-24 top-32 h-72 w-72 rounded-full bg-violet-600/18 blur-[110px]" />
      <div className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-emerald-500/10 blur-[110px]" />
      {grid && <div className="hero-grid absolute inset-0 opacity-45" />}
    </div>
  );
}

/** Contador animado simple (para métricas del panel). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={className}
    >
      {value.toLocaleString('es-ES')}
    </motion.span>
  );
}
