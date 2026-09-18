'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Crown,
  Globe,
  MessageSquareQuote,
  Rocket,
  ShoppingBag,
  SlidersHorizontal,
  Smile,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { EASE } from '@/components/Motion';
import { cn } from '@/lib/utils';

/**
 * Asistente de alta en 4 pasos (v3.7.0 — "Paso a Paso" visual).
 * Textos largos sustituidos por iconos explicativos + una línea de ayuda.
 * Indicador de progreso con estados (pendiente · activo · completado).
 */

const PLATFORMS = [
  { id: 'google', name: 'Google', icon: Globe, desc: 'Business con 1 clic (OAuth) o Places por Place ID' },
  { id: 'trustpilot', name: 'Trustpilot', icon: Star, desc: 'API key del plan Business' },
  { id: 'tienda', name: 'Tienda online', icon: ShoppingBag, desc: 'Shopify, WooCommerce o TPV por webhook' },
];

const TONES = [
  { id: 'profesional', name: 'Profesional', icon: MessageSquareQuote, desc: 'Cordial y resolutivo' },
  { id: 'cercano', name: 'Cercano', icon: Smile, desc: 'Amable y próximo' },
  { id: 'formal', name: 'Formal', icon: Crown, desc: 'Distinguido y serio' },
] as const;

const STEPS = [
  { icon: Building2, title: 'Empresa', hint: 'Ponle nombre a tu negocio' },
  { icon: Globe, title: 'Fuentes', hint: 'De dónde vienen tus reseñas' },
  { icon: SlidersHorizontal, title: 'Tono IA', hint: 'Cómo suenan tus respuestas' },
  { icon: Rocket, title: 'Lanzar', hint: 'Revisa y crea' },
];

