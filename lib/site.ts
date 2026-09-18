/**
 * ReviewFlow AI — Datos del sitio y de la empresa (v3.9.0).
 *
 * FUENTE ÚNICA DE VERDAD para los datos fiscales y de contacto.
 * Se consumen dinámicamente desde el footer y las páginas legales
 * (/aviso-legal, /privacidad, /terminos, /cookies).
 *
 * Configuración (prioridad):
 *  1. Variables de entorno NEXT_PUBLIC_* (recomendado en producción).
 *  2. Valores por defecto de abajo (placeholders a sustituir).
 *
 * ⚠️ ACCIÓN MANUAL: define estas variables en tu `.env` / hosting con tus
 * datos fiscales reales (ver docs/GUIA_PASOS_MANUALES.md paso 1):
 *   NEXT_PUBLIC_COMPANY_NAME, NEXT_PUBLIC_CIF, NEXT_PUBLIC_ADDRESS,
 *   NEXT_PUBLIC_LEGAL_EMAIL, NEXT_PUBLIC_SUPPORT_EMAIL, NEXT_PUBLIC_DOMAIN
 */

const env = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : fallback;
};

/** Nombre comercial de la plataforma. */
export const brand = 'ReviewFlow AI';

/** Nombre fiscal de la sociedad (S.L.). */
export const companyName = env('NEXT_PUBLIC_COMPANY_NAME', '[NOMBRE FISCAL S.L.]');

/** CIF/NIF de la sociedad. */
export const cif = env('NEXT_PUBLIC_CIF', '[CIF/NIF]');

/** Domicilio fiscal (LSSI-CE art. 10). */
export const address = env('NEXT_PUBLIC_ADDRESS', '[CALLE, Nº, CP, CIUDAD, ESPAÑA]');

/** Email legal / privacidad / RGPD. */
export const legalEmail = env('NEXT_PUBLIC_LEGAL_EMAIL', 'legal@[tudominio.com]');

/** Email de soporte. */
export const supportEmail = env('NEXT_PUBLIC_SUPPORT_EMAIL', 'soporte@[tudominio.com]');

/** Dominio público (sin protocolo). */
export const domain = env('NEXT_PUBLIC_DOMAIN', '[tudominio.com]');

/**
 * Objeto agregado (compatibilidad con el código existente).
 * Las páginas legales y el footer deben preferir las exportaciones
 * individuales (`companyName`, `cif`, `address`, `supportEmail`, `domain`).
 */
export const SITE = {
  brand,
  tagline: 'Todas tus reseñas. Una sola bandeja. Respuestas con IA.',
  // ---- Datos fiscales (LSSI-CE art. 10) — centralizados arriba ----
  company: companyName,
  cif,
  address,
  email: legalEmail,
  supportEmail,
  domain,
  // ---- Planes de pago (deben coincidir con Stripe; sin plan gratuito) ----
  plans: {
    pro: { name: 'Pro', price: '29 €', period: '/mes' },
    business: { name: 'Business', price: '79 €', period: '/mes' },
  },
};
