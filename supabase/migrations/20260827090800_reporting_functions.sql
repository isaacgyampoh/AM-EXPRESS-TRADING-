-- =============================================================================
-- AM Express Trading — reporting
-- =============================================================================
--
-- Every figure is aggregated from stored rows: sales, sale_items, payments,
-- inventory, expenses. Nothing is estimated, sampled or seeded.
--
-- Three rules run through all of it:
--
--   1. Voided sales are excluded from every revenue figure. A void is a
--      correction, and a report that still counts the money is wrong.
--
--   2. Profit is all-or-nothing. If any unit sold in the period has no
--      recorded cost, cost of goods sold comes back NULL rather than
--      understated. A partial figure labelled "profit" is worse than no
--      figure, because it looks authoritative.
--
--   3. A cashier can only ever see their own numbers. These functions are
--      SECURITY DEFINER — they bypass RLS — so each one re-checks the role
--      itself and forces the cashier filter rather than trusting the argument.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who may ask for what
-- -----------------------------------------------------------------------------
-- Returns the cashier id the caller is actually allowed to report on: their own
-- if they are a cashier, whatever they asked for if they are an admin.
create or replace function public.resolve_report_scope(p_cashier_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := public.current_staff_role();
begin
  if v_role is null then
    raise exception 'You must be signed in as active staff to read reports.'
      using errcode = 'AM004';
  end if;

  if v_role = 'admin' then
    return p_cashier_id;
  end if;

  -- A cashier asking about anyone else silently becomes a cashier asking about
  -- themselves. Not an error: the POS asks for "my sales today" with no
  -- argument, and there is nothing to warn about.
  return (select auth.uid());
end;
$$;

create or replace function public.assert_admin_report()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can read this report.'
      using errcode = 'AM004';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales summary
-- -----------------------------------------------------------------------------
create or replace function public.report_sales_summary(
  p_from       timestamptz,
  p_to         timestamptz,
  p_cashier_id uuid default null
)
returns table (
  total_sales             numeric,
  transaction_count       bigint,
  cash_total              numeric,
  mobile_money_total      numeric,
  split_transaction_count bigint,
  units_sold              bigint,
  average_sale            numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope uuid := public.resolve_report_scope(p_cashier_id);
begin
  return query
  with scoped as (
    select s.id, s.total
    from public.sales s
    where s.status = 'completed'
      and s.sold_at >= p_from
      and s.sold_at <= p_to
      and (v_scope is null or s.cashier_id = v_scope)
  ),
  tender as (
    select
      p.sale_id,
      sum(p.amount) filter (where p.method = 'cash') as cash,
      sum(p.amount) filter (where p.method = 'mobile_money') as momo,
      count(distinct p.method) as method_count
    from public.payments p
    join scoped sc on sc.id = p.sale_id
    group by p.sale_id
  ),
  units as (
    select coalesce(sum(si.quantity), 0) as total_units
    from public.sale_items si
    join scoped sc on sc.id = si.sale_id
  )
  select
    coalesce(sum(sc.total), 0)::numeric(14, 2),
    count(*)::bigint,
    coalesce(sum(t.cash), 0)::numeric(14, 2),
    coalesce(sum(t.momo), 0)::numeric(14, 2),
    count(*) filter (where t.method_count > 1)::bigint,
    (select total_units from units)::bigint,
    case
      when count(*) = 0 then 0::numeric(14, 2)
      -- Rounded to the pesewa: an average is a derived figure, and carrying
      -- fractions of a pesewa into a report only invites someone to add them up.
      else round(sum(sc.total) / count(*), 2)
    end
  from scoped sc
  left join tender t on t.sale_id = sc.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales by product
-- -----------------------------------------------------------------------------
create or replace function public.report_sales_by_product(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 50
)
returns table (
  product_id    uuid,
  sku           text,
  name          text,
  category_name text,
  units_sold    bigint,
  revenue       numeric,
  profit        numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_report();

  return query
  select
    si.product_id,
    max(si.sku)::text,
    max(si.name)::text,
    max(c.name)::text,
    sum(si.quantity)::bigint,
    sum(si.line_total)::numeric(14, 2),
    -- NULL when any unit sold had no recorded cost, rather than counting the
    -- whole line as profit.
    case
      when bool_or(si.unit_cost is null) then null
      else sum(si.line_total - (si.unit_cost * si.quantity))::numeric(14, 2)
    end
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  left join public.products p on p.id = si.product_id
  left join public.categories c on c.id = p.category_id
  where s.status = 'completed'
    and s.sold_at >= p_from
    and s.sold_at <= p_to
  group by si.product_id
  order by sum(si.line_total) desc
  limit greatest(coalesce(p_limit, 50), 1);
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales by category
-- -----------------------------------------------------------------------------
create or replace function public.report_sales_by_category(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  category_id   uuid,
  category_name text,
  units_sold    bigint,
  revenue       numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_report();

  return query
  select
    c.id,
    -- Products can lose their category, and a sale keeps its line either way.
    coalesce(c.name, 'Uncategorised')::text,
    sum(si.quantity)::bigint,
    sum(si.line_total)::numeric(14, 2)
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  left join public.products p on p.id = si.product_id
  left join public.categories c on c.id = p.category_id
  where s.status = 'completed'
    and s.sold_at >= p_from
    and s.sold_at <= p_to
  group by c.id, c.name
  order by sum(si.line_total) desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales by cashier
-- -----------------------------------------------------------------------------
create or replace function public.report_sales_by_cashier(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  cashier_id         uuid,
  cashier_name       text,
  transaction_count  bigint,
  revenue            numeric,
  cash_total         numeric,
  mobile_money_total numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_report();

  return query
  with scoped as (
    select s.id, s.cashier_id, s.total
    from public.sales s
    where s.status = 'completed'
      and s.sold_at >= p_from
      and s.sold_at <= p_to
  ),
  tender as (
    select
      sc.cashier_id,
      sum(p.amount) filter (where p.method = 'cash') as cash,
      sum(p.amount) filter (where p.method = 'mobile_money') as momo
    from public.payments p
    join scoped sc on sc.id = p.sale_id
    group by sc.cashier_id
  )
  select
    sc.cashier_id,
    max(pr.full_name)::text,
    count(*)::bigint,
    sum(sc.total)::numeric(14, 2),
    coalesce(max(t.cash), 0)::numeric(14, 2),
    coalesce(max(t.momo), 0)::numeric(14, 2)
  from scoped sc
  join public.profiles pr on pr.id = sc.cashier_id
  left join tender t on t.cashier_id = sc.cashier_id
  group by sc.cashier_id
  order by sum(sc.total) desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
create or replace function public.report_expense_summary(
  p_from date,
  p_to   date
)
returns table (
  grouping_kind text,
  grouping_id   uuid,
  grouping_name text,
  total         numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_report();

  return query
  -- One shape for three groupings, so the caller makes one round trip instead
  -- of three for what is a single screen.
  select 'total'::text, null::uuid, 'All expenses'::text,
         coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.expenses e
  where e.incurred_on between p_from and p_to

  union all

  select 'category'::text, ec.id, ec.name::text, sum(e.amount)::numeric(14, 2)
  from public.expenses e
  join public.expense_categories ec on ec.id = e.category_id
  where e.incurred_on between p_from and p_to
  group by ec.id, ec.name

  union all

  select 'method'::text, null::uuid, e.method::text, sum(e.amount)::numeric(14, 2)
  from public.expenses e
  where e.incurred_on between p_from and p_to
  group by e.method;
end;
$$;

-- -----------------------------------------------------------------------------
-- Inventory valuation
-- -----------------------------------------------------------------------------
create or replace function public.report_inventory_valuation()
returns table (
  products_tracked        bigint,
  units_on_hand           bigint,
  low_stock_count         bigint,
  out_of_stock_count      bigint,
  value_at_cost           numeric,
  value_at_selling_price  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_report();

  return query
  select
    count(*)::bigint,
    coalesce(sum(i.quantity_on_hand), 0)::bigint,
    count(*) filter (where i.quantity_on_hand <= p.minimum_stock)::bigint,
    count(*) filter (where i.quantity_on_hand = 0)::bigint,
    -- NULL when any stocked product has no cost price: a valuation that
    -- quietly treats unknown cost as zero understates the business's assets.
    case
      when bool_or(p.cost_price is null and i.quantity_on_hand > 0) then null
      else coalesce(sum(p.cost_price * i.quantity_on_hand), 0)::numeric(14, 2)
    end,
    coalesce(sum(p.selling_price * i.quantity_on_hand), 0)::numeric(14, 2)
  from public.inventory i
  join public.products p on p.id = i.product_id
  where p.is_active;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profitability
-- -----------------------------------------------------------------------------
create or replace function public.report_profitability(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  revenue                numeric,
  cost_of_goods_sold     numeric,
  gross_profit           numeric,
  expenses               numeric,
  net_profit             numeric,
  products_missing_cost  text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revenue  numeric(14, 2);
  v_cogs     numeric(14, 2);
  v_expenses numeric(14, 2);
  v_missing  text[];
begin
  perform public.assert_admin_report();

  select coalesce(sum(si.line_total), 0)
    into v_revenue
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'completed'
    and s.sold_at >= p_from
    and s.sold_at <= p_to;

  -- Every product sold in the period that had no cost recorded at the time.
  -- Named, not just counted, so the owner knows exactly what to go and fix.
  select coalesce(array_agg(distinct si.name order by si.name), '{}')
    into v_missing
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.status = 'completed'
    and s.sold_at >= p_from
    and s.sold_at <= p_to
    and si.unit_cost is null;

  if array_length(v_missing, 1) is null then
    select coalesce(sum(si.unit_cost * si.quantity), 0)
      into v_cogs
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.status = 'completed'
      and s.sold_at >= p_from
      and s.sold_at <= p_to;
  else
    v_cogs := null;
  end if;

  select coalesce(sum(e.amount), 0)
    into v_expenses
  from public.expenses e
  where e.incurred_on >= p_from::date
    and e.incurred_on <= p_to::date;

  return query select
    v_revenue,
    v_cogs,
    case when v_cogs is null then null else v_revenue - v_cogs end,
    v_expenses,
    case when v_cogs is null then null else v_revenue - v_cogs - v_expenses end,
    v_missing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- Signed-in staff may call them; each function decides what to hand back.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.resolve_report_scope(uuid)',
    'public.assert_admin_report()',
    'public.report_sales_summary(timestamptz, timestamptz, uuid)',
    'public.report_sales_by_product(timestamptz, timestamptz, integer)',
    'public.report_sales_by_category(timestamptz, timestamptz)',
    'public.report_sales_by_cashier(timestamptz, timestamptz)',
    'public.report_expense_summary(date, date)',
    'public.report_inventory_valuation()',
    'public.report_profitability(timestamptz, timestamptz)'
  ]
  loop
    execute format('revoke execute on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$$;
