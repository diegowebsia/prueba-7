'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  CreditCard,
  Gauge,
  MapPin,
  Minus,
  Plug,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { SITE } from '@/lib/site';
import { Footer } from '@/components/Footer';
import { Accordion } from '@/components/Accordion';
import { AddonPicker } from '@/components/AddonPicker';
import { Aurora, EASE, GlowCard, Reveal, fadeUp } from '@/components/Motion';
import { PLANS, PLAN_CATALOG, TRIAL_DAYS } from '@/lib/plans';

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

/* v3.7.0 — Esquema visual de 3 pasos (menos texto, más claridad). */
const flowSteps = [
  {
    icon: Plug,
    step: '1',
    title: 'Conecta',
    desc: 'Vincula Google Maps o tu tienda (Shopify / WooCommerce) en unos clics. Tus reseñas y pedidos empiezan a fluir solos.',
    tag: 'Google Maps · Shopify · WooCommerce',
  },
  {
    icon: Bot,
    step: '2',
    title: 'Automatiza',
    desc: 'Configura una vez tus plantillas de WhatsApp y la ingesta de reseñas. La IA redacta cada respuesta con el tono de tu marca.',
    tag: 'WhatsApp · Plantillas IA · Ingesta',
  },
  {
    icon: TrendingUp,
    step: '3',
    title: 'Crece',
    desc: 'Filtra las opiniones negativas en privado y destaca las positivas. Tu reputación crece con cada reseña respondida.',
    tag: 'Filtro privado · Reputación',
  },
];

const bento = [
  {
    icon: Gauge,
    title: 'Cuotas reales, no promesas',
    desc: 'Cada reseña importada, cada respuesta de IA y cada WhatsApp descuentan un evento en base de datos. Al llegar al 100% el servidor corta con 429 y te ofrece ampliar al instante.',
    span: 'lg:col-span-2',
    accent: 'from-brand-500/25 to-transparent',
  },
  {
    icon: Bot,
    title: 'IA medida, sin sorpresas',
    desc: 'Cada borrador pasa por un cliente de IA con reintentos y límite de velocidad. El sistema cuenta los tokens que consumes y los compara con el presupuesto de tu plan: si se agota, la IA se pausa y sigues respondiendo con plantillas. Nunca te llega un cargo raro.',
    span: '',
    accent: 'from-brand-400/20 to-transparent',
  },
  {
    icon: ShieldCheck,
    title: 'Filtro privado de quejas',
    desc: 'Las malas experiencias se gestionan en privado: mensaje conciliador, plan de acción y nota de seguimiento. Nunca confrontas a un cliente enfadado en público.',
    span: '',
    accent: 'from-amber-400/20 to-transparent',
  },
  {
    icon: ShoppingBag,
    title: 'WhatsApp al entregar',
    desc: 'Tu tienda avisa al sistema cuando un pedido se entrega y el cliente recibe la petición de valoración con tu enlace de Google. Automático, en el mejor momento.',
    span: '',
    accent: 'from-emerald-400/20 to-transparent',
  },
  {
    icon: BadgeCheck,
    title: 'Cumplimiento UE real',
    desc: 'Solo reseñas reales de plataformas oficiales, con fuente y verificación visible (Dir. UE 2019/2161), RGPD por diseño y datos alojados en la UE.',
    span: 'lg:col-span-2',
    accent: 'from-violet-500/20 to-transparent',
  },
];

