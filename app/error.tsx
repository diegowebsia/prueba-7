'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Home, RotateCcw, TriangleAlert } from 'lucide-react';
import { Aurora, EASE } from '@/components/Motion';

/**
 * Límite de errores global de la app (Next.js App Router).
 * Muestra el fallo con el mismo sistema de diseño oscuro y una acción clara
 * para reintentar, en vez del mensaje por defecto sin estilo.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En producción conviene enviarlo a tu proveedor de observabilidad.
    console.error('[ReviewFlow AI] Error no capturado:', error?.message, error?.digest);
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-16 text-ink-100">
      <Aurora />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative w-full max-w-lg"
      >
        <div className="card p-7 text-center shadow-glow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
            <TriangleAlert size={26} />
          </span>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tighter text-white">
            Algo ha fallado al cargar esta pantalla
          </h1>
          <p className="mt-2.5 text-sm text-ink-300">
            No se ha perdido ningún dato: tus reseñas, respuestas y ajustes siguen guardados en la
            base de datos. Vuelve a intentarlo y, si se repite, escríbenos indicando el código de
            error.
          </p>

          {error?.digest && (
            <p className="mt-4 inline-block rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-2xs text-ink-400">
              referencia: {error.digest}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <button onClick={() => reset()} className="btn-primary">
              <RotateCcw size={16} /> Reintentar
            </button>
            <Link href="/" className="btn-secondary">
              <Home size={16} /> Ir al inicio
            </Link>
            <Link href="/contacto" className="btn-ghost">
              Avisar a soporte
            </Link>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
