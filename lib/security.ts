import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export function safeInternalRedirect(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  try {
    const url = new URL(value, 'https://reviewflow.invalid');
    if (url.origin !== 'https://reviewflow.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function requestIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

export function hashPersonalValue(value: string): string {
  const pepper = process.env.PRIVACY_HASH_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-development';
  return createHmac('sha256', pepper).update(value).digest('hex');
}

function signingSecret(): string {
  return (
    process.env.APP_SIGNING_SECRET ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  );
}

export function signOpaqueId(value: string): string {
  const secret = signingSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function verifyOpaqueId(value: string, signature: string): boolean {
  const expected = signOpaqueId(value);
  if (!expected || !signature) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OAuthState = { tenantId: string; userId: string; nonce: string; exp: number };

export function createOAuthState(tenantId: string, userId: string): string {
  const secret = signingSecret();
  if (!secret) throw new Error('Falta APP_SIGNING_SECRET/OAUTH_STATE_SECRET.');
  const payload: OAuthState = {
    tenantId,
    userId,
    nonce: randomBytes(18).toString('base64url'),
    exp: Date.now() + 10 * 60_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

export function verifyOAuthState(state: string): OAuthState | null {
  const secret = signingSecret();
  const [encoded, signature] = state.split('.');
  if (!secret || !encoded || !signature) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState;
    if (!payload.tenantId || !payload.userId || !payload.nonce || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
