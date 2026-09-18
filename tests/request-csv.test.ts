import test from 'node:test';
import assert from 'node:assert/strict';
import { PayloadTooLargeError, readJsonLimited, readTextLimited } from '../lib/request';
import { csvCell, csvDocument } from '../lib/csv';

test('rechaza Content-Length y streams que superan el límite', async () => {
  await assert.rejects(
    () => readTextLimited(new Request('https://test', { method: 'POST', body: '12345' }), 4),
    PayloadTooLargeError,
  );
  await assert.rejects(
    () => readTextLimited(new Request('https://test', { method: 'POST', headers: { 'content-length': '999' }, body: 'x' }), 4),
    PayloadTooLargeError,
  );
});

test('parsea JSON dentro del límite', async () => {
  const value = await readJsonLimited(new Request('https://test', { method: 'POST', body: '{"ok":true}' }), 32);
  assert.deepEqual(value, { ok: true });
});

test('CSV neutraliza fórmulas y escapa comillas', () => {
  assert.equal(csvCell('=HYPERLINK("https://evil")'), '"\'=HYPERLINK(""https://evil"")"');
  const csv = csvDocument(['name'], [{ name: '+cmd' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'+cmd"));
});
