import { createClient } from '@/lib/supabase/server';
import { isSuperAdminEmail, isSupabaseConfigured } from '@/lib/env';

export type AdminGuard =
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string; demo?: boolean };

/**
 * Guardia server-side para /admin y /api/admin/*.
 * Defensa en profundidad: el middleware ya filtra, esto re-verifica.
 */
export async function requireSuperAdmin(): Promise<AdminGuard> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      status: 503,
      error: 'Supabase no configurado. Define las claves en el .env.',
      demo: true,
    };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: 'No autenticado.' };
  if (!isSuperAdminEmail(user.email)) {
    return { ok: false, status: 403, error: 'Acceso denegado: no eres super-admin.' };
  }
  return { ok: true, userId: user.id, email: user.email ?? '' };
}

/** Sesión normal para /dashboard. */
export async function getSessionUser() {
  if (!isSupabaseConfigured) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
