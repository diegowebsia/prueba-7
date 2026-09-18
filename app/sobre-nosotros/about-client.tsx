'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Eye,
  Gauge,
  HeartHandshake,
  Plug,
  Scale,
  Send,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { SITE } from '@/lib/site';
import { PLANS, TRIAL_DAYS } from '@/lib/plans';
import { Footer } from '@/components/Footer';
import { Aurora, EASE, Reveal } from '@/components/Motion';

const values = [
  {
    icon: Eye,
    tone: 'text-brand-300',
    title: 'Transparencia radical',
    desc: 'Sin reseñas falsas ni métricas infladas. Cada dato muestra su fuente y su fecha, como exige la Dir. (UE) 2019/2161.',
  },
  {
    icon: ShieldCheck,
    tone: 'text-emerald-300',
    title: 'Privacidad por diseño',
    desc: 'RGPD real: datos alojados en la UE, aislamiento por empresa (RLS) y cookies con consentimiento previo.',
  },
  {
    icon: HeartHandshake,
    tone: 'text-violet-300',
    title: 'El negocio manda',
    desc: 'La IA propone, tú decides. Nada se publica sin tu revisión salvo que actives el piloto automático.',
  },
  {
    icon: Scale,
    tone: 'text-amber-300',
    title: 'Límites claros y medibles',
    desc: 'Cada acción consume eventos de tu cuota y puedes verlos en tiempo real. Sin sorpresas en la factura.',
  },
];

const pipeline = [
  {
    icon: Plug,
    title: 'Conecta',
    desc: 'Google Business Profile, Trustpilot y tu tienda (Shopify, WooCommerce o TPV) vía API.',
    time: '≈ 5 min',
  },
  {
    icon: Bot,
    title: 'La IA redacta',
    desc: 'Borradores con tu tono de marca, y triaje privado de las quejas de ≤3 estrellas.',
    time: '≈ 30 s',
  },
  {
    icon: Send,
    title: 'Publicas',
    desc: 'Un clic y la respuesta sale en la plataforma; el cliente recibe WhatsApp si lo activas.',
    time: '1 clic',
  },
];

const facts: Array<[string, string]> = [
  [`${TRIAL_DAYS} días`, 'prueba gratis con tarjeta'],
  ['~30 s', 'por borrador de IA'],
  ['UE', 'datos alojados'],
  ['24 h', 'respuesta de soporte'],
];

export function AboutClient() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-ink-50">
      <Aurora />
      <header className="nav-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tightish text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <Star size={17} fill="currentColor" />
            </span>
            {SITE.brand}
          </Link>
          <Link href="/" className="btn-ghost btn-sm">
            <ArrowLeft size={15} /> Volver
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        {/* ---------- Hero ---------- */}
        <section className="mx-auto max-w-3xl px-4 pb-6 pt-16 text-center sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <p className="kicker">Sobre nosotros</p>
            <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-tighter text-white sm:text-5xl sm:leading-[1.05]">
              La reputación de tu negocio, en piloto automático{' '}
              <span className="text-gradient">(supervisado)</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-300">
              {SITE.brand} centraliza las reseñas de todas tus plataformas y redacta respuestas con IA
              que suenan como tú. Sin humo: aquí te enseñamos exactamente cómo funciona por dentro y
              qué consume tu cuota.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/registro" className="btn-primary btn-lg">
                Probar gratis {TRIAL_DAYS} días <ArrowRight size={17} />
              </Link>
              <Link href="/#planes" className="btn-secondary btn-lg">
                Ver planes
              </Link>
            </div>
          </motion.div>
        </section>

        {/* ---------- Cómo funciona ---------- */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <Reveal>
            <h2 className="text-center text-2xl font-extrabold tracking-tighter text-white sm:text-3xl">
              Cómo funciona, paso a paso
            </h2>
          </Reveal>
          <div className="relative mt-9 grid gap-4 sm:grid-cols-3">
            <div
              className="pointer-events-none absolute left-[16%] right-[16%] top-9 hidden h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent sm:block"
              aria-hidden
            />
            {pipeline.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.12, duration: 0.5, ease: EASE }}
                className="card card-hover relative p-6 text-center"
              >
                <motion.span
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow"
                >
                  <s.icon size={23} />
                </motion.span>
                <p className="mt-4 text-2xs font-bold uppercase tracking-[0.18em] text-brand-300">
                  Paso {i + 1} · {s.time}
                </p>
                <h3 className="mt-1.5 text-base font-bold tracking-tightish text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink-300">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div className="card mt-6 border-brand-500/25 bg-brand-500/[0.07] p-5 text-sm text-ink-200">
              <span className="flex items-start gap-3">
                <Gauge size={18} className="mt-0.5 shrink-0 text-brand-300" />
                <span>
                  <strong className="font-bold text-white">¿Y las alertas y la cuota?</strong> Cuando
                  entra una reseña de ≤3 estrellas, el negocio recibe un WhatsApp al instante y puede
                  responder en minutos. Cada petición de opinión, opinión importada, respuesta de IA
                  y sincronización consume de su contador mensual
                  ({PLANS.pro.limits.requestsPerMonth} en {PLANS.pro.tier} y{' '}
                  {PLANS.business.limits.requestsPerMonth} en {PLANS.business.tier} peticiones de
                  opiniones), ampliable con recargas puntuales desde el panel.
                </span>
              </span>
            </div>
          </Reveal>
        </section>

        {/* ---------- Valores ---------- */}
        <section className="mx-auto max-w-6xl px-4 py-8">
          <Reveal>
            <h2 className="text-center text-2xl font-extrabold tracking-tighter text-white sm:text-3xl">
              Nuestros valores
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.08, duration: 0.45, ease: EASE }}
                className="card card-hover p-6"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                  <v.icon size={20} className={v.tone} />
                </span>
                <h3 className="mt-4 font-bold tracking-tightish text-white">{v.title}</h3>
                <p className="mt-1.5 text-sm text-ink-300">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------- Datos honestos + CTA ---------- */}
        <section className="mx-auto max-w-4xl px-4 py-16">
          <Reveal>
            <div className="ring-gradient grid gap-6 p-8 text-center shadow-glow-soft sm:grid-cols-4">
              {facts.map(([n, l]) => (
                <div key={l}>
                  <p className="text-3xl font-extrabold tracking-tighter text-white">{n}</p>
                  <p className="mt-1 text-sm text-ink-400">{l}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10 text-center">
              <Link href="/registro" className="btn-primary btn-lg px-10">
                Empezar ahora <ArrowRight size={17} />
              </Link>
              <p className="mt-3.5 text-sm text-ink-400">
                {TRIAL_DAYS} días gratis · Sin permanencia · Cancela cuando quieras
              </p>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
