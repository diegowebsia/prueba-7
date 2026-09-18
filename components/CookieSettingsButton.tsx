'use client';

import { Settings2 } from 'lucide-react';
import { openCookieSettings } from '@/lib/consent';

export function CookieSettingsButton() {
  return (
    <button
      onClick={openCookieSettings}
      className="btn-primary"
    >
      <Settings2 size={16} /> Abrir preferencias de cookies
    </button>
  );
}
