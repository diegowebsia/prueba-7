-- ReviewFlow AI v3.11.0 — seguridad, idempotencia y multipack
begin;

alter table public.tenants drop constraint if exists tenants_subscription_status_check;
alter table public.tenants add constraint tenants_subscription_status_check
  check (subscription_status in ('trialing','active','past_due','canceled','inactive','paused','none'));

-- El modelo anterior impedía varias líneas del mismo pago.
drop index if exists public.addons_payment_unique_idx;
drop index if exists public.addons_invoice_unique_idx;
create unique index addons_payment_unique_idx on public.addons(stripe_payment_id, pack)
  where stripe_payment_id is not null;
create unique index addons_invoice_unique_idx on public.addons(stripe_invoice_id, pack)
  where stripe_invoice_id is not null;

create table if not exists public.processed_events (
  id bigint generated always as identity primary key,
  provider text not null,
  tenant_scope text not null default 'global',
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, tenant_scope, event_id)
);
create index if not exists processed_events_created_idx on public.processed_events(created_at);
alter table public.processed_events enable row level security;

create table if not exists public.api_rate_limits (
  key_hash text primary key,
  count int not null default 0,
  reset_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns table(allowed boolean, retry_after int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.api_rate_limits%rowtype;
begin
  insert into public.api_rate_limits(key_hash, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update set
    count = case when api_rate_limits.reset_at <= now() then 1 else api_rate_limits.count + 1 end,
    reset_at = case when api_rate_limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else api_rate_limits.reset_at end
  returning * into r;
  return query select r.count <= p_limit, greatest(0, ceil(extract(epoch from r.reset_at - now())))::int;
end $$;
revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

create or replace function public.is_member(tid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.memberships m where m.tenant_id = tid and m.user_id = auth.uid());
$$;
drop policy if exists tenants_insert_auth on public.tenants;

insert into public.processed_events(provider, tenant_scope, event_id)
select distinct 'stripe_addon', tenant_id::text, coalesce(stripe_invoice_id, stripe_payment_id) from public.addons where coalesce(stripe_invoice_id, stripe_payment_id) is not null
on conflict do nothing;


create or replace function public.cleanup_security_data()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.api_rate_limits where reset_at < now() - interval '1 day';
  delete from public.processed_events where created_at < now() - interval '90 days';
end $$;
revoke all on function public.cleanup_security_data() from public, anon, authenticated;
grant execute on function public.cleanup_security_data() to service_role;

create or replace function public.apply_addon_purchase(
  p_tenant_id uuid, p_payment_id text, p_invoice_id text, p_cycle text,
  p_total_cents int, p_items jsonb,
  p_requests int, p_reviews int, p_ai int, p_syncs int
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed bigint;
begin
  insert into public.processed_events(provider, tenant_scope, event_id)
  values ('stripe_addon', p_tenant_id::text, coalesce(p_invoice_id, p_payment_id))
  on conflict do nothing returning id into claimed;
  if claimed is null then return false; end if;

  insert into public.addons(tenant_id,type,pack,events,reviews,ai,whatsapp,quantity,unit_amount_cents,cycle,stripe_payment_id,stripe_invoice_id)
  select p_tenant_id, x->>'pack', x->>'pack',
    coalesce((x->>'events')::int,0), coalesce((x->>'reviews')::int,0),
    coalesce((x->>'ai')::int,0), coalesce((x->>'whatsapp')::int,0),
    coalesce((x->>'quantity')::int,1), p_total_cents, p_cycle, p_payment_id, p_invoice_id
  from jsonb_array_elements(p_items) x;

  update public.tenants set
    extra_requests = (case when extra_quota_cycle = p_cycle then extra_requests else 0 end) + p_requests,
    extra_reviews = (case when extra_quota_cycle = p_cycle then extra_reviews else 0 end) + p_reviews,
    extra_ai = (case when extra_quota_cycle = p_cycle then extra_ai else 0 end) + p_ai,
    extra_syncs = (case when extra_quota_cycle = p_cycle then extra_syncs else 0 end) + p_syncs,
    extra_stored = (case when extra_quota_cycle = p_cycle then extra_stored else 0 end) + p_reviews,
    extra_quota_cycle = p_cycle, updated_at = now()
  where id = p_tenant_id;
  if not found then raise exception 'Tenant no encontrado'; end if;
  return true;
end $$;
revoke all on function public.apply_addon_purchase(uuid,text,text,text,int,jsonb,int,int,int,int) from public, anon, authenticated;
grant execute on function public.apply_addon_purchase(uuid,text,text,text,int,jsonb,int,int,int,int) to service_role;


create table if not exists public.admin_audit_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_email text not null,
  action text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  reason text not null,
  ticket text not null
);
alter table public.admin_audit_events enable row level security;
create or replace function public.prevent_audit_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$ begin
  raise exception 'Los eventos de auditoría son inmutables';
end $$;
drop trigger if exists admin_audit_immutable on public.admin_audit_events;
create trigger admin_audit_immutable before update or delete on public.admin_audit_events
for each row execute function public.prevent_audit_mutation();

commit;
