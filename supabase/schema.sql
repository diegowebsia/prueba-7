-- ============================================================
-- ReviewFlow AI v3.8.0 — Esquema Supabase (Postgres + RLS)
-- Cómo aplicarlo: Supabase Dashboard → SQL Editor → pegar y Run.
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- v3.8.0: contabilidad de TOKENS de IA (`usage_counters.ai_tokens_*`,
--         `tenants.ai_*`, tabla `ai_interactions`, RPC `consume_ai_tokens`,
--         vista `v_ai_usage`), purga de IA y índices de rendimiento.
-- v3.7.0: 3 planes (free | pro | business), ampliaciones del ciclo
--         (extra_requests / extra_reviews / extra_ai / extra_syncs /
--         extra_stored), vista `v_quota_overview` recalculada y funciones
--         de purga por plan (`purge_tenant`, `purge_all_tenants`) como red
--         de seguridad para no desbordar PostgreSQL/Supabase.
-- ============================================================

-- ---------- Extensiones ----------
create extension if not exists "pgcrypto";

-- ---------- Tabla: tenants (empresas) ----------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid references auth.users(id) on delete set null,
  owner_email text not null,
  -- Planes v3.7.0: free (Gratuito) · pro · business. Los nombres antiguos
  -- (trial / resenas / completo) siguen aceptándose para no romper filas.
  plan text not null default 'free'
    check (plan in ('free', 'pro', 'business', 'trial', 'resenas', 'completo')),
  subscription_status text not null default 'none'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'none')),
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  -- Clave API por empresa para la ingesta de reseñas (autogenerada).
  api_key text unique not null default encode(gen_random_bytes(24), 'hex'),
  -- Ajustes: { tone, place_id (Maps), whatsapp_to }
  settings jsonb not null default '{}'::jsonb,
  suspended boolean not null default false,
  -- v3.7.0 — Ampliaciones del ciclo (recargas de pago único compradas en Stripe).
  -- Caducan solas al cambiar de mes (ver reset_expired_extras + lib/usage.ts).
  extra_requests int not null default 0, -- peticiones de opiniones (email + WhatsApp)
  extra_reviews  int not null default 0, -- opiniones importadas extra
  extra_ai       int not null default 0, -- respuestas con IA extra
  extra_syncs    int not null default 0, -- sincronizaciones automáticas extra
  extra_stored   int not null default 0, -- plazas extra de almacenamiento (opiniones)
  -- v3.8.0 — Totales acumulados de IA (coste y tokens históricos).
  ai_tokens_in  bigint not null default 0,
  ai_tokens_out bigint not null default 0,
  ai_requests   bigint not null default 0,
  ai_cost_usd   numeric(12, 6) not null default 0,
  extra_quota_cycle text,
  -- Columnas legacy v3.4-v3.6 (histórico inerte; la migración v3.7.0 las
  -- volcó a `extra_requests`). No se usan en el modelo actual.
  extra_quota int not null default 0,
  extra_whatsapp int not null default 0,
  whatsapp_unlimited boolean not null default false,
  reviews_unlimited  boolean not null default false,
  extra_locations    int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- v3.7.0: columnas y constraints idempotentes (proyectos ya creados) ----------
-- Permite ejecutar schema.sql sobre una BD v3.5/v3.6 sin re-crear `tenants`.
alter table public.tenants add column if not exists extra_requests int not null default 0;
alter table public.tenants add column if not exists extra_syncs    int not null default 0;
alter table public.tenants add column if not exists extra_stored   int not null default 0;
alter table public.tenants add column if not exists ai_tokens_in   bigint not null default 0;
alter table public.tenants add column if not exists ai_tokens_out  bigint not null default 0;
alter table public.tenants add column if not exists ai_requests    bigint not null default 0;
alter table public.tenants add column if not exists ai_cost_usd    numeric(12, 6) not null default 0;
alter table public.tenants add column if not exists extra_reviews int not null default 0;
alter table public.tenants add column if not exists extra_ai      int not null default 0;
alter table public.tenants add column if not exists extra_quota_cycle text;
alter table public.usage_counters add column if not exists ai_tokens_in  int not null default 0;
alter table public.usage_counters add column if not exists ai_tokens_out int not null default 0;
alter table public.tenants add column if not exists whatsapp_unlimited boolean not null default false;
alter table public.tenants add column if not exists reviews_unlimited  boolean not null default false;
alter table public.tenants add column if not exists extra_locations    int not null default 0;

