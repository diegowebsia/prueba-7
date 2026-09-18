'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Gestor de consentimiento de cookies (RGPD + ePrivacy).
 * - Solo las cookies técnicas existen por defecto (sesión Supabase).
 * - Los scripts de terceros (analítica/marketing) SOLO se cargan si el
 *   usuario acepta la categoría correspondiente (ver <ThirdPartyScripts />).
 */

export type ConsentState = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  ts: string;
};

type ConsentContextValue = {
  consent: ConsentState | null; // null = aún no decidido → mostrar banner
  acceptAll: () => void;
  rejectAll: () => void;
  saveCustom: (c: { analytics: boolean; marketing: boolean }) => void;
  openSettings: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
};

const KEY = 'rf-consent-v1';
const ConsentContext = createContext<ConsentContextValue | null>(null);

export function loadConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics !== 'boolean') return null;
    return { necessary: true, ...parsed };
  } catch {
    return null;
  }
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setConsent(loadConsent());
    const handler = () => setSettingsOpen(true);
    window.addEventListener('rf:open-cookie-settings', handler);
    return () => window.removeEventListener('rf:open-cookie-settings', handler);
  }, []);

  const persist = useCallback((c: { analytics: boolean; marketing: boolean }) => {
    const state: ConsentState = { necessary: true, ...c, ts: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento no disponible: se mantiene en memoria */
    }
    setConsent(state);
    setSettingsOpen(false);
  }, []);

  const value: ConsentContextValue = {
    consent,
    acceptAll: () => persist({ analytics: true, marketing: true }),
    rejectAll: () => persist({ analytics: false, marketing: false }),
    saveCustom: persist,
    openSettings: () => setSettingsOpen(true),
    settingsOpen,
    setSettingsOpen,
  };

  // El provider existe siempre (SSR incluido); el banner decide cuándo pintarse.
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent debe usarse dentro de <ConsentProvider>');
  return ctx;
}

/** Abre el panel de cookies desde cualquier sitio (footer, /cookies…). */
export function openCookieSettings() {
  window.dispatchEvent(new Event('rf:open-cookie-settings'));
}
