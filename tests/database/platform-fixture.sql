-- APENAS para cluster PostgreSQL novo criado pelo runner; nunca aplicar em Supabase.
-- Contratos mínimos de Auth e Storage necessários à migração original.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Reproduz grants amplos do ambiente Supabase: migrações devem revogá-los explicitamente.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text);
alter table storage.objects enable row level security;