-- El check de `plan` solo acepta planes de pago (ver migration_3_9_0.sql
-- para migrar instalaciones con filas legacy).
do $$
begin
  -- Normaliza filas antiguas antes de endurecer el constraint.
  update public.tenants set plan = 'pro'
   where plan in ('free', 'trial', 'gratis', 'gratuito', 'starter', 'standard', 'estandar', 'resenas', 'solo-resenas');
  update public.tenants set plan = 'business'
   where plan in ('completo', 'completo-ecommerce', 'ecommerce', 'enterprise');
  update public.tenants set plan = 'pro' where plan not in ('pro', 'business');
exception when others then
  raise warning 'Normalización de planes omitida: %', sqlerrm;
end $$;
alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants
  add constraint tenants_plan_check
  check (plan in ('pro', 'business'));
alter table public.tenants alter column plan set default 'pro';

-- Migración de extras legacy → nuevo modelo (solo si aún están a 0).
do $$
begin
  update public.tenants
     set extra_requests = coalesce(extra_quota, 0) + coalesce(extra_whatsapp, 0)
   where extra_requests = 0
     and (coalesce(extra_quota, 0) > 0 or coalesce(extra_whatsapp, 0) > 0);
end $$;

-- ---------- Tabla: memberships (miembros por empresa) ----------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- ---------- Tabla: reviews (reseñas) ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null default 'google' check (source in ('google', 'trustpilot', 'tripadvisor', 'facebook', 'manual', 'places')),
  external_id text,
  author_name text not null default 'Anónimo',
  rating int not null check (rating between 1 and 5),
  text text not null default '',
  reply_text text,
  replied_at timestamptz,
  -- Dir. UE 2019/2161: true si la plataforma de origen confirma consumo real.
  is_verified boolean not null default false,
  -- Filtro privado IA (plan Solo Reseñas): malas experiencias (≤3★) para gestión interna.
  flagged_private boolean not null default false,
  private_note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, source, external_id)
);
create index if not exists reviews_tenant_created_idx on public.reviews (tenant_id, created_at desc);

-- ---------- Tabla: system_logs ----------
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null default 'info' check (level in ('info', 'warn', 'error')),
  source text not null default 'app',
  message text not null,
  meta jsonb
);
create index if not exists system_logs_created_idx on public.system_logs (created_at desc);

-- ---------- Tabla: integrations (conexiones reales por empresa) ----------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('google', 'trustpilot', 'tripadvisor', 'whatsapp', 'maps', 'shopify', 'woocommerce', 'store')),
  status text not null default 'connected'
    check (status in ('connected', 'error', 'disconnected')),
  -- Credenciales OAuth/API (solo accesibles con service_role, nunca desde cliente).
  credentials jsonb not null default '{}'::jsonb,
  external_label text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- ---------- Tabla: usage_counters (cuotas mensuales por empresa) ----------
create table if not exists public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle text not null, -- YYYY-MM
  ai_responses int not null default 0,
  whatsapp_sent int not null default 0,
  reviews_ingested int not null default 0,
  google_calls int not null default 0, -- llamadas a Google Business / Places
  -- v3.8.0: consumo REAL de tokens de IA del ciclo (entrada + salida).
  ai_tokens_in int not null default 0,
  ai_tokens_out int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, cycle)
);

