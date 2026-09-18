'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Gauge,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { PLANS, TRIAL_DAYS, formatEur, planOf, type PlanId } from '@/lib/plans';
import { Aurora, CountUp, EASE } from '@/components/Motion';
import { Spinner, TableSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

export type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  plan: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  reviews_count: number;
  ai_replies_count: number;
  mrr_cents: number;
  created_at: string;
  suspended: boolean;
  /** Recargas de cuota concedidas en el ciclo (columnas extra_* de tenants). */
  extra_requests?: number;
  extra_reviews?: number;
  extra_ai?: number;
  extra_syncs?: number;
  extra_stored?: number;
  /** Consumo del ciclo actual (usage_counters). */
  used_events?: number;
  /** Consumo de IA del ciclo: tokens medidos y coste estimado (USD). */
  ai_tokens_cycle?: number;
  ai_tokens_limit?: number;
  ai_cost_cycle?: number;
  ai_fallbacks?: number;
};

type Props = {
  email: string;
  demo: boolean;
  tenants: AdminTenant[];
  stats: {
    tenants: number;
    activeSubscriptions: number;
    mrrCents: number;
    mrrFormatted: string;
    reviewsTotal: number;
    aiRepliesTotal: number;
    trialCount: number;
    /** Control de coste de IA del ciclo actual (todas las empresas). */
    aiTokensCycle?: number;
    aiCostCycleUsd?: number;
    aiFallbacksCycle?: number;
    aiModel?: string;
  };
  logs: Array<{ id: string; created_at: string; level: string; source: string; message: string }>;
  integrations: Array<{ name: string; ok: boolean; hint?: string }>;
};

const TABS = [
  { id: 'tenants', label: 'Empresas', icon: Building2 },
  { id: 'subs', label: 'Suscripciones', icon: CreditCard },
  { id: 'quota', label: 'Cuotas y extras', icon: Gauge },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'system', label: 'Sistema', icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]['id'];

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  past_due: 'Impago',
  unpaid: 'Impago',
  canceled: 'Cancelada',
  inactive: 'Inactiva',
  incomplete: 'Incompleta',
  incomplete_expired: 'Caducada',
  paused: 'Pausada',
  none: 'Sin suscripción',
};

function statusClass(status: string) {
  if (status === 'active') return 'badge-ok';
  if (status === 'trialing') return 'badge-brand';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'badge-warn';
  if (status === 'canceled' || status === 'inactive' || status === 'incomplete_expired' || status === 'paused')
    return 'badge-danger';
  return 'badge';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(statusClass(status), 'whitespace-nowrap')}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Barra de consumo de cuota del ciclo (base del plan + extras concedidos). */
function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const tone =
    pct >= 100 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-[linear-gradient(90deg,#2563eb,#8b5cf6)]';
  return (
    <span className="flex w-28 items-center gap-2" title={`${used} de ${quota} eventos`}>
      <span className="meter flex-1">
        <span className={tone} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn('text-2xs tabular-nums', pct >= 100 ? 'text-rose-300' : 'text-ink-400')}>
        {pct}%
      </span>
    </span>
  );
}

