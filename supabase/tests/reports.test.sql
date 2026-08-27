-- =============================================================================
-- Reporting: correctness and scope
-- =============================================================================
--
-- Every expected figure below is worked out by hand from the fixtures, not
-- read back from the same query being tested. A report that agrees with itself
-- proves nothing.
--
-- What is being pinned down:
--   * voided sales are excluded from revenue
--   * profit is NULL when any unit sold had no recorded cost, never understated
--   * a cashier sees only their own numbers, whatever they pass as an argument
--   * a cashier cannot read the business-wide reports at all
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create or replace function pg_temp.ok(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'ok   %', label;
  else
    raise exception 'FAIL %', label;
  end if;
end;
$$;

create or replace function pg_temp.eq(actual numeric, expected numeric, label text)
returns void language plpgsql as $$
begin
  if actual is not distinct from expected then
    raise notice 'ok   % (%)', label, coalesce(actual::text, 'null');
  else
    raise exception 'FAIL %: expected %, got %', label,
      coalesce(expected::text, 'null'), coalesce(actual::text, 'null');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
\set admin_id    '''11111111-1111-4111-8111-111111111111'''
\set cashier_a   '''22222222-2222-4222-8222-222222222222'''
\set cashier_b   '''33333333-3333-4333-8333-333333333333'''

\set rice '''bbbbbbbb-0000-4000-8000-000000000001'''
\set oil  '''bbbbbbbb-0000-4000-8000-000000000002'''
\set soap '''bbbbbbbb-0000-4000-8000-000000000003'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin_id,  'owner@amexpress.test',   '{"full_name":"Akosua Mensah"}'),
  (:cashier_a, 'cashier@amexpress.test', '{"full_name":"Kofi Boateng"}'),
  (:cashier_b, 'kwame@amexpress.test',   '{"full_name":"Kwame Asante"}');

update public.profiles set role = 'admin' where id = :admin_id;

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

insert into public.categories (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Provisions');

-- Soap deliberately has no cost price: it is what makes profit incalculable,
-- and proving that is half the point of this suite.
insert into public.products (id, sku, name, category_id, selling_price, cost_price, minimum_stock)
values
  (:rice, 'RICE-5KG', 'Rice 5kg',       'aaaaaaaa-0000-4000-8000-000000000001', 50.00, 38.00, 5),
  (:oil,  'OIL-1L',   'Cooking Oil 1L', 'aaaaaaaa-0000-4000-8000-000000000001', 25.00, 19.50, 5),
  (:soap, 'SOAP-BAR', 'Bar Soap',       'aaaaaaaa-0000-4000-8000-000000000001', 10.00, null,  5);

select public.record_stock_in(:rice, 100, 'Opening stock');
select public.record_stock_in(:oil,  100, 'Opening stock');
select public.record_stock_in(:soap, 100, 'Opening stock');

insert into public.expense_categories (id, name) values
  ('cccccccc-0000-4000-8000-000000000001', 'Transport'),
  ('cccccccc-0000-4000-8000-000000000002', 'Utilities');

insert into public.expenses (category_id, amount, method, description, incurred_on)
values
  ('cccccccc-0000-4000-8000-000000000001', 40.00, 'cash', 'Taxi to market', current_date),
  ('cccccccc-0000-4000-8000-000000000002', 60.00, 'mobile_money', 'Electricity', current_date);

reset role;

-- Cashier A: three sales.
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_a), false);
set role authenticated;

-- 2 x Rice @ 50 = 100.00, cash
select public.complete_sale('rep-a1',
  format('[{"product_id":"%s","quantity":2}]', :rice)::jsonb,
  '[{"method":"cash","amount":"100.00"}]'::jsonb);

-- 3 x Oil @ 25 = 75.00, split 25 cash + 50 MoMo
select public.complete_sale('rep-a2',
  format('[{"product_id":"%s","quantity":3}]', :oil)::jsonb,
  '[{"method":"cash","amount":"25.00"},
    {"method":"mobile_money","amount":"50.00","reference":"MM-A2"}]'::jsonb);

-- 5 x Soap @ 10 = 50.00, cash. No cost price on soap.
select public.complete_sale('rep-a3',
  format('[{"product_id":"%s","quantity":5}]', :soap)::jsonb,
  '[{"method":"cash","amount":"50.00"}]'::jsonb);

reset role;

-- Cashier B: one real sale, and one that gets voided.
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_b), false);
set role authenticated;

-- 1 x Rice + 1 x Oil = 75.00, all MoMo
select public.complete_sale('rep-b1',
  format('[{"product_id":"%s","quantity":1},{"product_id":"%s","quantity":1}]', :rice, :oil)::jsonb,
  '[{"method":"mobile_money","amount":"75.00","reference":"MM-B1"}]'::jsonb);

-- 2 x Rice = 100.00 cash — voided below, and must not appear in any figure.
select public.complete_sale('rep-b2',
  format('[{"product_id":"%s","quantity":2}]', :rice)::jsonb,
  '[{"method":"cash","amount":"100.00"}]'::jsonb);

reset role;

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

select public.void_sale(
  (select id from public.sales where client_transaction_id = 'rep-b2'),
  'Customer changed their mind'
);

-- -----------------------------------------------------------------------------
-- Sales summary, business-wide
-- -----------------------------------------------------------------------------
-- Completed sales: 100.00 + 75.00 + 50.00 + 75.00 = 300.00 across 4 sales.
-- Cash:  100 + 25 + 50 +  0 = 175.00
-- MoMo:    0 + 50 +  0 + 75 = 125.00
-- Units:   2 +  3 +  5 +  2 = 12
do $$
declare
  r record;
begin
  select * into r
  from public.report_sales_summary(now() - interval '1 day', now() + interval '1 day');

  perform pg_temp.eq(r.total_sales, 300.00, 'total sales excludes the voided sale');
  perform pg_temp.eq(r.transaction_count, 4, 'transaction count excludes the voided sale');
  perform pg_temp.eq(r.cash_total, 175.00, 'cash total');
  perform pg_temp.eq(r.mobile_money_total, 125.00, 'Mobile Money total');
  perform pg_temp.eq(r.split_transaction_count, 1, 'split transactions counted once');
  perform pg_temp.eq(r.units_sold, 12, 'units sold');
  perform pg_temp.eq(r.average_sale, 75.00, 'average sale');

  perform pg_temp.ok(
    r.cash_total + r.mobile_money_total = r.total_sales,
    'cash + Mobile Money reconciles to total sales'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales by product
-- -----------------------------------------------------------------------------
-- Rice: 3 units, 150.00, profit 150 - (38 x 3) = 36.00
-- Oil:  4 units, 100.00, profit 100 - (19.50 x 4) = 22.00
-- Soap: 5 units,  50.00, profit NULL — no cost was ever recorded
do $$
declare
  r record;
begin
  select * into r from public.report_sales_by_product(
    now() - interval '1 day', now() + interval '1 day'
  ) where sku = 'RICE-5KG';
  perform pg_temp.eq(r.units_sold, 3, 'rice units sold');
  perform pg_temp.eq(r.revenue, 150.00, 'rice revenue');
  perform pg_temp.eq(r.profit, 36.00, 'rice profit');
  perform pg_temp.ok(r.category_name = 'Provisions', 'product rows carry their category');

  select * into r from public.report_sales_by_product(
    now() - interval '1 day', now() + interval '1 day'
  ) where sku = 'OIL-1L';
  perform pg_temp.eq(r.revenue, 100.00, 'oil revenue');
  perform pg_temp.eq(r.profit, 22.00, 'oil profit');

  select * into r from public.report_sales_by_product(
    now() - interval '1 day', now() + interval '1 day'
  ) where sku = 'SOAP-BAR';
  perform pg_temp.eq(r.revenue, 50.00, 'soap revenue');
  perform pg_temp.ok(
    r.profit is null,
    'a product with no cost price reports NULL profit, not full profit'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales by category and by cashier
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from public.report_sales_by_category(
    now() - interval '1 day', now() + interval '1 day'
  ) where category_name = 'Provisions';
  perform pg_temp.eq(r.revenue, 300.00, 'category revenue');
  perform pg_temp.eq(r.units_sold, 12, 'category units');

  -- Cashier A: 100 + 75 + 50 = 225.00 over 3 sales; cash 175, MoMo 50.
  select * into r from public.report_sales_by_cashier(
    now() - interval '1 day', now() + interval '1 day'
  ) where cashier_id = '22222222-2222-4222-8222-222222222222';
  perform pg_temp.eq(r.transaction_count, 3, 'cashier A transaction count');
  perform pg_temp.eq(r.revenue, 225.00, 'cashier A revenue');
  perform pg_temp.eq(r.cash_total, 175.00, 'cashier A cash');
  perform pg_temp.eq(r.mobile_money_total, 50.00, 'cashier A Mobile Money');
  perform pg_temp.ok(r.cashier_name = 'Kofi Boateng', 'cashier rows are named');

  -- Cashier B: only the 75.00 sale — the voided one does not count.
  select * into r from public.report_sales_by_cashier(
    now() - interval '1 day', now() + interval '1 day'
  ) where cashier_id = '33333333-3333-4333-8333-333333333333';
  perform pg_temp.eq(r.transaction_count, 1, 'a voided sale is not credited to the cashier');
  perform pg_temp.eq(r.revenue, 75.00, 'cashier B revenue');
end;
$$;

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
do $$
declare
  v_total numeric;
  v_transport numeric;
  v_momo numeric;
begin
  select total into v_total
  from public.report_expense_summary(current_date - 1, current_date + 1)
  where grouping_kind = 'total';

  select total into v_transport
  from public.report_expense_summary(current_date - 1, current_date + 1)
  where grouping_kind = 'category' and grouping_name = 'Transport';

  select total into v_momo
  from public.report_expense_summary(current_date - 1, current_date + 1)
  where grouping_kind = 'method' and grouping_name = 'mobile_money';

  perform pg_temp.eq(v_total, 100.00, 'total expenses');
  perform pg_temp.eq(v_transport, 40.00, 'expenses by category');
  perform pg_temp.eq(v_momo, 60.00, 'expenses by payment method');
end;
$$;

-- -----------------------------------------------------------------------------
-- Inventory valuation
-- -----------------------------------------------------------------------------
-- Rice 100 - 2 - 1 - 2 + 2(void restored) = 97
-- Oil  100 - 3 - 1                        = 96
-- Soap 100 - 5                            = 95
-- At selling price: 97x50 + 96x25 + 95x10 = 4850 + 2400 + 950 = 8200.00
do $$
declare
  r record;
begin
  select * into r from public.report_inventory_valuation();

  perform pg_temp.eq(r.products_tracked, 3, 'products tracked');
  perform pg_temp.eq(r.units_on_hand, 288, 'units on hand, with the void restored');
  perform pg_temp.eq(r.value_at_selling_price, 8200.00, 'stock value at selling price');
  perform pg_temp.ok(
    r.value_at_cost is null,
    'stock value at cost is NULL while any stocked product has no cost price'
  );
  perform pg_temp.eq(r.low_stock_count, 0, 'nothing is low');
  perform pg_temp.eq(r.out_of_stock_count, 0, 'nothing is out of stock');
end;
$$;

-- -----------------------------------------------------------------------------
-- Profitability
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from public.report_profitability(
    now() - interval '1 day', now() + interval '1 day'
  );

  perform pg_temp.eq(r.revenue, 300.00, 'profitability revenue');
  perform pg_temp.eq(r.expenses, 100.00, 'profitability expenses');
  perform pg_temp.ok(
    r.cost_of_goods_sold is null and r.gross_profit is null and r.net_profit is null,
    'profit is NULL, not understated, while a sold product has no cost'
  );
  perform pg_temp.ok(
    r.products_missing_cost @> array['Bar Soap'],
    'the report names which product is missing a cost'
  );
end;
$$;

-- Give soap a cost and sell it again in a period where every line has one.
-- Cost is captured at the moment of sale, so the earlier lines stay NULL and
-- the earlier period stays incalculable — which is the correct history.
update public.products set cost_price = 6.00 where id = :soap;

reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_a), false);
set role authenticated;

select public.complete_sale('rep-a4',
  format('[{"product_id":"%s","quantity":2}]', :soap)::jsonb,
  '[{"method":"cash","amount":"20.00"}]'::jsonb);

reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.report_profitability(
    now() - interval '1 day', now() + interval '1 day'
  );

  -- Still NULL: the first soap sale in this window has no cost against it.
  perform pg_temp.ok(
    r.net_profit is null,
    'one costless line in the period is enough to make profit incalculable'
  );
  perform pg_temp.eq(r.revenue, 320.00, 'revenue includes the new sale');
end;
$$;

-- -----------------------------------------------------------------------------
-- Scope: a cashier sees only themselves
-- -----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_a), false);
set role authenticated;

do $$
declare
  r record;
begin
  -- Asking for the whole business.
  select * into r
  from public.report_sales_summary(now() - interval '1 day', now() + interval '1 day');

  perform pg_temp.eq(r.total_sales, 245.00, 'a cashier asking for everything gets only their own sales');
  perform pg_temp.eq(r.transaction_count, 4, 'cashier A own transaction count');

  -- Asking specifically for someone else's numbers.
  select * into r
  from public.report_sales_summary(
    now() - interval '1 day', now() + interval '1 day',
    '33333333-3333-4333-8333-333333333333'
  );

  perform pg_temp.eq(
    r.total_sales, 245.00,
    'a cashier asking for another cashier''s numbers still gets their own'
  );

  begin
    perform * from public.report_sales_by_product(
      now() - interval '1 day', now() + interval '1 day'
    );
    raise exception 'FAIL a cashier read the sales-by-product report';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot read sales by product';
  end;

  begin
    perform * from public.report_sales_by_cashier(
      now() - interval '1 day', now() + interval '1 day'
    );
    raise exception 'FAIL a cashier read the sales-by-cashier report';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot read sales by cashier';
  end;

  begin
    perform * from public.report_expense_summary(current_date - 1, current_date + 1);
    raise exception 'FAIL a cashier read the expense report';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot read the expense report';
  end;

  begin
    perform * from public.report_profitability(
      now() - interval '1 day', now() + interval '1 day'
    );
    raise exception 'FAIL a cashier read the profit report';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot read the profit report';
  end;

  begin
    perform * from public.report_inventory_valuation();
    raise exception 'FAIL a cashier read the inventory valuation';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot read the inventory valuation';
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Signed out
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;

do $$
begin
  begin
    perform * from public.report_sales_summary(
      now() - interval '1 day', now() + interval '1 day'
    );
    raise exception 'FAIL an anonymous request read a sales report';
  exception when sqlstate 'AM004' then
    raise notice 'ok   an anonymous request cannot read any report';
  end;
end;
$$;

reset role;

\echo ''
\echo 'All reporting tests passed.'
