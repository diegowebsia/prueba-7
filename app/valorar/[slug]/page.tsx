import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrialExpired } from '@/lib/plans';
import FunnelClient from './funnel-client';

export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

/**
 * Flujo Neutral de Valoración (página pública del negocio).
 * Solo expone datos seguros (nombre + slug); los enlaces públicos salen
 * tras cualquier puntuación; los mensajes de soporte opcionales nunca se publican.
 */
export default async function ValorarPage({ params }: Props) {
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name, slug, plan, subscription_status, suspended, trial_ends_at, settings')
    .eq('slug', params.slug)
    .single();

  const settings = ((tenant as any)?.settings as any) ?? {};
  const usable =
    tenant &&
    !(tenant as any).suspended &&
    ((tenant as any).subscription_status === 'active' || (tenant as any).subscription_status === 'trialing') &&
    !isTrialExpired((tenant as any).subscription_status, (tenant as any).trial_ends_at) &&
    settings.funnel_enabled !== false;

  if (!usable) notFound();

  return (
    <FunnelClient
      slug={(tenant as any).slug}
      businessName={(tenant as any).name}
      hasGoogle={Boolean(settings.place_id)}
      hasTripadvisor={Boolean(settings.tripadvisor_url)}
      hasTrustpilot={Boolean(settings.trustpilot_url)}
    />
  );
}
