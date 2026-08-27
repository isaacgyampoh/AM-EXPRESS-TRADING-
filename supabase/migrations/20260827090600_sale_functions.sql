-- =============================================================================
-- AM Express Trading — completing and voiding a sale
-- =============================================================================
--
-- complete_sale() is the most important function in this system. Everything a
-- checkout must do happens inside it, in one transaction:
--
--     validate the cart -> validate stock -> create the sale -> create the
--     items -> record the payments -> reduce inventory -> write the ledger
--
-- Either all of that commits or none of it does. There is no path that leaves
-- stock reduced without a sale, or a sale recorded without reducing stock.
--
-- Two design decisions are worth stating plainly:
--
--   1. The client sends product ids and quantities. It does NOT send prices or
--      a total. Every price is read here, from the catalogue, under lock.
--      A tampered request cannot change what is charged, because the numbers
--      it would tamper with are never read.
--
--   2. Rows are locked in product-id order before anything is written. Two
--      cashiers selling the last unit at the same moment serialise here, and
--      exactly one of them gets the "insufficient stock" error.
--
-- Custom SQLSTATEs let the application map failures back to domain errors:
--
--     AM001  insufficient stock
--     AM002  payments do not equal the total
--     AM003  product missing or inactive
--     AM004  not permitted
--     AM005  invalid input
-- =============================================================================

create or replace function public.complete_sale(
  p_client_transaction_id text,
  p_items                 jsonb,
  p_payments              jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_sale_id  uuid;
  v_prefix   text;
  v_receipt  text;
  v_total    numeric(14, 2) := 0;
  v_paid     numeric(14, 2) := 0;
  v_line     record;
  v_product  record;
  v_stock    integer;
  v_new_qty  integer;
  v_bad      integer;
begin
  -- ---------------------------------------------------------------------
  -- Who is asking
  -- ---------------------------------------------------------------------
  -- SECURITY DEFINER bypasses RLS, so this function does its own checking.
  if not public.is_active_staff() then
    raise exception 'You must be signed in as active staff to record a sale.'
      using errcode = 'AM004';
  end if;

  if length(btrim(coalesce(p_client_transaction_id, ''))) = 0 then
    raise exception 'A transaction reference is required.'
      using errcode = 'AM005';
  end if;

  -- ---------------------------------------------------------------------
  -- Idempotency
  -- ---------------------------------------------------------------------
  -- A retry after a dropped connection returns the sale that already exists
  -- rather than selling the same stock again.
  select s.id into v_sale_id
  from public.sales s
  where s.client_transaction_id = p_client_transaction_id;

  if v_sale_id is not null then
    return v_sale_id;
  end if;

  -- ---------------------------------------------------------------------
  -- Shape of the request
  -- ---------------------------------------------------------------------
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product before completing the sale.'
      using errcode = 'AM005';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) = 0 then
    raise exception 'Record how the sale was paid for.'
      using errcode = 'AM005';
  end if;

  select count(*) into v_bad
  from (
    select (e ->> 'product_id')::uuid as product_id
    from jsonb_array_elements(p_items) e
    group by 1
    having count(*) > 1
  ) duplicates;

  if v_bad > 0 then
    raise exception 'The same product appears more than once in the basket.'
      using errcode = 'AM005';
  end if;

  -- ---------------------------------------------------------------------
  -- Lock every affected stock row, in a stable order
  -- ---------------------------------------------------------------------
  -- Ordering by product id means two concurrent sales touching the same two
  -- products can never deadlock by grabbing them in opposite orders.
  perform i.product_id
  from public.inventory i
  where i.product_id in (
    select (e ->> 'product_id')::uuid from jsonb_array_elements(p_items) e
  )
  order by i.product_id
  for update;

  -- ---------------------------------------------------------------------
  -- Price the cart from the catalogue and check stock
  -- ---------------------------------------------------------------------
  for v_line in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items) e
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantity must be at least 1.'
        using errcode = 'AM005';
    end if;

    select p.id, p.sku, p.name, p.selling_price, p.cost_price, p.is_active
      into v_product
    from public.products p
    where p.id = v_line.product_id;

    if v_product.id is null then
      raise exception 'A product in the basket no longer exists.'
        using errcode = 'AM003';
    end if;

    if not v_product.is_active then
      raise exception '% is not active and cannot be sold.', v_product.name
        using errcode = 'AM003';
    end if;

    select i.quantity_on_hand into v_stock
    from public.inventory i
    where i.product_id = v_line.product_id;

    if v_stock is null then
      raise exception 'No stock record exists for %.', v_product.name
        using errcode = 'AM003';
    end if;

    if v_stock < v_line.quantity then
      -- DETAIL is machine-readable on purpose: the repository parses it back
      -- into a typed InsufficientStockError rather than regexing the sentence.
      raise exception 'Not enough stock for %: % requested, % available.',
        v_product.name, v_line.quantity, v_stock
        using errcode = 'AM001',
              detail = format('product=%s|requested=%s|available=%s',
                              v_product.name, v_line.quantity, v_stock);
    end if;

    v_total := v_total + (v_product.selling_price * v_line.quantity);
  end loop;

  if v_total <= 0 then
    raise exception 'A sale must come to more than zero.'
      using errcode = 'AM005';
  end if;

  -- ---------------------------------------------------------------------
  -- The payment rule: cash + Mobile Money must equal the total, exactly
  -- ---------------------------------------------------------------------
  select coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0)
    into v_paid
  from jsonb_array_elements(p_payments) e;

  if v_paid <> v_total then
    raise exception 'Payment of % does not match the sale total of %.', v_paid, v_total
      using errcode = 'AM002',
            detail = format('total=%s|tendered=%s', v_total, v_paid);
  end if;

  -- ---------------------------------------------------------------------
  -- Write it
  -- ---------------------------------------------------------------------
  select b.receipt_prefix into v_prefix
  from public.business_settings b
  where b.id;

  v_receipt := coalesce(v_prefix, 'AMX') || '-' ||
               lpad(nextval('public.receipt_number_seq')::text, 6, '0');

  insert into public.sales (receipt_number, cashier_id, total, client_transaction_id)
  values (v_receipt, v_actor, v_total, p_client_transaction_id)
  returning id into v_sale_id;

  for v_line in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items) e
  loop
    select p.sku, p.name, p.selling_price, p.cost_price
      into v_product
    from public.products p
    where p.id = v_line.product_id;

    insert into public.sale_items
      (sale_id, product_id, sku, name, unit_price, unit_cost, quantity, line_total)
    values
      (v_sale_id, v_line.product_id, v_product.sku, v_product.name,
       v_product.selling_price, v_product.cost_price, v_line.quantity,
       v_product.selling_price * v_line.quantity);

    update public.inventory i
       set quantity_on_hand = i.quantity_on_hand - v_line.quantity,
           updated_at = now()
     where i.product_id = v_line.product_id
    returning i.quantity_on_hand into v_new_qty;

    insert into public.inventory_movements
      (product_id, movement_type, quantity_delta, resulting_quantity, sale_id, recorded_by)
    values
      (v_line.product_id, 'sale', -v_line.quantity, v_new_qty, v_sale_id, v_actor);
  end loop;

  insert into public.payments (sale_id, method, amount, reference)
  select v_sale_id,
         e ->> 'method',
         round((e ->> 'amount')::numeric, 2),
         nullif(btrim(coalesce(e ->> 'reference', '')), '')
  from jsonb_array_elements(p_payments) e;

  return v_sale_id;

