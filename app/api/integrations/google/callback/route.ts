import { NextResponse } from 'next/server';
import { exchangeGoogleCode } from '@/lib/google';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { systemLog } from '@/lib/logger';
import { verifyOAuthState } from '@/lib/security';
import { encryptCredentials } from '@/lib/credentials';

function redirect(req: Request, status: string) {
  const url = new URL('/dashboard', req.url);
  url.searchParams.set('google', status);
  const response = NextResponse.redirect(url);
  response.cookies.delete('google_oauth_verifier');
  return response;
}

/** Callback OAuth con state firmado, TTL, vinculación a usuario y PKCE. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = verifyOAuthState(url.searchParams.get('state') ?? '');
  const verifier = /(?:^|;\s*)google_oauth_verifier=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  if (!code || !state || !verifier) return redirect(req, 'invalid_state');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?redirect=/dashboard', req.url));
  if (user.id !== state.userId) return redirect(req, 'forbidden');

  const admin = createAdminClient();
  if (!admin) return redirect(req, 'nodb');
  const { data: member } = await admin.from('memberships').select('id')
    .eq('tenant_id', state.tenantId).eq('user_id', user.id).single();
  if (!member) return redirect(req, 'forbidden');
  const { error: claimError } = await admin.from('processed_events').insert({
    provider: 'google_oauth', tenant_scope: state.tenantId, event_id: state.nonce,
  });
  if (claimError?.code === '23505') return redirect(req, 'invalid_state');
  if (claimError) return redirect(req, 'error');

  try {
    const tokens = await exchangeGoogleCode(code, decodeURIComponent(verifier));
    const { error } = await admin.from('integrations').upsert({
      tenant_id: state.tenantId,
      provider: 'google',
      status: 'connected',
      credentials: encryptCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        obtained_at: new Date().toISOString(),
      }),
      external_label: 'Google Business Profile',
      last_error: null,
    }, { onConflict: 'tenant_id,provider' });
    if (error) throw error;
    await systemLog('info', 'integrations.google', 'Google conectado', { tenantId: state.tenantId });
    return redirect(req, 'connected');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'OAuth falló';
    await systemLog('error', 'integrations.google', message, { tenantId: state.tenantId });
    return redirect(req, 'error');
  }
}
