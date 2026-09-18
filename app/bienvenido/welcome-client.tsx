'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  Loader2,
  Minus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { PLAN_CATALOG, PLANS, TRIAL_DAYS, formatEur, type PlanId } from '@/lib/plans';
import { EASE } from '@/components/Motion';
import { cn } from '@/lib/utils';

const REASONS: Record<string, { title: string; body: string; tone: 'danger' | 'warn' | 'info' }> = {
  'no-access': {
    title: 'Tu plan no está activo',
    body: 'Impago o cancelación: elige un plan para recuperar el acceso a tu panel. No pierdes ningún dato.',
    tone: 'danger',
  },
  'trial-ended': {
    title: `Tu prueba de ${TRIAL_DAYS} días terminó`,
    body: 'No se completó el primer cobro, así que el acceso al panel quedó pausado. Reactívalo en 1 minuto: no pierdes ningún dato.',
    tone: 'danger',
  },
  'past-due': {
    title: 'Hay un pago pendiente',
    body: 'Stripe no pudo cobrar tu suscripción. Actualiza el método de pago o contrata de nuevo tu plan.',
    tone: 'warn',
  },
  canceled: {
    title: 'Plan cancelado',
    body: 'Puedes volver a activarlo cuando quieras; tus opiniones y ajustes siguen guardados.',
    tone: 'warn',
  },
  suspended: {
    title: 'Cuenta suspendida',
    body: 'Hemos pausado esta cuenta. Contacta con soporte para revisarlo.',
    tone: 'danger',
  },
};

/**
 * Onboarding post-registro con el modelo 100% de pago (2 planes):
 *  · Pro/Business → Checkout de Stripe con 7 días de prueba y tarjeta.
 * La empresa se crea sola vía webhook y el panel queda listo.
 * Sin suscripción activa no hay acceso (las APIs responden 402).
 */
