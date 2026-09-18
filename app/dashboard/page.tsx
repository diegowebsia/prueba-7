import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { hasAccess } from '@/lib/plans';
import { DashboardClient, type TenantInfo } from './dashboard-client';
import { demoReviews, demoTenants } from '@/lib/demo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Panel — ReviewFlow AI' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; addon?: string; pack?: string; plan?: string }>;
}) {
  const [user, query] = await Promise.all([getSessionUser(), searchParams]);
  const tab =
    query.tab === 'facturacion' || query.tab === 'empresa'
      ? query.tab
      : query.addon
        ? 'facturacion'
        : 'bandeja';
  const addonResult =
    query.addon === 'success' ? 'success' : query.addon === 'canceled' ? 'canceled' : null;
  if (isSupabaseConfigured && !user) redirect('/login?redirect=/dashboard');

  let tenants: TenantInfo[] = [];
  let reviews: typeof demoReviews = demoReviews;
  let demo = true;
  let hasSubscriptionWithAccess = false;
  let hasAnyTenant = false;

  // Sin Supabase no hay datos reales: se monta una empresa de ejemplo para que el
  // panel completo (Bandeja, Empresa y Facturación) pueda previsualizarse con
  // `/dashboard?demo=1`. En cuanto existen claves reales, este bloque no aplica.
  if (!isSupabaseConfigured) {
    const requestedPlan = query.plan === 'business' ? 'business' : 'pro';
    const d = demoTenants.find((tenant) => tenant.plan === requestedPlan && tenant.subscription_status === 'active')
      ?? demoTenants[0];
    reviews = demoReviews.filter((review) => review.tenant === d.name);
    tenants = [
      {
        id: d.id,
        name: d.name,
        slug: 'demo',
        plan: d.plan,
        subscription_status: d.subscription_status,
        suspended: false,
        trial_ends_at: null,
        access: true,
        settings: {
          tone: 'cercano',
          place_id: 'ChIJJ3y5 Example-Place-ID',
          whatsapp_to: '34600000000',
          place_rating: 4.7,
        },
        api_key: 'rf_demo_0000000000',
        integrations: [
          { provider: 'google', status: 'connected', last_sync_at: new Date().toISOString() },
          { provider: 'trustpilot', status: 'disconnected', last_sync_at: null },
        ],
      },
    ];
    hasSubscriptionWithAccess = true;
    hasAnyTenant = true;
  }

  const admin = createAdminClient();
  if (admin && user) {
    try {
      const { data: memberships } = await admin
        .from('memberships')
        .select('tenant_id, tenants(id, name, slug, plan, subscription_status, suspended, trial_ends_at, settings, api_key)')
        .eq('user_id', user.id);
      const list = (memberships ?? []).map((m: any) => m.tenants).filter(Boolean);
      hasAnyTenant = list.length > 0;

      // Estado de integraciones por empresa (sin credenciales: solo estado).
      const integMap: Record<string, Array<{ provider: string; status: string; last_sync_at: string | null }>> = {};
      if (list.length > 0) {
        const { data: integs } = await admin
          .from('integrations')
          .select('tenant_id, provider, status, last_sync_at')
          .in('tenant_id', list.map((t: any) => t.id));
        for (const i of integs ?? []) {
          (integMap[i.tenant_id] ??= []).push({
            provider: i.provider,
            status: i.status,
            last_sync_at: i.last_sync_at,
          });
        }
      }

      tenants = list.map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        subscription_status: t.subscription_status,
        suspended: t.suspended,
        trial_ends_at: t.trial_ends_at,
        access: hasAccess(t.subscription_status, t.suspended),
        settings: (t.settings as any) ?? {},
        api_key: t.api_key ?? null,
        integrations: integMap[t.id] ?? [],
      }));
      hasSubscriptionWithAccess = tenants.some((t) => t.access);

      const accessibleIds = tenants.filter((t) => t.access).map((t) => t.id);
      if (accessibleIds.length > 0) {
        const { data: revs } = await admin
          .from('reviews')
          .select('id, tenant_id, author_name, rating, text, source, created_at, reply_text, is_verified, flagged_private, private_note, tenants(name)')
          .in('tenant_id', accessibleIds)
          .order('created_at', { ascending: false })
          .limit(50);
        demo = false;
        reviews = (revs ?? []).map((r: any) => ({
          id: r.id,
          tenant: r.tenants?.name ?? '',
          tenant_id: r.tenant_id,
          author: r.author_name,
          rating: r.rating,
          text: r.text,
          source: r.source,
          created_at: r.created_at,
          replied: Boolean(r.reply_text),
          verified: Boolean(r.is_verified),
          flagged_private: Boolean(r.flagged_private),
          private_note: r.private_note ?? null,
          reply: r.reply_text ?? null,
        }));
      } else if (hasAnyTenant) {
        demo = false;
        reviews = [];
      }
    } catch {
      demo = true;
    }
  }

  return (
    <DashboardClient
      tenants={tenants}
      reviews={reviews}
      demo={demo}
      userEmail={user?.email ?? 'demo@example.com'}
      hasAccess={hasSubscriptionWithAccess}
      hasAnyTenant={hasAnyTenant}
      tab={tab as 'bandeja' | 'empresa' | 'embudo' | 'facturacion'}
      addonResult={addonResult}
    />
  );
}
