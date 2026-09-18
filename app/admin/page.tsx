import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { demoLogs } from '@/lib/logger';
import { demoStats, demoTenants } from '@/lib/demo';
import {
  isGoogleConfigured,
  isOpenAIConfigured,
  isSmtpConfigured,
  isStripeConfigured,
  isStripeWebhookConfigured,
  isSupabaseAdminConfigured,
  isSuperAdminConfigured,
  isWhatsappConfigured,
} from '@/lib/env';
import { ALL_ADDON_CATALOG, DEFAULT_AI_MODEL, planOf } from '@/lib/plans';
import { addonPriceIdFor } from '@/lib/stripe';
import { AdminClient, type AdminTenant } from './admin-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Super-Admin · ReviewFlow AI' };

/** MRR teórico de una empresa según plan + estado de la suscripción. */
function mrrFor(plan: string, status: string): number {
  if (status !== 'active') return 0;
  const p = planOf(plan);
  return p.priceCents;
}

export default async function AdminPage() {
  const guard = await requireSuperAdmin();
  const demo = !guard.ok || !isSupabaseAdminConfigured;

  let tenants: AdminTenant[] = demoTenants as AdminTenant[];
  let stats: any = demoStats();
  let logs: any[] = demoLogs();

  const admin = createAdminClient();
  if (admin && guard.ok) {
    try {
      const { data: t } = await admin
        .from('tenants')
        .select(
          'id, name, slug, owner_email, plan, subscription_status, stripe_customer_id, suspended, created_at, extra_requests, extra_reviews, extra_ai, extra_syncs, extra_stored',
        )
        .order('created_at', { ascending: false })
        .limit(200);

      if (t) {
        const ids = t.map((x: any) => x.id);

        // Contadores de uso del ciclo actual (una sola consulta para todos).
        const { data: counters } = await admin
          .from('usage_counters')
          .select('tenant_id, reviews_ingested, ai_responses, whatsapp_sent, ai_tokens_in, ai_tokens_out, cycle')
          .in('tenant_id', ids);

        const usedByTenant = new Map<string, number>();
        const tokensByTenant = new Map<string, number>();
        for (const c of (counters ?? []) as any[]) {
          usedByTenant.set(
            c.tenant_id,
            Number(c.reviews_ingested ?? 0) + Number(c.ai_responses ?? 0) + Number(c.whatsapp_sent ?? 0),
          );
          tokensByTenant.set(
            c.tenant_id,
            Number(c.ai_tokens_in ?? 0) + Number(c.ai_tokens_out ?? 0),
          );
        }

        // IA del ciclo por empresa (tokens, coste estimado y fallbacks).
        type AiUsageRow = {
          tenant_id: string;
          tokens_total: number;
          cost_usd_cycle: number;
          fallbacks_cycle: number;
          tokens_limit: number;
        };
        const aiByTenant = new Map<string, AiUsageRow>();
        try {
          const { data: aiRows } = await admin
            .from('v_ai_usage')
            .select('tenant_id, tokens_total, cost_usd_cycle, fallbacks_cycle, tokens_limit')
            .in('tenant_id', ids);
          for (const row of (aiRows ?? []) as AiUsageRow[]) aiByTenant.set(row.tenant_id, row);
        } catch {
          /* vista no migrada todavía */
        }

        // Reseñas y respuestas publicadas por empresa (counts paralelos).
        const withCounts = await Promise.all(
          t.map(async (tenant: any) => {
            const { count: reviews } = await admin
              .from('reviews')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id);
            const { count: replies } = await admin
              .from('reviews')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .not('reply_text', 'is', null);
            const ai = aiByTenant.get(tenant.id);
            return {
              ...tenant,
              reviews_count: reviews ?? 0,
              ai_replies_count: replies ?? 0,
              used_events: usedByTenant.get(tenant.id) ?? 0,
              ai_tokens_cycle: ai?.tokens_total ?? tokensByTenant.get(tenant.id) ?? 0,
              ai_tokens_limit: ai?.tokens_limit ?? planOf(tenant.plan).limits.aiTokensPerMonth,
              ai_cost_cycle: Number(ai?.cost_usd_cycle ?? 0),
              ai_fallbacks: Number(ai?.fallbacks_cycle ?? 0),
              mrr_cents: mrrFor(tenant.plan, tenant.subscription_status),
            } as AdminTenant;
          }),
        );

        tenants = withCounts;
        const mrr = tenants.reduce((a, x) => a + (x.mrr_cents ?? 0), 0);
        stats = {
          tenants: tenants.length,
          activeSubscriptions: tenants.filter((x) => x.subscription_status === 'active').length,
          mrrCents: mrr,
          mrrFormatted: `${(mrr / 100).toFixed(2).replace('.', ',')} €`,
          reviewsTotal: tenants.reduce((a, x) => a + (x.reviews_count ?? 0), 0),
          aiRepliesTotal: tenants.reduce((a, x) => a + (x.ai_replies_count ?? 0), 0),
          trialCount: tenants.filter((x) => x.subscription_status === 'trialing').length,
          aiTokensCycle: tenants.reduce((a, x) => a + Number(x.ai_tokens_cycle ?? 0), 0),
          aiCostCycleUsd: tenants.reduce((a, x) => a + Number(x.ai_cost_cycle ?? 0), 0),
          aiFallbacksCycle: tenants.reduce((a, x) => a + Number(x.ai_fallbacks ?? 0), 0),
          aiModel: DEFAULT_AI_MODEL,
        };
      }

      const { data: l } = await admin
        .from('system_logs')
        .select('id, created_at, level, source, message')
        .order('created_at', { ascending: false })
        .limit(100);
      if (l && l.length > 0) logs = l;
    } catch {
      /* seguimos con los datos de demostración */
    }
  }

  const integrations = [
    { name: 'Base de datos', ok: isSupabaseAdminConfigured, hint: 'Datos, acceso y cuotas' },
    { name: 'Control de administradores', ok: isSuperAdminConfigured, hint: 'Acceso al panel interno' },
    { name: 'Sistema de pagos', ok: isStripeConfigured, hint: 'Checkout, suscripciones y portal' },
    { name: 'Confirmación de pagos', ok: isStripeWebhookConfigured, hint: 'Suscripciones y recargas' },
    ...ALL_ADDON_CATALOG.map((pack) => ({
      name: `Recarga · ${pack.name}`,
      ok: Boolean(addonPriceIdFor(pack.id)),
      hint: `Precio previsto: ${pack.priceCents / 100} €`,
    })),
    { name: 'Correo transaccional', ok: isSmtpConfigured, hint: 'Avisos y resúmenes' },
    { name: 'OpenAI (opcional)', ok: isOpenAIConfigured, hint: 'Sin ella: plantillas locales' },
    { name: 'Google OAuth (opcional)', ok: isGoogleConfigured, hint: 'Business Profile + publicación' },
    { name: 'WhatsApp (opcional)', ok: isWhatsappConfigured, hint: 'Alertas ≤3★ y post-venta' },
  ];

  return (
    <AdminClient
      email={guard.ok ? guard.email : 'demo (sin sesión)'}
      demo={demo}
      tenants={tenants}
      stats={stats}
      logs={logs}
      integrations={integrations}
    />
  );
}