export function WelcomeClient({
  email,
  preselected,
  checkout,
  reason,
  alreadyActive,
  demo,
}: {
  email: string;
  preselected: PlanId;
  checkout?: string;
  reason?: string;
  alreadyActive: boolean;
  demo: boolean;
}) {
  const [plan, setPlan] = useState<PlanId>(PLANS[preselected] ? preselected : 'pro');
  const [busy, setBusy] = useState(false);
  const info = reason ? REASONS[reason] : null;

  const selected = PLANS[plan];

  async function start() {
    // Todos los planes pasan por Stripe (prueba de TRIAL_DAYS días con tarjeta).
    setBusy(true);
    window.location.href = `/api/stripe/checkout?plan=${plan}`;
  }

  if (alreadyActive) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}>
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_40px_-16px_rgba(52,211,153,0.9)]">
            <BadgeCheck size={30} className="text-emerald-300" />
          </span>
          <h1 className="mt-6 text-balance text-3xl font-extrabold tracking-tighter text-white">
            ¡Tu cuenta ya está activa!
          </h1>
          <p className="mt-2 text-ink-300">
            Tu empresa está creada con la cuota de tu plan. Entra al panel y conecta Google para importar
            tus primeras opiniones.
          </p>
          <Link href="/dashboard" className="btn-primary btn-lg mt-7">
            Entrar al panel <ArrowRight size={17} />
          </Link>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="text-center"
      >
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-ink-200">
          <Sparkles size={14} className="text-amber-300" />
          Pro y Business con {TRIAL_DAYS} días de prueba gratis
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
          Elige tu plan{email ? `, ${email.split('@')[0]}` : ''}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-300">
          Dos planes de pago claros: prueba {TRIAL_DAYS} días gratis y quédate con el que tu volumen de opiniones pida. Sin permanencia.
        </p>
      </motion.div>

      {info && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'mx-auto mt-6 flex max-w-xl items-start gap-2.5 rounded-2xl border p-3.5 text-sm',
            info.tone === 'danger'
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-100',
          )}
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-bold">{info.title}.</strong> {info.body}
          </span>
        </motion.p>
      )}

      {checkout === 'canceled' && (
        <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-center text-sm text-amber-100">
          Pago cancelado: no se ha creado ningún cargo. Elige plan cuando quieras.
        </p>
      )}
      {checkout === 'success' && !alreadyActive && (
        <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-brand-400/35 bg-brand-500/10 p-3.5 text-center text-sm text-brand-100">
          Pago confirmado… estamos creando tu empresa (tarda unos segundos).{' '}
          <button onClick={() => window.location.reload()} className="font-bold underline underline-offset-2">
            Recargar
          </button>
        </p>
      )}
      {demo && (
        <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-center text-sm text-ink-300">
          Modo demo (sin Supabase/Stripe): los botones se activan al configurar las claves del
          <code className="mx-1 rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs">.env</code>.
        </p>
      )}

      <div className="mx-auto mt-9 grid max-w-3xl gap-4 lg:grid-cols-2">
        {PLAN_CATALOG.map((p) => {
          const active = plan === p.id;
          const featured = p.id === 'pro';
          return (
            <motion.button
              key={p.id}
              onClick={() => setPlan(p.id)}
              whileTap={{ scale: 0.99 }}
              aria-pressed={active}
              className={cn(
                'card relative flex flex-col overflow-hidden p-6 text-left transition-all duration-300',
                active ? 'ring-gradient bg-brand-500/[0.09] shadow-glow' : 'hover:border-white/20',
              )}
            >
              {featured && (
                <span className="absolute right-4 top-4 rounded-full bg-[linear-gradient(120deg,#2563eb,#8b5cf6)] px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-white">
                  Más popular
                </span>
              )}
              <span className="badge-brand">{p.tier}</span>
              <p className="mt-3 text-base font-bold tracking-tightish text-white">{p.name}</p>
              <p className="mt-2 text-4xl font-extrabold tracking-tighter text-white">
                {formatEur(p.priceCents)}
                <span className="ml-1 text-sm font-medium text-ink-400">/mes</span>
              </p>
              <p className="mt-1.5 text-sm text-ink-300">{p.pitch}</p>

              <ul className="mt-4 space-y-1.5 text-xs text-ink-300">
                <li className="flex items-center gap-2">
                  <Check size={13} className="shrink-0 text-emerald-400" />
                  {p.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones de opiniones/mes
                </li>
                <li className="flex items-center gap-2">
                  <Check size={13} className="shrink-0 text-emerald-400" />
                  {p.limits.reviewsPerMonth.toLocaleString('es-ES')} opiniones y{' '}
                  {p.limits.aiRepliesPerMonth.toLocaleString('es-ES')} respuestas IA/mes
                </li>
                <li className="flex items-center gap-2">
                  <Check size={13} className="shrink-0 text-emerald-400" />
                  {p.limits.reviewsStored.toLocaleString('es-ES')} opiniones guardadas ·{' '}
                  {(p.limits.storageMb / 1024).toFixed(p.limits.storageMb >= 1024 ? 0 : 2)} GB
                </li>
                {[
                  ['googleBusiness', 'Google Business Profile'],
                  ['whatsappAlerts', 'Peticiones por WhatsApp'],
                  ['storeIntegration', 'Tienda + WhatsApp al entregar'],
                ].map(([key, label]) => {
                  const on = Boolean(p.features[key as keyof typeof p.features]);
                  return (
                    <li key={key} className="flex items-center gap-2">
                      {on ? (
                        <Check size={13} className="shrink-0 text-emerald-400" />
                      ) : (
                        <Minus size={13} className="shrink-0 text-ink-600" />
                      )}
                      <span className={on ? '' : 'text-ink-500'}>{label}</span>
                    </li>
                  );
                })}
              </ul>

              <span
                className={cn(
                  'mt-auto pt-4 text-center text-2xs font-bold uppercase tracking-wider',
                  active ? 'text-brand-200' : 'text-ink-500',
                )}
              >
                {active ? '✓ Plan seleccionado' : 'Seleccionar plan'}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="mx-auto mt-8 max-w-3xl text-center">
        <button onClick={start} disabled={busy} className="btn-primary btn-lg w-full sm:w-auto sm:px-14">
          {busy ? (
            <>
              <Loader2 size={17} className="animate-spin" /> Abriendo el pago seguro…
            </>
          ) : (
            <>
              <CreditCard size={17} /> Probar {TRIAL_DAYS} días — {selected.tier}
            </>
          )}
        </button>
        <p className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-400" />
            Pago seguro con Stripe · no se cobra durante la prueba
          </span>
          <Link href="/dashboard?tab=facturacion" className="inline-flex items-center gap-1.5 underline-offset-2 hover:text-white hover:underline">
            ¿Y si necesito más cuota?
          </Link>
        </p>
      </div>
    </main>
  );
}