exception
  when unique_violation then
    -- Two retries of the same transaction arrived at once and the second lost
    -- the race on client_transaction_id. The first one's sale is the answer.
    select s.id into v_sale_id
    from public.sales s
    where s.client_transaction_id = p_client_transaction_id;

    if v_sale_id is not null then
      return v_sale_id;
    end if;
    raise;
end;
$$;

comment on function public.complete_sale(text, jsonb, jsonb) is
  'Atomically records a sale. Prices are read from the catalogue, never accepted from the caller.';

-- -----------------------------------------------------------------------------
-- void_sale — undo a completed sale
-- -----------------------------------------------------------------------------
-- Restores stock, writes reversal movements, and marks the sale voided. The
-- original rows stay exactly as they were: a void is a new fact about a sale,
-- not an edit to it.
create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_status  text;
  v_line    record;
  v_new_qty integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can void a sale.'
      using errcode = 'AM004';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give a reason for voiding the sale.'
      using errcode = 'AM005';
  end if;

  select s.status into v_status
  from public.sales s
  where s.id = p_sale_id
  for update;

  if v_status is null then
    raise exception 'That sale was not found.'
      using errcode = 'AM003';
  end if;

  if v_status = 'voided' then
    -- Already done. Idempotent rather than an error, so a double-tap on a
    -- flaky connection cannot restore the stock twice.
    return p_sale_id;
  end if;

  for v_line in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = p_sale_id
    order by si.product_id
  loop
    update public.inventory i
       set quantity_on_hand = i.quantity_on_hand + v_line.quantity,
           updated_at = now()
     where i.product_id = v_line.product_id
    returning i.quantity_on_hand into v_new_qty;

    insert into public.inventory_movements
      (product_id, movement_type, quantity_delta, resulting_quantity, reason, sale_id, recorded_by)
    values
      (v_line.product_id, 'sale_reversal', v_line.quantity, v_new_qty,
       btrim(p_reason), p_sale_id, v_actor);
  end loop;

  update public.sales s
     set status = 'voided',
         voided_at = now(),
         voided_by = v_actor,
         void_reason = btrim(p_reason)
   where s.id = p_sale_id;

  return p_sale_id;
end;
$$;

revoke execute on function public.complete_sale(text, jsonb, jsonb) from public;
revoke execute on function public.void_sale(uuid, text) from public;
grant execute on function public.complete_sale(text, jsonb, jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
