import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('schema crea usage_counters antes de alterarla', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  assert.ok(sql.indexOf('create table if not exists public.usage_counters') < sql.indexOf('alter table public.usage_counters add column'));
});

test('schema contempla estados runtime y hardening crítico', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  for (const value of ["'inactive'", "'paused'", 'processed_events', 'consume_rate_limit', 'apply_addon_purchase']) assert.ok(sql.includes(value));
  assert.equal(sql.includes('create policy "tenants_insert_auth"'), false);
  assert.match(sql, /stripe_payment_id, pack/);
});


test('schema 3.12 aporta idempotencia observable de webhooks', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  for (const value of ['webhook_events', 'claim_webhook_event', 'finish_webhook_event', 'fail_webhook_event']) {
    assert.ok(sql.includes(value));
  }
});


test('schema 3.13 incorpora atribución de campañas', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  assert.match(sql, /campaign text/);
  assert.ok(sql.includes('feedback_tenant_campaign_created_idx'));
  assert.ok(sql.includes('feedback_campaign_format'));
});
