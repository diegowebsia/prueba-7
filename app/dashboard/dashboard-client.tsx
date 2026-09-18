'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  CircleHelp,
  CreditCard,
  Filter,
  Gauge,
  Inbox,
  LogOut,
  Plus,
  Rocket,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { ReviewListSkeleton, StatSkeleton } from '@/components/Skeleton';
import { HelpCenter } from '@/components/HelpCenter';
import { Wizard } from '@/components/Wizard';
import { CountUp, EASE } from '@/components/Motion';
import { TenantCard } from '@/components/dashboard/TenantCard';
import { TriageCard } from '@/components/dashboard/TriageCard';
import { ReviewCard } from '@/components/dashboard/ReviewCard';
import { BillingPanel } from '@/components/dashboard/BillingPanel';
import { FunnelPanel } from '@/components/dashboard/FunnelPanel';
import type { TenantInfo } from '@/components/dashboard/types';
import { TRIAL_DAYS, planOf } from '@/lib/plans';
import type { DemoReview } from '@/lib/demo';
import { cn } from '@/lib/utils';

export type { TenantInfo };

type TabId = 'bandeja' | 'empresa' | 'embudo' | 'facturacion';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'bandeja', label: 'Bandeja', icon: <Inbox size={15} /> },
  { id: 'empresa', label: 'Empresa y conexiones', icon: <Building2 size={15} /> },
  { id: 'embudo', label: 'Embudo', icon: <Filter size={15} /> },
  { id: 'facturacion', label: 'Facturación y cuota', icon: <CreditCard size={15} /> },
];

