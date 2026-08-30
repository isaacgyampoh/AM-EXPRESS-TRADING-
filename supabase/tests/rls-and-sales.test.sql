-- =============================================================================
-- Database behaviour tests: RLS, atomicity, payment rules, idempotency
-- =============================================================================
--
-- Run with `npm run db:test`, which starts a throwaway PostgreSQL, applies the
-- Supabase shim and then every migration in order, and finally runs this file.
--
-- These are the tests that matter most. A cashier reading the day's takings, a
-- sale that reduces stock without recording itself, a split payment that does
-- not add up — none of that is reachable from a TypeScript test with a mocked
-- repository, because none of it lives in TypeScript.
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

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
\set admin_id   '''11111111-1111-4111-8111-111111111111'''
\set cashier_id '''22222222-2222-4222-8222-222222222222'''
\set other_id   '''33333333-3333-4333-8333-333333333333'''

-- Start from an empty roster. The PIN migration seeds a default administrator,
-- so without this the counts below depend on what the migrations happened to
-- create — which is how this suite came to assert 3 profiles in a database
-- that had 4.
delete from auth.users;

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin_id,   'owner@amexpress.test',   '{"full_name":"Akosua Mensah"}'),
  (:cashier_id, 'cashier@amexpress.test', '{"full_name":"Kofi Boateng"}'),
  (:other_id,   'kwame@amexpress.test',   '{"full_name":"Kwame Asante"}');

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.profiles) = 3,
    'a new auth user automatically becomes a staff profile'
  );
  perform pg_temp.ok(
    (select count(*) from public.profiles where role = 'cashier') = 3,
    'every new profile starts as a cashier, never an admin'
  );
end;
$$;

-- The sign-up path must not be able to grant admin. Prove it: a user whose
-- metadata asks for admin still lands as a cashier.
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-8444-444444444444', 'attacker@example.com',
   '{"full_name":"Mallory","role":"admin"}');

do $$
begin
  perform pg_temp.ok(
    (select role from public.profiles where email = 'attacker@example.com') = 'cashier',
    'metadata claiming {"role":"admin"} at sign-up is ignored'
  );
end;
$$;

delete from auth.users where email = 'attacker@example.com';

-- Bootstrap the owner, the way the documented first-run step does.
update public.profiles set role = 'admin' where id = :admin_id;

-- -----------------------------------------------------------------------------
-- Catalogue: admins write, cashiers read
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

insert into public.categories (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Provisions');

insert into public.products (id, sku, name, category_id, cost_price, minimum_stock)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'RICE-5KG', 'Rice 5kg',
   'aaaaaaaa-0000-4000-8000-000000000001', 38.00, 5),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'OIL-1L', 'Cooking Oil 1L',
   'aaaaaaaa-0000-4000-8000-000000000001', 19.50, 3);

-- Price lives on the selling unit now. Both of these are sold by the piece
-- only; the box/piece and wholesale cases are exercised further down.
insert into public.product_units
  (product_id, unit_name, base_quantity, retail_price, is_default)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Piece', 1, 50.00, true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Piece', 1, 25.00, true);

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.inventory) = 2,
    'creating a product creates its stock record'
  );
  perform pg_temp.ok(
    (select bool_and(quantity_on_hand = 0) from public.inventory),
    'a new product starts at zero stock, not at some assumed number'
  );
end;
$$;

reset role;

