import { createAdminClient } from '@/lib/supabase/admin';
import { hashPersonalValue } from '@/lib/security';

const fallback = new Map<string, { count: number; resetAt: number }>();

/** Límite distribuido mediante PostgreSQL; el mapa solo se usa en desarrollo sin Supabase. */
export async function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = hashPersonalValue(`${scope}:${identity}`);
  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error('rate_limit_backend_error', { scope, code: error.code });
      // Fail closed for public abuse-sensitive endpoints.
      return { allowed: false, retryAfter: windowSeconds };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: Boolean(row?.allowed), retryAfter: Number(row?.retry_after ?? windowSeconds) };
  }

  if (process.env.NODE_ENV === 'production') return { allowed: false, retryAfter: windowSeconds };
  const now = Date.now();
  const current = fallback.get(key);
  if (!current || current.resetAt <= now) {
    fallback.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
}
