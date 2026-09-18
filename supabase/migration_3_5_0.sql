-- ============================================================
-- ReviewFlow AI v3.5.0 — Migración de cuotas reales + add-ons
-- ============================================================
-- Supabase Dashboard → SQL Editor → pegar y Run. Es IDEMPOTENTE:
-- puedes ejecutarla varias veces sin romper datos.
--
-- Qué añade:
--   1. `tenants.extra_quota / extra_reviews / extra_ai / extra_whatsapp`
--      → capacidad adicional del ciclo en curso (la escribe el webhook de
--        Stripe al cobrar un add-on; caduca sola al cambiar de mes).
--   2. `usage_counters.google_calls` → llamadas a Google (Business/Places).
--   3. `quota_events` → ledger auditable de cada evento consumido.
--   4. `addons` ampliado (pack, métricas, cantidad, importe, factura).
--   5. Función `consume_quota()` → incremento ATÓMICO (sin condiciones de
--      carrera entre webhooks y peticiones simultáneas).
--   6. Funciones de mantenimiento de ciclo (`reset_expired_extras`).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 0) Helper: ciclo actual (YYYY-MM) ----------
create or replace function public.current_cycle()
returns text language sql stable as $$
  select to_char(now(), 'YYYY-MM');
$$;

-- ---------- 1) Cuota extra en tenants ----------
alter table public.tenants add column if not exists extra_quota int not null default 0;
alter table public.tenants add column if not exists extra_reviews int not null default 0;
alter table public.tenants add column if not exists extra_ai int not null default 0;
alter table public.tenants add column if not exists extra_whatsapp int not null default 0;
-- Ciclo (YYYY-MM) al que pertenecen los extras. Si no coincide con el actual,
-- el servidor los pone a 0 en la siguiente lectura (rollOverExtras).
alter table public.tenants add column if not exists extra_quota_cycle text;

comment on column public.tenants.extra_quota is
  'Eventos extra del ciclo actual concedidos por add-ons de Stripe (webhook).';

-- ---------- 2) Contadores: llamadas a Google ----------
alter table public.usage_counters add column if not exists google_calls int not null default 0;
alter table public.usage_counters add column if not exists updated_at timestamptz not null default now();

-- ---------- 3) Ledger de eventos consumidos ----------
create table if not exists public.quota_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle text not null default public.current_cycle(),
  kind text not null check (kind in ('reviews', 'ai', 'whatsapp', 'google_call')),
  amount int not null default 1,
  source text not null default 'app',
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists quota_events_tenant_cycle_idx
  on public.quota_events (tenant_id, cycle, created_at desc);
create index if not exists quota_events_created_idx
  on public.quota_events (created_at desc);

alter table public.quota_events enable row level security;
-- Sin policies: solo service_role (el servidor escribe y audita).

-- ---------- 4) Add-ons ampliados ----------
alter table public.addons add column if not exists pack text;
alter table public.addons add column if not exists reviews int not null default 0;
alter table public.addons add column if not exists ai int not null default 0;
alter table public.addons add column if not exists whatsapp int not null default 0;
alter table public.addons add column if not exists quantity int not null default 1;
alter table public.addons add column if not exists unit_amount_cents int;
alter table public.addons add column if not exists stripe_invoice_id text;

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

-- Backfill: `pack` = `type` en compras anteriores.
update public.addons set pack = type where pack is null;

-- ---------- 5) Función ATÓMICA de consumo ----------
-- Uso desde el servidor: admin.rpc('consume_quota', { p_tenant, p_metric, p_amount })
-- Devuelve los contadores actualizados del ciclo en curso.
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
  google_calls integer
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
      select u.tenant_id, u.cycle, u.ai_responses, u.whatsapp_sent, u.reviews_ingested, u.google_calls
      from public.usage_counters u
      where u.tenant_id = p_tenant and u.cycle = v_cycle;
    return;
  end if;

  insert into public.usage_counters as u (tenant_id, cycle, ai_responses, whatsapp_sent, reviews_ingested, google_calls, updated_at)
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
  returning u.tenant_id, u.cycle, u.ai_responses, u.whatsapp_sent, u.reviews_ingested, u.google_calls
  into tenant_id, cycle, ai_responses, whatsapp_sent, reviews_ingested, google_calls;

  -- Auditoría: cada consumo queda trazado (quién, qué, cuándo).
  insert into public.quota_events (tenant_id, cycle, kind, amount, source)
  values (p_tenant, v_cycle, p_metric, v_amount, 'consume_quota');

  return next;
end;
$$;

revoke all on function public.consume_quota(uuid, text, integer) from public;
grant execute on function public.consume_quota(uuid, text, integer) to service_role;

-- ---------- 6) Mantenimiento de ciclo ----------
-- Pone a 0 los extras cuyo ciclo ya pasó. Ejecutable a mano o con pg_cron:
--   select cron.schedule('rf-reset-extras', '5 0 1 * *', $$select public.reset_expired_extras()$$);
create or replace function public.reset_expired_extras()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_rows integer;
begin
  update public.tenants
     set extra_quota = 0,
         extra_reviews = 0,
         extra_ai = 0,
         extra_whatsapp = 0,
         extra_quota_cycle = public.current_cycle()
   where extra_quota_cycle is distinct from public.current_cycle()
     and (extra_quota > 0 or extra_reviews > 0 or extra_ai > 0 or extra_whatsapp > 0);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.reset_expired_extras() from public;
grant execute on function public.reset_expired_extras() to service_role;

-- ---------- 7) Vista de cuotas para el panel /admin ----------
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
  coalesce(a.events, 0) as addon_events
from public.tenants t
left join public.usage_counters u
  on u.tenant_id = t.id and u.cycle = public.current_cycle()
left join lateral (
  select count(*)::int as packs, coalesce(sum(events), 0)::int as events
  from public.addons x
  where x.tenant_id = t.id and x.cycle = public.current_cycle()
) a on true;

-- PG15+: la vista respeta las policies RLS del usuario que consulta.
do $$ begin
  execute 'alter view public.v_quota_overview set (security_invoker = on)';
exception when others then
  raise warning 'security_invoker no aplicado (Postgres < 15): %', sqlerrm;
end $$;

-- ---------- 8) RLS recordatorio ----------
alter table public.tenants enable row level security;
alter table public.usage_counters enable row level security;
alter table public.addons enable row level security;
alter table public.quota_events enable row level security;

-- ============================================================
-- Verificación rápida tras ejecutar:
--   select * from public.v_quota_overview;
--   select public.consume_quota('<uuid-tenant>', 'reviews', 1);
--   select * from public.usage_counters;
--   select * from public.quota_events order by id desc limit 10;
-- ============================================================
