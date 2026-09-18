-- ============================================================
-- ReviewFlow AI v3.4.0 — Migración (si ya aplicaste schema.sql antes)
-- Supabase Dashboard → SQL Editor → pegar y Run. Idempotente.
-- Cambios: planes resenas/completo + cuotas + add-ons + triaje + tiendas.
-- ============================================================

-- 1) Renombrado de planes: starter→resenas, pro→completo
update public.tenants set plan = 'resenas' where plan = 'starter';
update public.tenants set plan = 'completo' where plan = 'pro';

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.tenants'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%plan%'
  loop
    execute format('alter table public.tenants drop constraint %I', r.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tenants'::regclass
      and conname = 'tenants_plan_check_v34'
  ) then
    alter table public.tenants
      add constraint tenants_plan_check_v34 check (plan in ('trial', 'resenas', 'completo'));
  end if;
end $$;

-- 2) Triaje privado en reviews
alter table public.reviews add column if not exists flagged_private boolean not null default false;
alter table public.reviews add column if not exists private_note text;

-- Marca como gestión privada las malas experiencias históricas sin respuesta
update public.reviews set flagged_private = true
where rating <= 3 and reply_text is null and flagged_private = false;

-- 3) Proveedores de tienda en integrations
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.integrations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider%'
  loop
    execute format('alter table public.integrations drop constraint %I', r.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.integrations'::regclass
      and conname = 'integrations_provider_check_v34'
  ) then
    alter table public.integrations
      add constraint integrations_provider_check_v34 check (
        provider in ('google', 'trustpilot', 'whatsapp', 'maps', 'shopify', 'woocommerce', 'store')
      );
  end if;
end $$;

-- 4) Contadores de uso + add-ons
create table if not exists public.usage_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle text not null,
  ai_responses int not null default 0,
  whatsapp_sent int not null default 0,
  reviews_ingested int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, cycle)
);

create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null default 'events_500',
  events int not null default 500,
  cycle text not null,
  stripe_payment_id text,
  created_at timestamptz not null default now()
);
create index if not exists addons_tenant_cycle_idx on public.addons (tenant_id, cycle);

alter table public.usage_counters enable row level security;
alter table public.addons enable row level security;
-- Sin policies: solo service_role.