-- A cashier may read the catalogue but not change it.
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_id), false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.products) = 2,
    'a cashier can read the catalogue'
  );

  begin
    insert into public.products (sku, name) values ('HACK-1', 'Free Rice');
    raise exception 'FAIL a cashier was able to create a product';
  exception when insufficient_privilege then
    raise notice 'ok   RLS stops a cashier creating a product';
  end;

  -- Repricing is the one a cashier has a motive for, and it moved to
  -- product_units, so the policy has to have moved with it.
  begin
    update public.product_units set retail_price = 0.01
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000001';
    perform pg_temp.ok(
      (select retail_price from public.product_units
        where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 50.00,
      'RLS stops a cashier repricing a product'
    );
  exception when insufficient_privilege then
    raise notice 'ok   RLS stops a cashier repricing a product';
  end;

  begin
    insert into public.product_units
      (product_id, unit_name, base_quantity, retail_price)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'Box', 12, 0.01);
    raise exception 'FAIL a cashier was able to invent a cheap selling unit';
  exception when insufficient_privilege then
    raise notice 'ok   RLS stops a cashier adding their own selling unit';
  end;

  begin
    perform public.record_stock_in('bbbbbbbb-0000-4000-8000-000000000001', 100, 'helping myself');
    raise exception 'FAIL a cashier was able to add stock';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot add stock';
  end;

  begin
    update public.inventory set quantity_on_hand = 9999
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000001';
    perform pg_temp.ok(
      (select quantity_on_hand from public.inventory
       where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0,
      'stock cannot be written directly, only through the stock functions'
    );
  exception when insufficient_privilege then
    raise notice 'ok   stock cannot be written directly';
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Stock in
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

select public.record_stock_in('bbbbbbbb-0000-4000-8000-000000000001', 10, 'Opening stock');
select public.record_stock_in('bbbbbbbb-0000-4000-8000-000000000002', 4,  'Opening stock');

do $$
begin
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 10,
    'stock in raises the balance'
  );
  perform pg_temp.ok(
    (select count(*) from public.inventory_movements where movement_type = 'stock_in') = 2,
    'stock in writes a ledger line'
  );
  perform pg_temp.ok(
    (select resulting_quantity from public.inventory_movements
     where movement_type = 'stock_in'
       and product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 10,
    'the ledger records the resulting balance, so history is auditable'
  );
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- The POS: a cashier completes a sale
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_id), false);
set role authenticated;

-- 2 x Rice @ 50.00 = 100.00, paid in cash.
select public.complete_sale(
  'txn-0001',
  '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  '[{"method":"cash","amount":"100.00"}]'::jsonb
) as sale_id \gset first_

do $$
begin
  perform pg_temp.ok(
    (select total from public.sales where client_transaction_id = 'txn-0001') = 100.00,
    'the total is computed from the catalogue, not supplied by the client'
  );
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 8,
    'a sale of 2 reduces stock by exactly 2'
  );
  -- The movement itself is asserted later, from the admin session: a cashier
  -- cannot read the stock ledger, which is itself part of what is being tested.
  perform pg_temp.ok(
    (select receipt_number from public.sales where client_transaction_id = 'txn-0001')
      like 'AMX-%',
    'the receipt number uses the configured business prefix'
  );
  perform pg_temp.ok(
    (select cashier_id from public.sales where client_transaction_id = 'txn-0001')
      = '22222222-2222-4222-8222-222222222222',
    'the sale records who actually sold it, from the session not the request'
  );
  perform pg_temp.ok(
    (select unit_cost from public.sale_items
     where sale_id = (select id from public.sales where client_transaction_id = 'txn-0001')) = 38.00,
    'the cost at the time of sale is captured, so profit stays calculable later'
  );
end;
$$;

-- Idempotency: the same transaction id must not sell the stock twice.
select public.complete_sale(
  'txn-0001',
  '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":2}]'::jsonb,
  '[{"method":"cash","amount":"100.00"}]'::jsonb
) as sale_id \gset retry_

-- psql does not interpolate variables inside dollar-quoted blocks, so this one
-- comparison happens in plain SQL.
select pg_temp.ok(
  :'first_sale_id'::uuid = :'retry_sale_id'::uuid,
  'retrying a transaction returns the original sale'
) \gset _discard_

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.sales) = 1,
    'retrying a transaction does not create a second sale'
  );
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 8,
    'retrying a transaction does not reduce stock twice'
  );
end;
$$;

-- A split payment that balances: 50 cash + 25 MoMo for 3 items at 25.00.
select public.complete_sale(
  'txn-0002',
  '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000002","quantity":3}]'::jsonb,
  '[{"method":"cash","amount":"50.00"},
    {"method":"mobile_money","amount":"25.00","reference":"MM-773421"}]'::jsonb
);