export function DashboardClient({
  tenants,
  reviews,
  demo,
  userEmail,
  hasAccess,
  hasAnyTenant,
  tab: initialTab = 'bandeja',
  addonResult,
}: {
  tenants: TenantInfo[];
  reviews: DemoReview[];
  demo: boolean;
  userEmail: string;
  hasAccess: boolean;
  hasAnyTenant: boolean;
  tab?: TabId;
  addonResult?: 'success' | 'canceled' | null;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [filter, setFilter] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Aviso de vuelta de Stripe (add-on comprado o cancelado).
  useEffect(() => {
    if (addonResult === 'success') {
      toast({
        kind: 'success',
        title: 'Ampliación de cuota activada',
        body: 'Stripe confirmó el pago y los créditos ya están sumados a tu ciclo actual.',
      });
    }
    if (addonResult === 'canceled') {
      toast({ kind: 'info', title: 'Pago cancelado', body: 'No se ha realizado ningún cargo.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addonResult]);

  const filtered = useMemo(
    () =>
      reviews.filter((r) => {
        const replied = r.replied || publishedIds.has(r.id);
        if (onlyPending && replied) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          r.author.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q) ||
          r.tenant.toLowerCase().includes(q)
        );
      }),
    [reviews, filter, onlyPending, publishedIds],
  );

  const flagged = useMemo(
    () => reviews.filter((r) => r.flagged_private || (r.rating <= 3 && !r.replied && !publishedIds.has(r.id))),
    [reviews, publishedIds],
  );

  const stats = useMemo(() => {
    const total = reviews.length;
    const pending = reviews.filter((r) => !r.replied && !publishedIds.has(r.id)).length;
    const avg = total ? Number((reviews.reduce((a, r) => a + r.rating, 0) / total).toFixed(1)) : 0;
    const negative = reviews.filter((r) => r.rating <= 3).length;
    return { total, pending, avg, negative };
  }, [reviews, publishedIds]);

  function toneFor(review: DemoReview): 'profesional' | 'cercano' | 'formal' {
    const t = tenants.find((x) => x.id === review.tenant_id)?.settings?.tone;
    if (t === 'cercano' || t === 'formal' || t === 'profesional') return t;
    try {
      const local = localStorage.getItem('rf-tone');
      if (local === 'cercano' || local === 'formal' || local === 'profesional') return local;
    } catch {
      /* noop */
    }
    return 'profesional';
  }

  async function sync(provider: 'google' | 'trustpilot' | 'tripadvisor' | 'places', tenantId: string) {
    setSyncing(`${provider}-${tenantId}`);
    const endpoint =
      provider === 'trustpilot'
        ? '/api/integrations/trustpilot/sync'
        : provider === 'tripadvisor'
          ? '/api/integrations/tripadvisor/sync'
          : '/api/integrations/google/sync';
    const payload =
      provider === 'trustpilot' || provider === 'tripadvisor'
        ? { tenantId }
        : { tenantId, provider: provider === 'places' ? 'places' : 'business' };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data?.error ?? `Error ${res.status}`;
        toast({
          kind: res.status === 429 || res.status === 402 ? 'warning' : 'error',
          title:
            res.status === 429
              ? 'Cuota agotada: sincronización bloqueada'
              : res.status === 402
                ? 'Suscripción sin acceso'
                : res.status === 403
                  ? 'No incluido en tu plan'
                  : 'Sincronización fallida',
          body: message,
          action:
            res.status === 429
              ? { label: 'Ampliar cuota', onClick: () => setTab('facturacion') }
              : res.status === 402
                ? { label: 'Activar plan', onClick: () => (window.location.href = '/bienvenido') }
                : undefined,
          duration: 8000,
        });
        return;
      }

      toast({
        kind: 'success',
        title: data.quotaCut ? 'Sincronización parcial (cuota al límite)' : 'Sincronización completa',
        body: data.message ?? `${data.imported ?? 0} reseñas importadas.`,
      });
      window.dispatchEvent(new Event('rf:quota-refresh'));
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Sincronización fallida', body: e?.message });
    } finally {
      setSyncing(null);
    }
  }

  const canAddCompany = hasAccess && tenants.length < 1;
  const primaryTenant = tenants[0];

  return (
    <div className="relative min-h-screen bg-ink-950 text-ink-100">
      {/* Header */}
      <header className="nav-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="group flex items-center gap-2.5 font-bold tracking-tightish text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] shadow-[0_8px_24px_-10px_rgba(37,99,235,0.95)] transition-transform duration-300 group-hover:scale-105">
              <Star size={17} fill="currentColor" />
            </span>
            <span className="hidden sm:inline">Panel</span>
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-[220px] truncate text-ink-400 lg:inline">{userEmail}</span>
            {primaryTenant && (
              <span className="badge-brand hidden sm:inline-flex">
                {planOf(primaryTenant.plan).tier}
              </span>
            )}
            <a href="/api/stripe/portal" className="btn-secondary btn-sm">
              <CreditCard size={14} /> Suscripción
            </a>
            <button onClick={() => setHelpOpen(true)} className="btn-quiet btn-sm" aria-label="Abrir ayuda">
              <CircleHelp size={14} /> <span className="hidden sm:inline">Ayuda</span>
            </button>
            <form action="/api/auth/signout" method="post">
              <button className="btn-quiet btn-sm">
                <LogOut size={14} /> Salir
              </button>
            </form>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-6xl px-4">
          <div className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-sm font-semibold transition-colors duration-200',
                    active ? 'text-white' : 'text-ink-400 hover:text-ink-100',
                  )}
                >
                  {t.icon}
                  {t.label}
                  {active && (
                    <motion.span
                      layoutId="dash-tab"
                      transition={{ duration: 0.3, ease: EASE }}
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[linear-gradient(90deg,#2563eb,#8b5cf6)] shadow-[0_0_16px_-2px_rgba(59,118,240,0.95)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-64 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(37,99,235,0.12),transparent_70%)]" aria-hidden />

        {demo && (
          <div className="card flex items-start gap-3 border-amber-400/25 bg-amber-400/[0.07]">
            <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-300" />
            <div className="text-sm">
              <p className="font-bold text-white">Modo demo</p>
              <p className="mt-0.5 text-ink-300">
                Estás viendo datos de ejemplo. Conecta Supabase + Stripe (ver{' '}
                <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs">GUIA_GRATIS.md</code>)
                para usar tu panel real con cuotas y cobros.
              </p>
            </div>
          </div>
        )}

        {/* Sin suscripción y sin empresa → activar prueba */}
        {!demo && !hasAccess && !hasAnyTenant && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="card ring-gradient relative overflow-hidden p-9 text-center"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[34rem] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[100px]" aria-hidden />
            <div className="relative">
              <span className="badge-brand mx-auto">
                <Sparkles size={12} /> Paso 2 de 2
              </span>
              <h1 className="mt-4 text-balance text-3xl font-extrabold tracking-tighter text-white">
                Elige tu plan y empieza
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-300">
                Tu cuenta ya está creada. Elige Pro o Business con {TRIAL_DAYS} días de prueba gratis:
                tu empresa se activa al instante tras el pago.
              </p>
              <Link href="/bienvenido" className="btn-primary btn-lg mt-6">
                <CreditCard size={17} /> Elegir plan y empezar
              </Link>
            </div>
          </motion.div>
        )}

        {/* Con empresa pero sin acceso → paywall */}
        {!demo && !hasAccess && hasAnyTenant && (
          <div className="card border-rose-400/30 bg-rose-500/[0.08] p-6 text-center">
            <ShieldAlert size={26} className="mx-auto text-rose-300" />
            <p className="mt-3 text-lg font-bold tracking-tightish text-white">Tu suscripción está en pausa</p>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-ink-300">
              Las integraciones están bloqueadas hasta que actualices tu método de pago o
              contrates un plan. Tus datos siguen intactos.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href="/api/stripe/portal" className="btn-light">
                <CreditCard size={15} /> Actualizar pago
              </a>
              <Link href="/bienvenido" className="btn-secondary">
                Cambiar de plan
              </Link>
              <button onClick={() => setTab('facturacion')} className="btn-quiet">
                Ver facturación
              </button>
            </div>
          </div>
        )}

        <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />

        <AnimatePresence mode="wait">
          {/* ---------------- BANDEJA ---------------- */}
          {tab === 'bandeja' && (
            <motion.div
              key="bandeja"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-5"
            >
              {/* Stats */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {!hydrated ? (
                  Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
                ) : (
                  [
                    { label: 'Reseñas en bandeja', value: stats.total, icon: <Inbox size={14} />, tone: 'text-brand-300' },
                    { label: 'Pendientes', value: stats.pending, icon: <Gauge size={14} />, tone: 'text-amber-300' },
                    { label: 'Nota media', value: stats.avg, suffix: '★', icon: <Star size={14} />, tone: 'text-emerald-300', decimals: true },
                    { label: 'Quejas ≤3★', value: stats.negative, icon: <ShieldAlert size={14} />, tone: 'text-rose-300' },
                  ].map((s) => (
                    <div key={s.label} className="card card-hover">
                      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                        <span className={s.tone}>{s.icon}</span>
                        {s.label}
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tracking-tighter text-white">
                        {s.decimals ? (
                          <>{s.value ? s.value.toFixed(1).replace('.', ',') : '—'}{s.value ? <span className="ml-1 text-base text-ink-500">★</span> : null}</>
                        ) : (
                          <CountUp value={s.value} />
                        )}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Cola de gestión privada */}
              {(hasAccess || demo) && flagged.length > 0 && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="flex items-center gap-2 text-base font-bold tracking-tightish text-white">
                        <ShieldAlert size={16} className="text-amber-300" /> Gestión privada
                        <span className="badge-warn">{flagged.length}</span>
                      </h2>
                      <p className="mt-1 text-sm text-ink-400">
                        Quejas para resolver en privado antes de responder en público. La IA inspecciona
                        la reclamación y redacta el mensaje conciliador.
                      </p>
                    </div>
                  </div>
                  {flagged.map((r) => (
                    <TriageCard
                      key={r.id}
                      review={r}
                      demo={demo}
                      tone={toneFor(r)}
                      businessName={r.tenant}
                    />
                  ))}
                </section>
              )}

              {/* Filtros */}
              {(hasAccess || demo) && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                    <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                    <input
                      className="input pl-10"
                      placeholder="Buscar por autor, texto o empresa…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      aria-label="Buscar reseñas"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-ink-200 transition hover:border-white/20">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={onlyPending}
                      onChange={(e) => setOnlyPending(e.target.checked)}
                    />
                    Solo pendientes
                  </label>
                  <span className="ml-auto text-xs text-ink-500">
                    {filtered.length} de {reviews.length}
                  </span>
                </div>
              )}

              {/* Reseñas */}
              {(hasAccess || demo) && (
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {filtered.map((r) => (
                      <ReviewCard
                        key={r.id}
                        review={r}
                        draft={drafts[r.id]}
                        published={publishedIds.has(r.id)}
                        tone={toneFor(r)}
                        onDraftChange={(id, value) => setDrafts((d) => ({ ...d, [id]: value }))}
                        onPublished={(id) => setPublishedIds((s) => new Set(s).add(id))}
                      />
                    ))}
                  </AnimatePresence>

                  {filtered.length === 0 && (
                    <div className="card p-10 text-center">
                      <Inbox size={26} className="mx-auto text-ink-500" />
                      <p className="mt-3 font-bold text-white">Sin reseñas por aquí</p>
                      <p className="mx-auto mt-1 max-w-md text-sm text-ink-400">
                        {reviews.length === 0
                          ? 'Conecta Google Business, Google Places o Trustpilot en la pestaña «Empresa y conexiones» para importar tus reseñas reales.'
                          : 'Ninguna coincide con el filtro aplicado.'}
                      </p>
                      {reviews.length === 0 && (
                        <button onClick={() => setTab('empresa')} className="btn-secondary mt-4">
                          <Building2 size={15} /> Ir a conexiones
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-ink-500">
                Transparencia (Dir. UE 2019/2161): cada reseña muestra su fuente y verificación.{' '}
                <Link href="/terminos" className="underline-offset-2 hover:text-ink-200 hover:underline">Términos</Link> ·{' '}
                <Link href="/contacto" className="underline-offset-2 hover:text-ink-200 hover:underline">Soporte</Link>
              </p>
            </motion.div>
          )}

          {/* ---------------- EMPRESA ---------------- */}
          {tab === 'empresa' && (
            <motion.div
              key="empresa"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold tracking-tightish text-white">
                    <Building2 size={16} className="text-brand-300" /> Mi empresa
                  </h2>
                  <p className="mt-1 text-sm text-ink-400">
                    Conexiones reales, ajustes de la IA y destinos de WhatsApp.
                  </p>
                </div>
                {canAddCompany ? (
                  <button onClick={() => setShowWizard((v) => !v)} className="btn-secondary btn-sm">
                    <Plus size={14} /> Añadir empresa
                  </button>
                ) : (
                  hasAccess && (
                    <span className="text-xs text-ink-400">
                      Cada plan incluye 1 empresa ·{' '}
                      <Link href="/bienvenido" className="text-brand-200 underline underline-offset-2">
                        cambiar de plan
                      </Link>
                    </span>
                  )
                )}
              </div>

              <AnimatePresence initial={false}>
                {showWizard && canAddCompany && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1">
                      <Wizard />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {tenants.length === 0 && !demo && (
                <div className="card p-10 text-center">
                  <Rocket size={26} className="mx-auto text-brand-300" />
                  <p className="mt-3 font-bold text-white">Todavía no tienes empresa creada</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-400">
                    Se crea automáticamente al activar tu suscripción. Si ya pagaste y no aparece,
                    recarga la página en unos segundos (el webhook de Stripe tarda poco).
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Link href="/bienvenido" className="btn-primary">
                      <CreditCard size={15} /> Activar suscripción
                    </Link>
                    <button onClick={() => window.location.reload()} className="btn-secondary">
                      Recargar
                    </button>
                  </div>
                </div>
              )}

              {tenants.map((t) => (
                <TenantCard key={t.id} tenant={t} syncing={syncing} onSync={sync} demo={demo} />
              ))}

              {demo && tenants.length > 0 && (
                <p className="text-xs text-ink-500">
                  Modo demo: las conexiones se activan al configurar Supabase y las claves de cada
                  proveedor. Paso a paso resumido en el botón{' '}
                  <button type="button" onClick={() => setHelpOpen(true)} className="font-semibold text-brand-200 underline-offset-2 hover:underline">
                    Ayuda
                  </button>{' '}
                  de la cabecera.
                </p>
              )}
            </motion.div>
          )}

          {/* ---------------- EMBUDO ---------------- */}
          {tab === 'embudo' && (
            <motion.div
              key="embudo"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-4"
            >
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold tracking-tightish text-white">
                  <Filter size={16} className="text-brand-300" /> Embudo Privado de Satisfacción
                </h2>
                <p className="mt-1 text-sm text-ink-400">
                  Tu enlace público clasifica cada voto: 4-5★ salen a las plataformas y 1-3★ llegan como
                  ticket privado con aviso inmediato.
                </p>
              </div>
              {tenants.length === 0 && !demo && (
                <div className="card p-10 text-center">
                  <p className="font-bold text-white">Crea tu empresa para activar el embudo</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-ink-400">
                    El enlace público aparece aquí en cuanto actives tu suscripción.
                  </p>
                </div>
              )}
              {tenants.map((t) => (
                <FunnelPanel key={t.id} tenant={t} demo={demo} />
              ))}
            </motion.div>
          )}

          {/* ---------------- FACTURACIÓN ---------------- */}
          {tab === 'facturacion' && (
            <motion.div
              key="facturacion"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <BillingPanel tenant={primaryTenant} demo={demo} addonResult={addonResult} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Esqueleto de página completa (Suspense fallback del servidor). */
export function DashboardLoading() {
  return (
    <div className="min-h-screen bg-ink-950 p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <ReviewListSkeleton rows={3} />
      </div>
    </div>
  );
}
