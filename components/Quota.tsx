'use client';

import { motion } from 'framer-motion';
import { Bot, Database, HardDrive, Newspaper, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsageMetric } from '@/lib/plans';
import { EASE } from '@/components/Motion';

/**
 * Visualización del consumo real del ciclo (lectura de `usage_counters`) y de
 * los TOPES DE BASE DE DATOS por empresa (opiniones guardadas, registros de
 * auditoría y conexiones) definidos en `lib/plans.ts`.
 */

export type MetricQuotaView = {
  used: number;
  quota: number;
  remaining: number;
  allowed: boolean;
  pct: number;
};

export type TableCapView = MetricQuotaView & { label: string; cap: number };

export type StorageView = {
  reviews: TableCapView;
  audit: TableCapView;
  integrations: TableCapView;
  /** Contabilidad de tokens (`ai_interactions`). */
  ai: TableCapView;
  limitMb: number;
  usedMb: number;
  remainingMb: number;
  pct: number;
  logRetentionDays: number;
  purged?: { reviews: number; audit: number; ai: number; logs: number };
};

/** Consumo real de tokens de IA del ciclo y coste estimado (USD). */
export type AiUsageView = {
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  pct: number;
  costUsd: number;
  requests: number;
  model: string;
};

/**
 * Código de color oficial del consumo:
 *   · Verde  → < 70 %   · Amarillo → 70–90 %   · Rojo → > 90 %
 */
export function quotaTone(pctValue: number): 'ok' | 'warn' | 'danger' {
  if (pctValue > 90) return 'danger';
  if (pctValue >= 70) return 'warn';
  return 'ok';
}

const TONE_BAR: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'bg-[linear-gradient(90deg,#10b981,#34d399_60%,#6ee7b7)]',
  warn: 'bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]',
  danger: 'bg-[linear-gradient(90deg,#e11d48,#fb7185)]',
};

const TONE_TEXT: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-200',
  danger: 'text-rose-200',
};

export function quotaLabel(value: number, isUnlimited = false): string {
  return isUnlimited ? '∞' : value.toLocaleString('es-ES');
}

export const METRIC_META: Record<
  UsageMetric,
  { label: string; short: string; icon: React.ReactNode }
> = {
  requests: {
    label: 'Peticiones de opiniones (email/WhatsApp)',
    short: 'Peticiones',
    icon: <Send size={13} />,
  },
  reviews: { label: 'Opiniones importadas', short: 'Opiniones', icon: <Newspaper size={13} /> },
  ai: { label: 'Respuestas con IA', short: 'IA', icon: <Bot size={13} /> },
  syncs: { label: 'Sincronizaciones automáticas', short: 'Syncs', icon: <RefreshCw size={13} /> },
};

/** Orden estable de las 4 cuotas mensuales en la UI. */
export const METRIC_ORDER: UsageMetric[] = ['requests', 'reviews', 'ai', 'syncs'];

