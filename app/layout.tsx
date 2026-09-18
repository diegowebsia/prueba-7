import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';
import { ConsentProvider } from '@/lib/consent';
import { CookieBanner } from '@/components/CookieBanner';
import { ThirdPartyScripts } from '@/components/ThirdPartyScripts';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: `${SITE.brand} — Gestiona y responde reseñas con IA`,
    template: `%s · ${SITE.brand}`,
  },
  description:
    'Plataforma SaaS multi-tenant para centralizar reseñas de Google, Trustpilot y tus tiendas y responderlas automáticamente con IA. Cuotas reales, add-ons de ampliación y cumplimiento RGPD.',
  keywords: [
    'gestión de reseñas',
    'respuestas con IA',
    'Google Business Profile',
    'Trustpilot',
    'WhatsApp Business',
    'reputación online',
  ],
  applicationName: SITE.brand,
  authors: [{ name: SITE.brand }],
  openGraph: {
    title: `${SITE.brand} — Todas tus reseñas, respondidas con IA`,
    description:
      'Centraliza Google, Trustpilot y tus tiendas en una sola bandeja y responde en segundos con el tono de tu marca.',
    type: 'website',
    locale: 'es_ES',
    siteName: SITE.brand,
  },
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#090D16',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-ink-950 text-ink-100 antialiased">
        <ToastProvider>
          <ConsentProvider>
            {children}
            <CookieBanner />
            <ThirdPartyScripts />
          </ConsentProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
