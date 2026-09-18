'use client';

import Link from 'next/link';
import { Lock, Star } from 'lucide-react';
import { brand, companyName, domain, supportEmail, SITE } from '@/lib/site';
import { openCookieSettings } from '@/lib/consent';

const COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Producto',
    links: [
      ['Funciones', '/#funciones'],
      ['Cómo funciona', '/#como-funciona'],
      ['Planes', '/#planes'],
      ['Ampliaciones de cuota', '/#ampliaciones'],
      ['Preguntas frecuentes', '/#faq'],
    ],
  },
  {
    title: 'Empresa',
    links: [
      ['Sobre nosotros', '/sobre-nosotros'],
      ['Contacto', '/contacto'],
      ['Entrar', '/login'],
      ['Crear cuenta', '/registro'],
    ],
  },
  {
    title: 'Legal (UE/RGPD)',
    links: [
      ['Aviso legal', '/aviso-legal'],
      ['Privacidad', '/privacidad'],
      ['Términos del servicio', '/terminos'],
      ['Política de cookies', '/cookies'],
    ],
  },
];

/** Pie de página unificado (estética dark en toda la plataforma). */
export function Footer(_props?: { dark?: boolean }) {
  return (
    <footer className="relative border-t border-white/[0.07] bg-ink-950/80 py-14 text-sm">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="flex items-center gap-2.5 font-bold tracking-tightish text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] text-white shadow-[0_8px_24px_-10px_rgba(37,99,235,0.95)]">
              <Star size={16} fill="currentColor" />
            </span>
            {brand}
          </p>
          <p className="mt-3 max-w-xs leading-relaxed text-ink-400">{SITE.tagline}</p>
          <p className="mt-2 text-xs text-ink-500">
            {companyName} · {domain}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            <a href={`mailto:${supportEmail}`} className="transition hover:text-white">
              {supportEmail}
            </a>
          </p>
          <ul className="mt-5 space-y-2 text-xs text-ink-400">
            <li className="flex items-center gap-2">
              <Lock size={13} className="text-emerald-400" /> Datos alojados en la UE
            </li>
            <li className="flex items-center gap-2">
              <Star size={13} className="text-amber-400" /> Reseñas verificadas (Dir. UE 2019/2161)
            </li>
            <li>
              <button
                onClick={openCookieSettings}
                className="inline-flex items-center gap-2 rounded-lg transition hover:text-white"
              >
                🍪 Configurar cookies
              </button>
            </li>
          </ul>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500">{col.title}</p>
            <ul className="mt-3.5 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-ink-300 transition-colors duration-200 hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-white/[0.06] px-4 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {companyName} · {brand} v3.9.0 · Todos los derechos
          reservados.
        </p>
        <p className="flex items-center gap-3">
          <Link href="/aviso-legal" className="transition hover:text-ink-200">Aviso legal</Link>
          <span className="text-ink-700">·</span>
          <Link href="/privacidad" className="transition hover:text-ink-200">Privacidad</Link>
          <span className="text-ink-700">·</span>
          <Link href="/cookies" className="transition hover:text-ink-200">Cookies</Link>
        </p>
      </div>
    </footer>
  );
}
