import Link from 'next/link';
import { Compass, Home, LayoutDashboard, Star } from 'lucide-react';
import { SITE } from '@/lib/site';
import { Aurora } from '@/components/Motion';

export const metadata = { title: 'Página no encontrada (404)' };

/** 404 coherente con el sistema de diseño oscuro (v3.7.0). */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-16 text-ink-100">
      <Aurora />
      <div className="relative w-full max-w-lg text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
          <Star size={24} fill="currentColor" />
        </span>
        <p className="mt-7 font-mono text-sm tracking-[0.3em] text-brand-300">ERROR 404</p>
        <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tighter text-white sm:text-5xl">
          Esta página no existe
        </h1>
        <p className="mx-auto mt-4 max-w-md text-ink-300">
          Puede que el enlace esté mal escrito o que la sección haya cambiado de sitio en{' '}
          {SITE.brand}. Prueba por aquí:
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/" className="btn-primary">
            <Home size={16} /> Ir al inicio
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            <LayoutDashboard size={16} /> Mi panel
          </Link>
          <Link href="/#planes" className="btn-ghost">
            <Compass size={16} /> Ver planes
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs">
          {[
            ['Cómo funciona', '/#como-funciona'],
            ['Preguntas frecuentes', '/#faq'],
            ['Contacto', '/contacto'],
            ['Sobre nosotros', '/sobre-nosotros'],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="badge transition hover:border-white/25 hover:text-white">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
