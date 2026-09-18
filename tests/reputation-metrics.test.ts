import test from 'node:test';
import assert from 'node:assert/strict';
import { responseSla } from '../lib/reputation-metrics';

test('calcula media de respuesta y SLA de 24 horas', () => {
  const metrics = responseSla([
    { created_at: '2026-09-01T00:00:00Z', replied_at: '2026-09-01T12:00:00Z' },
    { created_at: '2026-09-01T00:00:00Z', replied_at: '2026-09-03T00:00:00Z' },
  ]);
  assert.deepEqual(metrics, { averageResponseHours: 30, repliedWithin24hRate: 50 });
});

test('ignora fechas ausentes, inválidas o anteriores a la reseña', () => {
  assert.deepEqual(responseSla([
    { created_at: '2026-09-02T00:00:00Z', replied_at: null },
    { created_at: '2026-09-02T00:00:00Z', replied_at: '2026-09-01T00:00:00Z' },
    { created_at: 'fecha-invalida', replied_at: 'también-invalida' },
  ]), { averageResponseHours: null, repliedWithin24hRate: 0 });
});