do $$
begin
  perform pg_temp.ok(
    (select total from public.sales where client_transaction_id = 'txn-0002') = 75.00,
    'a split sale totals correctly'
  );
  perform pg_temp.ok(
    (select count(*) from public.payments
     where sale_id = (select id from public.sales where client_transaction_id = 'txn-0002')) = 2,
    'a split sale records both payment lines'
  );
  perform pg_temp.ok(
    (select reference from public.payments
     where method = 'mobile_money'
       and sale_id = (select id from public.sales where client_transaction_id = 'txn-0002'))
      = 'MM-773421',
    'the Mobile Money reference is stored for reconciliation'
  );
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000002') = 1,
    'the split sale reduced stock'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Failures must leave nothing behind
-- -----------------------------------------------------------------------------
do $$
declare
  sales_before integer := (select count(*) from public.sales);
  stock_before integer := (select quantity_on_hand from public.inventory
                           where product_id = 'bbbbbbbb-0000-4000-8000-000000000001');
begin
  -- Underpaying by a single pesewa.
  begin
    perform public.complete_sale(
      'txn-short',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      '[{"method":"cash","amount":"49.99"}]'::jsonb
    );
    raise exception 'FAIL a one-pesewa-short sale was accepted';
  exception when sqlstate 'AM002' then
    raise notice 'ok   a sale short by one pesewa is refused';
  end;

  -- Overpaying.
  begin
    perform public.complete_sale(
      'txn-over',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      '[{"method":"cash","amount":"20.00"},
        {"method":"mobile_money","amount":"40.00","reference":"MM-1"}]'::jsonb
    );
    raise exception 'FAIL an overpaid sale was accepted';
  exception when sqlstate 'AM002' then
    raise notice 'ok   a split that overpays is refused';
  end;

  -- More units than exist.
  begin
    perform public.complete_sale(
      'txn-greedy',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":99}]'::jsonb,
      '[{"method":"cash","amount":"4950.00"}]'::jsonb
    );
    raise exception 'FAIL a sale exceeding stock was accepted';
  exception when sqlstate 'AM001' then
    raise notice 'ok   a sale exceeding available stock is refused';
  end;

  -- Mobile Money with no reference.
  begin
    perform public.complete_sale(
      'txn-noref',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      '[{"method":"mobile_money","amount":"50.00"}]'::jsonb
    );
    raise exception 'FAIL Mobile Money without a reference was accepted';
  exception when check_violation then
    raise notice 'ok   Mobile Money without a transaction reference is refused';
  end;

  perform pg_temp.ok(
    (select count(*) from public.sales) = sales_before,
    'no partial sale survives a failed checkout'
  );
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = stock_before,
    'stock is untouched by a failed checkout'
  );
  perform pg_temp.ok(
    not exists (
      select 1 from public.inventory_movements m
      where m.sale_id is not null
        and not exists (select 1 from public.sales s where s.id = m.sale_id)
    ),
    'no stock movement references a sale that does not exist'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- A cashier cannot reach the money
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.sales (receipt_number, cashier_id, total, client_transaction_id)
    values ('AMX-999999', '22222222-2222-4222-8222-222222222222', 0.01, 'txn-forged');
    raise exception 'FAIL a sale row was inserted directly, bypassing the sale function';
  exception when insufficient_privilege then
    raise notice 'ok   a sale cannot be inserted directly, only through complete_sale';
  end;

  perform pg_temp.ok(
    (select count(*) from public.expenses) = 0
      and (select count(*) from public.expense_categories) = 0,
    'a cashier sees no expenses at all'
  );

  perform pg_temp.ok(
    (select count(*) from public.inventory_movements) = 0,
    'a cashier cannot read the stock ledger'
  );

  begin
    perform public.void_sale(
      (select id from public.sales where client_transaction_id = 'txn-0001'),
      'changed my mind'
    );
    raise exception 'FAIL a cashier was able to void a sale';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a cashier cannot void a sale';
  end;
end;
$$;

reset role;

-- Another cashier must not see the first cashier's sales.
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :other_id), false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.sales) = 0,
    'a cashier cannot read another cashier''s sales'
  );
  perform pg_temp.ok(
    (select count(*) from public.sale_items) = 0,
    'a cashier cannot read another cashier''s sale items'
  );
  perform pg_temp.ok(
    (select count(*) from public.payments) = 0,
    'a cashier cannot read another cashier''s payments'
  );
