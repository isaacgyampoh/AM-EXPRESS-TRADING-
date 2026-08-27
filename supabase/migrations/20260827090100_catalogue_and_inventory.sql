-- =============================================================================
-- AM Express Trading — catalogue and stock
-- =============================================================================
--
-- Two ideas kept deliberately apart:
--
--   products  — what the shop sells, and for how much. Changes rarely.
--   inventory — how many are on hand right now. Changes on every sale.
--
-- and one ledger, `inventory_movements`, which explains every change to the
-- second. Balances and ledger are only ever written together, inside SECURITY
-- DEFINER functions, so a balance can never move without a line explaining it.
-- RLS denies direct writes to both tables to make that the only way in.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Beverages" and "beverages" are one category.
create unique index categories_name_key on public.categories (lower(btrim(name)));

create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null check (sku = upper(btrim(sku)) and length(sku) between 1 and 40),
  name           text not null check (length(btrim(name)) between 1 and 120),
  category_id    uuid references public.categories (id) on delete set null,

  -- NUMERIC, never DOUBLE PRECISION. Money is exact or it is wrong.
  selling_price  numeric(14, 2) not null check (selling_price >= 0),
  cost_price     numeric(14, 2) check (cost_price >= 0),

  minimum_stock  integer not null default 0 check (minimum_stock >= 0),
  is_active      boolean not null default true,

  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.products.cost_price is
  'What the business paid. NULL means unknown — profit reports must exclude the product rather than assume zero.';

create unique index products_sku_key on public.products (sku);
create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (is_active) where is_active;
-- Trigram indexes so the POS search stays fast as the catalogue grows, and so
-- filtering happens in Postgres rather than by pulling every product to a phone.
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops);

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- inventory — the current balance, one row per product
-- -----------------------------------------------------------------------------
create table public.inventory (
  product_id       uuid primary key references public.products (id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  updated_at       timestamptz not null default now()
);

comment on table public.inventory is
  'Current stock. Written only by the stock functions, never directly — see RLS below.';
comment on column public.inventory.quantity_on_hand is
  'CHECK >= 0 is the last line of defence: even a bug in the sale function cannot drive stock negative.';

create index inventory_low_stock_idx on public.inventory (quantity_on_hand);

-- Every product gets a balance row the moment it exists, so no code path has
-- to cope with "product exists but has no stock record".
create or replace function public.create_inventory_for_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (product_id, quantity_on_hand)
  values (new.id, 0)
  on conflict (product_id) do nothing;
  return new;
end;
$$;

create trigger products_create_inventory
  after insert on public.products
  for each row execute function public.create_inventory_for_product();

-- -----------------------------------------------------------------------------
-- inventory_movements — the ledger
-- -----------------------------------------------------------------------------
create table public.inventory_movements (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  movement_type       text not null check (movement_type in ('stock_in', 'sale', 'adjustment', 'sale_reversal')),
  quantity_delta      integer not null check (quantity_delta <> 0),
  resulting_quantity  integer not null check (resulting_quantity >= 0),
  reason              text,
  sale_id             uuid,
  recorded_by         uuid not null references public.profiles (id),
  occurred_at         timestamptz not null default now(),

  -- Direction must match the reason given. A "stock_in" that removes units is
  -- a bug, and the database is the right place to say so.
  constraint movement_direction_matches_type check (
    (movement_type = 'stock_in'      and quantity_delta > 0) or
    (movement_type = 'sale'          and quantity_delta < 0) or
    (movement_type = 'sale_reversal' and quantity_delta > 0) or
    (movement_type = 'adjustment')
  ),
  -- An adjustment without an explanation is an unexplained discrepancy.
  constraint adjustment_requires_reason check (
    movement_type <> 'adjustment' or length(btrim(coalesce(reason, ''))) > 0
  )
);

comment on table public.inventory_movements is
  'Append-only stock ledger. No updates, no deletes: mistakes are corrected with a compensating movement.';

create index movements_product_time_idx on public.inventory_movements (product_id, occurred_at desc);
create index movements_time_idx on public.inventory_movements (occurred_at desc);
create index movements_sale_idx on public.inventory_movements (sale_id) where sale_id is not null;
create index movements_type_idx on public.inventory_movements (movement_type);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.inventory           enable row level security;
alter table public.inventory_movements enable row level security;

-- Reading the catalogue: any active staff member. A cashier cannot sell what
-- they cannot see.
create policy categories_select_staff
  on public.categories for select to authenticated
  using (public.is_active_staff());

create policy products_select_staff
  on public.products for select to authenticated
  using (public.is_active_staff());

create policy inventory_select_staff
  on public.inventory for select to authenticated
  using (public.is_active_staff());

-- Writing the catalogue: admins only. This is where prices live.
create policy categories_write_admin
  on public.categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy products_write_admin
  on public.products for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The stock ledger is admin-readable only. A cashier sees quantities through
-- `inventory`; the movement history is management information.
create policy movements_select_admin
  on public.inventory_movements for select to authenticated
  using (public.is_admin());

-- No INSERT, UPDATE or DELETE policy exists for `inventory` or
-- `inventory_movements`. With RLS enabled and no permissive policy, every
-- direct write from a signed-in user is refused — including from an admin.
-- The only way stock moves is through the SECURITY DEFINER functions, which is
-- exactly the guarantee the ledger needs: no balance change without a movement
-- row, and no movement row without a balance change.
