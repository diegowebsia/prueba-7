import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Alta SIN tarjeta ELIMINADA (v3.9.0 — modelo 100% de pago).
 *
 * POST /api/tenants/start
 *  · Ya no crea empresas gratuitas: no existe plan gratuito.
 *  · Todos los planes (Pro/Business) pasan por Stripe con prueba de 7 días:
 *    `/api/stripe/checkout?plan=pro|business` → el webhook crea/activa el tenant.
 *  · Se mantiene el endpoint para no romper clientes antiguos, pero responde
 *    402 (Payment Required) con la URL de checkout.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  return NextResponse.json(
    {
      error:
        'El alta gratuita ya no está disponible: elige un plan de pago con 7 días de prueba gratis.',
      code: 'no_free_plan',
      checkoutUrl: '/bienvenido',
    },
    { status: 402 },
  );
}