end;
$$;

reset role;

-- The admin sees the business.
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :admin_id), false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.sales) = 2,
    'an admin reads every sale'
  );
  perform pg_temp.ok(
    (select count(*) from public.profiles) = 3,
    'an admin reads every staff record'
  );
  perform pg_temp.ok(
    (select count(*) from public.inventory_movements) = 4,
    'an admin reads the full stock ledger'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Voiding restores stock
-- -----------------------------------------------------------------------------
do $$
declare
  v_sale uuid := (select id from public.sales where client_transaction_id = 'txn-0001');
begin
  perform public.void_sale(v_sale, 'Customer returned the goods');

  perform pg_temp.ok(
    (select status from public.sales where id = v_sale) = 'voided',
    'voiding marks the sale, it does not delete it'
  );
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 10,
    'voiding a sale of 2 puts 2 back on the shelf'
  );
  perform pg_temp.ok(
    (select count(*) from public.inventory_movements
     where movement_type = 'sale_reversal') = 1,
    'voiding writes a reversal movement rather than erasing the original'
  );

  -- Voiding twice must not restore the stock twice.
  perform public.void_sale(v_sale, 'double tap');
  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
     where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 10,
    'voiding the same sale twice is harmless'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- The business cannot lock itself out
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    update public.profiles set role = 'cashier'
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL an admin demoted themselves';
  exception when check_violation then
    raise notice 'ok   an admin cannot change their own role';
  end;

  begin
    update public.profiles set is_active = false
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'FAIL an admin deactivated themselves';
  exception when check_violation then
    raise notice 'ok   an admin cannot deactivate their own account';
  end;
end;
$$;

-- Promote a second admin, then prove the *last* admin is still protected.
update public.profiles set role = 'admin'
where id = '22222222-2222-4222-8222-222222222222';

reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_id), false);
set role authenticated;

do $$
begin
  -- Now signed in as the second admin, demote the first. Allowed: two remain.
  update public.profiles set role = 'cashier'
  where id = '11111111-1111-4111-8111-111111111111';

  perform pg_temp.ok(
    (select role from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'cashier',
    'one admin can demote another while an admin remains'
  );
end;
$$;

reset role;

-- The last-admin guard has to hold even against a privileged path. A cashier
-- trying this is stopped by RLS long before the trigger, so the interesting
-- case is someone with RLS bypassed — a service-role call, or an owner working
-- in the SQL editor. That is exactly the hand that locks a business out of its
-- own system, so the check lives in a trigger rather than in a policy.
select set_config('request.jwt.claims', '', false);

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.profiles where role = 'admin' and is_active) = 1,
    'exactly one administrator remains for the next check'
  );

  begin
    update public.profiles set role = 'cashier'
    where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL the last administrator was demoted';
  exception when check_violation then
    raise notice 'ok   the last administrator cannot be demoted, even with RLS bypassed';
  end;

  begin
    update public.profiles set is_active = false
    where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL the last administrator was deactivated';
  exception when check_violation then
    raise notice 'ok   the last administrator cannot be deactivated either';
  end;
end;
$$;

-- Put the owner back so the remaining checks run against a sane business.
update public.profiles set role = 'admin'
where id = '11111111-1111-4111-8111-111111111111';

-- -----------------------------------------------------------------------------
-- Deactivation takes effect immediately
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :cashier_id), false);
set role authenticated;

update public.profiles set is_active = false
where id = '33333333-3333-4333-8333-333333333333';

