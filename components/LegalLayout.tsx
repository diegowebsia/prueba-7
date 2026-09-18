import Link from 'next/link';
import { ArrowLeft, Scale, Star } from 'lucide-react';
import { SITE } from '@/lib/site';
import { Footer } from '@/components/Footer';

/** Plantilla premium para páginas legales (misma estética que el resto del producto). */
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-ink-950 text-ink-100">
      <header className="nav-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="group flex items-center gap-2.5 font-bold tracking-tightish text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] shadow-[0_8px_20px_-10px_rgba(37,99,235,0.95)]">
              <Star size={14} fill="currentColor" />
            </span>
            {SITE.brand}
          </Link>
          <Link href="/" className="btn-secondary btn-sm">
            <ArrowLeft size={14} /> Volver
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-14">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-600/12 blur-[110px]" aria-hidden />
        <div className="relative">
          <p className="kicker flex items-center gap-2">
            <Scale size={13} /> Legal
          </p>
          <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-ink-500">Última actualización: {updated}</p>

          <article className="card mt-8 p-6 sm:p-9">
            <div className="legal-prose-dark">{children}</div>
          </article>

          <nav className="mt-6 flex flex-wrap gap-2 text-xs">
            {[
              ['Aviso legal', '/aviso-legal'],
              ['Privacidad', '/privacidad'],
              ['Términos', '/terminos'],
              ['Cookies', '/cookies'],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="badge transition hover:border-white/25 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </main>

      <Footer />
    </div>
  );
}
