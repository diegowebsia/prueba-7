'use client';

import { cn } from '@/lib/utils';

/**
 * Esqueletos de carga y spinner del sistema de diseño.
 * Todos usan el shimmer de `.skeleton` (globals.css) sobre superficies oscuras.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

/** Spinner accesible. */
export function Spinner({
  className,
  label,
  size = 16,
}: {
  className?: string;
  label?: string;
  size?: number;
}) {
  return (
    <span role="status" aria-label={label ?? 'Cargando…'} className={cn('inline-flex items-center gap-2', className)}>
      <svg
        className="animate-spin"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-95"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}


/** Tarjeta de reseña en estado de carga. */
export function ReviewSkeleton() {
  return (
    <div className="card space-y-3" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

/** Fila de estadística en carga. */
export function StatSkeleton() {
  return (
    <div className="card space-y-3" aria-hidden>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

/** Bloque de cuota en carga (widget del panel). */
export function QuotaSkeleton() {
  return (
    <div className="panel space-y-3" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-52" />
        <Skeleton className="h-7 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

/** Lista de reseñas en carga. */
export function ReviewListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando reseñas">
      {Array.from({ length: rows }).map((_, i) => (
        <ReviewSkeleton key={i} />
      ))}
    </div>
  );
}

/** Tabla en carga (listados largos del panel). */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-8 flex-1 rounded-lg', c === 0 && 'max-w-[22%]', c === cols - 1 && 'max-w-[16%]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de las pantallas de acceso (/login y /registro). */
export function AuthSkeleton() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-70" aria-hidden />
      <div className="relative w-full max-w-md" aria-busy="true" aria-label="Cargando acceso">
        <div className="card p-7 shadow-glow-soft">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-6 h-7 w-3/4" />
          <Skeleton className="mt-2.5 h-4 w-full" />
          <Skeleton className="mt-6 h-11 w-full rounded-[var(--radius-control)]" />
          <Skeleton className="mt-3 h-11 w-full rounded-[var(--radius-control)]" />
          <Skeleton className="mt-5 h-11 w-full rounded-[var(--radius-control)]" />
          <Skeleton className="mt-5 h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
