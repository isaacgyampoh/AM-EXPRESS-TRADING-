-- =============================================================================
-- AM Express Trading — identity, roles and the authorisation helpers
-- =============================================================================
--
-- A note on table naming. The brief lists `profiles`, `roles` and `staff` as
-- separate concepts. In this system a staff member IS a profile: one row per
-- person, keyed by their Supabase auth user id. Splitting the same person
-- across two tables would buy nothing and introduce a class of bug where the
-- two disagree about whether someone is still employed. `roles` remains a real
-- lookup table so role names are constrained by a foreign key rather than by a
-- string comparison someone can typo.
--
-- Everything below runs as the signed-in user under Row Level Security. The
-- helper functions are SECURITY DEFINER purely so that a policy on `profiles`
-- can read `profiles` without recursing into itself.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
create table public.roles (
  name        text primary key,
  description text not null,
  created_at  timestamptz not null default now()
);

comment on table public.roles is
  'The roles a staff member can hold. Referenced by profiles.role.';

insert into public.roles (name, description) values
  ('admin',   'Owner or manager. Full access to the business.'),
  ('cashier', 'Sells at the point of sale. No access to money reports, expenses, staff or settings.');

-- -----------------------------------------------------------------------------
-- profiles — one row per person who can sign in
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) between 1 and 120),
  email      text not null unique check (email = lower(email)),
  role       text not null references public.roles (name),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Staff records. id matches auth.users.id — one person, one identity.';
comment on column public.profiles.role is
  'Authoritative role. Never read from the client; resolved server-side and mirrored by RLS.';

create index profiles_role_idx on public.profiles (role) where is_active;

-- -----------------------------------------------------------------------------
-- Authorisation helpers
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned, empty search_path. Every object reference is
-- schema-qualified so that nothing here can be hijacked by a search_path the
-- caller controls.

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

comment on function public.current_staff_role() is
  'Role of the signed-in, active staff member. NULL when signed out or deactivated.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() = 'admin', false)
$$;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null
$$;

-- A deactivated staff member keeps their auth session until it expires. These
-- helpers return false for them immediately, so deactivation takes effect on
-- the next request rather than at the next token refresh.

-- -----------------------------------------------------------------------------
-- Keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- New auth users become staff automatically
-- -----------------------------------------------------------------------------
-- Staff are created by an admin through the application, which calls the auth
-- admin API. This trigger turns a new auth user into a profile in the same
-- breath, so there is never an auth user with no staff record.
--
-- The new profile is ALWAYS a cashier. `raw_user_meta_data` is attacker-
-- controlled — anyone who can reach the sign-up endpoint can put
-- `{"role":"admin"}` in it — so the role is never read from there. Promotion
-- to admin happens afterwards, through the staff management path, which runs
-- server-side and checks that the caller is already an admin.
--
-- The display name is taken from metadata because a wrong name is a
-- cosmetic problem, not a privilege one.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    'cashier',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.roles    enable row level security;
alter table public.profiles enable row level security;

-- Any signed-in staff member may read the role list (the staff form needs it).
create policy roles_readable_by_staff
  on public.roles for select
  to authenticated
  using (public.is_active_staff());

-- A person can always see their own record — that is how the app resolves who
-- they are. Admins can see everyone.
create policy profiles_select_self_or_admin
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- Only an admin may change a staff record.
create policy profiles_update_by_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Two things RLS cannot express, because a policy sees either the old row or
-- the new row but never both:
--
--   1. Nobody may change their own role or deactivate themselves. An admin who
--      wants to step down is stepped down by another admin.
--   2. The last active admin cannot be demoted or deactivated, by anyone. That
--      is the update that locks the business out of its own system, and it is
--      always a mistake.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_admins integer;
begin
  if old.id = (select auth.uid()) then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role.'
        using errcode = 'check_violation';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'You cannot deactivate your own account.'
        using errcode = 'check_violation';
    end if;
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active) then
    select count(*) into remaining_admins
    from public.profiles p
    where p.role = 'admin' and p.is_active and p.id <> old.id;

    if remaining_admins = 0 then
      raise exception 'This is the last active administrator. Promote someone else first.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_changes
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Inserts happen through the auth trigger above (SECURITY DEFINER), and
-- deletes are not permitted at all: staff are deactivated, never erased, so
-- their sales keep a valid cashier reference.
