-- ============================================================
-- ReviewFlow AI v3.2.0 — Migración (solo si ya aplicaste schema.sql antes)
-- Supabase Dashboard → SQL Editor → pegar y Run.
-- Idempotente: seguro ejecutarla aunque ya exista la columna.
-- ============================================================

-- Insignia «Compra verificada» (Directiva UE 2019/2161).
alter table public.reviews
  add column if not exists is_verified boolean not null default false;
