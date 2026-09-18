'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Último recurso: se activa cuando falla el propio `RootLayout` (sustituye a
 * `<html>` y `<body>`), por eso incluye su markup mínimo y el CSS global.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ReviewFlow AI] Error fatal de layout:', error?.message, error?.digest);
  }, [error]);

  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-[#090D16] text-[#DDE2EC] antialiased">
        <main className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="w-full max-w-md rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-7 text-center">
            <p className="font-mono text-xs tracking-[0.3em] text-[#93b8ff]">ERROR FATAL</p>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
              La aplicación no ha podido arrancar esta vista
            </h1>
            <p className="mt-2.5 text-sm text-[#8A94AC]">
              Recarga para volver a intentarlo. Si el problema continúa, contacta con soporte e indica la referencia que aparece debajo.
            </p>
            {error?.digest && (
              <p className="mt-4 font-mono text-xs text-[#5A6785]">referencia: {error.digest}</p>
            )}
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              <button
                onClick={() => reset()}
                className="rounded-[0.875rem] bg-[linear-gradient(120deg,#2563eb,#5f92fb,#8b5cf6)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Reintentar
              </button>
              <a
                href="/"
                className="rounded-[0.875rem] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Ir al inicio
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
