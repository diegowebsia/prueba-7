'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Gauge,
  Receipt,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { AddonPicker } from '@/components/AddonPicker';
import { QuotaMeter } from '@/components/Quota';
import { QuotaSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { EASE } from '@/components/Motion';
import { describeApiError, type TenantInfo, type UsageResponse } from '@/components/dashboard/types';
import { PLANS, TRIAL_DAYS, formatEur, planOf, resolvePlan } from '@/lib/plans';
import { AiBudget, StorageCaps } from '@/components/Quota';
import type { StorageView } from '@/components/dashboard/types';

/**
 * Pestaña «Facturación y cuota» del panel.
 * - Estado real de la suscripción (plan, trial, impagos).
 * - Consumo del ciclo con desglose por tipo de evento.
 * - Selector de Upgrades (add-ons) conectado a /api/stripe/addon.
 * - Acceso al portal de cliente de Stripe (facturas, tarjeta, cancelar).
 */
export function BillingPanel({
  tenant,
  demo,
  addonResult,
}: {
  tenant?: TenantInfo;
  demo: boolean;
  addonResult?: 'success' | 'canceled' | null;
}) {
  const toast = useToast();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(tenant) && !demo);

  useEffect(() => {
    if (!tenant || demo) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/tenants/usage?tenantId=${encodeURIComponent(tenant.id)}`, {
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          const described = describeApiError(res.status, data);
          toast({ kind: described.kind, title: described.title, body: described.body });
          return;
        }
        if (data?.ok) setUsage(data as UsageResponse);
      } catch (e: any) {
        if (alive) toast({ kind: 'error', title: 'No se pudo leer tu facturación', body: e?.message });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, demo]);

  useEffect(() => {
    if (addonResult === 'success') {
      toast({
        kind: 'success',
        title: 'Ampliación activada',
        body: 'El webhook de Stripe ya sumó los créditos a tu cuota del ciclo actual.',
      });
      window.dispatchEvent(new Event('rf:quota-refresh'));
    }
    if (addonResult === 'canceled') {
      toast({ kind: 'info', title: 'Pago cancelado', body: 'No se ha realizado ningún cargo.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonResult]);

  if (!tenant) {
    return (
      <div className="card p-8 text-center">
        <CreditCard size={26} className="mx-auto text-brand-300" />
        <h2 className="mt-3 text-lg font-bold text-white">Todavía no tienes empresa ni suscripción</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-300">
          Activa tu prueba de {TRIAL_DAYS} días para contratar un plan y, desde aquí, ampliar la cuota
          cuando la necesites.
        </p>
        <Link href="/bienvenido" className="btn-primary mt-5">
          <Zap size={15} /> Elegir plan y empezar
        </Link>
      </div>
    );
  }

  const plan = planOf(tenant.plan);
  const trialActive = tenant.subscription_status === 'trialing';
  const blocked = !tenant.access;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="space-y-5">
      {/* Estado de la suscripción */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="card relative overflow-hidden">
          <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-brand-600/18 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="kicker">Plan contratado</p>
              <h2 className="mt-2 flex items-center gap-2 text-2xl font-extrabold tracking-tighter text-white">
                {plan.name}
                <span className="badge-brand">{plan.tier}</span>
              </h2>
              <p className="mt-1.5 text-sm text-ink-300">
                {formatEur(plan.priceCents)} / mes ·{' '}
                {plan.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones/mes · 1 empresa
              </p>
            </div>
            <StatusBadge status={tenant.subscription_status} suspended={tenant.suspended} />
          </div>

          <div className="relative mt-5 grid gap-2.5 sm:grid-cols-3">
            <InfoTile
              icon={<CalendarClock size={14} />}
              label={trialActive ? 'Prueba hasta' : 'Renovación'}
              value={
                trialActive && tenant.trial_ends_at
                  ? new Date(tenant.trial_ends_at).toLocaleDateString('es-ES')
                  : usage?.renewalLabel ?? '—'
              }
            />
            <InfoTile
              icon={<Gauge size={14} />}
              label="Peticiones del mes"
              value={
                usage
                  ? `${usage.metrics.requests.used} / ${usage.metrics.requests.quota}`
                  : '—'
              }
            />
            <InfoTile
              icon={<Receipt size={14} />}
              label="Almacenamiento"
              value={usage ? `${usage.storage.usedMb} / ${usage.storage.limitMb} MB` : '—'}
            />
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            <a href="/api/stripe/portal" className="btn-secondary btn-sm">
              <CreditCard size={14} /> Portal de facturación (Stripe)
            </a>
            <Link href="/bienvenido" className="btn-quiet btn-sm">
              Cambiar de plan
            </Link>
            <a href="/#planes" className="btn-quiet btn-sm">
              Ver comparativa
            </a>
          </div>

          {trialActive && tenant.trial_ends_at && (
            <p className="relative mt-4 flex items-start gap-2 rounded-xl border border-brand-400/25 bg-brand-500/10 p-3 text-xs text-brand-100">
              <Sparkles size={14} className="mt-0.5 shrink-0" />
              Estás en prueba gratuita hasta el{' '}
              <strong>{new Date(tenant.trial_ends_at).toLocaleDateString('es-ES')}</strong>. Ese día se
              cobra el primer mes con la tarjeta que diste de alta; si no se completa el pago, el
              acceso al panel se pausa automáticamente.
            </p>
          )}
          {blocked && (
            <p className="relative mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              Acceso bloqueado: tu suscripción no está activa ({tenant.subscription_status}). Actualiza
              el pago o contrata un plan para reactivar las integraciones.
            </p>
          )}
        </div>

        {/* Qué incluye el plan */}
        <div className="card">
          <p className="kicker">Qué incluye tu plan</p>
          <ul className="mt-3 space-y-2 text-sm">
            {FEATURE_ROWS.map(([key, label]) => {
              const on = Boolean((plan.features as any)[key]);
              return (
                <li key={key} className="flex items-center gap-2.5">
                  {on ? (
                    <BadgeCheck size={15} className="shrink-0 text-emerald-400" />
                  ) : (
                    <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-ink-600" />
                  )}
                  <span className={on ? 'text-ink-200' : 'text-ink-500 line-through decoration-ink-600/60'}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="divider my-4" />
          <p className="text-xs text-ink-400">
            Cuota mensual: {plan.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones de opiniones ·{' '}
            {plan.limits.reviewsPerMonth.toLocaleString('es-ES')} opiniones ·{' '}
            {plan.limits.aiRepliesPerMonth.toLocaleString('es-ES')} respuestas IA (
            {(plan.limits.aiTokensPerMonth / 1000).toLocaleString('es-ES')}k tokens) ·{' '}
            {plan.limits.syncsPerMonth.toLocaleString('es-ES')} sincronizaciones.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
            <ShieldCheck size={13} className="text-emerald-400" />
            Al agotar una cuota el servidor responde 429 y pausa esa función hasta el siguiente ciclo o
            hasta que amplíes con una recarga puntual.
          </p>
        </div>
      </div>

      {/* Consumo */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold tracking-tightish text-white">Consumo del ciclo actual</h3>
          {usage && (
            <span className="badge">
              ciclo {usage.cycle} · {usage.planLabel}
            </span>
          )}
        </div>
        {loading && !usage ? (
          <div className="mt-4">
            <QuotaSkeleton />
          </div>
        ) : usage ? (
          <div className="mt-4 space-y-5">
            <QuotaMeter
              metrics={usage.metrics}
              cycle={usage.cycle}
              renewalLabel={usage.renewalLabel}
              blockedBy={usage.blockedBy}
            />
            {usage.aiUsage && <AiBudget ai={usage.aiUsage} />}
            <StorageCaps storage={usage.storage as StorageView} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-400">
            {demo
              ? 'Modo demo: conecta Supabase y Stripe para ver tu consumo real.'
              : 'No se pudo cargar el consumo. Recarga la página.'}
          </p>
        )}
      </div>

      {/* Upgrades */}
      <AddonPicker
        variant="dashboard"
        tenantId={tenant.id}
        suggested={
          usage?.blockedBy === 'requests'
            ? 'extra_requests_1000'
            : usage?.blockedBy === 'reviews' || usage?.blockedBy === 'storage'
              ? 'extra_reviews_2000'
              : usage?.blockedBy === 'ai'
                ? 'extra_ai_500'
                : usage?.blockedBy === 'syncs'
                  ? 'extra_syncs_500'
                  : 'extra_requests_1000'
        }
        remaining={usage?.remaining ?? null}
        blocked={Boolean(usage && !usage.allowed)}
        onPurchased={() => window.dispatchEvent(new Event('rf:quota-refresh'))}
      />

      {/* Comparativa rápida */}
      <div className="card">
        <h3 className="text-base font-bold tracking-tightish text-white">¿Se te queda corto el plan?</h3>
        <p className="mt-1 text-sm text-ink-300">
          Pasarte a Business suma tienda conectada, WhatsApp al entregar y{' '}
          {PLANS.business.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones de opiniones al mes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['pro', 'business'] as const).map((id) => {
            const p = PLANS[id];
            const current = resolvePlan(tenant.plan) === id;
            return (
              <div
                key={id}
                className={`rounded-2xl border p-4 transition ${
                  current ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/[0.07] bg-white/[0.02]'
                }`}
              >
                <p className="flex items-center gap-2 text-sm font-bold text-white">
                  {p.name}
                  <span className="badge-brand">{p.tier}</span>
                  {current && <span className="badge-ok ml-auto">tu plan</span>}
                </p>
                <p className="mt-1.5 text-2xl font-extrabold tracking-tighter text-white">
                  {formatEur(p.priceCents)}
                  <span className="text-xs font-medium text-ink-400">/mes</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {p.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones ·{' '}
                  {p.limits.reviewsStored.toLocaleString('es-ES')} opiniones guardadas ·{' '}
                  {p.features.storeIntegration ? 'tienda incluida' : 'sin tienda'}
                </p>
                <p className="mt-1.5 text-2xs font-semibold text-emerald-300">
                  Incluye {TRIAL_DAYS} días de prueba gratis con tarjeta
                </p>
                {!current && (
                  <a href={`/bienvenido?plan=${id}`} className="btn-secondary btn-sm mt-3 w-full">
                    {`Cambiar a ${p.tier}`}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

const FEATURE_ROWS: Array<[string, string]> = [
  ['googleBusiness', 'Google Business Profile (OAuth)'],
  ['googlePlaces', 'Google Places API por Place ID'],
  ['trustpilot', 'Trustpilot Business API'],
  ['aiReplies', 'Borradores de respuesta con IA'],
  ['privateFilter', 'Filtro privado de quejas ≤3★'],
  ['publishToGoogle', 'Publicación directa en Google'],
  ['whatsappAlerts', 'Peticiones y alertas por WhatsApp'],
  ['mapsLinks', 'Enlaces «déjanos una reseña»'],
  ['storeIntegration', 'Conexión con tienda (Shopify/Woo)'],
  ['whatsappOrders', 'WhatsApp al entregar el pedido'],
  ['publicApi', 'API pública de ingesta'],
  ['emailRequests', 'Peticiones de opiniones por email'],
];

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
        <span className="text-brand-300">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status, suspended }: { status: string; suspended: boolean }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Activa', className: 'badge-ok' },
    trialing: { label: 'En prueba', className: 'badge-brand' },
    past_due: { label: 'Pago pendiente', className: 'badge-warn' },
    canceled: { label: 'Cancelada', className: 'badge' },
    inactive: { label: 'Inactiva', className: 'badge' },
    paused: { label: 'Pausada', className: 'badge-warn' },
    none: { label: 'Sin plan', className: 'badge' },
  };
  const info = map[status] ?? { label: status, className: 'badge' };
  if (suspended) return <span className="badge-danger">Cuenta suspendida · contacta con soporte</span>;
  return <span className={info.className}>{info.label}</span>;
}
