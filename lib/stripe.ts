import Stripe from 'stripe';
import { env, isStripeConfigured } from '@/lib/env';
import { ADDON_PACKS, PLANS, type AddonPack, type AddonPackId, type PlanId } from '@/lib/plans';

// Las reglas comerciales viven únicamente en `lib/plans.ts`.

let cached: Stripe | null = null;

/** Instancia Stripe perezosa. null si no hay clave (modo demo). */
export function getStripe(): Stripe | null {
  if (!isStripeConfigured) return null;
  if (!cached) {
    cached = new Stripe(env.stripeSecretKey, {
      apiVersion: '2024-06-20',
      typescript: true,
    });
  }
  return cached;
}

/**
 * Planes de pago (todos pasan por Stripe con prueba de 7 días; no hay plan gratuito).
 * `priceEnv` documenta la variable de entorno recomendada en `.env.example`.
 */
export const STRIPE_PLANS = [
  {
    id: 'pro' as const,
    name: PLANS.pro.name,
    tier: PLANS.pro.tier,
    priceEnv: 'STRIPE_PRICE_PRO',
    fallbackPrice: `${PLANS.pro.price}/mes`,
    limits: PLANS.pro.limits,
    features: [
      '1 empresa · 3 sedes',
      '500 peticiones de opiniones/mes',
      '1.000 opiniones y 300 respuestas IA/mes',
      'Sincronización automática cada 6 h',
      'Email + WhatsApp, Google Business, Places y Trustpilot',
    ],
  },
  {
    id: 'business' as const,
    name: PLANS.business.name,
    tier: PLANS.business.tier,
    priceEnv: 'STRIPE_PRICE_BUSINESS',
    fallbackPrice: `${PLANS.business.price}/mes`,
    limits: PLANS.business.limits,
    features: [
      '1 empresa · 10 sedes',
      '2.000 peticiones de opiniones/mes',
      '5.000 opiniones y 1.500 respuestas IA/mes',
      'Sincronización automática cada hora',
      'Tienda (Shopify/Woo/TPV) + WhatsApp al entregar',
      'API pública de ingesta y soporte prioritario',
    ],
  },
] as const;

/** Price ID de un plan de pago ('' si falta en el .env). */
export function priceIdFor(plan: PlanId): string {
  if (plan === 'business') return env.stripePriceBusiness;
  if (plan === 'pro') return env.stripePricePro;
  return '';
}

const ADDON_PRICE_ENV: Record<AddonPackId, string> = {
  extra_requests_1000: env.stripePriceAddonRequests,
  extra_reviews_2000: env.stripePriceAddonReviews,
  extra_ai_500: env.stripePriceAddonAi,
  extra_syncs_500: env.stripePriceAddonSyncs,
};

/**
 * Price ID configurado para una ampliación ('' si no existe en el .env).
 * Cuando está vacío, `/api/stripe/addon` crea la línea con `price_data`
 * inline usando el importe definido en `lib/plans.ts`.
 */
export function addonPriceIdFor(pack: AddonPackId): string {
  return ADDON_PRICE_ENV[pack] ?? '';
}

/** Line item listo para `checkout.sessions.create` (catálogo o inline). */
export function addonLineItem(pack: AddonPack, quantity = 1): Stripe.Checkout.SessionCreateParams.LineItem {
  const price = addonPriceIdFor(pack.id);
  if (price) return { price, quantity };
  return {
    quantity,
    price_data: {
      currency: 'eur',
      unit_amount: pack.priceCents,
      product_data: {
        name: pack.name,
        description: pack.description,
        metadata: { addon: pack.id },
      },
    },
  };
}

/** ¿Este Price ID corresponde a una ampliación (y a cuál)? */
export function addonPackFromPriceId(priceId?: string | null): AddonPack | null {
  if (!priceId) return null;
  const entry = (Object.entries(ADDON_PRICE_ENV) as Array<[AddonPackId, string]>).find(
    ([, v]) => v && v === priceId,
  );
  return entry ? ADDON_PACKS[entry[0]] : null;
}

/** ¿Este Price ID corresponde a un plan de pago (y a cuál)? */
export function planFromPriceId(priceId?: string | null): PlanId | null {
  if (!priceId) return null;
  if (priceId === env.stripePriceBusiness) return 'business';
  if (priceId === env.stripePricePro) return 'pro';
  return null;
}
