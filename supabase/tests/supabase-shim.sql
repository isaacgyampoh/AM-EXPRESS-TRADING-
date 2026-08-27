-- =============================================================================
-- A minimal stand-in for the parts of Supabase that the migrations depend on.
-- =============================================================================
--
-- Used only by `npm run db:test`, which runs the real migrations against a
-- throwaway local PostgreSQL and then exercises RLS and the sale function.
-- This file is never applied to a Supabase project — Supabase provides all of
-- it already.
--
-- It exists because the interesting failures in this system are database
-- failures: a policy that lets a cashier read the takings, a sale that reduces
-- stock without recording itself, a split payment that does not add up. None
-- of those can be caught by a TypeScript test with a mocked repository.
-- =============================================================================

create schema if not exists extensions;
create schema if not exists auth;

-- Roles PostgREST connects as.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase grants table privileges broadly and relies on RLS to restrict.
-- Reproducing that here is important: it means these tests exercise the same
-- "privileges are wide, policies are narrow" arrangement as production.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- auth.users, cut down to the columns the migrations touch.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

grant select on auth.users to authenticated, service_role;

-- The real auth.uid(), reading the request's JWT claims. Tests impersonate a
-- user with:  set local request.jwt.claims = '{"sub":"<uuid>"}';
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  )
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
