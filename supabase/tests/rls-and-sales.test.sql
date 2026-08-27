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

insert into public.products (id, sku, name, category_id, selling_price, cost_price, minimum_stock)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'RICE-5KG', 'Rice 5kg',
   'aaaaaaaa-0000-4000-8000-000000000001', 50.00, 38.00, 5),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'OIL-1L', 'Cooking Oil 1L',
   'aaaaaaaa-0000-4000-8000-000000000001', 25.00, 19.50, 3);

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
    insert into public.products (sku, name, selling_price)
    values ('HACK-1', 'Free Rice', 0.01);
    raise exception 'FAIL a cashier was able to create a product';
  exception when insufficient_privilege then
    raise notice 'ok   RLS stops a cashier creating a product';
  end;

  begin
    update public.products set selling_price = 0.01
    where sku = 'RICE-5KG';
    perform pg_temp.ok(
      (select selling_price from public.products where sku = 'RICE-5KG') = 50.00,
      'RLS stops a cashier repricing a product'
    );
  exception when insufficient_privilege then
    raise notice 'ok   RLS stops a cashier repricing a product';
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

\echo ''
\echo 'All database behaviour tests passed.'