-- ---------- Tabla: quota_events (ledger auditable de consumo) ----------
-- `kind` usa los identificadores históricos de la RPC consume_quota():
-- reviews | ai | whatsapp | google_call. Los topes por empresa
-- (`limits.auditRows` / `limits.logRetentionDays`) los aplica lib/usage.ts
-- y, como red de seguridad, purge_quota_events().
create table if not exists public.quota_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle text not null default to_char(now(), 'YYYY-MM'),
  kind text not null check (kind in ('reviews', 'ai', 'whatsapp', 'google_call')),
  amount int not null default 1,
  source text not null default 'app',
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists quota_events_tenant_cycle_idx
  on public.quota_events (tenant_id, cycle, created_at desc);

-- ---------- Tabla: ai_interactions (ledger de llamadas de IA) ----------
-- Una fila por llamada al proveedor: modelo, propósito, tokens, coste
-- estimado, latencia y resultado. Es la base del control de coste de OpenAI
-- y del histórico que ve el panel interno. Los topes por empresa
-- (`limits.aiRows`) y la retención (`limits.logRetentionDays`) los aplica
-- lib/usage.ts y, como red de seguridad, `purge_ai_interactions()`.
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
  -- v3.10.0 — IA asíncrona (cola QStash): job_id para consultar el resultado.
  job_id text,
  result_text text,
  result_status text not null default 'ready'
    check (result_status in ('pending', 'ready', 'error')),
  created_at timestamptz not null default now()
);
create index if not exists ai_interactions_job_idx on public.ai_interactions (job_id);
create index if not exists ai_interactions_tenant_cycle_idx
  on public.ai_interactions (tenant_id, cycle, created_at desc);
create index if not exists ai_interactions_created_idx
  on public.ai_interactions (created_at desc);

-- ---------- v3.10.0: opt-in WhatsApp (RGPD) ----------
create table if not exists public.whatsapp_optins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  customer_name text,
  order_id text,
  source text not null default 'checkout'
    check (source in ('checkout', 'order', 'manual', 'import')),
  proof_text text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, phone)
);
create index if not exists whatsapp_optins_tenant_idx on public.whatsapp_optins (tenant_id, created_at desc);

-- ---------- v3.10.0: ventana conversacional WhatsApp (24 h Meta) ----------
create table if not exists public.whatsapp_contacts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);

-- ---------- v3.10.0: Embudo Privado de Satisfacción ----------
create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  kind text not null check (kind in ('redirect', 'ticket')),
  channel text check (channel in ('google', 'tripadvisor', 'trustpilot')),
  customer_name text,
  contact text,
  message text,
  order_id text,
  status text not null default 'open' check (status in ('open', 'closed')),
  resolved_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_tenant_created_idx
  on public.feedback_responses (tenant_id, created_at desc);
create index if not exists feedback_tenant_kind_idx
  on public.feedback_responses (tenant_id, kind, status);

-- ---------- Tabla: addons (ampliaciones de cuota compradas) ----------
create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null default 'events_500',
  pack text, -- events_500 | reviews_500 | ai_500 | whatsapp_1000
  events int not null default 500,
  reviews int not null default 0,
  ai int not null default 0,
  whatsapp int not null default 0,
  quantity int not null default 1,
  unit_amount_cents int,
  cycle text not null, -- YYYY-MM en que se disfrutan
  stripe_payment_id text,
  stripe_invoice_id text,
  created_at timestamptz not null default now()
);
create index if not exists addons_tenant_cycle_idx on public.addons (tenant_id, cycle);
-- Idempotencia de webhooks reintentados.
-- Idempotencia de webhooks reintentados: un pago = una concesión.
-- (Se crea dentro de un bloque tolerante: si hubiera duplicados históricos,
--  avisa con un WARNING en vez de abortar toda la migración.)
do $$ begin
  create unique index if not exists addons_payment_unique_idx
    on public.addons (stripe_payment_id) where stripe_payment_id is not null;
