import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const customerViews = [
  'components/AuthForm.tsx',
  'components/HelpCenter.tsx',
  'components/dashboard/BillingPanel.tsx',
  'components/dashboard/FunnelPanel.tsx',
  'components/dashboard/StoreConnect.tsx',
  'app/dashboard/dashboard-client.tsx',
  'app/bienvenido/welcome-client.tsx',
  'app/global-error.tsx',
  'app/aviso-legal/page.tsx',
];

test('las vistas de cliente no exponen instrucciones ni secretos de infraestructura', () => {
  const source = customerViews.map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const forbidden of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SMTP (Brevo',
    'falta en .env',
    'conecta Supabase',
  ]) {
    assert.equal(source.includes(forbidden), false, `texto técnico visible: ${forbidden}`);
  }
});

test('las demostraciones Pro y Business usan empresas activas diferenciadas', () => {
  const source = readFileSync('lib/demo.ts', 'utf8');
  assert.match(source, /plan: 'pro'[\s\S]*subscription_status: 'active'/);
  assert.match(source, /plan: 'business'[\s\S]*subscription_status: 'active'/);
});
