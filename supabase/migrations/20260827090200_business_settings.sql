-- =============================================================================
-- AM Express Trading — business settings
-- =============================================================================
--
-- One row, holding everything that is specific to *this* business: its name,
-- its contact details, its currency, its receipt footer, its receipt number
-- prefix.
--
-- This table is the reusability requirement made concrete. "AM Express
-- Trading" and "GH₵" appear here and nowhere else in the running system, so
-- standing the application up for a different shop is a settings change rather
-- than a search-and-replace through components.
-- =============================================================================

create table public.business_settings (
  -- A single-row table, enforced by the primary key rather than by convention.
  id               boolean primary key default true check (id),

  business_name    text not null check (length(btrim(business_name)) between 1 and 120),
  address          text,
  phone            text,
  email            text,

  currency         text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),
  currency_symbol  text not null default 'GH₵' check (length(btrim(currency_symbol)) between 1 and 8),

  receipt_prefix   text not null default 'AMX' check (receipt_prefix ~ '^[A-Z0-9-]{1,10}$'),
  receipt_footer   text,

  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id)
);

create trigger business_settings_touch_updated_at
  before update on public.business_settings
  for each row execute function public.touch_updated_at();

-- Seeded so the application never has to cope with a missing settings row.
insert into public.business_settings (id, business_name, currency, currency_symbol, receipt_prefix, receipt_footer)
values (true, 'AM Express Trading', 'GHS', 'GH₵', 'AMX', 'Thank you for your business.');

alter table public.business_settings enable row level security;

-- Every active staff member reads settings: the receipt a cashier prints needs
-- the business name and currency symbol.
create policy business_settings_select_staff
  on public.business_settings for select to authenticated
  using (public.is_active_staff());

create policy business_settings_update_admin
  on public.business_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No insert or delete policy: there is one row and it stays one row.
