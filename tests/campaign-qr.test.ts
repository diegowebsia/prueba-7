import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { normalizeCampaign } from '../lib/campaign';

test('normaliza campañas y elimina PII/caracteres de URL peligrosos', () => {
  assert.equal(normalizeCampaign(' Mostrador Madrid #1 '), 'mostrador-madrid-1');
  assert.equal(normalizeCampaign('https://evil.example?a=1'), null);
  assert.equal(normalizeCampaign('persona@example.com'), null);
  assert.equal(normalizeCampaign('telefono-612345678'), null);
  assert.equal(normalizeCampaign('   '), null);
  assert.ok((normalizeCampaign('a'.repeat(100))?.length ?? 0) <= 48);
});

test('genera un QR SVG autocontenido', async () => {
  const svg = await QRCode.toString('https://example.com/valorar/demo?campaign=mostrador', { type: 'svg' });
  assert.match(svg, /^<svg/);
  assert.ok(svg.includes('<path'));
  assert.equal(svg.includes('<script'), false);
});
