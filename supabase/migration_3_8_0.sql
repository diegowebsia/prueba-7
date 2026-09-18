-- ============================================================
-- ReviewFlow AI v3.8.0 — IA medida, pooling y blindaje de datos
-- ============================================================
-- Supabase Dashboard → SQL Editor → pegar y Run. Es IDEMPOTENTE.
--
-- Qué añade:
--   1. `usage_counters.ai_tokens_in / ai_tokens_out` → consumo REAL de tokens
--      de IA por ciclo y empresa (lo escribe lib/ai.ts vía consume_ai_tokens).
--   2. `tenants.ai_tokens_in / ai_tokens_out / ai_requests / ai_cost_usd` →
--      totales acumulados rápidos para el panel interno y el control de coste.
--   3. Tabla `ai_interactions` → ledger auditable de CADA llamada de IA
--      (modelo, propósito, tokens, coste estimado, latencia, resultado).
--   4. RPC `consume_ai_tokens(tenant, tokens_in, tokens_out)` → suma atómica.
--   5. `consume_quota` actualizada para devolver también los tokens.
--   6. Purga de IA dentro de `purge_tenant()` (respeta `limits.aiRows`).
--   7. Vista `v_ai_usage` (tokens y coste por empresa y ciclo).
--   8. Índices de rendimiento + RLS en `ai_interactions`.
--
-- Presupuesto de tokens por plan (lib/plans.ts → limits.aiTokensPerMonth):
--   Gratuito  30.000 tokens · Pro 250.000 tokens · Business 1.200.000 tokens
--   Filas de contabilidad (limits.aiRows): 2.000 / 20.000 / 100.000
-- ============================================================

-- ---------- 1) Tokens por ciclo en usage_counters ----------
alter table public.usage_counters add column if not exists ai_tokens_in  int not null default 0;
alter table public.usage_counters add column if not exists ai_tokens_out int not null default 0;

comment on column public.usage_counters.ai_tokens_in  is 'Tokens de entrada (prompt) consumidos en el ciclo.';
comment on column public.usage_counters.ai_tokens_out is 'Tokens de salida (completion) consumidos en el ciclo.';

-- ---------- 2) Totales acumulados por empresa ----------
alter table public.tenants add column if not exists ai_tokens_in  bigint not null default 0;
alter table public.tenants add column if not exists ai_tokens_out bigint not null default 0;
alter table public.tenants add column if not exists ai_requests   bigint not null default 0;
alter table public.tenants add column if not exists ai_cost_usd   numeric(12, 6) not null default 0;

comment on column public.tenants.ai_cost_usd is
  'Coste estimado acumulado de IA en USD (precio público del modelo; referencia de margen).';

-- ---------- 3) Ledger de interacciones de IA ----------
create table if not exists public.ai_interactions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle text not null default to_char(now(), 'YYYY-MM'),
  model text not null default 'gpt-4o-mini',
  purpose text not null default 'reply',
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int generated always as (prompt_tokens + completion_tokens) stored,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms int not null default 0,
  provider text not null default 'openai',
  ok boolean not null default true,
  error_code text,
  review_id uuid references public.reviews(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Índices: consultas por empresa+ciclo (panel) y purga por antigüedad.
create index if not exists ai_interactions_tenant_cycle_idx
  on public.ai_interactions (tenant_id, cycle, created_at desc);
create index if not exists ai_interactions_created_idx
  on public.ai_interactions (created_at desc);

-- ---------- 4) RPC de tokens (suma atómica) ----------
create or replace function public.consume_ai_tokens(
  p_tenant uuid,
  p_tokens_in integer default 0,
  p_tokens_out integer default 0
)
returns table (tenant_id uuid, cycle text, ai_tokens_in integer, ai_tokens_out integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle text := public.current_cycle();
  v_in integer := greatest(0, coalesce(p_tokens_in, 0));
  v_out integer := greatest(0, coalesce(p_tokens_out, 0));
begin
  insert into public.usage_counters as u (tenant_id, cycle, ai_tokens_in, ai_tokens_out, updated_at)
  values (p_tenant, v_cycle, v_in, v_out, now())
  on conflict (tenant_id, cycle) do update set
    ai_tokens_in = u.ai_tokens_in + excluded.ai_tokens_in,
    ai_tokens_out = u.ai_tokens_out + excluded.ai_tokens_out,
    updated_at = now()
  returning u.tenant_id, u.cycle, u.ai_tokens_in, u.ai_tokens_out
  into tenant_id, cycle, ai_tokens_in, ai_tokens_out;

  return next;
end;
$$;

revoke all on function public.consume_ai_tokens(uuid, integer, integer) from public;
grant execute on function public.consume_ai_tokens(uuid, integer, integer) to service_role;

-- ---------- 5) consume_quota devuelve también los tokens ----------
drop function if exists public.consume_quota(uuid, text, integer);

