'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Clock,
  Mail,
  MessageCircle,
  Send,
  Star,
} from 'lucide-react';
import { SITE } from '@/lib/site';
import { PLANS } from '@/lib/plans';
import { Footer } from '@/components/Footer';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Skeleton';
import { Aurora, EASE } from '@/components/Motion';

const CHANNELS = [
  {
    icon: Mail,
    tone: 'text-brand-300',
    title: 'Email directo',
    body: SITE.supportEmail,
    href: `mailto:${SITE.supportEmail}`,
  },
  {
    icon: Clock,
    tone: 'text-emerald-300',
    title: 'Horario de soporte',
    body: 'L–V · 9:00–18:00 (Europa/Madrid)',
  },
  {
    icon: MessageCircle,
    tone: 'text-violet-300',
    title: '¿Ya eres cliente?',
    body: 'Entra a tu panel para soporte prioritario según tu plan.',
    href: '/dashboard',
  },
];

const TOPICS = [
  { id: 'planes', label: 'Planes y facturación' },
  { id: 'integraciones', label: 'Integraciones / API' },
  { id: 'migracion', label: 'Migración desde otra herramienta' },
  { id: 'rgpd', label: 'RGPD y privacidad' },
  { id: 'otro', label: 'Otro asunto' },
];

export function ContactClient() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('planes');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message: `[${topic}] ${message}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error enviando el mensaje.');
      toast({ kind: 'success', title: 'Mensaje enviado', body: data.message ?? 'Te respondemos en menos de 24 h laborables.' });
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: any) {
      toast({
        kind: 'error',
        title: 'No se pudo enviar',
        body: err?.message ?? 'Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      setSending(false);
    }
  }

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
          <Link
            href="/"
            className="btn-ghost btn-sm"
          >
            <ArrowLeft size={15} /> Volver
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <p className="kicker">Contacto</p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tighter text-white sm:text-[2.9rem] sm:leading-[1.05]">
            Hablemos de tu <span className="text-gradient">reputación</span>
          </h1>
          <p className="mt-4 max-w-md text-ink-300">
            Dudas sobre planes, límites de cuota, migraciones o integraciones a medida: escríbenos y
            te respondemos en menos de 24 h laborables.
          </p>

          <div className="mt-7 space-y-3">
            {CHANNELS.map((c, i) => {
              const inner = (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                    <c.icon size={18} className={c.tone} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">{c.title}</span>
                    <span className="block truncate text-sm text-ink-300">{c.body}</span>
                  </span>
                  {c.href && <ArrowRight size={15} className="ml-auto shrink-0 text-ink-500" />}
                </>
              );
              return (
                <motion.div
                  key={c.title}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.08, duration: 0.4, ease: EASE }}
                >
                  {c.href ? (
                    <Link href={c.href} className="card card-hover flex items-center gap-3.5 p-4">
                      {inner}
                    </Link>
                  ) : (
                    <div className="card flex items-center gap-3.5 p-4">{inner}</div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="card mt-6 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-400">
              Soporte incluido en cada plan
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {(['pro', 'business'] as const).map((id) => (
                <li key={id} className="flex items-center gap-2.5 text-ink-200">
                  <BadgeCheck size={15} className="shrink-0 text-emerald-300" />
                  <span>
                    <strong className="font-semibold text-white">{PLANS[id].tier}</strong> ·{' '}
                    {PLANS[id].features.support === 'prioritario'
                      ? 'Soporte prioritario'
                      : PLANS[id].features.support === 'email'
                        ? 'Soporte por email'
                        : 'Ayuda de la comunidad'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: EASE }}
          className="ring-gradient card p-6 shadow-glow-soft sm:p-8"
        >
          <h2 className="text-lg font-bold tracking-tightish text-white">Envíanos un mensaje</h2>
          <p className="mt-1 text-sm text-ink-400">
            Todos los campos son obligatorios. No compartimos tus datos con terceros.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="c-name">
                  Nombre
                </label>
                <input
                  id="c-name"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input mt-1.5"
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="label" htmlFor="c-email">
                  Email
                </label>
                <input
                  id="c-email"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input mt-1.5"
                  placeholder="tu@empresa.com"
                />
              </div>
            </div>

            <fieldset>
              <legend className="label">Asunto</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOPICS.map((t) => {
                  const active = topic === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTopic(t.id)}
                      aria-pressed={active}
                      className={
                        active
                          ? 'rounded-full border border-brand-400/50 bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-100 shadow-[0_0_20px_-10px_rgba(59,118,240,0.9)] transition'
                          : 'rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:border-white/20 hover:text-white'
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label className="label" htmlFor="c-msg">
                Mensaje
              </label>
              <textarea
                id="c-msg"
                required
                minLength={10}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="textarea mt-1.5 resize-y"
                placeholder="Cuéntanos en qué te ayudamos…"
              />
              <AnimatePresence>
                {message.length > 0 && message.length < 10 && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="hint mt-1.5 text-amber-300"
                  >
                    Escribe al menos 10 caracteres ({message.length}/10).
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button type="submit" disabled={sending} className="btn-primary btn-lg w-full">
              {sending ? (
                <Spinner label="Enviando…" />
              ) : (
                <>
                  <Send size={16} /> Enviar mensaje
                </>
              )}
            </button>
            <p className="hint text-center">
              Al enviar aceptas nuestra{' '}
              <Link href="/privacidad" className="text-ink-200 underline underline-offset-2 hover:text-white">
                Política de Privacidad
              </Link>
              .
            </p>
          </form>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
