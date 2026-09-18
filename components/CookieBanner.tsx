'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { useConsent } from '@/lib/consent';

/**
 * Banner de cookies RGPD/ePrivacy:
 * - Sin decisión → banner visible, CERO scripts de terceros cargados.
 * - Aceptar / Rechazar / Configurar (granular: analítica, marketing).
 * - Reabrible desde el footer y /cookies.
 */
export function CookieBanner() {
  const { consent, acceptAll, rejectAll, saveCustom, settingsOpen, setSettingsOpen } = useConsent();
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Solo cliente: evita parpadeo/hidratación distinta entre SSR y navegador.
  if (!mounted) return null;

  const showBanner = consent === null;

  return (
    <>
      <AnimatePresence>
        {showBanner && !settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-3xl rounded-2xl border border-white/10 bg-ink-900/92 p-5 text-ink-100 shadow-[0_30px_80px_-40px_rgba(2,6,23,1)] backdrop-blur-xl"
            role="dialog"
            aria-label="Aviso de cookies"
          >
            <div className="flex items-start gap-3">
              <Cookie className="mt-0.5 shrink-0 text-amber-400" size={22} />
              <div className="text-sm">
                <p className="font-bold text-white">Usamos cookies 🍪</p>
                <p className="mt-1 text-ink-300">
                  Solo usamos cookies técnicas necesarias. La analítica y el marketing opcionales{' '}
                  <strong>solo se activan si las aceptas</strong>. Puedes cambiar tu decisión cuando
                  quieras en <Link href="/cookies" className="underline">Política de Cookies</Link>.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={acceptAll} className="btn-primary">
                Aceptar todas
              </button>
              <button onClick={rejectAll} className="btn-secondary">
                Rechazar
              </button>
              <button onClick={() => setSettingsOpen(true)} className="btn-quiet">
                Configurar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel granular */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-end justify-center bg-ink-950/75 p-4 backdrop-blur-sm sm:items-center"
            role="dialog"
            aria-label="Configurar cookies"
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="card w-full max-w-md p-6 text-ink-100 shadow-[0_40px_100px_-40px_rgba(2,6,23,1)]"
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-extrabold tracking-tightish text-white">
                  <ShieldCheck size={20} className="text-brand-300" /> Preferencias de cookies
                </h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                  <div>
                    <p className="font-bold text-white">Necesarias</p>
                    <p className="text-ink-400">Sesión y seguridad. Siempre activas.</p>
                  </div>
                  <span className="badge-ok">siempre ON</span>
                </div>
                <Toggle
                  title="Analítica"
                  desc="Medición anónima de uso (solo si se configura)."
                  checked={analytics}
                  onChange={setAnalytics}
                />
                <Toggle
                  title="Marketing"
                  desc="Publicidad y remarketing (solo si se configura)."
                  checked={marketing}
                  onChange={setMarketing}
                />
              </div>

              <div className="mt-5 flex gap-2">
                <button onClick={() => saveCustom({ analytics, marketing })} className="btn-primary flex-1">
                  Guardar selección
                </button>
                <button onClick={acceptAll} className="btn-secondary">
                  Todas
                </button>
              </div>
              <p className="mt-3 text-center text-xs text-ink-500">
                Detalle en la <Link href="/cookies" className="underline">Política de Cookies</Link>.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Toggle({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <span>
        <span className="block font-bold text-white">{title}</span>
        <span className="block text-ink-400">{desc}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
          checked ? 'bg-[linear-gradient(120deg,#2563eb,#7c3aed)] shadow-[0_0_18px_-6px_rgba(59,118,240,0.95)]' : 'bg-white/12'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