create or replace function public.consume_quota(
  p_tenant uuid,
  p_metric text,
  p_amount integer default 1
)
returns table (
  tenant_id uuid,
  cycle text,
  ai_responses integer,
  whatsapp_sent integer,
  reviews_ingested integer,
  google_calls integer,
  ai_tokens_in integer,
  ai_tokens_out integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle text := public.current_cycle();
  v_amount integer := greatest(0, coalesce(p_amount, 1));
begin
  if v_amount = 0 and p_metric <> 'google_call' then
    return query
      select u.tenant_id, u.cycle, u.ai_responses, u.whatsapp_sent, u.reviews_ingested, u.google_calls,
             u.ai_tokens_in, u.ai_tokens_out
      from public.usage_counters u
      where u.tenant_id = p_tenant and u.cycle = v_cycle;
    return;
  end if;

  insert into public.usage_counters as u (
    tenant_id, cycle, ai_responses, whatsapp_sent, reviews_ingested, google_calls, updated_at
  )
  values (
    p_tenant,
    v_cycle,
    case when p_metric = 'ai' then v_amount else 0 end,
    case when p_metric = 'whatsapp' then v_amount else 0 end,
    case when p_metric = 'reviews' then v_amount else 0 end,
    case when p_metric = 'google_call' then v_amount else 0 end,
    now()
  )
  on conflict (tenant_id, cycle) do update set
    ai_responses = u.ai_responses + excluded.ai_responses,
    whatsapp_sent = u.whatsapp_sent + excluded.whatsapp_sent,
    reviews_ingested = u.reviews_ingested + excluded.reviews_ingested,
    google_calls = u.google_calls + excluded.google_calls,
    updated_at = now()
  returning u.tenant_id, u.cycle, u.ai_responses, u.whatsapp_sent, u.reviews_ingested, u.google_calls,
            u.ai_tokens_in, u.ai_tokens_out
  into tenant_id, cycle, ai_responses, whatsapp_sent, reviews_ingested, google_calls, ai_tokens_in, ai_tokens_out;

  insert into public.quota_events (tenant_id, cycle, kind, amount, source)
  values (p_tenant, v_cycle, p_metric, v_amount, 'consume_quota');

  return next;
end;
$$;

revoke all on function public.consume_quota(uuid, text, integer) from public;
grant execute on function public.consume_quota(uuid, text, integer) to service_role;

-- ---------- 6) Purga de IA dentro de purge_tenant ----------
create or replace function public.purge_ai_interactions(p_tenant uuid, p_keep integer, p_days integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_boundary timestamptz;
  v_rows integer := 0;
  v_deleted integer := 0;
begin
  if p_days is not null and p_days > 0 then
    delete from public.ai_interactions a
     where a.tenant_id = p_tenant
       and a.created_at < now() - make_interval(days => p_days);
    get diagnostics v_deleted = row_count;
    v_rows := v_rows + v_deleted;
  end if;

  if p_keep < 0 then p_keep := 0; end if;
  select a.created_at into v_boundary
    from public.ai_interactions a
   where a.tenant_id = p_tenant
   order by a.created_at desc
   offset p_keep
   limit 1;
  if v_boundary is not null then
    delete from public.ai_interactions a
     where a.tenant_id = p_tenant and a.created_at < v_boundary;
    get diagnostics v_deleted = row_count;
    v_rows := v_rows + v_deleted;
  end if;
  return v_rows;
end;
$$;

revoke all on function public.purge_ai_interactions(uuid, integer, integer) from public;
grant execute on function public.purge_ai_interactions(uuid, integer, integer) to service_role;

-- purge_tenant() ahora incluye la tabla de IA (mismos topes que lib/plans.ts).
drop function if exists public.purge_tenant(uuid);

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

  if v_plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then
    v_reviews_keep := 5000; v_audit_keep := 10000; v_ai_keep := 20000; v_days := 180;
  elsif v_plan in ('business', 'completo', 'ecommerce') then
    v_reviews_keep := 25000; v_audit_keep := 50000; v_ai_keep := 100000; v_days := 365;
  else
    v_reviews_keep := 500; v_audit_keep := 2000; v_ai_keep := 2000; v_days := 30;
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

revoke all on function public.purge_tenant(uuid) from public;
grant execute on function public.purge_tenant(uuid) to service_role;

-- ---------- 7) Vista de IA para el panel interno ----------
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
    when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 250000
    when t.plan in ('business', 'completo', 'ecommerce') then 1200000
    else 30000
  end as tokens_limit,
  round(
    100.0 * (coalesce(u.ai_tokens_in, 0) + coalesce(u.ai_tokens_out, 0))
    / greatest(case
        when t.plan in ('pro', 'resenas', 'starter', 'standard', 'estandar') then 250000
        when t.plan in ('business', 'completo', 'ecommerce') then 1200000
        else 30000
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

-- ---------- 8) RLS de ai_interactions ----------
alter table public.ai_interactions enable row level security;

-- El cliente puede LEER su propio consumo de IA (el panel lo muestra);
-- la escritura queda reservada al service_role (servidor).
drop policy if exists "ai_interactions_select_member" on public.ai_interactions;
create policy "ai_interactions_select_member" on public.ai_interactions
  for select using (public.is_member(tenant_id));

-- ---------- 9) Índices de rendimiento (tablas clave) ----------
-- Opiniones: bandeja por empresa (created_at desc) y filtro de triaje privado.
create index if not exists reviews_tenant_private_idx
  on public.reviews (tenant_id, flagged_private, created_at desc);
-- Auditoría de cuota: consultas del ciclo y purga por antigüedad.
create index if not exists quota_events_tenant_created_idx
  on public.quota_events (tenant_id, created_at desc);
-- Suscripciones: cobros y avisos por estado (panel interno y webhooks).
create index if not exists tenants_subscription_idx
  on public.tenants (subscription_status, plan);
create index if not exists tenants_owner_idx
  on public.tenants (owner_id);
-- Integraciones: una por proveedor y empresa, con su estado.
create index if not exists integrations_tenant_status_idx
  on public.integrations (tenant_id, status);
-- Ampliaciones: se leen por ciclo en cada cálculo de cuota.
create index if not exists addons_tenant_cycle_created_idx
  on public.addons (tenant_id, cycle, created_at desc);
-- usage_counters tiene PK (tenant_id, cycle): suficiente para la cuota.

-- Estadísticas frescas para que el planificador use los índices nuevos.
-- (En Supabase no hace falta, pero no molesta.)
do $$ begin
  perform 1;
end $$;

-- ============================================================
-- Fin de la migración v3.8.0 ✅
-- Comprueba:  select * from public.v_ai_usage order by pct_used desc limit 10;
-- ============================================================
