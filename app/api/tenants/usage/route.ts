import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/authz';
import { checkQuota, demoQuotaCheck, toSnapshot, type QuotaCheck } from '@/lib/usage';
import { ADDON_CATALOG } from '@/lib/plans';

const Query = z.object({ tenantId: z.string().uuid() });

/** Cuerpo de respuesta común (modo real y modo demo). */
function payload(check: QuotaCheck) {
  const snapshot = toSnapshot(check);
  const limits = check.planDefinition.limits;
  return {
    plan: check.plan,
    planLabel: check.planDefinition.label,
    tier: check.planDefinition.tier,
    cycle: check.cycle,

    // --- Cuotas mensuales simplificadas ---
    metrics: check.metrics,
    limits: {
      requestsPerMonth: limits.requestsPerMonth,
      reviewsPerMonth: limits.reviewsPerMonth,
      aiRepliesPerMonth: limits.aiRepliesPerMonth,
      aiTokensPerMonth: limits.aiTokensPerMonth,
      syncsPerMonth: limits.syncsPerMonth,
      locations: limits.locations,
    },
    // --- Consumo real de IA (tokens medidos + coste estimado) ---
    aiUsage: check.aiUsage,
    used: snapshot.used,
    limit: snapshot.limit,
    remaining: snapshot.totalRemaining,
    allowed: check.allowed,
    blockedBy: check.blockedBy,

    // --- Topes de base de datos (protección Supabase/PostgreSQL) ---
    storage: snapshot.storage,
    storageLimitMb: check.storage.limitMb,
    storageUsedMb: check.storage.usedMb,

    // --- Ampliaciones del ciclo ---
    extras: check.extras,
    packs: check.packs,
    catalog: ADDON_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      price: `${(p.priceCents / 100).toFixed(0)} €`,
      metric: p.metric,
      amount: p.amount,
      badge: p.badge ?? null,
    })),

    // --- Estado de la suscripción ---
    counters: {
      reviews_ingested: check.counters.reviews_ingested,
      ai_replies: check.counters.ai_responses,
      whatsapp_sent: check.counters.whatsapp_sent,
      google_calls: check.counters.google_calls,
      ai_tokens_in: check.counters.ai_tokens_in,
      ai_tokens_out: check.counters.ai_tokens_out,
    },
    features: check.planDefinition.features,
    renewalAt: check.renewalAt,
    renewalLabel: check.renewalLabel,
    hasAccess: check.hasAccess,
  };
}

/**
 * GET ?tenantId= — consumo real del ciclo actual.
 * Devuelve las 4 cuotas mensuales, los topes de base de datos por empresa
 * (opiniones guardadas, registros de auditoría, conexiones), el desglose de
 * ampliaciones y la fecha de renovación.
 *
 * Sin Supabase configurado devuelve un snapshot de demostración (`demo: true`)
 * para que el panel pueda previsualizarse; nunca autoriza consumo real.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ ok: true, demo: true, ...payload(demoQuotaCheck('pro')) });
  }

  const parsed = Query.safeParse({ tenantId: url.searchParams.get('tenantId') });
  if (!parsed.success) return NextResponse.json({ error: 'tenantId inválido.' }, { status: 400 });

  const authz = await requireOwner(admin, parsed.data.tenantId);
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status });

  const check = await checkQuota(admin, parsed.data.tenantId);

  return NextResponse.json({ ok: true, demo: false, ...payload(check) });
}