reset role;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :other_id), false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.products) = 0,
    'a deactivated staff member loses access on their next request, not at token expiry'
  );

  begin
    perform public.complete_sale(
      'txn-deactivated',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      '[{"method":"cash","amount":"50.00"}]'::jsonb
    );
    raise exception 'FAIL a deactivated staff member completed a sale';
  exception when sqlstate 'AM004' then
    raise notice 'ok   a deactivated staff member cannot sell';
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Signed out means nothing at all
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.products) = 0,
    'an anonymous request reads no products'
  );
  perform pg_temp.ok(
    (select count(*) from public.sales) = 0,
    'an anonymous request reads no sales'
  );
  perform pg_temp.ok(
    (select count(*) from public.business_settings) = 0,
    'an anonymous request reads no business settings'
  );

  begin
    perform public.complete_sale(
      'txn-anon',
      '[{"product_id":"bbbbbbbb-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
      '[{"method":"cash","amount":"50.00"}]'::jsonb
    );
    raise exception 'FAIL an anonymous request completed a sale';
  exception when sqlstate 'AM004' then
    raise notice 'ok   an anonymous request cannot complete a sale';
  end;
end;
$$;

reset role;

-- -----------------------------------------------------------------------------
-- Selling by the box and by the piece, wholesale and retail
-- -----------------------------------------------------------------------------
-- A carton of milk: 12 sachets to a box. Four prices, and deliberately none of
-- them derivable from any other. Box retail (120) is not twelve times Piece
-- retail (144), and Box wholesale (110) is not twelve times Piece wholesale
-- (108). Shops really do price like this, and any code that multiplied or
-- divided to fill a gap would get all four numbers wrong.
\set milk '''bbbbbbbb-0000-4000-8000-000000000009'''

insert into public.products (id, sku, name, cost_price, minimum_stock)
values (:milk, 'MILK-SACHET', 'Milk sachet', 6.00, 10);

insert into public.product_units
  (product_id, unit_name, base_quantity, retail_price, wholesale_price, is_default)
values
  (:milk, 'Piece', 1,   12.00,  9.00,   true),
  (:milk, 'Box',   12, 120.00, 110.00, false),
  -- A unit the shop does not sell in bulk: retail only, wholesale left NULL.
  (:milk, 'Crate', 144, 1300.00, null,  false);

-- Stocking in is an admin action; selling is the cashier's.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);

select public.record_stock_in(:milk, 200, 'Opening stock');

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);

do $$
declare
  v_piece uuid;
  v_box   uuid;
  v_sale  uuid;
  v_stock integer;
begin
  select id into v_piece from public.product_units
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009' and unit_name = 'Piece';
  select id into v_box from public.product_units
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009' and unit_name = 'Box';

  perform pg_temp.ok(
    (select base_quantity from public.product_units where id = v_box) = 12,
    'a Box knows it holds 12 base units'
  );

  v_sale := public.complete_sale(
    'txn-box-1',
    format('[{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":2,"price_tier":"retail"}]', v_box)::jsonb,
    '[{"method":"cash","amount":"240.00"}]'::jsonb
  );

  perform pg_temp.ok(
    (select total from public.sales where id = v_sale) = 240.00,
    'two Boxes cost 2 x the Box price, not 24 x the piece price'
  );

  select quantity_on_hand into v_stock from public.inventory
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009';
  perform pg_temp.ok(v_stock = 176,
    'selling 2 Boxes of 12 took 24 base units off the shelf, not 2');

  perform pg_temp.ok(
    (select unit_name from public.sale_items where sale_id = v_sale) = 'Box',
    'the sale line records the unit it was sold in'
  );
  perform pg_temp.ok(
    (select base_quantity from public.sale_items where sale_id = v_sale) = 12,
    'the line snapshots the pack size, so a reprint stays honest after repacking'
  );
  perform pg_temp.ok(
    (select unit_cost from public.sale_items where sale_id = v_sale) = 72.00,
    'cost per Box is 12 x the base cost — converting a quantity, never a price'
  );

  -- Wholesale uses the wholesale price, which is not retail minus anything.
  v_sale := public.complete_sale(
    'txn-box-2',
    format('[{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":1,"price_tier":"wholesale"}]', v_box)::jsonb,
    '[{"method":"cash","amount":"110.00"}]'::jsonb
  );
  perform pg_temp.ok(
    (select total from public.sales where id = v_sale) = 110.00,
    'a wholesale Box is 110.00 — the number that was typed in'
  );
  perform pg_temp.ok(
    (select price_tier from public.sale_items where sale_id = v_sale) = 'wholesale',
    'the line records which tier was charged'
  );

  -- A box and loose pieces of the same product, in one transaction.
  v_sale := public.complete_sale(
    'txn-mixed',
    format('[{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":1,"price_tier":"retail"},{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":3,"price_tier":"retail"}]', v_box, v_piece)::jsonb,
    '[{"method":"cash","amount":"156.00"}]'::jsonb
  );
  perform pg_temp.ok(
    (select total from public.sales where id = v_sale) = 156.00,
    'one Box (120) plus three Pieces (36) comes to 156.00'
  );
  perform pg_temp.ok(
    (select count(*) from public.sale_items where sale_id = v_sale) = 2,
    'a box and loose pieces are two lines on the receipt'
  );
  perform pg_temp.ok(
    (select count(*) from public.inventory_movements where sale_id = v_sale) = 1,
    'but one stock movement, for the summed base quantity'
  );
  perform pg_temp.ok(
    (select quantity_delta from public.inventory_movements where sale_id = v_sale) = -15,
    'and it is -15: twelve out of the box, three loose'
  );
