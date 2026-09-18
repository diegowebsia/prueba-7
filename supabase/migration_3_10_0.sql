-- ============================================================
-- ReviewFlow AI — Migración v3.10.0
-- TripAdvisor + colas async + plantillas WhatsApp + opt-in RGPD +
-- Embudo Privado de Satisfacción (Feedback Gateway)
-- ------------------------------------------------------------
-- Idempotente: puede re-ejecutarse sin romper nada.
-- Ejecutar DESPUÉS de migration_3_9_0.sql (SQL Editor de Supabase).
-- ============================================================

-- ---------- 1. reviews.source: + 'places' (bugfix v3.9) + 'tripadvisor' ----------
do $$
begin
  -- Normaliza valores antiguos inesperados antes de endurecer el check.
  update public.reviews set source = 'google'
   where source not in ('google', 'trustpilot', 'facebook', 'manual', 'places', 'tripadvisor');
exception when others then
  raise warning 'Normalización de reviews.source omitida: %', sqlerrm;
end $$;
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews
  add constraint reviews_source_check
  check (source in ('google', 'trustpilot', 'tripadvisor', 'facebook', 'manual', 'places'));

-- ---------- 2. integrations.provider: + 'tripadvisor' ----------
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations
  add constraint integrations_provider_check
  check (provider in ('google', 'trustpilot', 'tripadvisor', 'whatsapp', 'maps', 'shopify', 'woocommerce', 'store'));

-- ---------- 3. ai_interactions.job_id: resultados de IA asíncrona (cola) ----------
alter table public.ai_interactions add column if not exists job_id text;
create index if not exists ai_interactions_job_idx on public.ai_interactions (job_id);

-- Resultado del borrador async (solo se rellena en purpose = 'respond.async').
alter table public.ai_interactions add column if not exists result_text text;
alter table public.ai_interactions add column if not exists result_status text not null default 'ready'
  check (result_status in ('pending', 'ready', 'error'));

-- ---------- 4. whatsapp_optins: consentimiento explícito RGPD ----------
create table if not exists public.whatsapp_optins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- Móvil normalizado (solo dígitos, con prefijo país): '34612345678'.
  phone text not null,
  customer_name text,
  order_id text,
  -- Origen del consentimiento: checkout de la tienda, recepción de pedido,
  -- alta manual desde el panel o importación documentada.
  source text not null default 'checkout'
    check (source in ('checkout', 'order', 'manual', 'import')),
  -- Prueba del consentimiento (texto del checkbox aceptado, auditoría RGPD).
  proof_text text,
  created_at timestamptz not null default now(),
  -- Revocación (STOP/BAJA por WhatsApp o baja manual): deja de enviarse.
  revoked_at timestamptz,
  unique (tenant_id, phone)
);
create index if not exists whatsapp_optins_tenant_idx on public.whatsapp_optins (tenant_id, created_at desc);

-- ---------- 5. whatsapp_contacts: ventana conversacional de 24 h (Meta) ----------
-- Meta solo permite texto libre dentro de las 24 h tras el último mensaje
-- ENTRANTE del cliente; fuera de la ventana exige plantilla HSM aprobada.
create table if not exists public.whatsapp_contacts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);

-- ---------- 6. feedback_responses: Embudo Privado de Satisfacción ----------
-- Micro-encuesta pública /valorar/[slug]: 1-5 estrellas.
--   4-5 ★ → kind='redirect' (+ channel = plataforma elegida o null si no clicó).
--   1-3 ★ → kind='ticket' (+ message/name/contact, aviso interno al dueño).
create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  kind text not null check (kind in ('redirect', 'ticket')),
  -- Canal público elegido tras 4-5 ★ (click medido aparte si cambia).
  channel text check (channel in ('google', 'tripadvisor', 'trustpilot')),
  customer_name text,
  contact text,
  message text,
  order_id text,
  -- Gestión del ticket privado (1-3 ★).
  status text not null default 'open' check (status in ('open', 'closed')),
  resolved_at timestamptz,
  -- Antifraude básico (hash del IP + user agent recortado).
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_tenant_created_idx
  on public.feedback_responses (tenant_id, created_at desc);
create index if not exists feedback_tenant_kind_idx
  on public.feedback_responses (tenant_id, kind, status);

-- ---------- 7. RLS: mismo modelo que el resto de tablas ----------
alter table public.whatsapp_optins enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.feedback_responses enable row level security;

-- Opt-ins y embudo: el miembro LEE los de su empresa; la escritura pública
-- (formularios /valorar, webhooks) pasa por service_role en servidor.
drop policy if exists "whatsapp_optins_select_member" on public.whatsapp_optins;
create policy "whatsapp_optins_select_member" on public.whatsapp_optins
  for select using (public.is_member(tenant_id));

drop policy if exists "feedback_select_member" on public.feedback_responses;
create policy "feedback_select_member" on public.feedback_responses
  for select using (public.is_member(tenant_id));

-- whatsapp_contacts: solo service_role (servidor). Sin policies = denegado.

-- ============================================================
-- 8. Supabase Cron (ALTERNATIVA a Vercel Cron) — OPCIONAL
-- ------------------------------------------------------------
-- Si NO usas Vercel, programa la sincronización con pg_cron + pg_net:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule(
--     'reviewflow-sync-hourly',
--     '7 * * * *',  -- minuto 7 de cada hora (el código aplica cadencia por plan)
--     $$
--     select net.http_post(
--       url := 'https://TU-DOMINIO.com/api/cron/sync-reviews',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer TU_CRON_SECRET'
--       ),
--       body := '{}'::jsonb
--     );
--     $$
--   );
--
-- Ver estado:  select * from cron.job;  -- historial: cron.job_run_details
-- ============================================================