exception when others then
  raise warning 'addons_payment_unique_idx no creado (revisa pagos duplicados): %', sqlerrm;
end $$;

do $$ begin
  create unique index if not exists addons_invoice_unique_idx
    on public.addons (stripe_invoice_id) where stripe_invoice_id is not null;
exception when others then
  raise warning 'addons_invoice_unique_idx no creado (revisa facturas duplicadas): %', sqlerrm;
end $$;

-- ---------- Funciones de cuota ----------
-- Ciclo actual (YYYY-MM).
create or replace function public.current_cycle()
returns text language sql stable as $$
  select to_char(now(), 'YYYY-MM');
$$;

-- Consumo ATÓMICO de cuota + traza en el ledger.
-- Desde el servidor: admin.rpc('consume_quota', { p_tenant, p_metric, p_amount })
-- Devuelve también los tokens de IA acumulados en el ciclo (v3.8.0).
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

-- Tokens de IA: suma ATÓMICA del ciclo (lo llama lib/ai.ts tras cada generación).
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

-- Pone a 0 los extras de ciclos ya cerrados (a mano o con pg_cron el día 1).
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

-- Vista de cuotas para el panel interno (/admin).
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
    when t.plan in ('business', 'completo', 'ecommerce') then 2000
    else 500
  end
  + case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_requests, 0) else 0 end
    as quota_events,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_reviews, 0) else 0 end as extra_reviews,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_ai, 0) else 0 end as extra_ai,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_syncs, 0) else 0 end as extra_syncs,
  case when t.extra_quota_cycle = public.current_cycle() then coalesce(t.extra_stored, 0) else 0 end as extra_stored,
  -- Topes de base de datos del plan (los aplica lib/usage.ts y la purga SQL).
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

-- ============================================================
-- PURGA / ARCHIVADO a nivel de base de datos
-- ============================================================
-- Red de seguridad para que PostgreSQL/Supabase nunca se desborde aunque la
-- app no llegue a purgar (picos de ingesta, imports masivos, tareas
-- programadas). La purga es siempre «lo más antiguo primero» y nunca toca
-- datos vigentes. lib/usage.ts aplica los mismos topes en cada petición.

-- Purga de opiniones: conserva las `p_keep` más recientes de una empresa.
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

-- Purga de auditoría (`quota_events`): purga por antigüedad y luego por volumen.
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

-- Purga de `system_logs` (tabla compartida): poda global por antigüedad.
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

-- Purga de `ai_interactions`: por antigüedad y por volumen (respeta el ciclo).
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

-- Purga completa de una empresa aplicando los topes de SU plan
-- (opiniones, auditoría de cuota y contabilidad de IA).
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

  if v_plan in ('business', 'completo', 'ecommerce') then
    v_reviews_keep := 25000; v_audit_keep := 50000; v_ai_keep := 100000; v_days := 365;
  else
    v_reviews_keep := 5000; v_audit_keep := 10000; v_ai_keep := 20000; v_days := 180;
  end if;

  -- Las plazas extra de almacenamiento amplían el tope de opiniones.
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

-- Mantenimiento global: recorre todas las empresas + poda de logs.
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
revoke all on function public.purge_ai_interactions(uuid, integer, integer) from public;
revoke all on function public.purge_quota_events(uuid, integer, integer) from public;
revoke all on function public.purge_system_logs(integer) from public;
revoke all on function public.purge_tenant(uuid) from public;
revoke all on function public.purge_all_tenants() from public;
grant execute on function public.purge_reviews(uuid, integer) to service_role;
grant execute on function public.purge_ai_interactions(uuid, integer, integer) to service_role;
grant execute on function public.purge_quota_events(uuid, integer, integer) to service_role;
grant execute on function public.purge_system_logs(integer) to service_role;
grant execute on function public.purge_tenant(uuid) to service_role;
grant execute on function public.purge_all_tenants() to service_role;

