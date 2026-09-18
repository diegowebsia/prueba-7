import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isTrialExpired, TRIAL_DAYS } from '@/lib/plans';

/**
 * ReviewFlow AI v3.10.0 — Middleware de seguridad y negocio (modelo 100% de pago).
 *
 * Nota v3.10.0: `/api/cron/*`, `/api/queue/*` y `/api/feedback/*` quedan FUERA del
 * matcher a propósito y se protegen internamente (CRON_SECRET, firma QStash,
 * membresía o rate-limit según el caso).
 *
 * - `/admin/*`: solo SUPERADMIN_EMAILS (verificación 1 de 2). Es un panel
 *   interno PRIVADO: no se enlaza desde ninguna página pública.
 * - `/dashboard/*`: sesión + SUSCRIPCIÓN CON ACCESO (trialing vigente/active).
 *   Sin acceso → /bienvenido con el motivo:
 *     · `trial-ended`  → la prueba de {TRIAL_DAYS} días venció y no se completó
 *                        el pago del día 8 (corte automático del panel).
 *     · `past-due`     → impago (invoice.payment_failed).
 *     · `canceled`     → suscripción cancelada / inactiva / pausada por Stripe.
 *     · `suspended`    → suspensión manual desde /admin.
 *     · `no-access`    → registrado sin plan de pago contratado.
 *   No hay plan gratuito: sin suscripción no hay acceso. Si la comprobación
 *   falla por un error de infraestructura, se permite el paso (fail-open) y el
 *   dashboard muestra el paywall; cada API re-verifica de todos modos
 *   (defensa en profundidad).
 * - `/api/ai/*`, `/api/reviews/*`, `/api/integrations/*`: REGLA ESTRICTA —
 *   sesión (401) + suscripción con acceso. Sin suscripción activa o con la
 *   prueba de 7 días caducada → **402 Payment Required** (JSON).
 *   Excepciones (flujos máquina-a-máquina u OAuth, protegidos internamente por
 *   `enforce()` con api_key/HMAC): webhooks de Shopify/WooCommerce, ingesta por
 *   API, aviso de pedido entregado y callback OAuth de Google.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboardRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  // APIs protegidas por suscripción (regla estricta → 402 sin acceso).
  // La suscripción concreta del tenant se re-verifica en cada ruta con
  // `enforce()` / `enforceAi()` (defensa en profundidad).
  const isProtectedApi =
    !isPublicIntegrationPath(pathname) &&
    (pathname === '/api/ai' ||
      pathname.startsWith('/api/ai/') ||
      pathname === '/api/reviews' ||
      pathname.startsWith('/api/reviews/') ||
      pathname === '/api/integrations' ||
      pathname.startsWith('/api/integrations/'));

  if (!isAdminRoute && !isDashboardRoute && !isProtectedApi) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    // Sin Supabase no hay datos reales que proteger: `?demo=1` permite previsualizar
    // /admin y /dashboard con datos de ejemplo (misma regla en ambas rutas).
    const demoBypass = req.nextUrl.searchParams.get('demo');
    if (demoBypass === '1') return res;
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Supabase no configurado en el servidor. La API está en modo demo.', code: 'demo' },
        { status: 503 },
      );
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('reason', 'configure-supabase');
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        res.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        res.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Las rutas de API responden JSON 401 (no redirección) para que el panel
    // muestre el aviso correcto y nunca llame a la IA sin sesión.
    if (isProtectedApi) {
      return NextResponse.json({ error: 'No autenticado.', code: 'unauthenticated' }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute) {
    const raw = process.env.SUPERADMIN_EMAILS ?? '';
    const allowed = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user.email ?? '').toLowerCase();

    if (allowed.length === 0 || !email || !allowed.includes(email)) {
      const deniedUrl = req.nextUrl.clone();
      deniedUrl.pathname = '/login';
      deniedUrl.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(deniedUrl);
    }
    return res;
  }

  // APIs de IA / reseñas / integraciones: corte por suscripción con 402.
  if (isProtectedApi) {
    const verdict = await checkSubscriptionAccess(supabaseUrl, user.id);
    if (verdict && verdict.allowed === false) {
      const code =
        verdict.reason === 'trial-ended'
          ? 'trial_expired'
          : verdict.reason === 'suspended'
            ? 'suspended'
            : verdict.reason === 'past-due'
              ? 'past_due'
              : verdict.reason === 'canceled'
                ? 'canceled'
                : 'no_subscription';
      const response = NextResponse.json(
        {
          error: accessDeniedMessage(verdict.reason),
          code,
          reason: verdict.reason,
          checkoutUrl: '/bienvenido',
        },
        { status: 402 },
      );
      response.headers.set('X-RF-Access-Denied', verdict.reason);
      return response;
    }
    return res;
  }

  // Dashboard: corte por suscripción (trial de 7 días, impagos, cancelaciones).
  if (isDashboardRoute) {
    const verdict = await checkSubscriptionAccess(supabaseUrl, user.id);
    if (verdict && verdict.allowed === false) {
      const welcomeUrl = req.nextUrl.clone();
      // /bienvenido no está protegido: permite reactivar y pagar.
      welcomeUrl.pathname = '/bienvenido';
      welcomeUrl.searchParams.set('reason', verdict.reason);
      if (verdict.reason === 'trial-ended') welcomeUrl.searchParams.set('trial', String(TRIAL_DAYS));
      const response = NextResponse.redirect(welcomeUrl);
      response.headers.set('X-RF-Access-Denied', verdict.reason);
      return response;
    }
  }

  return res;
}

/**
 * Rutas de integraciones que NO pasan por el filtro de sesión/suscripción del
 * middleware porque son flujos máquina-a-máquina u OAuth:
 *  · Webhooks firmados de Shopify / WooCommerce (HMAC + api_key en query).
 *  · Ingesta pública y aviso de pedido entregado (autenticadas con `api_key`).
 *  · Callback OAuth de Google (redirección del proveedor).
 * Todas aplican la regla estricta internamente con `enforce()` (402 por tenant).
 */
