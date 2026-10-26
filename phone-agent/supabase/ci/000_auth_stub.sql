-- ============================================================================
-- FIXTURE SOLO PARA CI — NO EJECUTAR EN UN PROYECTO SUPABASE REAL
-- ============================================================================
-- La migración 001_full_schema.sql referencia cosas que en Supabase ya existen
-- (auth.users, auth.uid(), storage.buckets, los roles anon/authenticated/
-- service_role). Un Postgres de Docker no las tiene, así que sin este fichero
-- CI no podría aplicar la migración y el SQL quedaría sin verificar.
--
-- Crea el mínimo imprescindible para que 001 se aplique tal cual, sin tocarla.
-- En producción este fichero no se ejecuta nunca: está fuera de migrations/
-- a propósito, para que `supabase db reset` no lo vea.
-- ============================================================================

-- ── Roles de Supabase ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- pgcrypto da gen_random_uuid(); en Postgres 13+ ya viene de serie, pero la
-- migración la pide explícitamente con schema extensions.
create extension if not exists pgcrypto with schema extensions;

-- ── auth: espejo mínimo de GoTrue ───────────────────────────────────────────
create table if not exists auth.users (
  id                 uuid primary key default extensions.gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- auth.uid() lee el JWT de la petición. En CI no hay petición, así que se
-- apoya en una GUC que los tests pueden fijar con `set request.jwt.claims`.
-- Devuelve null si no hay claims, que es exactamente lo que pasa con anon.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
  '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  );
$$;

-- ── storage: lo justo para el bucket de screenshots y sus políticas ─────────
create table if not exists storage.buckets (
  id         text primary key,
  name       text not null unique,
  public     boolean default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default extensions.gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- La migración crea políticas que usan storage.foldername(name); sin esta
-- función el `create policy` falla y el bucket quedaría sin verificar.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
begin
  return string_to_array(substring(name from '^(.*?)/'), '/');
end;
$$;

-- RLS activado en storage.objects: la migración le añade políticas propias.
alter table storage.objects enable row level security;