end;
$$;

-- Wholesale where no wholesale price exists is refused outright. This is the
-- rule the schema exists for: no fallback to retail, no fraction of it.
do $$
declare v_crate uuid;
begin
  select id into v_crate from public.product_units
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009' and unit_name = 'Crate';

  begin
    perform public.complete_sale(
      'txn-no-wholesale',
      format('[{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":1,"price_tier":"wholesale"}]', v_crate)::jsonb,
      '[{"method":"cash","amount":"1300.00"}]'::jsonb
    );
    raise exception 'FAIL a Crate with no wholesale price was sold wholesale';
  exception when sqlstate 'AM005' then
    raise notice 'ok   a unit with no wholesale price is refused, not sold at retail';
  end;

  perform pg_temp.ok(
    (select count(*) from public.sales where client_transaction_id = 'txn-no-wholesale') = 0,
    'the refused wholesale sale left nothing behind'
  );
end;
$$;

-- The stock check must sum the lines: each fits alone, together they do not.
-- The old one-line-per-product constraint used to make this impossible.
do $$
declare
  v_piece uuid;
  v_box   uuid;
  v_stock integer;
begin
  select id into v_piece from public.product_units
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009' and unit_name = 'Piece';
  select id into v_box from public.product_units
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009' and unit_name = 'Box';

  select quantity_on_hand into v_stock from public.inventory
   where product_id = 'bbbbbbbb-0000-4000-8000-000000000009';

  begin
    -- Boxes alone that fit, plus loose pieces that tip it over. Each line
    -- passes on its own; the pair does not.
    perform public.complete_sale(
      'txn-oversell',
      format('[{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":%s,"price_tier":"retail"},{"product_id":"bbbbbbbb-0000-4000-8000-000000000009","product_unit_id":"%s","quantity":%s,"price_tier":"retail"}]',
             v_box, v_stock / 12, v_piece, (v_stock % 12) + 1)::jsonb,
      '[{"method":"cash","amount":"1.00"}]'::jsonb
    );
    raise exception 'FAIL two lines together oversold the shelf';
  exception when sqlstate 'AM001' then
    raise notice 'ok   stock is checked across every line touching a product';
  end;

  perform pg_temp.ok(
    (select quantity_on_hand from public.inventory
      where product_id = 'bbbbbbbb-0000-4000-8000-000000000009') = v_stock,
    'the refused oversell left stock untouched'
  );
end;
$$;

-- An unpriced unit cannot exist: retail_price is NOT NULL, so there is no way
-- to add a Box and leave the system to work out what it costs.
do $$
begin
  begin
    insert into public.product_units (product_id, unit_name, base_quantity, retail_price)
    values ('bbbbbbbb-0000-4000-8000-000000000009', 'Bag', 24, null);
    raise exception 'FAIL a selling unit was created with no price';
  exception when not_null_violation then
    raise notice 'ok   a selling unit cannot exist without its own retail price';
  end;