export function Wizard() {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['google']);
  const [tone, setTone] = useState<(typeof TONES)[number]['id']>('profesional');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(id: string) {
    setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function canNext() {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return platforms.length > 0;
    return true;
  }

  function next() {
    if (!canNext()) {
      toast({
        kind: 'warning',
        title: step === 0 ? 'Escribe el nombre de tu negocio' : 'Elige al menos una plataforma',
      });
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function finish() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if ((res.status === 402 || res.status === 403) && data.checkoutUrl) {
          toast({
            kind: 'warning',
            title: res.status === 402 ? 'Necesitas una suscripción activa' : 'Límite del plan',
            body: data.error,
            action: { label: 'Ir a activar', onClick: () => (window.location.href = data.checkoutUrl) },
            duration: 9000,
          });
          return;
        }
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      try {
        localStorage.setItem('rf-tone', tone);
        localStorage.setItem('rf-platforms', JSON.stringify(platforms));
      } catch {
        /* sin almacenamiento: continuar igual */
      }
      toast({
        kind: 'success',
        title: '¡Empresa creada!',
        body: `${name.trim()} ya está lista. Recargando el panel…`,
      });
      setTimeout(() => window.location.reload(), 700);
    } catch (e: any) {
      const msg = e?.message ?? 'No se pudo crear la empresa.';
      setError(msg);
      toast({ kind: 'error', title: 'No se pudo crear la empresa', body: msg });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card ring-gradient relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-brand-600/20 blur-3xl" aria-hidden />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tightish text-white">
          <Rocket size={19} className="text-brand-300" /> Configura tu empresa en 1 minuto
        </h2>
        <span className="badge-brand">
          Paso {step + 1} de {STEPS.length}
        </span>
      </div>

      {/* Paso a paso: iconos + progreso + estado (pendiente/activo/completado) */}
      <div className="relative mt-6 flex items-start">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.title} className="relative flex flex-1 flex-col items-center">
              {/* Conector */}
              {i < STEPS.length - 1 && (
                <div className="absolute left-1/2 top-[1.35rem] h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.div
                    className="h-full bg-[linear-gradient(90deg,#2563eb,#8b5cf6)]"
                    initial={false}
                    animate={{ width: i < step ? '100%' : '0%' }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </div>
              )}
              <motion.button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                whileTap={i < step ? { scale: 0.94 } : undefined}
                className={cn(
                  'relative z-10 flex h-[2.7rem] w-[2.7rem] items-center justify-center rounded-2xl border transition-all duration-300',
                  done
                    ? 'cursor-pointer border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                    : active
                      ? 'border-brand-400/70 bg-[linear-gradient(140deg,rgba(59,118,240,0.35),rgba(139,92,246,0.25))] text-white shadow-[0_10px_28px_-12px_rgba(37,99,235,0.95)]'
                      : 'cursor-not-allowed border-white/10 bg-white/[0.03] text-ink-500',
                )}
                aria-current={active ? 'step' : undefined}
                aria-label={`Paso ${i + 1}: ${s.title}${done ? ' (completado)' : ''}`}
              >
                {done ? <Check size={18} strokeWidth={3} /> : <s.icon size={18} />}
              </motion.button>
              <p
                className={cn(
                  'mt-1.5 text-xs font-bold tracking-tight',
                  done ? 'text-emerald-300' : active ? 'text-white' : 'text-ink-500',
                )}
              >
                {s.title}
              </p>
              <p className="hidden text-2xs text-ink-500 sm:block">{active ? s.hint : ''}</p>
            </div>
          );
        })}
      </div>

      <div className="relative mt-6 min-h-[210px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            {step === 0 && (
              <div>
                <StepIntro
                  icon={<Building2 size={16} />}
                  title="¿Cómo se llama tu negocio?"
                  hint="Así aparecerá en tus respuestas, en el panel y en las alertas."
                />
                <input
                  id="wz-name"
                  className="input"
                  placeholder="Ej. Mi Negocio S.L."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </div>
            )}

            {step === 1 && (
              <div>
                <StepIntro
                  icon={<Globe size={16} />}
                  title="¿De dónde quieres importar reseñas?"
                  hint="Puedes elegir varias. Las claves se vinculan después en «Empresa y conexiones»."
                />
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {PLATFORMS.map((p) => {
                    const active = platforms.includes(p.id);
                    return (
                      <motion.button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlatform(p.id)}
                        whileTap={{ scale: 0.98 }}
                        aria-pressed={active}
                        className={cn(
                          'rounded-2xl border p-3.5 text-left transition-all duration-300',
                          active
                            ? 'border-brand-400/60 bg-brand-500/12 shadow-[0_0_30px_-16px_rgba(59,118,240,0.95)]'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]',
                        )}
                      >
                        <p className="flex items-center gap-2">
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition',
                              active
                                ? 'border-brand-400/50 bg-brand-500/20 text-brand-200'
                                : 'border-white/10 bg-white/[0.04] text-ink-400',
                            )}
                          >
                            <p.icon size={15} />
                          </span>
                          <span className="text-sm font-bold text-white">{p.name}</span>
                          <span
                            className={cn(
                              'ml-auto flex h-5 w-5 items-center justify-center rounded-full border transition',
                              active ? 'border-brand-400 bg-brand-500 text-white' : 'border-white/20 text-transparent',
                            )}
                          >
                            <Check size={12} strokeWidth={3} />
                          </span>
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{p.desc}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <StepIntro
                  icon={<SlidersHorizontal size={16} />}
                  title="¿Cómo debe sonar tu IA?"
                  hint="Puedes cambiarlo cuando quieras desde «Empresa y conexiones»."
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  {TONES.map((t) => (
                    <motion.button
                      key={t.id}
                      type="button"
                      onClick={() => setTone(t.id)}
                      whileTap={{ scale: 0.99 }}
                      aria-pressed={tone === t.id}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-300',
                        tone === t.id
                          ? 'border-brand-400/60 bg-brand-500/12'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition',
                          tone === t.id
                            ? 'border-brand-400/50 bg-brand-500/20 text-brand-200'
                            : 'border-white/10 bg-white/[0.04] text-ink-400',
                        )}
                      >
                        <t.icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-bold text-white">
                          {t.name}
                          {tone === t.id && <Check size={13} strokeWidth={3} className="text-brand-300" />}
                        </span>
                        <span className="block truncate text-xs text-ink-400">{t.desc}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="font-bold text-white">Todo listo 🎉</p>
                <ul className="mt-3 space-y-2.5 text-sm text-ink-300">
                  <li className="flex items-center gap-2.5">
                    <StepIcon tone="brand"><Building2 size={14} /></StepIcon>
                    Empresa: <strong className="text-white">{name.trim()}</strong>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <StepIcon tone="brand"><Globe size={14} /></StepIcon>
                    Fuentes: <strong className="text-white">{platforms.join(', ')}</strong>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <StepIcon tone="brand"><SlidersHorizontal size={14} /></StepIcon>
                    Tono IA:{' '}
                    <strong className="text-white">{TONES.find((t) => t.id === tone)?.name}</strong>
                  </li>
                </ul>

                {creating && (
                  <div className="mt-4 space-y-2" aria-busy="true">
                    <span className="skeleton block h-3 w-2/3" />
                    <span className="skeleton block h-3 w-1/2" />
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100"
                    >
                      <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-2">
        <button
          className="btn-secondary"
          disabled={step === 0 || creating}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft size={15} /> Atrás
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn-primary" disabled={!canNext()} onClick={next}>
            Siguiente <ArrowRight size={15} />
          </button>
        ) : (
          <button className="btn-primary" disabled={creating || !canNext()} onClick={finish}>
            {creating ? <Spinner label="Creando…" /> : (<><Rocket size={15} /> Crear mi empresa</>)}
          </button>
        )}
      </div>
    </div>
  );
}

function StepIntro({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="mb-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-brand-300">
          {icon}
        </span>
        {title}
      </p>
      <p className="mt-1 pl-9 text-xs text-ink-400">{hint}</p>
    </div>
  );
}

function StepIcon({ tone, children }: { tone: 'brand'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
        tone === 'brand' ? 'border-brand-400/40 bg-brand-500/15 text-brand-300' : '',
      )}
    >
      {children}
    </span>
  );
}
