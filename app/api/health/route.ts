import { NextResponse } from 'next/server';
import {
  env,
  envStatus,
  isDatabaseConfigured,
  isGoogleConfigured,
  isGooglePlacesConfigured,
  isOpenAIConfigured,
  isSmtpConfigured,
  isStripeConfigured,
  isStripeWebhookConfigured,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  isSuperAdminConfigured,
  isWhatsappConfigured,
} from '@/lib/env';
import { OPENAI_MODEL, openAiRuntime } from '@/lib/openai';
import { checkDbHealth } from '@/lib/db';
import { isTripadvisorConfigured, tripadvisorProvider } from '@/lib/tripadvisor';
import { isQueueConfigured } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * Health-check público (sin secretos). Ideal para Docker HEALTHCHECK,
 * uptime monitors y para verificar el .env tras cada despliegue.
 *
 *   GET /api/health           → estado rápido (integración por integración)
 *   GET /api/health?verbose=1 → + variables presentes y estado del motor de IA
 *   GET /api/health?db=1      → + latencia real y conexiones de PostgreSQL
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const verbose = params.get('verbose') === '1';
  const withDb = params.get('db') === '1';
  const integrations = {
    supabase: isSupabaseConfigured,
    supabaseAdmin: isSupabaseAdminConfigured,
    superadmin: isSuperAdminConfigured,
    stripe: isStripeConfigured,
    stripeWebhook: isStripeWebhookConfigured,
    stripePrices: Boolean(env.stripePricePro) && Boolean(env.stripePriceBusiness),
    stripeAddons: Boolean(
      env.stripePriceAddonRequests ||
        env.stripePriceAddonReviews ||
        env.stripePriceAddonAi ||
        env.stripePriceAddonSyncs,
    ),
    smtp: isSmtpConfigured,
    openai: isOpenAIConfigured,
    database: isDatabaseConfigured,
    googleBusiness: isGoogleConfigured,
    googlePlaces: isGooglePlacesConfigured,
    whatsapp: isWhatsappConfigured,
    tripadvisor: isTripadvisorConfigured(),
    queue: isQueueConfigured(),
    cron: Boolean(process.env.CRON_SECRET),
  };

  const tripadvisor = { configured: isTripadvisorConfigured(), provider: tripadvisorProvider() };
  const queue = { configured: isQueueConfigured(), provider: isQueueConfigured() ? 'qstash' : 'inline' };

  return NextResponse.json({
    ok: true,
    app: 'reviewflow-ai',
    version: '3.10.0',
    time: new Date().toISOString(),
    integrations,
    tripadvisor,
    queue,
    ai: {
      configured: isOpenAIConfigured,
      model: OPENAI_MODEL,
      runtime: {
        inFlight: openAiRuntime().inFlight,
        maxConcurrency: openAiRuntime().maxConcurrency,
        rpmPerTenant: openAiRuntime().rpmPerTenant,
        maxAttempts: openAiRuntime().maxAttempts,
      },
    },
    missing: Object.entries(integrations)
      .filter(([, v]) => !v)
      .map(([k]) => k),
    ...(verbose ? { env: envStatus() } : {}),
    ...(withDb ? { database: await checkDbHealth() } : {}),
  });
}