end;
$$;

select set_config('request.jwt.claims', '', false);

-- -----------------------------------------------------------------------------
-- Credentials are reachable only by the service role
-- -----------------------------------------------------------------------------
-- The whole point of moving PIN hashes off `profiles`: that table's select
-- policy hands the entire row to its owner and to any admin, and a bcrypt hash
-- of four digits is ten thousand candidates. An admin who can read a cashier's
-- hash can sign in as them, and sales are attributed to whoever rang them up.
insert into public.staff_credentials (staff_id, pin_hash, auth_secret) values
  (:admin_id,   '$2b$12$SGVyZUlzQVBsYWNlaG9sZGVyaGFzaFZhbHVlRm9yVGVzdHM', 'admin-secret'),
  (:cashier_id, '$2b$12$QW5vdGhlclBsYWNlaG9sZGVyaGFzaFZhbHVlRm9yVGVzdHM', 'cashier-secret');

-- An admin is the strongest authenticated role there is. If anyone could read
-- this table it would be them.
--
-- Two things can stop a read, and either is a pass: the REVOKE refuses it
-- outright with insufficient_privilege, or RLS-with-no-policies returns no
-- rows. What must never happen is a row coming back.
create or replace function pg_temp.credentials_visible()
returns integer language plpgsql as $$
declare n integer;
begin
  select count(*) into n from public.staff_credentials;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', :admin_id)::text, false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    pg_temp.credentials_visible() = 0,
    'an admin cannot read any credentials row'
  );

  -- Attempt the write. Whether it is refused outright or silently matches no
  -- rows, it must not change anything — which is checked below from a session
  -- that can actually see the table. Checking it from here would prove
  -- nothing: a reader who is blocked always counts zero.
  begin
    update public.staff_credentials set pin_hash = 'overwritten';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.staff_credentials where pin_hash = 'overwritten') = 0,
    'an admin cannot overwrite a credentials row'
  );
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', :cashier_id)::text, false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    pg_temp.credentials_visible() = 0,
    'a cashier cannot read even their own credentials row'
  );
end;
$$;

reset role;

select set_config('request.jwt.claims', '', false);
set role anon;

do $$
begin
  perform pg_temp.ok(
    pg_temp.credentials_visible() = 0,
    'an anonymous request reads no credentials'
  );
end;
$$;

reset role;

do $$
begin
  -- Service role bypasses RLS; it is the only way in, and the application only
  -- ever reaches it from the server.
  perform pg_temp.ok(
    (select count(*) from public.staff_credentials) = 2,
    'the service role still reads credentials normally'
  );

  -- The hash must not have survived on profiles.
  perform pg_temp.ok(
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
        and column_name = 'pin_hash'
    ),
    'profiles no longer carries a pin_hash column'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- The auth repair
-- -----------------------------------------------------------------------------
-- This is the bug that made the system unbootable. The old migration seeded the
-- first administrator with a hand-written INSERT into auth.users, which leaves
-- an account GoTrue cannot sign in: token columns NULL where it reads non-null
-- strings, and no auth.identities row for email sign-in to resolve through.
-- Since that was the only account a fresh deployment had, and creating more
-- requires being signed in, nobody could get in at all.
--
-- Insert an account exactly the way the broken seed did, confirm it is broken,
-- then repair it.
\set broken_id '''55555555-5555-4555-8555-555555555555'''

insert into auth.users (id, email, raw_user_meta_data)
values (:broken_id, 'handwritten@amexpress.test', '{"full_name":"Hand Written"}');

do $$
begin
  perform pg_temp.ok(
    not exists (
      select 1 from auth.identities i
      where i.user_id = '55555555-5555-4555-8555-555555555555'
        and i.provider = 'email'
    ),
    'a hand-written auth user starts with no email identity (the bug)'
  );
  perform pg_temp.ok(
    (select confirmation_token is null from auth.users
      where id = '55555555-5555-4555-8555-555555555555'),
    'a hand-written auth user starts with NULL token columns (the bug)'
  );
end;
$$;

select public.repair_auth_accounts();

