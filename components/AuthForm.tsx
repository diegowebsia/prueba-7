'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { Aurora, EASE } from '@/components/Motion';
import { PLANS, TRIAL_DAYS, resolvePlan } from '@/lib/plans';
import { SITE } from '@/lib/site';

/**
 * Autenticación unificada (estética premium dark).
 * mode signin → /login · mode signup → /registro (también /login?mode=signup legacy).
 * Acepta `?plan=pro|business` para preseleccionar el plan tras el alta.
 */
export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const redirect = params.get('redirect') || '/dashboard';
  const urlError = params.get('error');
  const reason = params.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planParam = params.get('plan');
  const preselectedPlan = planParam ? PLANS[resolvePlan(planParam)] : null;

  const infoBanner = useMemo(() => {
    if (urlError === 'forbidden')
      return 'No tienes permiso para acceder a esa sección. Si crees que es un error, escribe a soporte.';
    if (reason === 'configure-supabase')
      return 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.';
    if (reason === 'trial-ended')
      return `Tu prueba de ${TRIAL_DAYS} días terminó y el pago no se completó. Vuelve a activar tu plan para entrar al panel.`;
    if (reason === 'past-due')
      return 'Hay un pago pendiente. Actualiza tu método de pago para recuperar el acceso.';
    return null;
  }, [urlError, reason]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({
          kind: 'success',
          title: '¡Cuenta creada!',
          body: 'Elige tu plan de pago: Pro o Business con 7 días de prueba gratis.',
        });
        const plan = params.get('plan');
        const valid = plan === 'pro' || plan === 'business' ? plan : null;
        router.push(valid ? `/bienvenido?plan=${valid}` : '/bienvenido');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ kind: 'success', title: 'Sesión iniciada', body: 'Cargando tu panel…' });
        router.push(redirect);
      }
      router.refresh();
    } catch (err: any) {
      const msg: string = err?.message ?? 'Error de autenticación.';
      const friendly =
        msg.includes('placeholder') || msg.includes('Failed to fetch')
          ? 'Supabase no está configurado en este servidor. Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el .env (ver GUIA_GRATIS.md).'
          : msg === 'Invalid login credentials'
            ? 'Email o contraseña incorrectos. ¿Quizá aún no tienes cuenta?'
            : msg.includes('Password should be at least')
              ? 'La contraseña debe tener al menos 6 caracteres.'
              : msg.includes('already registered')
                ? 'Ese email ya tiene cuenta. Prueba a entrar.'
                : msg;
      setError(friendly);
      toast({ kind: 'error', title: mode === 'signup' ? 'No se pudo crear la cuenta' : 'No se pudo entrar', body: friendly });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen bg-ink-950 text-ink-100 lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.06] p-10 lg:flex">
        <Aurora />
        <Link href="/" className="relative flex items-center gap-2.5 font-bold tracking-tightish text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] shadow-[0_8px_24px_-10px_rgba(37,99,235,0.95)]">
            <Star size={17} fill="currentColor" />
          </span>
          {SITE.brand}
        </Link>

        <div className="relative">
          <p className="kicker">Cómo funciona</p>
          <h2 className="mt-3 max-w-md text-balance text-3xl font-extrabold leading-tight tracking-tighter text-white">
            Tu reputación, atendida en minutos y no en semanas
          </h2>
          <div className="mt-7 max-w-md space-y-3">
            {[
              ['1', 'Conecta Google, Places, Trustpilot o tu tienda'],
              ['2', 'La IA redacta cada respuesta con tu tono'],
              ['3', 'Revisas, publicas y recibes alertas al móvil'],
            ].map(([n, t], i) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.12 + i * 0.09, ease: EASE }}
                className="card card-hover flex items-center gap-3.5 p-3.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] text-sm font-extrabold text-white">
                  {n}
                </span>
                <p className="text-sm font-semibold text-white">{t}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-7 grid max-w-md grid-cols-3 gap-3 text-center">
            {[
              ['2 planes', 'Pro · Business'],
              [`${TRIAL_DAYS} días`, 'de prueba'],
              ['24 h', 'soporte'],
            ].map(([n, l]) => (
              <div key={l} className="panel py-3">
                <p className="text-lg font-extrabold tracking-tightish text-white">{n}</p>
                <p className="mt-0.5 text-2xs text-ink-400">{l}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-ink-500">
          © {new Date().getFullYear()} {SITE.company} ·{' '}
          <Link href="/privacidad" className="underline-offset-2 hover:text-ink-200 hover:underline">Privacidad</Link> ·{' '}
          <Link href="/terminos" className="underline-offset-2 hover:text-ink-200 hover:underline">Términos</Link>
        </p>
      </div>

      {/* Formulario */}
      <div className="relative flex items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(37,99,235,0.14),transparent_70%)] lg:hidden" aria-hidden />
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="relative w-full max-w-md"
        >
          <Link href="/" className="btn-quiet -ml-2 mb-4 inline-flex">
            <ArrowLeft size={15} /> Volver a la web
          </Link>

          <div className="card glow-border p-6 sm:p-8">
            <p className="flex items-center gap-2 font-bold text-white lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#2563eb,#8b5cf6)]">
                <Star size={14} fill="currentColor" />
              </span>
              {SITE.brand}
            </p>

            <h1 className="mt-1 text-2xl font-extrabold tracking-tighter text-white lg:mt-0">
              {mode === 'signup' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
            </h1>
            <p className="mt-1.5 text-sm text-ink-300">
              {mode === 'signup'
                ? 'Elige Pro o Business: tienes 7 días de prueba gratis con tarjeta.'
                : 'Accede a tu panel de reseñas.'}
            </p>

            {preselectedPlan && mode === 'signup' && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand-400/25 bg-brand-500/10 p-3">
                <Sparkles size={16} className="shrink-0 text-brand-300" />
                <p className="text-xs text-brand-100">
                  Plan seleccionado: <strong className="font-bold">{preselectedPlan.name}</strong> ·{' '}
                  {`${preselectedPlan.price}/mes tras la prueba`}{' '}
                  · {preselectedPlan.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones de opiniones/mes
                </p>
              </div>
            )}

            <AnimatePresence>
              {infoBanner && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100"
                >
                  {infoBanner}
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="input"
                />
              </div>

              <div>
                <label className="label" htmlFor="password">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="input pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-400 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? (
                  <Spinner label={mode === 'signup' ? 'Creando cuenta…' : 'Entrando…'} />
                ) : mode === 'signup' ? (
                  <>
                    Crear cuenta gratis <ArrowLeft size={15} className="rotate-180" />
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            {mode === 'signup' && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-500">
                <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                Al registrarte aceptas los{' '}
                <Link href="/terminos" className="underline-offset-2 hover:text-ink-200 hover:underline">Términos</Link>{' '}
                y la{' '}
                <Link href="/privacidad" className="underline-offset-2 hover:text-ink-200 hover:underline">Privacidad</Link>.
              </p>
            )}

            <div className="divider my-5" />

            <p className="text-center text-sm text-ink-400">
              {mode === 'signup' ? (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="font-semibold text-brand-200 transition hover:text-white">
                    Entrar
                  </Link>
                </>
              ) : (
                <>
                  ¿Sin cuenta?{' '}
                  <Link href="/registro" className="font-semibold text-brand-200 transition hover:text-white">
                    Crear cuenta gratis
                  </Link>
                </>
              )}
            </p>
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ShieldCheck size={12} />
            )}
            ¿Problemas para entrar? Escríbenos desde{' '}
            <Link href="/contacto" className="underline-offset-2 hover:text-ink-200 hover:underline">
              contacto
            </Link>{' '}
            y te ayudamos.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
