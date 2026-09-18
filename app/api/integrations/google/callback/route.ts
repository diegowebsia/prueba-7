import { NextResponse } from 'next/server';
import { exchangeGoogleCode } from '@/lib/google';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';

/** Callback OAuth: verifica sesión + membresía y guarda los tokens. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tenantId = url.searchParams.get('state');
  const dash = new URL('/dashboard', req.url);

  if (!code || !tenantId) {
    dash.searchParams.set('google', 'error');
    return NextResponse.redirect(dash);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?redirect=/dashboard', req.url));

  const admin = createAdminClient();
  if (!admin) {
    dash.searchParams.set('google', 'nodb');
    return NextResponse.redirect(dash);
  }

  const { data: member } = await admin
    .from('memberships')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .single();
  if (!member) {
    dash.searchParams.set('google', 'forbidden');
    return NextResponse.redirect(dash);
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    await admin.from('integrations').upsert(
      {
        tenant_id: tenantId,
        provider: 'google',
        status: 'connected',
        credentials: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          obtained_at: new Date().toISOString(),
        },
        external_label: 'Google Business Profile',
        last_error: null,
      },
      { onConflict: 'tenant_id,provider' },
    );
    await systemLog('info', 'integrations.google', `Google conectado`, { tenantId });
    dash.searchParams.set('google', 'connected');
  } catch (e: any) {
    await systemLog('error', 'integrations.google', e?.message ?? 'OAuth falló', { tenantId });
    dash.searchParams.set('google', 'error');
  }
  return NextResponse.redirect(dash);
}
