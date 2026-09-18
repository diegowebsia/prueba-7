import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { createOAuthState, createPkce, escapeHtml, safeInternalRedirect, signOpaqueId, verifyOAuthState, verifyOpaqueId } from '../lib/security';
import { decryptCredentials, encryptCredentials } from '../lib/credentials';
import { verifyShopifyHmac } from '../lib/store';

test('safeInternalRedirect bloquea esquemas, externos y protocol-relative', () => {
  assert.equal(safeInternalRedirect('/dashboard?tab=uso'), '/dashboard?tab=uso');
  for (const unsafe of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil']) {
    assert.equal(safeInternalRedirect(unsafe), '/dashboard');
  }
});

test('escapeHtml neutraliza HTML de usuario', () => {
  assert.equal(escapeHtml(`<img src=x onerror="x">&'`), '&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#039;');
});

test('state OAuth está firmado, expira y queda vinculado', () => {
  process.env.APP_SIGNING_SECRET = 'test-secret-long-enough';
  const state = createOAuthState('tenant-1', 'user-1');
  assert.deepEqual(verifyOAuthState(state)?.tenantId, 'tenant-1');
  assert.equal(verifyOAuthState(`${state}x`), null);
  const pkce = createPkce();
  assert.ok(pkce.verifier.length >= 43 && pkce.challenge.length >= 43);
});

test('tokens opacos no aceptan IDs manipulados', () => {
  process.env.APP_SIGNING_SECRET = 'test-secret-long-enough';
  const token = signOpaqueId('row-1');
  assert.equal(verifyOpaqueId('row-1', token), true);
  assert.equal(verifyOpaqueId('row-2', token), false);
});

test('credenciales usan AES-GCM y aceptan filas legacy', () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'test-encryption-key';
  const encrypted = encryptCredentials({ access_token: 'secret' });
  assert.equal((encrypted as any)._encrypted, 'v1');
  assert.equal(JSON.stringify(encrypted).includes('secret'), false);
  assert.deepEqual(decryptCredentials(encrypted), { access_token: 'secret' });
  assert.deepEqual(decryptCredentials({ legacy: 'ok' }), { legacy: 'ok' });
});

test('HMAC de tienda se compara correctamente', () => {
  const raw = '{"id":1}';
  const sig = createHmac('sha256', 'secret').update(raw).digest('base64');
  assert.equal(verifyShopifyHmac(raw, 'secret', sig), true);
  assert.equal(verifyShopifyHmac(raw, 'secret', `${sig}x`), false);
});

test('validación de producción exige secretos y HTTPS', async () => {
  const { productionEnvErrors } = await import('../lib/env-validation');
  const errors = productionEnvErrors({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } as unknown as NodeJS.ProcessEnv);
  assert.ok(errors.includes('Falta SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(errors.some((error) => error.includes('HTTPS')));
});