-- Programación opcional (Supabase con pg_cron habilitado):
--   select cron.schedule('reviewflow-purge', '15 * * * *', $$select public.purge_all_tenants()$$);
-- La app ya purga en cada lectura de cuota; esto es una segunda red de seguridad.


-- Vista de consumo de IA (panel interno): tokens, coste y % del presupuesto.
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

-- ---------- Índices de rendimiento (v3.8.0) ----------
create index if not exists reviews_tenant_private_idx
  on public.reviews (tenant_id, flagged_private, created_at desc);
create index if not exists quota_events_tenant_created_idx
  on public.quota_events (tenant_id, created_at desc);
create index if not exists tenants_subscription_idx
  on public.tenants (subscription_status, plan);
create index if not exists tenants_owner_idx
  on public.tenants (owner_id);
create index if not exists integrations_tenant_status_idx
  on public.integrations (tenant_id, status);
create index if not exists addons_tenant_cycle_created_idx
  on public.addons (tenant_id, cycle, created_at desc);

-- ---------- updated_at automático ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch
  before update on public.tenants
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- Regla: solo los miembros ven/escriben los datos de su empresa.
-- El service_role (servidor) bypassa RLS para webhooks y /admin.
-- ============================================================
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.reviews enable row level security;
alter table public.system_logs enable row level security;
alter table public.integrations enable row level security;
alter table public.usage_counters enable row level security;
alter table public.addons enable row level security;
alter table public.quota_events enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.whatsapp_optins enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.feedback_responses enable row level security;

-- Helper: ¿es auth.uid() miembro del tenant?
create or replace function public.is_member(tid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = tid and m.user_id = auth.uid()
  );
$$;

-- tenants: ver solo donde soy miembro; crear libre (el servidor asigna owner); sin update/delete directo
drop policy if exists "tenants_select_member" on public.tenants;
create policy "tenants_select_member" on public.tenants
  for select using (public.is_member(id));

drop policy if exists "tenants_insert_auth" on public.tenants;
create policy "tenants_insert_auth" on public.tenants
  for insert with check (auth.role() = 'authenticated');

-- memberships: ver las mías
drop policy if exists "memberships_select_own" on public.memberships;
create policy "memberships_select_own" on public.memberships
  for select using (user_id = auth.uid());

-- reviews: leer/escribir solo de mis empresas
drop policy if exists "reviews_select_member" on public.reviews;
create policy "reviews_select_member" on public.reviews
  for select using (public.is_member(tenant_id));

drop policy if exists "reviews_insert_member" on public.reviews;
create policy "reviews_insert_member" on public.reviews
  for insert with check (public.is_member(tenant_id));

drop policy if exists "reviews_update_member" on public.reviews;
create policy "reviews_update_member" on public.reviews
  for update using (public.is_member(tenant_id));

-- ai_interactions: el cliente LEE su propio consumo de IA (panel de uso);
-- la escritura queda reservada al service_role (servidor).
drop policy if exists "ai_interactions_select_member" on public.ai_interactions;
create policy "ai_interactions_select_member" on public.ai_interactions
  for select using (public.is_member(tenant_id));

-- whatsapp_optins + feedback_responses: el miembro LEE los de su empresa;
-- la escritura pública pasa por service_role en servidor.
drop policy if exists "whatsapp_optins_select_member" on public.whatsapp_optins;
create policy "whatsapp_optins_select_member" on public.whatsapp_optins
  for select using (public.is_member(tenant_id));

drop policy if exists "feedback_select_member" on public.feedback_responses;
create policy "feedback_select_member" on public.feedback_responses
  for select using (public.is_member(tenant_id));

-- system_logs: sin acceso directo desde cliente (solo service_role en servidor)
-- (no se crean policies = denegado por defecto con RLS activo)

-- integrations: igual que system_logs (credenciales solo en servidor).
-- usage_counters + addons + quota_events: solo service_role (el servidor los
-- lee y escribe; el cliente consulta el consumo vía /api/tenants/usage).