/** Medidor de las 4 cuotas mensuales del plan. */
export function QuotaMeter({
  metrics,
  cycle,
  renewalLabel,
  blockedBy,
  className,
  showBreakdown = true,
}: {
  metrics: Partial<Record<UsageMetric, MetricQuotaView>>;
  cycle?: string;
  renewalLabel?: string;
  blockedBy?: UsageMetric | 'storage' | null;
  className?: string;
  showBreakdown?: boolean;
}) {
  const worst = METRIC_ORDER.reduce((max, m) => Math.max(max, metrics[m]?.pct ?? 0), 0);
  const tone = quotaTone(worst);

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <RefreshCw size={14} className={TONE_TEXT[tone]} />
          Tu cuota de este mes
          {cycle && <span className="font-normal text-ink-400">· {cycle}</span>}
        </p>
        <p className={cn('text-xs font-semibold', TONE_TEXT[tone])}>
          {tone === 'ok' ? 'todo en orden' : tone === 'warn' ? 'cerca del límite' : 'límite alcanzado'}
        </p>
      </div>

      {showBreakdown && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_ORDER.map((m) => {
            const data = metrics[m];
            if (!data) return null;
            const mTone = quotaTone(data.pct);
            const isBlocked = blockedBy === m;
            return (
              <div
                key={m}
                className={cn(
                  'rounded-xl border px-3 py-2.5 transition-colors',
                  isBlocked ? 'border-rose-400/40 bg-rose-500/10' : 'border-white/[0.07] bg-white/[0.02]',
                )}
              >
                <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-400">
                  <span className={TONE_TEXT[mTone]}>{METRIC_META[m].icon}</span>
                  {METRIC_META[m].short}
                </p>
                <p className="mt-1 text-sm font-bold tabular-nums text-white">
                  {data.used.toLocaleString('es-ES')}
                  <span className="text-xs font-medium text-ink-500"> / {quotaLabel(data.quota)}</span>
                </p>
                <div
                  className="meter mt-1.5 h-1.5"
                  role="progressbar"
                  aria-valuenow={data.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${METRIC_META[m].label}: ${data.used} de ${data.quota}`}
                >
                  <motion.span
                    className={TONE_BAR[mTone]}
                    initial={{ width: 0 }}
                    animate={{ width: `${data.pct}%` }}
                    transition={{ duration: 0.7, ease: EASE }}
                  />
                </div>
                <p className="mt-1 text-2xs text-ink-500">
                  restan {data.remaining.toLocaleString('es-ES')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <p
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
          tone === 'danger' ? 'text-rose-200' : tone === 'warn' ? 'text-amber-200/90' : 'text-ink-500',
        )}
      >
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            tone === 'ok'
              ? 'bg-emerald-400/15 text-emerald-300'
              : tone === 'warn'
                ? 'bg-amber-400/15 text-amber-300'
                : 'bg-rose-500/15 text-rose-300',
          )}
        >
          {tone === 'ok' ? '✓ consumo bajo' : tone === 'warn' ? '● cerca del límite' : '⛔ límite alcanzado'}
        </span>
        {renewalLabel
          ? `Los contadores se reinician solos el ${renewalLabel}.`
          : 'Los contadores se reinician solos cada mes.'}
        {tone !== 'ok' && ' Puedes ampliar la cuota sin esperar con una recarga puntual.'}
      </p>
    </div>
  );
}

/**
 * Presupuesto de IA: tokens del ciclo, coste estimado y modelo en uso.
 * El límite de tokens es el freno de coste real: aunque queden créditos de IA,
 * al agotar el presupuesto las llamadas se bloquean hasta el siguiente ciclo.
 */
export function AiBudget({ ai, className }: { ai: AiUsageView; className?: string }) {
  const tone = quotaTone(ai.pct);
  const eur = (ai.costUsd * 0.92).toFixed(2); // USD → EUR aproximado para lectura humana

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Bot size={14} className="text-brand-300" />
          Presupuesto de IA
        </p>
        <p className="flex items-center gap-1.5 text-xs text-ink-400">
          <span className={cn('font-bold tabular-nums', TONE_TEXT[tone])}>
            {ai.tokensUsed.toLocaleString('es-ES')}
          </span>
          <span className="text-ink-500">
            / {ai.tokensLimit.toLocaleString('es-ES')} tokens del ciclo
          </span>
        </p>
      </div>

      <div className="meter h-2">
        <motion.span
          className={TONE_BAR[tone]}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, ai.pct)}%` }}
          transition={{ duration: 0.7, ease: EASE }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">Borradores de IA</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-white">
            {ai.requests.toLocaleString('es-ES')}
            <span className="text-xs font-medium text-ink-500"> este ciclo</span>
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">Tokens restantes</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-white">
            {ai.tokensRemaining.toLocaleString('es-ES')}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">Coste estimado</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-white">
            ≈ {eur} €
            <span className="ml-1 text-2xs font-medium text-ink-500">/{ai.model}</span>
          </p>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-ink-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
        Medimos cada llamada (tokens de entrada y salida) para que nunca pagues más de lo previsto:
        si el presupuesto se agota, la IA se pausa hasta el {new Date().getMonth() === 11 ? 'día 1' : 'día 1'} del mes
        siguiente y puedes ampliarla con una recarga.
      </p>
    </div>
  );
}

/**
 * Protección de la base de datos: cuántas filas retiene esta empresa en cada
 * tabla y cuándo se purga automáticamente lo más antiguo.
 */
export function StorageCaps({ storage, className }: { storage: StorageView; className?: string }) {
  const rows: Array<{ key: string; cap: TableCapView; hint: string }> = [
    { key: 'reviews', cap: storage.reviews, hint: 'se purgan las más antiguas al superar el tope' },
    { key: 'audit', cap: storage.audit, hint: 'historial de actividad; se poda por antigüedad y volumen' },
    { key: 'ai', cap: storage.ai, hint: 'registro de cada llamada de IA; se poda por antigüedad' },
    { key: 'integrations', cap: storage.integrations, hint: 'no se purgan: se rechaza la conexión extra' },
  ];
  const tone = quotaTone(storage.pct);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Database size={14} className="text-brand-300" />
          Límites de tu base de datos
        </p>
        <p className="flex items-center gap-1.5 text-xs text-ink-400">
          <HardDrive size={13} className={TONE_TEXT[tone]} />
          <span className={cn('font-bold tabular-nums', TONE_TEXT[tone])}>
            {storage.usedMb.toLocaleString('es-ES')} MB
          </span>
          <span className="text-ink-500">/ {storage.limitMb.toLocaleString('es-ES')} MB activos</span>
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ key, cap, hint }) => {
          const capTone = quotaTone(cap.pct);
          return (
            <div key={key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{cap.label}</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-white">
                {cap.used.toLocaleString('es-ES')}
                <span className="text-xs font-medium text-ink-500"> / {cap.cap.toLocaleString('es-ES')} filas</span>
              </p>
              <div className="meter mt-1.5 h-1.5">
                <motion.span
                  className={TONE_BAR[capTone]}
                  initial={{ width: 0 }}
                  animate={{ width: `${cap.pct}%` }}
                  transition={{ duration: 0.7, ease: EASE }}
                />
              </div>
              <p className="mt-1 text-2xs text-ink-500">{hint}</p>
            </div>
          );
        })}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-ink-500">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
        Purga automática activa: tu historial de actividad se conserva {storage.logRetentionDays} días y
        cada tabla tiene un tope por empresa. Así tu plan nunca dispara sobrecostes en Supabase/PostgreSQL.
      </p>
    </div>
  );
}
