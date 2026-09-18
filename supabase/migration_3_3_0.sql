-- ============================================================
-- ReviewFlow AI v3.3.0 — Migración (solo si ya aplicaste schema.sql antes)
-- Supabase Dashboard → SQL Editor → pegar y Run. Idempotente.
-- Cambios: fin del plan gratis → trial/starter/pro + integraciones.
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) Planes: 'free' → 'trial' + nueva restricción
update public.tenants set plan = 'trial' where plan = 'free';

-- Elimina el check antiguo sea cual sea su nombre generado
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
      and conname = 'tenants_plan_check_v33'
  ) then
    alter table public.tenants
      add constraint tenants_plan_check_v33 check (plan in ('trial', 'starter', 'pro'));
  end if;
end $$;

alter table public.tenants alter column plan set default 'trial';
alter table public.tenants alter column subscription_status set default 'none';

-- 2) Nuevas columnas de tenants
alter table public.tenants add column if not exists trial_ends_at timestamptz;
alter table public.tenants
  add column if not exists api_key text unique default encode(gen_random_bytes(24), 'hex');
alter table public.tenants
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- Rellena api_key donde faltase (por si la columna ya existía vacía)
update public.tenants
set api_key = encode(gen_random_bytes(24), 'hex')
where api_key is null;

-- 3) Tabla de integraciones
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('google', 'trustpilot', 'whatsapp', 'maps')),
  status text not null default 'connected'
    check (status in ('connected', 'error', 'disconnected')),
  credentials jsonb not null default '{}'::jsonb,
  external_label text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

alter table public.integrations enable row level security;
-- Sin policies: solo service_role (servidor) accede a las credenciales.