export function AdminClient({ email, demo, tenants, stats, logs, integrations }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('tenants');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return tenants;
    const s = q.toLowerCase();
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(s) ||
        t.owner_email.toLowerCase().includes(s) ||
        t.slug.toLowerCase().includes(s) ||
        t.plan.toLowerCase().includes(s),
    );
  }, [tenants, q]);

  /** Cuota total de peticiones del ciclo = plan + recargas del ciclo. */
  function quotaOf(t: AdminTenant) {
    const plan = planOf(t.plan);
    return plan.limits.requestsPerMonth + (t.extra_requests ?? 0);
  }

  const totals = useMemo(() => {
    const extras = tenants.reduce(
      (a, t) => a + (t.extra_requests ?? 0) + (t.extra_reviews ?? 0) + (t.extra_ai ?? 0) + (t.extra_syncs ?? 0),
      0,
    );
    const used = tenants.reduce((a, t) => a + (t.used_events ?? 0), 0);
    const capped = tenants.filter((t) => (t.used_events ?? 0) >= quotaOf(t)).length;
    return { extras, used, capped };

  }, [tenants]);

  async function impersonate(tenantId: string) {
    const reason = window.prompt('Motivo detallado del acceso de soporte (mín. 10 caracteres):')?.trim();
    if (!reason || reason.length < 10) return;
    const ticket = window.prompt('ID del ticket o incidencia:')?.trim();
    if (!ticket || ticket.length < 3) return;
    await action('/api/admin/impersonate', { tenantId, reason, ticket }, `row-${tenantId}`, 'Sesión de soporte abierta');
  }

  async function action(path: string, body: any, key: string, okTitle: string) {
    setBusy(key);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      toast({ kind: 'success', title: okTitle, body: data.message });
      if (data.url) {
        window.open(data.url, '_blank', 'noopener');
        return;
      }
      setTimeout(() => window.location.reload(), 700);
    } catch (err: any) {
      toast({ kind: 'error', title: 'No se pudo completar', body: err?.message ?? 'Error de red.' });
    } finally {
      setBusy(null);
    }
  }

  const busyRow = (key: string) => busy === key;

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-ink-50">
      <Aurora />
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8">
        {/* ---------- Cabecera ---------- */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tighter text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-500/10 text-brand-300 shadow-[0_0_28px_-12px_rgba(59,118,240,1)]">
                <ShieldCheck size={18} />
              </span>
              Super-Admin
            </h1>
            <p className="mt-1.5 text-sm text-ink-400">
              Sesión <strong className="font-semibold text-ink-200">{email}</strong>
              <span className="mx-1.5 text-ink-600">·</span>
              protegido por middleware +{' '}
              <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">SUPERADMIN_EMAILS</code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="btn-secondary btn-sm">
              <Eye size={15} /> Ver app
            </Link>
            <button className="btn-secondary btn-sm" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> Actualizar
            </button>
          </div>
        </motion.header>

        <AnimatePresence>
          {demo && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm text-amber-100"
            >
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <p>
                <strong className="font-bold">Vista de ejemplo:</strong> estás viendo datos ficticios y ninguna acción afectará a clientes reales. La activación técnica del panel interno está documentada únicamente en las guías privadas de despliegue.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- Métricas ---------- */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Empresas', value: stats.tenants, sub: `${stats.trialCount} en prueba` },
            {
              label: 'MRR',
              value: stats.mrrCents / 100,
              display: stats.mrrFormatted,
              sub: `${stats.activeSubscriptions} suscripciones activas`,
            },
            { label: 'Reseñas', value: stats.reviewsTotal, sub: 'importadas en total' },
            {
              label: 'Tokens de IA (ciclo)',
              value: stats.aiTokensCycle ?? 0,
              sub:
                (stats.aiCostCycleUsd ?? 0) > 0
                  ? `≈ ${(stats.aiCostCycleUsd ?? 0).toFixed(3)} USD · ${stats.aiModel ?? 'gpt-4o-mini'}` +
                    ((stats.aiFallbacksCycle ?? 0) > 0 ? ` · ${stats.aiFallbacksCycle} fallback(s)` : '')
                  : `modelo ${stats.aiModel ?? 'gpt-4o-mini'}`,
            },
            {
              label: 'Eventos consumidos',
              value: totals.used,
              sub: totals.capped > 0 ? `${totals.capped} empresa(s) al límite` : 'ninguna al límite',
            },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.4, ease: EASE }}
              className="card p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{m.label}</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tighter text-white tabular-nums">
                {m.display ?? <CountUp value={m.value} />}
              </p>
              <p className="mt-1 text-2xs text-ink-500">{m.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* ---------- Tabs ---------- */}
        <div className="mt-7 flex flex-wrap items-center gap-1 border-b border-white/[0.07]">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  active ? 'text-white' : 'text-ink-400 hover:text-ink-100',
                )}
              >
                <t.icon size={15} /> {t.label}
                {active && (
                  <motion.span
                    layoutId="admin-tab"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-gradient shadow-[0_0_14px_rgba(59,118,240,0.9)]"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mt-5"
          >
            {/* ================= EMPRESAS ================= */}
            {tab === 'tenants' && (
              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-bold tracking-tightish text-white">
                    Empresas <span className="text-ink-400">({filtered.length})</span>
                  </h2>
                  <div className="relative w-full sm:w-72">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                    <input
                      className="input py-2 pl-9"
                      placeholder="Buscar empresa, email o plan…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      aria-label="Buscar empresas"
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="text-left text-2xs uppercase tracking-wider text-ink-500">
                        <th className="pb-2 font-semibold">Empresa</th>
                        <th className="pb-2 font-semibold">Propietario</th>
                        <th className="pb-2 font-semibold">Plan</th>
                        <th className="pb-2 font-semibold">Estado</th>
                        <th className="pb-2 font-semibold">Reseñas</th>
                        <th className="pb-2 font-semibold">Alta</th>
                        <th className="pb-2 font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((t) => (
                        <tr
                          key={t.id}
                          className={cn(
                            'border-t border-white/[0.06] transition-colors hover:bg-white/[0.025]',
                            busyRow(`row-${t.id}`) && 'opacity-60',
                          )}
                        >
                          <td className="py-2.5 pr-3 align-top">
                            <span className="font-semibold text-white">{t.name}</span>
                            <span className="block text-2xs text-ink-500">/{t.slug}</span>
                            {t.suspended && <span className="badge-danger mt-1.5">suspendida</span>}
                          </td>
                          <td className="py-2.5 pr-3 align-top text-ink-300">{t.owner_email}</td>
                          <td className="py-2.5 pr-3 align-top">
                            <span className="badge whitespace-nowrap">
                              {planOf(t.plan).tier}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <StatusBadge status={t.subscription_status} />
                          </td>
                          <td className="py-2.5 pr-3 align-top text-ink-300 tabular-nums">
                            {t.reviews_count}
                            <span className="block text-2xs text-ink-500">{t.ai_replies_count} con IA</span>
                          </td>
                          <td className="py-2.5 pr-3 align-top text-ink-400 tabular-nums">
                            {new Date(t.created_at).toLocaleDateString('es-ES')}
                          </td>
                          <td className="py-2.5 align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                title="Abrir el panel como esta empresa"
                                className="btn-quiet btn-sm"
                                disabled={!!busy}
                                onClick={() => void impersonate(t.id)}
                              >
                                {busyRow(`row-${t.id}`) ? <Spinner /> : <ExternalLink size={13} />} Acceder
                              </button>
                              <button
                                title={t.suspended ? 'Reactivar acceso' : 'Suspender acceso'}
                                className="btn-quiet btn-sm"
                                disabled={!!busy}
                                onClick={() =>
                                  action(
                                    '/api/admin/tenants',
                                    { tenantId: t.id, op: t.suspended ? 'unsuspend' : 'suspend' },
                                    `row-${t.id}`,
                                    t.suspended ? 'Empresa reactivada' : 'Empresa suspendida',
                                  )
                                }
                              >
                                {t.suspended ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                                {t.suspended ? 'Reactivar' : 'Suspender'}
                              </button>
                              <button
                                title="Eliminar empresa y todos sus datos"
                                className="btn-danger btn-sm"
                                disabled={!!busy}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `¿Eliminar "${t.name}" y TODOS sus datos? Esta acción no se puede deshacer.`,
                                    )
                                  )
                                    action(
                                      '/api/admin/tenants',
                                      { tenantId: t.id, op: 'delete' },
                                      `row-${t.id}`,
                                      'Empresa eliminada',
                                    );
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="py-6 text-center text-sm text-ink-500">
                      Sin resultados para «{q}».
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* ================= SUSCRIPCIONES ================= */}
            {tab === 'subs' && (
              <section className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-bold tracking-tightish text-white">Suscripciones de Stripe</h2>
                  <p className="mt-1 text-sm text-ink-400">
                    El estado se sincroniza por webhooks en{' '}
                    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">
                      /api/stripe/webhook
                    </code>
                    . Prueba de {TRIAL_DAYS} días con tarjeta; si el primer cobro falla, el middleware corta el
                    acceso al panel el día 8 (<code className="font-mono text-2xs">?reason=trial-ended</code>).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-2xs">
                    {(['pro', 'business'] as PlanId[]).map((id) => (
                      <span key={id} className="badge">
                        <strong className="font-bold text-white">{PLANS[id].tier}</strong> ·{' '}
                        {formatEur(PLANS[id].priceCents)}/mes ·{' '}
                        {PLANS[id].limits.requestsPerMonth.toLocaleString('es-ES')} peticiones ·{' '}
                        {PLANS[id].limits.reviewsStored.toLocaleString('es-ES')} opiniones guardadas
                      </span>
                    ))}
                  </div>
                </div>

                {filtered.map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    className={cn('card flex flex-wrap items-center justify-between gap-3 p-4', busyRow(`plan-${t.id}`) && 'opacity-70')}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{t.name}</p>
                      <p className="mt-0.5 truncate font-mono text-2xs text-ink-500">
                        {t.stripe_customer_id ?? 'sin customer id'} · {formatEur(t.mrr_cents)}/mes
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.subscription_status} />
                      <label className="sr-only" htmlFor={`plan-${t.id}`}>
                        Cambiar plan de {t.name}
                      </label>
                      <select
                        id={`plan-${t.id}`}
                        className="select w-auto py-1.5 text-xs"
                        defaultValue={t.plan}
                        disabled={!!busy}
                        onChange={(e) =>
                          action(
                            '/api/admin/tenants',
                            { tenantId: t.id, op: 'set-plan', plan: e.target.value },
                            `plan-${t.id}`,
                            'Plan actualizado',
                          )
                        }
                      >
                        <option value="pro">{PLANS.pro.name} (29 €/mes)</option>
                        <option value="business">{PLANS.business.name} (79 €/mes)</option>
                      </select>
                      {busyRow(`plan-${t.id}`) && <Spinner />}
                    </div>
                  </motion.div>
                ))}
              </section>
            )}

            {/* ================= CUOTAS Y EXTRAS ================= */}
            {tab === 'quota' && (
              <section className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Consumo total del ciclo', value: totals.used },
                    { label: 'Recargas concedidas', value: totals.extras },
                    { label: 'Empresas al 100 % de cuota', value: totals.capped },
                  ].map((m) => (
                    <div key={m.label} className="card p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{m.label}</p>
                      <p className="mt-2 text-3xl font-extrabold tracking-tighter text-white tabular-nums">
                        <CountUp value={m.value} />
                      </p>
                    </div>
                  ))}
                </div>

                <div className="card p-5">
                  <h2 className="font-bold tracking-tightish text-white">Consumo por empresa</h2>
                  <p className="mt-1 text-sm text-ink-400">
                    Cuota del ciclo = peticiones del plan + recargas puntuales compradas. Cuando llega al
                    100 %, las APIs devuelven{' '}
                    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">402</code>{' '}
                    (falta plan/feature),{' '}
                    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">429</code>{' '}
                    (cuota agotada) o{' '}
                    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">507</code>{' '}
                    (tope de filas/almacenamiento).
                  </p>
                  <div className="mt-4 space-y-2">
                    {tenants.length === 0 && <TableSkeleton rows={4} cols={3} />}
                    {filtered.map((t) => {
                      const quota = quotaOf(t);
                      const used = t.used_events ?? 0;
                      const extras =
                        (t.extra_requests ?? 0) + (t.extra_reviews ?? 0) + (t.extra_ai ?? 0) + (t.extra_syncs ?? 0);
                      return (
                        <div
                          key={t.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                            <p className="mt-0.5 text-2xs text-ink-500">
                              {planOf(t.plan).tier} ·{' '}
                              {quota.toLocaleString('es-ES')} peticiones/ciclo
                              {extras > 0 && (
                                <span className="ml-1 text-emerald-300">(+{extras.toLocaleString('es-ES')} extra)</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-2xs tabular-nums text-ink-400">
                              {used.toLocaleString('es-ES')} usados
                            </span>
                            <QuotaBar used={used} quota={quota} />
                            {used >= quota && <span className="badge-danger">bloqueada</span>}
                          </div>
                          {(t.ai_tokens_cycle ?? 0) > 0 && (
                            <div className="w-full border-t border-white/[0.05] pt-2 text-2xs text-ink-500 sm:w-auto sm:border-0 sm:pt-0">
                              <span className="text-ink-400">IA:</span>{' '}
                              <span className="tabular-nums text-white">
                                {(t.ai_tokens_cycle ?? 0).toLocaleString('es-ES')}
                              </span>{' '}
                              / {(t.ai_tokens_limit ?? 0).toLocaleString('es-ES')} tokens ·{' '}
                              <span className="tabular-nums">≈ {(t.ai_cost_cycle ?? 0).toFixed(3)} USD</span>
                              {(t.ai_fallbacks ?? 0) > 0 && (
                                <span className="ml-1 text-amber-200">· {t.ai_fallbacks} fallback(s)</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* ================= LOGS ================= */}
            {tab === 'logs' && (
              <section className="card p-5">
                <h2 className="font-bold tracking-tightish text-white">
                  Logs del sistema <span className="text-ink-400">(últimos {logs.length})</span>
                </h2>
                <p className="mt-1 text-sm text-ink-400">
                  Cada corte de cuota, webhook de Stripe y sincronización queda registrado en{' '}
                  <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-2xs">system_logs</code>.
                </p>
                <div className="mt-4 space-y-1.5">
                  {logs.length === 0 && <TableSkeleton rows={5} cols={2} />}
                  {logs.map((l) => (
                    <div
                      key={l.id}
                      className="flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.025] p-2.5"
                    >
                      <span
                        className={cn(
                          'h-fit shrink-0',
                          l.level === 'error' ? 'badge-danger' : l.level === 'warn' ? 'badge-warn' : 'badge-ok',
                        )}
                      >
                        {l.level}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-2xs text-ink-500">
                          {new Date(l.created_at).toLocaleString('es-ES')} · {l.source}
                        </p>
                        <p className="text-sm text-ink-200">{l.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ================= SISTEMA ================= */}
            {tab === 'system' && (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="card p-5">
                  <h2 className="font-bold tracking-tightish text-white">Estado de integraciones</h2>
                  <p className="mt-1 text-sm text-ink-400">
                    Comprobación automática de los servicios necesarios para operar.
                  </p>
                  <div className="mt-4 divide-y divide-white/[0.06]">
                    {integrations.map((i) => (
                      <div key={i.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 text-ink-200">
                          {i.name}
                          {i.hint && <span className="block text-2xs text-ink-500">{i.hint}</span>}
                        </span>
                        {i.ok ? (
                          <span className="badge-ok shrink-0">
                            <CheckCircle2 size={12} /> listo
                          </span>
                        ) : (
                          <span className="badge-danger shrink-0">
                            <XCircle size={12} /> requiere atención
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="card p-5">
                    <h2 className="font-bold tracking-tightish text-white">Acciones rápidas</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="btn-secondary btn-sm" href="/api/health" target="_blank" rel="noreferrer">
                        Health-check JSON
                      </a>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={!!busy}
                        onClick={() =>
                          action('/api/admin/tenants', { op: 'ping' }, 'ping', 'Conexión con la BD correcta')
                        }
                      >
                        {busyRow('ping') ? <Spinner /> : <ShieldCheck size={15} />} Probar conexión BD
                      </button>
                    </div>
                  </div>

                  <div className="card p-5">
                    <h2 className="font-bold tracking-tightish text-white">Versión y reglas de negocio</h2>
                    <ul className="mt-3 space-y-1.5 text-sm text-ink-300">
                      <li className="flex justify-between gap-3">
                        <span>Versión</span>
                        <strong className="font-mono text-2xs text-white">3.8.0</strong>
                      </li>
                      <li className="flex justify-between gap-3">
                        <span>Prueba gratuita</span>
                        <strong className="text-white">{TRIAL_DAYS} días con tarjeta</strong>
                      </li>
                      <li className="flex justify-between gap-3">
                        <span>Corte de acceso</span>
                        <strong className="text-white">día 8 si no hay pago</strong>
                      </li>
                      <li className="flex justify-between gap-3">
                        <span>Add-ons de cuota</span>
                        <strong className="text-white">inmediatos vía webhook</strong>
                      </li>
                      <li className="flex justify-between gap-3">
                        <span>Webhook Stripe</span>
                        <strong className="font-mono text-2xs text-white">/api/stripe/webhook</strong>
                      </li>
                    </ul>
                  </div>
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
