/** Datos de demostración coherentes para modo sin-BD (panel admin + dashboard). */

export type DemoTenant = {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  plan: 'pro' | 'business';
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'inactive' | 'none';
  stripe_customer_id: string | null;
  reviews_count: number;
  ai_replies_count: number;
  mrr_cents: number;
  created_at: string;
  suspended: boolean;
};

export const demoTenants: DemoTenant[] = [
  {
    id: 'demo-t-1',
    name: 'Clínica Dental Sonrisa',
    slug: 'clinica-sonrisa',
    owner_email: 'hola@clinica-sonrisa.es',
    plan: 'business',
    subscription_status: 'active',
    stripe_customer_id: 'cus_demo_001',
    reviews_count: 342,
    ai_replies_count: 318,
    mrr_cents: 7900,
    created_at: '2025-05-02T10:00:00Z',
    suspended: false,
  },
  {
    id: 'demo-t-2',
    name: 'Restaurante La Brasa',
    slug: 'la-brasa',
    owner_email: 'reservas@labrasa.es',
    plan: 'pro',
    subscription_status: 'active',
    stripe_customer_id: 'cus_demo_002',
    reviews_count: 187,
    ai_replies_count: 150,
    mrr_cents: 2900,
    created_at: '2025-08-19T10:00:00Z',
    suspended: false,
  },
  {
    id: 'demo-t-3',
    name: 'Taller Rueda Libre',
    slug: 'rueda-libre',
    owner_email: 'taller@ruedalibre.es',
    plan: 'pro',
    subscription_status: 'trialing',
    stripe_customer_id: 'cus_demo_003',
    reviews_count: 24,
    ai_replies_count: 9,
    mrr_cents: 2900,
    created_at: '2026-09-01T10:00:00Z',
    suspended: false,
  },
];

export type DemoReview = {
  id: string;
  tenant: string;
  tenant_id?: string;
  author: string;
  rating: number;
  text: string;
  source: 'google' | 'trustpilot' | 'facebook';
  created_at: string;
  replied: boolean;
  /** Dir. UE 2019/2161: la plataforma de origen confirma consumo real. */
  verified: boolean;
  /** v3.4.0: gestión privada (≤3★) + nota de seguimiento. */
  flagged_private?: boolean;
  private_note?: string | null;
  reply?: string | null;
};

export const demoReviews: DemoReview[] = [
  {
    id: 'demo-r-1',
    tenant: 'Clínica Dental Sonrisa',
    author: 'María G.',
    rating: 5,
    text: 'Trato increíble desde que entras por la puerta. Sin dolor y rapidísimos.',
    source: 'google',
    created_at: '2026-09-15T09:12:00Z',
    replied: true,
    verified: true,
  },
  {
    id: 'demo-r-2',
    tenant: 'Clínica Dental Sonrisa',
    author: 'Javier R.',
    rating: 2,
    text: 'Me cambiaron la cita dos veces sin avisar con tiempo. Espero que mejoren.',
    source: 'google',
    created_at: '2026-09-14T18:40:00Z',
    replied: false,
    verified: true,
    flagged_private: true,
    private_note: null,
  },
  {
    id: 'demo-r-3',
    tenant: 'Restaurante La Brasa',
    tenant_id: 'demo-t-2',
    author: 'Lucía F.',
    rating: 4,
    text: 'La carne espectacular, el servicio un poco lento en hora punta.',
    source: 'trustpilot',
    created_at: '2026-09-13T21:05:00Z',
    replied: false,
    verified: false,
  },
  {
    id: 'demo-r-4',
    tenant: 'Restaurante La Brasa',
    tenant_id: 'demo-t-2',
    author: 'Carlos M.',
    rating: 5,
    text: 'Reserva sencilla, atención excelente y platos muy cuidados. Volveremos.',
    source: 'google',
    created_at: '2026-09-16T13:25:00Z',
    replied: true,
    verified: true,
    reply: 'Hola Carlos, muchas gracias por visitarnos y compartir tu experiencia. ¡Esperamos volver a verte pronto!',
  },
  {
    id: 'demo-r-5',
    tenant: 'Restaurante La Brasa',
    tenant_id: 'demo-t-2',
    author: 'Ana P.',
    rating: 2,
    text: 'Esperamos demasiado entre platos y nadie nos explicó el retraso.',
    source: 'google',
    created_at: '2026-09-17T20:10:00Z',
    replied: false,
    verified: true,
    flagged_private: true,
    private_note: '',
  },
  {
    id: 'demo-r-6',
    tenant: 'Restaurante La Brasa',
    tenant_id: 'demo-t-2',
    author: 'Sergio T.',
    rating: 5,
    text: 'Muy buena relación calidad-precio y personal atento.',
    source: 'trustpilot',
    created_at: '2026-09-18T12:15:00Z',
    replied: false,
    verified: true,
  },
];

export function demoStats() {
  const mrrCents = demoTenants.reduce((a, t) => a + t.mrr_cents, 0);
  return {
    tenants: demoTenants.length,
    activeSubscriptions: demoTenants.filter((t) => t.subscription_status === 'active').length,
    mrrCents,
    mrrFormatted: `${(mrrCents / 100).toFixed(2)} €`,
    reviewsTotal: demoTenants.reduce((a, t) => a + t.reviews_count, 0),
    aiRepliesTotal: demoTenants.reduce((a, t) => a + t.ai_replies_count, 0),
    // Control de coste de IA (modo demo): tokens del ciclo y coste estimado.
    aiTokensCycle: 214_800,
    aiCostCycleUsd: 0.045,
    aiFallbacksCycle: 1,
    aiModel: 'gpt-4o-mini',
    trialCount: demoTenants.filter((t) => t.subscription_status === 'trialing').length,
  };
}