const faqs = [
  {
    q: '¿Puedo probar antes de pagar?',
    a: `Sí. Todos los planes de pago incluyen ${TRIAL_DAYS} días de prueba gratis: conectas la tarjeta vía Stripe y usas todo sin pagar. Si cancelas antes del día ${TRIAL_DAYS + 1}, no se te cobra nada.`,
  },
  {
    q: `¿Cómo funciona la prueba de ${TRIAL_DAYS} días de Pro y Business?`,
    a: `Al elegir Pro o Business conectas la tarjeta vía Stripe y durante ${TRIAL_DAYS} días usas todo sin pagar. Si cancelas antes del día ${TRIAL_DAYS + 1}, no se te cobra nada. Sin suscripción activa no hay acceso a la plataforma.`,
  },
  {
    q: '¿Qué límites tengo cada mes?',
    a: 'Cuatro contadores sencillos: peticiones de opiniones (email/WhatsApp), opiniones guardadas del mes, respuestas generadas con IA y sincronizaciones automáticas con tus fuentes. En el panel ves cada contador con su porcentaje y cuándo se reinicia.',
  },
  {
    q: '¿Qué pasa cuando alcanzo un límite?',
    a: 'El servidor deja de procesar esa función y responde con un aviso claro (429) indicando cuándo se reinicia el contador. No se pierde nada: sigues viendo y respondiendo lo ya importado, y puedes ampliar con una recarga puntual desde el panel.',
  },
  {
    q: '¿Cómo protege mi base de datos? ¿Se borran mis datos?',
    a: 'Cada plan fija un máximo de opiniones retenidas, de registros de auditoría y de conexiones por empresa. Al superarlo, las filas más antiguas se purgan o archivan automáticamente para que la base de datos nunca se sature, y el panel te avisa con el espacio disponible. Si necesitas conservar más histórico, amplías almacenamiento o subes de plan.',
  },
  {
    q: '¿Cómo funcionan las recargas (paquetes de ampliación)?',
    a: 'Son de pago único y se consumen en el ciclo en curso: +1.000 peticiones (9 €), +2.000 opiniones (12 €), +500 respuestas IA (15 €) y +500 sincronizaciones (6 €). Las marcas en el panel, pagas con Stripe y la capacidad se activa al instante. Sin suscripciones paralelas ni cargos recurrentes.',
  },
  {
    q: '¿Cómo funciona la IA y qué me cuesta?',
    a: 'Usa gpt-4o-mini, el modelo más económico de OpenAI: lee la reseña, tu tono y los datos de tu negocio, y escribe el borrador en segundos (o un aviso privado si la reseña es de 1 a 3★). Va incluida en tu plan con un presupuesto de tokens al mes (250.000 en Pro / 1.200.000 en Business); si se agota, la IA se pausa hasta el día 1 o hasta que compres la recarga de IA. Nunca pagas de más por sorpresa.',
  },
  {
    q: '¿Qué pasa si el proveedor de IA falla?',
    a: 'La plataforma reintenta la llamada con espera creciente y, si aun así no responde, genera el borrador con una plantilla profesional local. El panel sigue funcionando y tú nunca te quedas sin poder contestar.',
  },
  {
    q: '¿Las respuestas de la IA se publican solas?',
    a: 'No. La IA prepara borradores (públicos o privados para las quejas) y tú los revisas y publicas en un clic. En reseñas de Google conectadas por OAuth, la publicación es directa en la plataforma.',
  },
  {
    q: '¿Las reseñas son reales? ¿Cumplís la normativa?',
    a: 'Sí. Solo importamos reseñas reales de las plataformas oficiales, mostramos siempre la fuente y marcamos las compras verificadas (Directiva UE 2019/2161). Jamás inventamos ni compramos reseñas.',
  },
  {
    q: '¿Mis datos están seguros? ¿Cumplís el RGPD?',
    a: 'Sí. Datos alojados en la UE, cifrado en tránsito y en reposo, aislamiento por empresa (Row Level Security), acceso al panel solo con suscripción activa y aviso legal, privacidad, términos y cookies adaptados al RGPD/LOPDGDD.',
  },
];

const marqueeItems = [
  'Google Business Profile',
  'Google Places API',
  'Trustpilot Business',
  'WhatsApp Cloud API',
  'Shopify',
  'WooCommerce',
  'Stripe Billing',
  'OpenAI',
  'Supabase',
  'RGPD · Dir. UE 2019/2161',
];

/* ------------------------------------------------------------------ */
/* Landing                                                             */
/* ------------------------------------------------------------------ */

