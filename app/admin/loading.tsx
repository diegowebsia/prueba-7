import { Spinner, TableSkeleton } from '@/components/Skeleton';

/** Esqueleto del panel super-admin (métricas + tabla de empresas). */
export default function Loading() {
  return (
    <div className="min-h-screen bg-ink-950 px-4 py-8 text-ink-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3">
          <Spinner size={18} />
          <p className="text-sm text-ink-400">Cargando panel de administración…</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-[var(--radius-card)]" />
          ))}
        </div>
        <div className="card p-5">
          <TableSkeleton rows={7} cols={6} />
        </div>
      </div>
    </div>
  );
}
