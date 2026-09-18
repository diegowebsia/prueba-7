import { Aurora } from '@/components/Motion';
import { Spinner } from '@/components/Skeleton';

/** Estado de carga genérico entre rutas (mismo fondo oscuro que la app). */
export default function Loading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 text-ink-100">
      <Aurora />
      <div className="relative flex flex-col items-center gap-3">
        <Spinner size={22} />
        <p className="text-sm text-ink-400">Cargando…</p>
      </div>
    </div>
  );
}