export function Landing() {

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink-950 text-ink-100">
      {/* NAV */}
      <header className="nav-blur sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="group flex items-center gap-2.5 font-bold tracking-tightish text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] text-white shadow-[0_8px_24px_-10px_rgba(37,99,235,0.95)] transition-transform duration-300 group-hover:scale-105">
              <Star size={17} fill="currentColor" />
            </span>
            {SITE.brand}
          </Link>

          <nav className="hidden items-center gap-1 text-sm text-ink-300 md:flex">
            {[
              ['Cómo funciona', '#como-funciona'],
              ['Producto', '#funciones'],
              ['Planes', '#planes'],
              ['Ampliaciones', '#ampliaciones'],
              ['FAQ', '#faq'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-quiet hidden sm:inline-flex">
              Entrar
            </Link>
            <Link href="/registro" className="btn-primary btn-sm sm:btn">
              Probar {TRIAL_DAYS} días
              <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <Aurora />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:pt-24">
          <motion.div {...fadeUp} initial="hidden" animate="show" transition={{ duration: 0.5 }}>
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-ink-200">
              <Sparkles size={14} className="text-amber-300" />
              Prueba {TRIAL_DAYS} días gratis · Sin permanencia · Cuotas reales
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease: EASE }}
            className="mx-auto mt-7 max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tighter text-white sm:text-6xl md:text-[4.25rem]"
          >
            Todas tus reseñas.{' '}
            <span className="text-gradient">Respondidas con IA</span> antes de que enfríen.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
            className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-ink-300"
          >
            Centraliza Google, Trustpilot y tus tiendas en una sola bandeja, responde en segundos con
            el tono de tu marca y pide valoraciones por WhatsApp en cada entrega. Con límites medidos
            evento a evento, sin sorpresas en la factura.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href="/registro" className="btn-primary btn-lg group w-full sm:w-auto">
              Probar {TRIAL_DAYS} días gratis
              <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <a href="#como-funciona" className="btn-secondary btn-lg w-full sm:w-auto">
              Ver cómo funciona
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink-400"
          >
            <span className="inline-flex items-center gap-1.5">
              <CreditCard size={14} /> Con tarjeta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-emerald-400" /> No se cobra nada en la prueba
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-brand-300" /> Datos en la UE
            </span>
          </motion.p>

          {/* Mockup del panel */}
          <motion.div
            initial={{ opacity: 0, y: 56, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.85, delay: 0.38, ease: EASE }}
            className="relative mx-auto mt-16 max-w-4xl"
          >
            <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(59,118,240,0.28),transparent_70%)] blur-2xl" aria-hidden />
            <div className="glass overflow-hidden rounded-[1.4rem] text-left shadow-[0_50px_120px_-50px_rgba(2,6,23,1)]">
              <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-3 rounded-md bg-white/[0.05] px-3 py-1 font-mono text-2xs text-ink-400">
                  {SITE.domain.replace(/[[\]]/g, '') || 'tu-dominio.com'}/dashboard
                </span>
                <span className="badge-ok ml-auto hidden sm:inline-flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> en vivo
                </span>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-[0.95fr_1.25fr]">
                <div className="space-y-3">
                  {[
                    { n: 'Google Business', l: 'OAuth conectado', d: 'sincronizado hace 2 min', ok: true },
                    { n: 'Trustpilot', l: 'API Business activa', d: 'sincronizado hoy', ok: true },
                  ].map((s) => (
                    <div key={s.n} className="panel">
                      <p className="flex items-center gap-2 text-sm font-bold text-white">
                        {s.n}
                        <span className="badge-ok ml-auto">
                          <Check size={11} strokeWidth={3} /> {s.ok ? 'ok' : '—'}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">{s.l}</p>
                      <p className="mt-1 text-2xs text-emerald-300/90">{s.d}</p>
                    </div>
                  ))}
                  <div className="panel">
                    <p className="flex items-center justify-between text-xs font-semibold text-ink-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Gauge size={13} className="text-brand-300" /> Cuota del ciclo
                      </span>
                      <span className="tabular-nums text-white">184 / 300</span>
                    </p>
                    <div className="meter mt-2">
                      <motion.span
                        className="bg-[linear-gradient(90deg,#2563eb,#5f92fb_55%,#8b5cf6)]"
                        initial={{ width: 0 }}
                        animate={{ width: '61%' }}
                        transition={{ duration: 1.1, delay: 0.9, ease: EASE }}
                      />
                    </div>
                    <p className="mt-1.5 text-2xs text-ink-500">97 reseñas · 71 IA · 16 WhatsApp</p>
                  </div>
                </div>

                <div className="panel">
                  <p className="flex items-center gap-2 text-sm font-bold text-white">
                    <Bot size={15} className="text-brand-300" /> Borrador IA listo
                    <span className="badge-brand ml-auto">~4 s</span>
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} size={13} className="fill-amber-400 text-amber-400" />
                      ))}
                    </span>
                    <span className="badge">google · verificada</span>
                  </div>
                  <p className="mt-2.5 rounded-xl border border-brand-400/25 bg-brand-500/10 p-3 text-sm leading-relaxed text-brand-100">
                    «Hola Marta, muchísimas gracias por tu reseña. Nos alegra saber que el trato del
                    equipo te hizo sentir como en casa. ¡Te esperamos pronto! — La Brasa»
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="btn-primary btn-sm">
                      <Send size={13} /> Publicar en Google
                    </span>
                    <span className="btn-secondary btn-sm">Editar</span>
                    <span className="btn-quiet btn-sm ml-auto">Gestión privada</span>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -9, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="glass absolute -right-2 -top-7 hidden rounded-2xl px-4 py-3 shadow-lift sm:block"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <TrendingUp size={14} className="text-emerald-400" /> Alerta WhatsApp
              </p>
              <p className="text-xs text-ink-400">reseña 2★ gestionada en 6 min</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* MARQUESINA */}
      <section className="relative border-y border-white/[0.06] bg-white/[0.015] py-4">
        <div className="marquee flex gap-10 whitespace-nowrap text-sm font-medium text-ink-400">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 items-center gap-10" aria-hidden={k === 1}>
              {marqueeItems.map((b) => (
                <span key={b} className="flex items-center gap-2">
                  <Star size={12} className="text-ink-600" /> {b}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* CÓMO FUNCIONA — v3.7.0: esquema visual de 3 pasos */}
      <section id="como-funciona" className="relative mx-auto max-w-6xl px-4 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="kicker">Cómo funciona</p>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
            Tres pasos y tu reputación trabaja sola
          </h2>
          <p className="mt-3 text-ink-300">
            Conecta · Automatiza · Crece. Sin manual, sin letra pequeña.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-5 md:grid-cols-3">
          {/* Línea conectora entre pasos */}
          <div
            className="pointer-events-none absolute left-[16%] right-[16%] top-[4.4rem] hidden h-0.5 bg-[linear-gradient(90deg,transparent,rgba(59,118,240,0.55)_25%,rgba(139,92,246,0.55)_75%,transparent)] md:block"
            aria-hidden
          />
          {flowSteps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              <GlowCard className="relative flex h-full flex-col items-center p-7 text-center">
                <div className="relative">
                  <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-[linear-gradient(140deg,rgba(59,118,240,0.32),rgba(139,92,246,0.2))] text-brand-100 shadow-[0_16px_40px_-16px_rgba(37,99,235,0.95)]">
                    <s.icon size={30} strokeWidth={1.8} />
                  </span>
                  <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2563eb,#8b5cf6)] text-sm font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,1)]">
                    {s.step}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold tracking-tightish text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{s.desc}</p>
                <p className="mt-4 text-2xs font-semibold uppercase tracking-wider text-brand-300/80">{s.tag}</p>
              </GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FUNCIONES (bento) */}
      <section id="funciones" className="relative border-y border-white/[0.06] bg-white/[0.012] py-24">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="kicker">Producto</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
              Todo lo que necesitas para que una reseña nunca se quede sin respuesta
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {bento.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.07} className={b.span}>
                <GlowCard className="relative h-full overflow-hidden p-6">
                  <div
                    className={`pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br ${b.accent} blur-2xl`}
                    aria-hidden
                  />
                  <div className="relative">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-brand-200">
                      <b.icon size={18} />
                    </span>
                    <h3 className="mt-4 text-base font-bold tracking-tightish text-white">{b.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-300">{b.desc}</p>
                  </div>
                </GlowCard>
              </Reveal>
            ))}
          </div>

          {/* Gestión privada destacada */}
          <Reveal delay={0.1} className="mt-4">
            <GlowCard className="grid gap-6 p-7 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <p className="kicker">Filtro privado</p>
                <h3 className="mt-2 text-xl font-bold tracking-tightish text-white">
                  Las quejas se resuelven en privado, las alabanzas se celebran en público
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">
                  Las reseñas de 3★ o menos entran en una cola de gestión privada: la IA inspecciona
                  la queja (severidad, categoría, riesgo de reclamación), redacta un mensaje
                  conciliador y propone un plan de acción. Tu equipo anota el seguimiento y nada de
                  eso se publica.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-ink-200">
                  {[
                    'Mensaje privado conciliador con tu tono',
                    'Severidad y riesgo legal detectados automáticamente',
                    'Nota de seguimiento interna por reseña',
                    'Alerta inmediata al móvil del responsable',
                  ].map((x) => (
                    <li key={x} className="flex items-start gap-2.5">
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-ink-950/60 p-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  <ShieldCheck size={14} /> Gestión privada · 2★
                </p>
                <p className="mt-2 text-sm text-ink-200">
                  «Me cambiaron la cita dos veces sin avisar. Espero que mejoren.»
                </p>
                <div className="mt-3 space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs">
                  <p className="flex items-center justify-between text-ink-300">
                    Severidad <span className="badge-warn">alta</span>
                  </p>
                  <p className="flex items-center justify-between text-ink-300">
                    Categoría <span className="text-white">Trato al cliente</span>
                  </p>
                  <p className="flex items-center justify-between text-ink-300">
                    Canal sugerido <span className="text-white">Llamada telefónica</span>
                  </p>
                  <p className="pt-1 text-ink-400">
                    Plan: llamar hoy, reconocer el fallo, ofrecer nueva cita preferente y dejar nota
                    en la reseña.
                  </p>
                </div>
              </div>
            </GlowCard>
          </Reveal>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="planes" className="relative py-24">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="kicker">Planes</p>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
              Planes de pago con {TRIAL_DAYS} días de prueba gratis.
            </h2>
            <p className="mt-3 text-ink-300">
              Dos planes claros, sin letra pequeña: Pro (29&nbsp;€) y Business (79&nbsp;€), ambos
              con {TRIAL_DAYS} días de prueba gratis con tarjeta. Sin suscripción activa no hay
              acceso. Cambia o cancela cuando quieras desde el panel.
            </p>
          </Reveal>

          <div className="mx-auto mt-10 grid max-w-4xl gap-5 lg:grid-cols-2">
            {PLAN_CATALOG.map((p, i) => {
              const featured = p.id === 'pro';
              return (
                <Reveal key={p.id} delay={i * 0.1} className="h-full">
                  <div
                    className={`card relative flex h-full flex-col p-7 ${
                      featured ? 'ring-gradient bg-[linear-gradient(165deg,rgba(37,99,235,0.16),rgba(124,58,237,0.08)_45%,rgba(255,255,255,0.01))] shadow-glow-lg' : ''
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(120deg,#2563eb,#8b5cf6)] px-3 py-1 text-2xs font-bold uppercase tracking-wider text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,1)]">
                        Más popular
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="badge-brand">{p.tier}</span>
                      <span className="badge-ok">{TRIAL_DAYS} días de prueba gratis</span>
                      {p.features.support === 'prioritario' && <span className="badge">soporte prioritario</span>}
                    </div>
                    <h3 className="mt-3 text-lg font-bold tracking-tightish text-white">{p.name}</h3>
                    <p className="mt-1.5 flex items-end gap-1.5">
                      <span className="text-5xl font-extrabold tracking-tighter text-white">{p.price}</span>
                      <span className="pb-1.5 text-sm text-ink-400">/mes</span>
                    </p>
                    <p className="mt-2 text-sm text-ink-300">{p.pitch}</p>

                    <ul className="mt-5 space-y-2.5 text-sm">
                      <PlanRow
                        label={`${p.limits.requestsPerMonth.toLocaleString('es-ES')} peticiones de opiniones/mes`}
                        ok
                      />
                      <PlanRow
                        label={`${p.limits.reviewsStored.toLocaleString('es-ES')} opiniones guardadas`}
                        ok
                      />
                      <PlanRow label="Filtro privado IA (≤3★)" ok={p.features.privateFilter} />
                      <PlanRow
                        label="Google Business + Places API"
                        ok={p.features.googleBusiness || p.features.googlePlaces}
                      />
                      <PlanRow label="Respuestas publicadas en Google" ok={p.features.publishToGoogle} />
                      <PlanRow label="Peticiones de opiniones por WhatsApp" ok={p.features.whatsappAlerts} />
                      <PlanRow label="Conexión tienda + WhatsApp al entregar" ok={p.features.storeIntegration} />
                      <PlanRow label={`Soporte ${p.features.support}`} ok />
                    </ul>

                    {/* Desglose animado */}
                    <div className="mt-5">
                      <Accordion
                        exclusive
                        items={[
                          {
                            id: `plan-${p.id}`,
                            title: 'Ver qué incluye en detalle',
                            icon: <Sparkles size={15} />,
                            content: (
                              <ul className="space-y-3 pt-1 text-sm">
                                {PLAN_DETAIL[p.id].map(([t, d]) => (
                                  <li key={t} className="flex gap-2.5">
                                    <BadgeCheck size={16} className="mt-0.5 shrink-0 text-brand-300" />
                                    <span>
                                      <strong className="font-semibold text-white">{t}.</strong>{' '}
                                      <span className="text-ink-300">{d}</span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ),
                          },
                        ]}
                        itemClassName="bg-white/[0.02]"
                      />
                    </div>

                    <Link
                      href={`/registro?plan=${p.id}`}
                      className={`mt-6 w-full ${featured ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      <CreditCard size={15} />
                      {`Probar ${TRIAL_DAYS} días gratis`}
                    </Link>
                    <p className="mt-2.5 text-center text-2xs text-ink-500">
                      {`Después ${p.price}/mes · cancela en 2 clics desde el panel`}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* AMPLIACIONES */}
          <div id="ampliaciones" className="mx-auto mt-10 max-w-4xl scroll-mt-24">
            <Reveal>
              <AddonPicker variant="landing" />
            </Reveal>
          </div>

          {/* Comparativa de límites (desplegable, fuera del flujo principal) */}
          <Reveal delay={0.06} className="mx-auto mt-10 max-w-4xl">
            <Accordion
              items={[
                {
                  id: 'limits-compare',
                  title: 'Ver comparativa completa de límites por plan',
                  icon: <Gauge size={15} />,
                  content: (
                    <div className="overflow-x-auto pt-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-2xs uppercase tracking-wider text-ink-400">
                            <th className="px-3 py-2 font-semibold">Límite</th>
                            {PLAN_CATALOG.map((p) => (
                              <th key={p.id} className="px-3 py-2 font-semibold">
                                {p.tier}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="text-ink-200">
                          {[
                            ['Peticiones de opiniones/mes', ...PLAN_CATALOG.map((p) => p.limits.requestsPerMonth)],
                            ['Opiniones importadas/mes', ...PLAN_CATALOG.map((p) => p.limits.reviewsPerMonth)],
                            ['Respuestas IA/mes', ...PLAN_CATALOG.map((p) => p.limits.aiRepliesPerMonth)],
                            ['Presupuesto de IA (tokens/mes)', ...PLAN_CATALOG.map((p) => p.limits.aiTokensPerMonth)],
                            ['Sincronizaciones automáticas/mes', ...PLAN_CATALOG.map((p) => p.limits.syncsPerMonth)],
                            ['Opiniones guardadas (tope)', ...PLAN_CATALOG.map((p) => p.limits.reviewsStored)],
                            ['Almacenamiento activo (MB)', ...PLAN_CATALOG.map((p) => p.limits.storageMb)],
                            ['Conexiones simultáneas', ...PLAN_CATALOG.map((p) => p.limits.integrations)],
                          ].map(([label, ...values]) => (
                            <tr key={label as string} className="border-t border-white/[0.06]">
                              <td className="px-3 py-2 text-ink-300">{label}</td>
                              {values.map((v, idx) => (
                                <td key={idx} className="px-3 py-2 font-semibold tabular-nums text-white">
                                  {Number(v).toLocaleString('es-ES')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ),
                },
              ]}
              itemClassName="bg-white/[0.02]"
            />
          </Reveal>

          <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-ink-400">
            <Zap size={15} className="text-brand-300" /> ¿Dudas? Escríbenos en{' '}
            <Link href="/contacto" className="font-semibold text-brand-200 underline-offset-4 hover:underline">
              contacto
            </Link>{' '}
            — respondemos en 24 h laborables.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-24">
        <Reveal className="text-center">
          <p className="kicker">FAQ</p>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-3 text-ink-300">Todo lo que suele preguntarse antes de contratar.</p>
        </Reveal>

        <Reveal delay={0.06} className="mt-10">
          <Accordion
            exclusive
            defaultOpen={0}
            items={faqs.map((f, i) => ({
              id: `faq-${i}`,
              title: f.q,
              content: <p className="text-sm leading-relaxed text-ink-300">{f.a}</p>,
              meta: i < 3 ? 'Facturación' : i < 6 ? 'Producto' : 'Legal y datos',
            }))}
          />
        </Reveal>
      </section>

      {/* CTA FINAL */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(37,99,235,0.9),rgba(124,58,237,0.85))] p-10 text-center shadow-glow-lg sm:p-16">
            <div className="hero-grid absolute inset-0 opacity-25" aria-hidden />
            <div className="absolute -bottom-24 left-1/2 h-56 w-[36rem] -translate-x-1/2 rounded-full bg-white/20 blur-[100px]" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">
                Tu próxima reseña, respondida en minutos y no en semanas
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-balance text-brand-50/90">
                {TRIAL_DAYS} días gratis. Conecta Google, recibe tu primera alerta y publica tu primera
                respuesta con IA hoy mismo.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/registro" className="btn-light btn-lg group w-full sm:w-auto">
                  Probar {TRIAL_DAYS} días gratis
                  <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link href="/contacto" className="btn btn-lg w-full border border-white/25 bg-white/10 text-white hover:bg-white/20 sm:w-auto">
                  Hablar con nosotros
                </Link>
              </div>
              <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/70">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={12} /> Datos en la UE
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={12} /> RGPD + Dir. UE 2019/2161
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard size={12} /> Sin cobro durante la prueba
                </span>
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

const PLAN_DETAIL: Record<string, Array<[string, string]>> = {
  pro: [
    ['Captura de opiniones', 'Importa tus reseñas de Google (OAuth 1-clic), Google Places (por Place ID) y Trustpilot (API) a una sola bandeja.'],
    ['Filtro privado con IA', 'Las malas experiencias (≤3★) se marcan para gestión privada: inspección de la queja, mensaje conciliador interno y alerta al instante.'],
    ['Respuestas publicadas en Google', 'Borradores con tu tono en segundos; publicas en un clic y la respuesta se escribe directamente en la plataforma.'],
    ['Enlaces de Maps', 'Genera tu enlace «déjanos una reseña» con tu Place ID para pedir valoraciones en el mostrador o por WhatsApp.'],
    ['Cuota clara', `${PLANS.pro.limits.requestsPerMonth} peticiones de opiniones y ${PLANS.pro.limits.reviewsPerMonth} opiniones al mes, ${PLANS.pro.limits.aiRepliesPerMonth} respuestas IA y ${PLANS.pro.limits.syncsPerMonth} sincronizaciones automáticas (cada 6 h).`],
    ['Peticiones por email y WhatsApp', 'Envía tu enlace de Google a los clientes por email o WhatsApp y mide cada petición.'],
    ['Sincronización y almacenamiento', `Sincronización automática cada 6 h y hasta ${PLANS.pro.limits.reviewsStored.toLocaleString('es-ES')} opiniones retenidas (${(PLANS.pro.limits.storageMb / 1024).toFixed(0)} GB).`],
  ],
  business: [
    ['Conexión con tu tienda', 'Shopify, WooCommerce o cualquier TPV vía API con verificación HMAC: detectamos el pedido entregado automáticamente.'],
    ['WhatsApp al entregar', 'Cuando un pedido pasa a «Entregado/Completado», el cliente recibe un WhatsApp pidiendo su valoración con tu enlace de Google.'],
    ['Cuota ampliada', `${PLANS.business.limits.requestsPerMonth} peticiones de opiniones, ${PLANS.business.limits.reviewsPerMonth} opiniones y ${PLANS.business.limits.aiRepliesPerMonth} respuestas IA al mes, con sincronización cada hora.`],
    ['Almacenamiento de empresa', `Hasta ${PLANS.business.limits.reviewsStored.toLocaleString('es-ES')} opiniones retenidas (${(PLANS.business.limits.storageMb / 1024).toFixed(0)} GB) y ${PLANS.business.limits.integrations} conexiones simultáneas.`],
    ['API completa', 'Ingesta de reseñas y eventos de pedido con la api_key de tu empresa para integraciones a medida.'],
    ['Soporte prioritario', 'Respuesta el mismo día laborable y ayuda con la conexión de tu tienda y tus plantillas de WhatsApp.'],
  ],
};

function PlanRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      {ok ? (
        <Check size={15} className="shrink-0 text-emerald-400" />
      ) : (
        <Minus size={15} className="shrink-0 text-ink-600" />
      )}
      <span className={ok ? 'text-ink-200' : 'text-ink-500 line-through decoration-ink-600/60'}>{label}</span>
    </li>
  );
}
