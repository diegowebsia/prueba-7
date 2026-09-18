import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/** Cliente Supabase para Server Components / Route Handlers (respeta RLS). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    env.supabaseUrl || 'https://placeholder.supabase.co',
    env.supabaseAnonKey || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(values) {
          try {
            for (const { name, value, options } of values) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /* Server Component: solo lectura; Proxy refresca la sesión. */
          }
        },
      },
    },
  );
}
