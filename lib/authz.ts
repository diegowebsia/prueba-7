import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

type AdminLike = SupabaseClient<any, 'public', any>;

export type AuthzOk = { ok: true; userId: string };
export type AuthzFail = { ok: false; error: string; status: number };
export type Authz = AuthzOk | AuthzFail;

/**
 * Verifica sesión + pertenencia del usuario a la empresa.
 * Usar en todas las rutas que operen sobre un tenantId.
 */
export async function requireOwner(admin: AdminLike, tenantId: string): Promise<Authz> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.', status: 401 };

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return { ok: false, error: 'Sin permiso en esta empresa.', status: 403 };
  return { ok: true, userId: user.id };
}
