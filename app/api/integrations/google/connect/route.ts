import { NextResponse } from 'next/server';
import { getGoogleOAuthUrl, isGoogleConfigured } from '@/lib/google';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePaidAccess } from '@/lib/usage';
import { createOAuthState, createPkce } from '@/lib/security';

/** GET /api/integrations/google/connect?tenantId=xxx → redirige al OAuth de Google. */
export async function GET(req: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: 'Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el servidor.' },
      { status: 503 },
    );
  }
  const tenantId = new URL(req.url).searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId.' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?redirect=/dashboard', req.url));

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase no configurado.' }, { status: 503 });
  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) return NextResponse.json({ error: 'Sin permiso en esta empresa.' }, { status: 403 });

  // Regla estricta: sin suscripción activa o con la prueba caducada → 402.
  const gate = await requirePaidAccess(admin, tenantId, {
    feature: 'googleBusiness',
    action: 'Conexión con Google Business',
    metric: 'syncs',
  });
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status, headers: gate.headers });
  }

  const { verifier, challenge } = createPkce();
  const state = createOAuthState(tenantId, user.id);
  const response = NextResponse.redirect(getGoogleOAuthUrl(state, challenge), { status: 302 });
  response.cookies.set('google_oauth_verifier', verifier, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/api/integrations/google/callback', maxAge: 600,
  });
  return response;
}
