'use client';

import Script from 'next/script';
import { useConsent } from '@/lib/consent';

/**
 * Carga condicional de scripts de terceros según consentimiento.
 * - Sin consentimiento → NO se carga nada (cumple ePrivacy por diseño).
 * - Con analítica aceptada + NEXT_PUBLIC_PLAUSIBLE_DOMAIN → Plausible (sin cookies).
 * Para añadir más proveedores (GA4, Meta Pixel…), replica el patrón con su categoría.
 */
export function ThirdPartyScripts() {
  const { consent } = useConsent();
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  if (!consent?.analytics || !plausibleDomain) return null;

  return (
    <Script
      strategy="afterInteractive"
      data-domain={plausibleDomain}
      src="https://plausible.io/js/script.js"
    />
  );
}
