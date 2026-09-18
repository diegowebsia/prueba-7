import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseAdminConfigured } from '@/lib/env';

/**
 * Cliente service_role (SOLO servidor, bypass RLS).
 * Úsalo exclusivamente en rutas /api/admin/* tras verificar super-admin.
 * Devuelve null si no hay claves → las APIs responden modo demo.
 */
export function createAdminClient() {
  if (!isSupabaseAdminConfigured) return null;
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
