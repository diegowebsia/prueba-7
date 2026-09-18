import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth';

/**
 * Segunda barrera de seguridad de /admin (la primera es el middleware).
 * Si no es super-admin, redirige al login con error=forbidden.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) {
    if (guard.demo) {
      // Sin Supabase: mostramos el panel en modo demo con la guía.
      // (El middleware solo deja llegar aquí con ?demo=1 o lo redirige.)
      return <>{children}</>;
    }
    redirect('/login?error=forbidden');
  }
  return <>{children}</>;
}