do $$
begin
  perform pg_temp.ok(
    (select count(*) from auth.users u
      where not exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider = 'email'
      )) = 0,
    'after repair, every auth user has an email identity to sign in through'
  );

  perform pg_temp.ok(
    (select count(*) from auth.users
      where confirmation_token is null
         or recovery_token is null
         or email_change is null
         or email_change_token_new is null
         or email_change_token_current is null) = 0,
    'after repair, no auth user has a NULL token column for GoTrue to choke on'
  );
end;
$$;

-- Idempotent: running it twice must not duplicate identities.
select public.repair_auth_accounts();

do $$
begin
  perform pg_temp.ok(
    (select count(*) from auth.identities
      where user_id = '55555555-5555-4555-8555-555555555555') = 1,
    'repairing twice does not create a second identity'
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- Staff incentives: an admin sees everyone, a cashier sees only themselves
-- -----------------------------------------------------------------------------
-- Pay is the fastest way to sour a small team, so this is not a UI decision.
-- Deliberately NOT :cashier_id: earlier tests in this file promote that
-- account to admin, and an admin seeing every row is the correct behaviour.
-- The plain staff member left by this point is the hand-written user.
\set plain_staff '''55555555-5555-4555-8555-555555555555'''

insert into public.staff_incentives
  (staff_id, amount, period_start, period_end, reason, recorded_by)
values
  (:plain_staff, 200.00, '2026-08-01', '2026-08-31', 'August commission', :admin_id),
  (:cashier_id,  350.00, '2026-08-01', '2026-08-31', 'August commission', :admin_id);

select set_config('request.jwt.claims', json_build_object('sub', :admin_id, 'role', 'authenticated')::text, false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.staff_incentives) = 2,
    'an admin sees every incentive'
  );
end;
$$;

reset role;

select set_config('request.jwt.claims', json_build_object('sub', :plain_staff, 'role', 'authenticated')::text, false);
set role authenticated;

do $$
begin
  perform pg_temp.ok(
    (select count(*) from public.staff_incentives) = 1,
    'a cashier sees only their own incentive'
  );
  perform pg_temp.ok(
    (select amount from public.staff_incentives) = 200.00,
    'and it is theirs, not the other cashier''s'
  );

  begin
    insert into public.staff_incentives
      (staff_id, amount, period_start, period_end, reason, recorded_by)
    values ('55555555-5555-4555-8555-555555555555', 5000.00,
            '2026-08-01', '2026-08-31', 'a bonus I have awarded myself',
            '55555555-5555-4555-8555-555555555555');
    raise exception 'FAIL a cashier awarded themselves an incentive';
  exception when insufficient_privilege then
    raise notice 'ok   a cashier cannot award themselves an incentive';
  end;

  begin
    update public.staff_incentives set status = 'paid';
    perform pg_temp.ok(
      (select count(*) from public.staff_incentives where status = 'paid') = 0,
      'a cashier cannot mark their own incentive paid'
    );
  exception when insufficient_privilege then
    raise notice 'ok   a cashier cannot mark their own incentive paid';
  end;
end;
$$;

reset role;

-- Cancelled incentives are kept, and excluded from the money totals.
do $$
begin
  update public.staff_incentives set status = 'cancelled'
   where staff_id = '22222222-2222-4222-8222-222222222222';

  perform pg_temp.ok(
    (select count(*) from public.staff_incentives) = 2,
    'cancelling keeps the record rather than deleting it'
  );
end;
$$;

select set_config('request.jwt.claims', json_build_object('sub', :admin_id, 'role', 'authenticated')::text, false);
set role authenticated;

do $$
declare r record;
begin
  select * into r from public.report_staff_incentives('2026-08-01', '2026-08-31');
  perform pg_temp.ok(r.total_pending = 200.00,
    'the incentive report counts the live one');
  perform pg_temp.ok(
    (select count(*) from public.report_staff_incentives('2026-08-01', '2026-08-31')) = 1,
    'and leaves the cancelled one out entirely'
  );
end;
$$;

reset role;
select set_config('request.jwt.claims', '', false);

\echo ''
\echo 'All database behaviour tests passed.'
