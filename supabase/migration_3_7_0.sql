-- ============================================================
-- ReviewFlow AI v3.7.0 — Migración: 3 planes + topes de BD por plan
-- ============================================================
-- Supabase Dashboard → SQL Editor → pegar y Run. Es IDEMPOTENTE:
-- puedes ejecutarla varias veces sin romper datos ni perder información.
--
-- Qué cambia respecto a v3.6.0:
--   1. `tenants.plan` acepta los 3 planes nuevos (free | pro | business)
--      y sigue aceptando los nombres antiguos (trial | resenas | completo)
--      para no romper filas existentes.
--   2. Nuevas columnas de ampliaciones del ciclo:
--        extra_requests  → peticiones de opiniones (email + WhatsApp)
--        extra_syncs     → sincronizaciones automáticas (Google/Trustpilot)
--        extra_stored    → plazas extra de almacenamiento (opiniones)
--      `extra_reviews` y `extra_ai` se mantienen (mismo significado).
--   3. Migración de datos: `extra_quota` + `extra_whatsapp` → `extra_requests`.
--      (Las columnas antiguas NO se borran: quedan como histórico inerte.)
--   4. `reset_expired_extras()` pone a 0 también las columnas nuevas.
--   5. `v_quota_overview` recalculada con los límites de los 3 planes.
--   6. Funciones de PURGA/ARCHIVADO a nivel de base de datos para que
--      ninguna tabla crezca sin tope (opiniones, auditoría y logs).
--
-- Los límites de aplicación viven en `lib/plans.ts` (PLANS[*].limits).
-- Este script replica los mismos números a nivel SQL como red de seguridad:
--
--   Plan       Opiniones   Auditoría (quota_events)   Conexiones  Retención
--   Gratuito      500              2.000                    2      30 días
--   Pro         5.000             10.000                    6     180 días
--   Business   25.000             50.000                   20     365 días
-- ============================================================

-- ---------- 1) `plan` acepta free | pro | business (+ legacy) ----------
alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants
  add constraint tenants_plan_check
  check (plan in ('free', 'pro', 'business', 'trial', 'resenas', 'completo'));

alter table public.tenants alter column plan set default 'free';

-- ---------- 2) Columnas de ampliaciones del ciclo (v3.7.0) ----------
alter table public.tenants add column if not exists extra_requests int not null default 0;
alter table public.tenants add column if not exists extra_syncs    int not null default 0;
alter table public.tenants add column if not exists extra_stored   int not null default 0;

-- ---------- 3) Migración de extras legacy → nuevo modelo ----------
-- Súmalos solo la primera vez (si extra_requests sigue a 0) para que repetir
-- la migración no infle la cuota.
do $$
begin
  update public.tenants
     set extra_requests = coalesce(extra_quota, 0) + coalesce(extra_whatsapp, 0)
   where extra_requests = 0
     and (coalesce(extra_quota, 0) > 0 or coalesce(extra_whatsapp, 0) > 0);
end $$;

-- ---------- 4) reset_expired_extras() con las columnas nuevas ----------
create or replace function public.reset_expired_extras()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  update public.tenants
     set extra_requests = 0,
         extra_reviews = 0,
         extra_ai = 0,
         extra_syncs = 0,
         extra_stored = 0,
         extra_quota_cycle = public.current_cycle()
   where extra_quota_cycle is distinct from public.current_cycle()
     and (
       coalesce(extra_requests, 0) > 0 or coalesce(extra_reviews, 0) > 0
       or coalesce(extra_ai, 0) > 0 or coalesce(extra_syncs, 0) > 0
       or coalesce(extra_stored, 0) > 0
     );
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.reset_expired_extras() from public;
grant execute on function public.reset_expired_extras() to service_role;

-- NOTA: `extra_stored` se pone a 0 al cerrar el ciclo en la app (lib/usage.ts);
-- si prefieres que las plazas extra de almacenamiento se mantengan mientras el
-- cliente las siga necesitando, quita `extra_stored = 0` de la función.

-- ---------- 5) Vista de cuotas para el panel interno (/admin) ----------
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
  -- Cuota de peticiones del ciclo = límite del plan + extras concedidos.
  case
    when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 500
    when t.plan in ('business', 'completo', 'ecommerce') then 2000
    else 50
  end
  + case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_requests, 0) else 0 end
    as quota_events,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_reviews, 0) else 0 end as extra_reviews,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_ai, 0) else 0 end as extra_ai,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_syncs, 0) else 0 end as extra_syncs,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_stored, 0) else 0 end as extra_stored,
  -- Topes de base de datos del plan (los aplica lib/usage.ts y la purga SQL).
  case
    when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 5000
    when t.plan in ('business', 'completo', 'ecommerce') then 25000
    else 500
  end as reviews_stored_cap,
  case
    when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 10000
    when t.plan in ('business', 'completo', 'ecommerce') then 50000
    else 2000
  end as audit_rows_cap,
  case
    when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 6
    when t.plan in ('business', 'completo', 'ecommerce') then 20
    else 2
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

