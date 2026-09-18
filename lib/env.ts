/**
 * Acceso centralizado y tolerante a variables de entorno.
 * La app NUNCA revienta en build/start por falta de claves:
 * cada integración expone su estado (configured: boolean) y la UI
 * muestra el modo demo / guía de configuración correspondiente.
 *
 * Tabla completa de variables y dónde se consigue cada una:
 *   → docs/GUIA_PASOS_MANUALES.md (sección «Credenciales») y `.env.example`.
 */

function list(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  /* ---------- App ---------- */
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  port: Number(process.env.PORT ?? '3000'),

  /* ---------- Super-admin ---------- */
  superadminEmails: list(process.env.SUPERADMIN_EMAILS),

  /* ---------- PostgreSQL directo (pool) ---------- */
  // Cadena del Connection Pooler de Supabase (recomendado):
  //   postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres
  // Es OPCIONAL: la app funciona con la API REST de Supabase; el pool se usa
  // para analítica, mantenimiento y diagnóstico (lib/db.ts).
  databaseUrl: process.env.DATABASE_URL ?? '',

  /* ---------- Supabase ---------- */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',

  /* ---------- Stripe ---------- */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripePublishableKey:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  // Planes de pago v3.9.0 (todos pasan por Stripe; no hay plan gratuito).
  // Se aceptan los nombres antiguos para no romper despliegues existentes:
  //   STRIPE_PRICE_RESENAS / STRIPE_PRICE_STARTER → Pro
  //   STRIPE_PRICE_COMPLETO                       → Business
  stripePricePro:
    process.env.STRIPE_PRICE_PRO ??
    process.env.STRIPE_PRICE_RESENAS ??
    process.env.STRIPE_PRICE_STARTER ??
    '',
  stripePriceBusiness: process.env.STRIPE_PRICE_BUSINESS ?? process.env.STRIPE_PRICE_COMPLETO ?? '',
  // Ampliaciones puntuales (pago único). Si no se definen, el checkout se crea
  // con `price_data` inline usando los importes de lib/plans.ts.
  stripePriceAddonRequests:
    process.env.STRIPE_PRICE_ADDON_REQUESTS ?? process.env.STRIPE_PRICE_ADDON_EVENTS ?? '',
  stripePriceAddonReviews: process.env.STRIPE_PRICE_ADDON_REVIEWS ?? '',
  stripePriceAddonAi: process.env.STRIPE_PRICE_ADDON_AI ?? '',
  stripePriceAddonSyncs: process.env.STRIPE_PRICE_ADDON_SYNCS ?? '',

  /* ---------- SMTP ---------- */
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? '587'),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpFrom: process.env.SMTP_FROM ?? 'ReviewFlow AI <no-reply@example.com>',

  /* ---------- OpenAI ---------- */
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',

  /* ---------- Google ---------- */
  // OAuth (Google Business Profile): importar + publicar respuestas.
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  // API key de servidor (Google Places API New): reseñas por Place ID.
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',

  /* ---------- Meta / WhatsApp Cloud API ---------- */
  whatsappToken: process.env.WHATSAPP_TOKEN ?? '',
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '',
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',

  /* ---------- Analítica opcional (RGPD) ---------- */
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isSupabaseAdminConfigured = Boolean(
  env.supabaseUrl && env.supabaseServiceRoleKey,
);
export const isDatabaseConfigured = Boolean(env.databaseUrl);
export const isStripeConfigured = Boolean(env.stripeSecretKey);
export const isStripeWebhookConfigured = Boolean(env.stripeWebhookSecret);
export const isSmtpConfigured = Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
export const isOpenAIConfigured = Boolean(env.openaiApiKey);
export const isGoogleConfigured = Boolean(env.googleClientId && env.googleClientSecret);
export const isGooglePlacesConfigured = Boolean(env.googlePlacesApiKey);
export const isWhatsappConfigured = Boolean(env.whatsappToken && env.whatsappPhoneId);
export const isSuperAdminConfigured = env.superadminEmails.length > 0;

/** Mapa plano «variable → presente» para /api/health y el panel /admin. */
export function envStatus(): Record<string, boolean> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(env.supabaseUrl),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(env.supabaseAnonKey),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.supabaseServiceRoleKey),
    DATABASE_URL: isDatabaseConfigured,
    SUPERADMIN_EMAILS: isSuperAdminConfigured,
    STRIPE_SECRET_KEY: isStripeConfigured,
    STRIPE_WEBHOOK_SECRET: isStripeWebhookConfigured,
    STRIPE_PRICE_PRO: Boolean(env.stripePricePro),
    STRIPE_PRICE_BUSINESS: Boolean(env.stripePriceBusiness),
    STRIPE_PRICE_ADDON_REQUESTS: Boolean(env.stripePriceAddonRequests),
    STRIPE_PRICE_ADDON_REVIEWS: Boolean(env.stripePriceAddonReviews),
    STRIPE_PRICE_ADDON_AI: Boolean(env.stripePriceAddonAi),
    STRIPE_PRICE_ADDON_SYNCS: Boolean(env.stripePriceAddonSyncs),
    SMTP: isSmtpConfigured,
    OPENAI_API_KEY: isOpenAIConfigured,
    GOOGLE_CLIENT_ID: isGoogleConfigured,
    GOOGLE_PLACES_API_KEY: isGooglePlacesConfigured,
    WHATSAPP_TOKEN: isWhatsappConfigured,
  };
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.superadminEmails.includes(email.trim().toLowerCase());
}
