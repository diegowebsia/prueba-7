import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { getSessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Portal de cliente de Stripe (facturas, cambiar plan, cancelar). */
export async function GET(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe no configurado.' }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const admin = createAdminClient();
  let customerId: string | null = null;
  if (admin) {
    const { data } = await admin
      .from('tenants')
      .select('stripe_customer_id')
      .eq('owner_email', user.email)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .single();
    customerId = (data?.stripe_customer_id as string) ?? null;
  }

  if (!customerId) {
    return NextResponse.redirect(new URL('/dashboard?portal=nocustomer', req.url));
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/dashboard`,
  });
  return NextResponse.redirect(portal.url, { status: 303 });
}