-- ============================================================
-- 6) PURGA / ARCHIVADO a nivel de base de datos
-- ============================================================
-- Red de seguridad para que PostgreSQL/Supabase nunca se desborde aunque la
-- app no llegue a purgar (tarea programada, picos de ingesta, imports masivos).
-- Toda la purga es "lo más antiguo primero" y NUNCA toca datos vigentes.

-- 6.1 Opiniones: conserva las `p_keep` más recientes de una empresa.
create or replace function public.purge_reviews(p_tenant uuid, p_keep integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_boundary timestamptz;
  v_rows integer := 0;
begin
  if p_keep < 0 then p_keep := 0; end if;
  select r.created_at into v_boundary
    from public.reviews r
   where r.tenant_id = p_tenant
   order by r.created_at desc
   offset p_keep
   limit 1;
  if v_boundary is null then return 0; end if;
  delete from public.reviews r
   where r.tenant_id = p_tenant and r.created_at < v_boundary;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- 6.2 Auditoría (`quota_events`): purga por antigüedad y luego por volumen.
create or replace function public.purge_quota_events(p_tenant uuid, p_keep integer, p_days integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_boundary timestamptz;
  v_rows integer := 0;
  v_deleted integer := 0;
begin
  if p_days is not null and p_days > 0 then
    delete from public.quota_events q
     where q.tenant_id = p_tenant
       and q.created_at < now() - make_interval(days => p_days);
    get diagnostics v_deleted = row_count;
    v_rows := v_rows + v_deleted;
  end if;

  if p_keep < 0 then p_keep := 0; end if;
  select q.created_at into v_boundary
    from public.quota_events q
   where q.tenant_id = p_tenant
   order by q.created_at desc
   offset p_keep
   limit 1;
  if v_boundary is not null then
    delete from public.quota_events q
     where q.tenant_id = p_tenant and q.created_at < v_boundary;
    get diagnostics v_deleted = row_count;
    v_rows := v_rows + v_deleted;
  end if;
  return v_rows;
end;
$$;

-- 6.3 `system_logs` (tabla compartida): poda global por antigüedad.
create or replace function public.purge_system_logs(p_days integer default 365)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_rows integer := 0;
  v_days integer := greatest(coalesce(p_days, 365), 7);
begin
  delete from public.system_logs l
   where l.created_at < now() - make_interval(days => v_days);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- 6.4 Purga completa de una empresa aplicando los topes de SU plan.
create or replace function public.purge_tenant(p_tenant uuid)
returns table (reviews_purged integer, audit_purged integer)
language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_reviews_keep integer;
  v_audit_keep integer;
  v_audit_days integer;
begin
  select t.plan into v_plan from public.tenants t where t.id = p_tenant;
  if v_plan is null then
    return query select 0, 0;
    return;
  end if;

  if v_plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then
    v_reviews_keep := 5000; v_audit_keep := 10000; v_audit_days := 180;
  elsif v_plan in ('business', 'completo', 'ecommerce') then
    v_reviews_keep := 25000; v_audit_keep := 50000; v_audit_days := 365;
  else
    v_reviews_keep := 500; v_audit_keep := 2000; v_audit_days := 30;
  end if;

  -- Las plazas extra de almacenamiento amplían el tope de opiniones.
  if (select t.extra_quota_cycle from public.tenants t where t.id = p_tenant) = public.current_cycle() then
    v_reviews_keep := v_reviews_keep + coalesce((select t.extra_stored from public.tenants t where t.id = p_tenant), 0);
  end if;

  return query
    select
      public.purge_reviews(p_tenant, v_reviews_keep),
      public.purge_quota_events(p_tenant, v_audit_keep, v_audit_days);
end;
$$;

-- 6.5 Mantenimiento global: recorre todas las empresas + poda de logs.
create or replace function public.purge_all_tenants()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_count integer := 0;
begin
  for v_tenant in select id from public.tenants loop
    perform public.purge_tenant(v_tenant);
    v_count := v_count + 1;
  end loop;
  perform public.purge_system_logs(365);
  return v_count;
end;
$$;

revoke all on function public.purge_reviews(uuid, integer) from public;
revoke all on function public.purge_quota_events(uuid, integer, integer) from public;
revoke all on function public.purge_system_logs(integer) from public;
revoke all on function public.purge_tenant(uuid) from public;
revoke all on function public.purge_all_tenants() from public;
grant execute on function public.purge_reviews(uuid, integer) to service_role;
grant execute on function public.purge_quota_events(uuid, integer, integer) to service_role;
grant execute on function public.purge_system_logs(integer) to service_role;
grant execute on function public.purge_tenant(uuid) to service_role;
grant execute on function public.purge_all_tenants() to service_role;

-- 6.6 Programación opcional (Supabase con pg_cron habilitado):
--   select cron.schedule('reviewflow-purge', '15 * * * *', $$select public.purge_all_tenants()$$);
-- La app ya purga en cada lectura de cuota; esto es una segunda red de seguridad.

-- ============================================================
-- Fin de la migración v3.7.0 ✅
-- Siguiente paso: revisa `select * from public.v_quota_overview;`
-- ============================================================
