-- ReviewFlow AI v3.13.0 — campañas atribuibles para valoración y QR
begin;

alter table public.feedback_responses add column if not exists campaign text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_campaign_format') then
    alter table public.feedback_responses add constraint feedback_campaign_format
      check (campaign is null or campaign ~ '^[a-z0-9][a-z0-9_-]{0,47}$');
  end if;
end $$;
create index if not exists feedback_tenant_campaign_created_idx
  on public.feedback_responses(tenant_id, campaign, created_at desc);

commit;
