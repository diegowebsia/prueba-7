import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/env';
import { hasAccess, resolvePlan } from '@/lib/plans';
import { Aurora } from '@/components/Motion';
import { WelcomeClient } from './welcome-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activa tu prueba — ReviewFlow AI' };

/**
 * Onboarding post-registro: elige plan → Stripe (trial 7 días) → el webhook crea
 * tu empresa automáticamente → entras al panel. Si ya tienes suscripción activa
 * (o el webhook ya terminó mientras elegías plan) se redirige directo al panel.
 *
 * `?reason=` lo añade el middleware cuando corta el acceso: no-access,
 * trial-ended, past-due, canceled o suspended (ver `lib/plans.ts` → hasAccess).
 */
export default async function BienvenidoPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; checkout?: string; reason?: string }>;
}) {
  const [user, query] = await Promise.all([getSessionUser(), searchParams]);
  if (isSupabaseConfigured && !user) redirect('/login?redirect=/bienvenido');

  // Modelo 100% de pago: pro | business (los alias antiguos resuelven a pago).
  const preselected = query.plan ? resolvePlan(query.plan) : 'pro';
  const checkout = query.checkout; // success | canceled | undefined

  let alreadyActive = false;
  const admin = createAdminClient();
  if (admin && user) {
    const { data } = await admin
      .from('tenants')
      .select('subscription_status, suspended')
      .eq('owner_id', user.id);
    alreadyActive = (data ?? []).some((t: any) => hasAccess(t.subscription_status, t.suspended));
  }

  // Si vuelve de Stripe con éxito y el webhook ya creó la empresa → al panel.
  if (checkout === 'success' && alreadyActive) redirect('/dashboard');

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-ink-50">
      <Aurora />
      <header className="nav-blur sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-ink-300 transition-colors hover:text-white"
          >
            <span aria-hidden>←</span> Volver a la web
          </Link>
          <p className="truncate text-sm text-ink-400">
            {user?.email ?? 'Bienvenido'}
            <span className="mx-2 text-ink-600">·</span>
            <span className="font-semibold text-white">Paso 2 de 2 · activa tu prueba</span>
          </p>
        </div>
      </header>
      <div className="relative z-10">
        <WelcomeClient
          email={user?.email ?? ''}
          preselected={preselected}
          checkout={checkout}
          reason={query.reason}
          alreadyActive={alreadyActive}
          demo={!isSupabaseConfigured}
        />
      </div>
    </div>
  );
}