function isPublicIntegrationPath(pathname: string): boolean {
  return (
    pathname === '/api/integrations/shopify/webhook' ||
    pathname.startsWith('/api/integrations/shopify/webhook/') ||
    pathname === '/api/integrations/woocommerce/webhook' ||
    pathname.startsWith('/api/integrations/woocommerce/webhook/') ||
    pathname === '/api/integrations/ingest' ||
    pathname.startsWith('/api/integrations/ingest/') ||
    pathname === '/api/integrations/store/order-delivered' ||
    pathname.startsWith('/api/integrations/store/order-delivered/') ||
    pathname === '/api/integrations/google/callback' ||
    pathname.startsWith('/api/integrations/google/callback/')
  );
}

function accessDeniedMessage(reason: AccessVerdictReason): string {
  switch (reason) {
    case 'trial-ended':
      return `Tu prueba de ${TRIAL_DAYS} días terminó y el pago no se completó. Reactiva tu suscripción para seguir usando la plataforma.`;
    case 'past-due':
      return 'Hay un pago pendiente en tu suscripción. Actualiza el método de pago para reactivar el acceso.';
    case 'canceled':
      return 'Tu suscripción está cancelada o inactiva. Contrata un plan de pago para reactivar el acceso.';
    case 'suspended':
      return 'Tu cuenta está suspendida. Contacta con soporte para reactivarla.';
    case 'no-access':
    default:
      return 'Necesitas una suscripción activa para usar la plataforma.';
  }
}

type AccessVerdictReason = 'trial-ended' | 'past-due' | 'canceled' | 'suspended' | 'no-access';

type AccessVerdict = { allowed: true } | { allowed: false; reason: AccessVerdictReason };

type TenantAccessRow = {
  subscription_status: string;
  suspended: boolean;
  trial_ends_at: string | null;
};

/**
 * `{ allowed: true }` = acceso · `{ allowed: false, reason }` = corte a
 * /bienvenido (dashboard) o 402 (APIs) · `null` = no se pudo comprobar
 * (fail-open; el dashboard y cada API re-verifican de todos modos).
 */
async function checkSubscriptionAccess(
  supabaseUrl: string,
  userId: string,
): Promise<AccessVerdict | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?owner_id=eq.${encodeURIComponent(userId)}` +
        `&select=subscription_status,suspended,trial_ends_at`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        cache: 'no-store',
      },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as TenantAccessRow[];
    if (!rows || rows.length === 0) return { allowed: false, reason: 'no-access' };

    // Cualquier empresa activa y no suspendida da acceso al panel/APIs.
    const usable = rows.filter(
      (t) =>
        !t.suspended &&
        (t.subscription_status === 'active' || t.subscription_status === 'trialing') &&
        // Día 8 sin pago completado → la prueba caducó aunque Stripe aún diga `trialing`.
        !isTrialExpired(t.subscription_status, t.trial_ends_at),
    );
    if (usable.length > 0) return { allowed: true };

    if (rows.some((t) => t.suspended)) return { allowed: false, reason: 'suspended' };
    if (rows.some((t) => isTrialExpired(t.subscription_status, t.trial_ends_at))) {
      return { allowed: false, reason: 'trial-ended' };
    }
    if (rows.some((t) => t.subscription_status === 'past_due')) return { allowed: false, reason: 'past-due' };
    if (
      rows.some(
        (t) =>
          t.subscription_status === 'canceled' ||
          t.subscription_status === 'inactive' ||
          t.subscription_status === 'paused',
      )
    ) {
      return { allowed: false, reason: 'canceled' };
    }
    return { allowed: false, reason: 'no-access' };
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/api/ai/:path*',
    '/api/ai',
    '/api/reviews/:path*',
    '/api/reviews',
    '/api/integrations/:path*',
    '/api/integrations',
  ],
};
