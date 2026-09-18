-- ============================================================
-- ReviewFlow AI v3.6.0 — Migración de add-ons ilimitados y sedes extra
-- ============================================================
-- Supabase Dashboard → SQL Editor → pegar y Run. Es IDEMPOTENTE:
-- puedes ejecutarla varias veces sin romper datos.
--
-- Qué añade:
--   1. `tenants.whatsapp_unlimited` (boolean) → WhatsApp Ilimitado activo
--      (mensajes automáticos sin tope mensual). Lo escribe el webhook de
--      Stripe al confirmar/cancelar el add-on recurrente.
--   2. `tenants.reviews_unlimited` (boolean) → Reseñas Ilimitadas activas
--      (ingesta sin tope mensual).
--   3. `tenants.extra_locations` (int) → Pack Localización Extra: sedes de
--      Google Maps / tiendas adicionales contratadas (recurrente por unidad).
--
-- Los bonus puntuales de mensajes (+500 / +2.000) NO requieren migración:
-- suman a las columnas `extra_whatsapp` / `extra_quota` existentes (pago único).
-- ============================================================

-- ---------- 1) WhatsApp Ilimitado (recurrente mensual) ----------
alter table public.tenants add column if not exists whatsapp_unlimited boolean not null default false;

-- ---------- 2) Reseñas Ilimitadas (recurrente mensual) ----------
alter table public.tenants add column if not exists reviews_unlimited boolean not null default false;

-- ---------- 3) Pack Localización Extra (recurrente por unidad) ----------
alter table public.tenants add column if not exists extra_locations int not null default 0;

-- ---------- 4) Vista de cuotas para /admin: columnas nuevas ----------
create or replace view public.v_quota_overview as
select
  t.id as tenant_id,
  t.name,
  t.plan,
  t.subscription_status,
  t.trial_ends_at,
  public.current_cycle() as cycle,
  coalesce(u.reviews_ingested, 0) as reviews_ingested,
  coalesce(u.ai_responses, 0) as ai_responses,
  coalesce(u.whatsapp_sent, 0) as whatsapp_sent,
  coalesce(u.google_calls, 0) as google_calls,
  coalesce(u.reviews_ingested, 0) + coalesce(u.ai_responses, 0) + coalesce(u.whatsapp_sent, 0) as used_events,
  case t.plan
    when 'completo' then 1000
    when 'resenas' then 300
    else 50
  end + case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_quota, 0) else 0 end as quota_events,
  coalesce(a.packs, 0) as addon_packs,
  coalesce(a.events, 0) as addon_events,
  t.whatsapp_unlimited,
  t.reviews_unlimited,
  coalesce(t.extra_locations, 0) as extra_locations
from public.tenants t
left join public.usage_counters u
  on u.tenant_id = t.id and u.cycle = public.current_cycle()
left join lateral (
  select count(*)::int as packs, coalesce(sum(events), 0)::int as events
  from public.addons x
  where x.tenant_id = t.id and x.cycle = public.current_cycle()
) a on true;
