-- ============================================================
-- ReviewFlow AI v3.9.0 — Modelo 100% de pago (sin plan gratuito)
-- Cómo aplicarlo: Supabase Dashboard → SQL Editor → pegar y Run.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
--
-- Cambios:
--  1. `tenants.plan`: solo 'pro' | 'business'. Las filas legacy o
--     gratuitas migran al plan de pago equivalente (nunca se pierde acceso
--     por el plan; el acceso lo decide `subscription_status`).
--  2. `tenants.subscription_status`: admite 'inactive' (baja/cancelación,
--     lo escribe el webhook INMEDIATAMENTE) y 'paused' (Stripe pausa la
--     suscripción si el cobro del día 8 no se completa).
-- ============================================================

-- ---------- 1) Migrar planes legacy/gratuitos a planes de pago ----------
update public.tenants
   set plan = 'pro'
 where plan in ('free', 'trial', 'gratis', 'gratuito', 'starter', 'standard', 'estandar', 'resenas', 'solo-resenas');

update public.tenants
   set plan = 'business'
 where plan in ('completo', 'completo-ecommerce', 'ecommerce', 'enterprise');

-- Cualquier otro valor desconocido → plan de pago más barato.
update public.tenants
   set plan = 'pro'
 where plan not in ('pro', 'business');

-- ---------- 2) Nuevo check de `plan` (solo pago) ----------
do $$
declare
  r record;
begin
  -- Borra TODOS los checks históricos sobre `plan` (nombres distintos por versión).
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.tenants'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%plan%in(%'
  loop
    execute format('alter table public.tenants drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tenants'::regclass
       and conname = 'tenants_plan_check_v39'
  ) then
    alter table public.tenants
      add constraint tenants_plan_check_v39 check (plan in ('pro', 'business'));
  end if;
end $$;

alter table public.tenants alter column plan set default 'pro';

-- ---------- 3) Nuevos estados de suscripción: 'inactive' + 'paused' ----------
do $$
declare
  r record;
begin
  -- Borra TODOS los checks históricos sobre `subscription_status`.
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.tenants'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%subscription_status%in(%'
  loop
    execute format('alter table public.tenants drop constraint %I', r.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.tenants'::regclass
       and conname = 'tenants_subscription_status_check_v39'
  ) then
    alter table public.tenants
      add constraint tenants_subscription_status_check_v39 check (
        subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'inactive', 'paused', 'none')
      );
  end if;
end $$;

-- Las filas con estados antiguos no contemplados se normalizan a 'none'
-- (sin acceso hasta contratar un plan de pago).
update public.tenants
   set subscription_status = 'none'
 where subscription_status not in ('trialing', 'active', 'past_due', 'canceled', 'inactive', 'paused', 'none')
    or subscription_status is null;

-- ---------- 4) Vistas y purgas: topes del plan más barato por defecto ----------
-- (Sin plan gratuito, el `else` de los CASE equivale a Pro.)

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
  case
    when t.plan in ('business', 'completo', 'ecommerce') then 2000
    else 500
  end
  + case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_requests, 0) else 0 end
    as quota_events,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_reviews, 0) else 0 end as extra_reviews,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_ai, 0) else 0 end as extra_ai,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_syncs, 0) else 0 end as extra_syncs,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_stored, 0) else 0 end as extra_stored,
  case
    when t.plan in ('business', 'completo', 'ecommerce') then 25000
    else 5000
  end as reviews_stored_cap,
  case
    when t.plan in ('business', 'completo', 'ecommerce') then 50000
    else 10000
  end as audit_rows_cap,
  case
    when t.plan in ('business', 'completo', 'ecommerce') then 20
    else 6
  end as integrations_cap,
  coalesce(a.packs, 0) as addon_packs,
  coalesce(a.events, 0) as addon_events
from public.tenants t
left join public.usage_counters u
  on u.tenant_id = t.id and u.cycle = public.current_cycle()
left join lateral (
  select count(*)::int as packs, coalesce(sum(events), 0)::int as events
  from public.addons x
  where x.tenant_id = t.id and x.cycle = public.current_cycle()
) a on true;

create or replace function public.purge_tenant(p_tenant uuid)
returns table (reviews_purged integer, audit_purged integer, ai_purged integer)
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_reviews_keep integer;
  v_audit_keep integer;
  v_ai_keep integer;
  v_days integer;
begin
  select t.plan into v_plan from public.tenants t where t.id = p_tenant;
  if v_plan is null then
    return query select 0, 0, 0;
    return;
  end if;

  if v_plan in ('business', 'completo', 'ecommerce') then
    v_reviews_keep := 25000; v_audit_keep := 50000; v_ai_keep := 100000; v_days := 365;
  else
    v_reviews_keep := 5000; v_audit_keep := 10000; v_ai_keep := 20000; v_days := 180;
  end if;

  if (select t.extra_quota_cycle from public.tenants t where t.id = p_tenant) = public.current_cycle() then
    v_reviews_keep := v_reviews_keep + coalesce((select t.extra_stored from public.tenants t where t.id = p_tenant), 0);
  end if;

  return query
    select
      public.purge_reviews(p_tenant, v_reviews_keep),
      public.purge_quota_events(p_tenant, v_audit_keep, v_days),
      public.purge_ai_interactions(p_tenant, v_ai_keep, v_days);
end;
$$;

create or replace view public.v_ai_usage as
select
  t.id as tenant_id,
  t.name,
  t.plan,
  public.current_cycle() as cycle,
  coalesce(u.ai_responses, 0) as ai_replies,
  coalesce(u.ai_tokens_in, 0) as tokens_in,
  coalesce(u.ai_tokens_out, 0) as tokens_out,
  coalesce(u.ai_tokens_in, 0) + coalesce(u.ai_tokens_out, 0) as tokens_total,
  case
    when t.plan in ('business', 'completo', 'ecommerce') then 1200000
    else 250000
  end as tokens_limit,
  round(
    100.0 * (coalesce(u.ai_tokens_in, 0) + coalesce(u.ai_tokens_out, 0))
    / greatest(case
        when t.plan in ('business', 'completo', 'ecommerce') then 1200000
        else 250000
      end, 1),
    1
  ) as pct_used,
  coalesce(i.requests, 0) as calls_cycle,
  coalesce(i.cost_usd, 0) as cost_usd_cycle,
  coalesce(i.fallbacks, 0) as fallbacks_cycle,
  t.ai_tokens_in + t.ai_tokens_out as tokens_total_historico,
  t.ai_cost_usd as cost_usd_historico
from public.tenants t
left join public.usage_counters u
  on u.tenant_id = t.id and u.cycle = public.current_cycle()
left join lateral (
  select
    count(*)::int as requests,
    round(sum(a.cost_usd), 6) as cost_usd,
    count(*) filter (where a.ok = false)::int as fallbacks
  from public.ai_interactions a
  where a.tenant_id = t.id and a.cycle = public.current_cycle()
) i on true;
