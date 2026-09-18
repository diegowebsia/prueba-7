'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Cliente Supabase para Componentes de Cliente.
 * Usa valores placeholder si no hay claves para no romper el build;
 * las páginas detectan `isSupabaseConfigured` y muestran modo demo.
 */
export function createClient() {
  return createBrowserClient(
    env.supabaseUrl || 'https://placeholder.supabase.co',
    env.supabaseAnonKey || 'placeholder-anon-key',
  );
}
