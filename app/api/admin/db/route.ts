import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth';
import { checkDbHealth, dbPoolConfig, getDbPool, query } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { OPENAI_MODEL, openAiRuntime } from '@/lib/openai';
import { PLAN_CATALOG, ROW_KB, estimateCostUsd } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * Panel interno · diagnóstico de base de datos e IA.
 *
 *   GET /api/admin/db
 *
 * Solo super-admin. Devuelve, sin secretos:
 *   · Estado del pool `pg` (modo, límites, conexiones en uso) y del servidor
 *     (conexiones activas, tamaño de la BD, latencia).
 *   · Top de empresas por consumo de IA del ciclo (tokens y coste estimado).
 *   · Tamaño real de las tablas protegidas (para ajustar los topes del plan).
 *   · Presupuesto de tokens y coste teórico máximo por plan (control de margen).
 */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: guard.status });
  }

  const health = await checkDbHealth();
  const cfg = dbPoolConfig();

  /** Tablas protegidas: filas y tamaño real en disco. */
  type TableStat = { table: string; rows: number; total_mb: number };
  let tables: TableStat[] = [];
  if (getDbPool()) {
    const res = await query<{ table_name: string; rows: string; total_mb: string }>(
      `select c.relname as table_name,
              coalesce(s.n_live_tup, 0)::text as rows,
              round((pg_total_relation_size(c.oid) / 1024.0 / 1024.0)::numeric, 2)::text as total_mb
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname in ('reviews','quota_events','ai_interactions','integrations','system_logs','usage_counters','addons','tenants','memberships')
        order by pg_total_relation_size(c.oid) desc`,
    );
    if (res.ok) {
      tables = res.rows.map((r) => ({
        table: r.table_name,
        rows: Number(r.rows) || 0,
        total_mb: Number(r.total_mb) || 0,
      }));
    }
  }

  // Top de consumo de IA del ciclo (vista creada por la migración 3.8.0).
  type AiRow = {
    name: string;
    plan: string;
    tokens_total: number;
    tokens_limit: number;
    pct_used: number;
    cost_usd_cycle: number;
    fallbacks_cycle: number;
  };
  let aiTop: AiRow[] = [];
  let aiCycleTotals = { tokens: 0, costUsd: 0, calls: 0, fallbacks: 0 };
  const admin = createAdminClient();
  if (admin) {
    try {
      const { data } = await admin
        .from('v_ai_usage')
        .select('name, plan, tokens_total, tokens_limit, pct_used, cost_usd_cycle, fallbacks_cycle')
        .order('tokens_total', { ascending: false })
        .limit(15);
      aiTop = (data ?? []) as AiRow[];
      aiCycleTotals = aiTop.reduce(
        (acc, r) => ({
          tokens: acc.tokens + Number(r.tokens_total ?? 0),
          costUsd: acc.costUsd + Number(r.cost_usd_cycle ?? 0),
          calls: acc.calls,
          fallbacks: acc.fallbacks + Number(r.fallbacks_cycle ?? 0),
        }),
        aiCycleTotals,
      );
    } catch {
      /* vista aún no migrada */
    }
  }

  /** Coste teórico máximo por plan (si el cliente agota su presupuesto). */
  const planBudgets = PLAN_CATALOG.map((p) => {
    // Reparto estimado 75 % entrada / 25 % salida (una reseña es más prompt que salida).
    const tokens = p.limits.aiTokensPerMonth;
    const maxCostUsd = estimateCostUsd(Math.round(tokens * 0.75), Math.round(tokens * 0.25), OPENAI_MODEL);
    return {
      plan: p.id,
      label: p.label,
      priceCents: p.priceCents,
      aiRepliesPerMonth: p.limits.aiRepliesPerMonth,
      aiTokensPerMonth: tokens,
      aiRows: p.limits.aiRows,
      /** Coste máximo de IA del ciclo si el cliente agota su presupuesto. */
      maxCostUsd,
      /** Margen teórico del plan tras ese coste máximo (en % del precio). */
      maxAiCostPctOfPrice:
        p.priceCents > 0 ? Math.round((maxCostUsd / (p.priceCents / 100)) * 10_000) / 100 : null,
    };
  });

  return NextResponse.json({
    ok: true,
    database: {
      ...health,
      poolConfig: cfg,
      tables,
      rowKb: ROW_KB,
    },
    ai: {
      model: OPENAI_MODEL,
      runtime: openAiRuntime(),
      cycleTotals: aiCycleTotals,
      top: aiTop,
      planBudgets,
    },
    hints: [
      'Si `pool.waiting` crece o `latencyMs` sube: sube DATABASE_POOL_MAX (VPS) o revisa el pooler (Supabase → Connection pooling).',
      'Si alguna tabla supera ~350 MB en Supabase Free: pasa a Pro o baja los topes del plan en lib/plans.ts.',
      'Si `ai.top` muestra un cliente con pct_used ≈ 100 %: ofrécele la recarga de IA o el plan superior.',
    ],
    generatedAt: new Date().toISOString(),
  });
}
