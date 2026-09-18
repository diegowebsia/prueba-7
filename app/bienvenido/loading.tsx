import { Spinner } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-100">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={22} />
        <p className="text-sm text-ink-400">Comprobando tu suscripción…</p>
      </div>
    </div>
  );
}
