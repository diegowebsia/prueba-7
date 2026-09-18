-- ReviewFlow AI v3.12.0 — observabilidad e idempotencia de webhooks
begin;

create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  attempts int not null default 1,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (provider, event_id)
);
create index if not exists webhook_events_status_updated_idx on public.webhook_events(status, updated_at);
alter table public.webhook_events enable row level security;

create or replace function public.claim_webhook_event(p_provider text, p_event_id text, p_event_type text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed bigint;
begin
  insert into public.webhook_events(provider,event_id,event_type)
  values (p_provider,p_event_id,p_event_type)
  on conflict do nothing returning id into claimed;
  if claimed is not null then return true; end if;

  update public.webhook_events set
    status = 'processing', attempts = attempts + 1, last_error = null, updated_at = now()
  where provider = p_provider and event_id = p_event_id
    and (status = 'failed' or (status = 'processing' and updated_at < now() - interval '5 minutes'))
  returning id into claimed;
  return claimed is not null;
end $$;

create or replace function public.finish_webhook_event(p_provider text, p_event_id text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.webhook_events set status='completed', completed_at=now(), updated_at=now(), last_error=null
  where provider=p_provider and event_id=p_event_id;
$$;

create or replace function public.fail_webhook_event(p_provider text, p_event_id text, p_error text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.webhook_events set status='failed', updated_at=now(), last_error=left(p_error,500)
  where provider=p_provider and event_id=p_event_id;
$$;

revoke all on function public.claim_webhook_event(text,text,text) from public, anon, authenticated;
revoke all on function public.finish_webhook_event(text,text) from public, anon, authenticated;
revoke all on function public.fail_webhook_event(text,text,text) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text,text,text) to service_role;
grant execute on function public.finish_webhook_event(text,text) to service_role;
grant execute on function public.fail_webhook_event(text,text,text) to service_role;

commit;
