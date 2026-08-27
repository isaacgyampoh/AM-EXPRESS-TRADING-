-- =============================================================================
-- AM Express Trading — expenses
-- =============================================================================
--
-- Money the business spent. Reports subtract these from sales, so they are
-- admin-only in both directions: a cashier neither records nor reads them.
-- =============================================================================

create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 80),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index expense_categories_name_key
  on public.expense_categories (lower(btrim(name)));

create trigger expense_categories_touch_updated_at
  before update on public.expense_categories
  for each row execute function public.touch_updated_at();

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories (id) on delete restrict,

  amount      numeric(14, 2) not null check (amount > 0),
  method      text not null check (method in ('cash', 'mobile_money')),
  description text not null check (length(btrim(description)) between 1 and 500),

  -- The day the money went out, which is not always the day it was entered.
  incurred_on date not null default current_date,

  recorded_by uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index expenses_incurred_idx on public.expenses (incurred_on desc);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_method_idx on public.expenses (method);
create index expenses_recorded_by_idx on public.expenses (recorded_by);

create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.touch_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;

create policy expense_categories_admin_all
  on public.expense_categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy expenses_admin_all
  on public.expenses for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- `recorded_by` must be the person actually signed in — an admin cannot file
-- an expense under someone else's name, whatever the request body says.
create or replace function public.guard_expense_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

create trigger expenses_set_actor
  before insert on public.expenses
  for each row execute function public.guard_expense_actor();
