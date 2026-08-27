-- =============================================================================
-- AM Express Trading — stock operations
-- =============================================================================
--
-- The only way stock moves. Each function updates the balance and appends the
-- ledger line in a single transaction, under a row lock, having first checked
-- the caller's role itself — SECURITY DEFINER bypasses RLS, so these functions
-- must do their own authorisation rather than inherit it.
--
-- They raise the same custom SQLSTATEs as the sale functions, so the
-- application maps every database refusal through one table:
--
--     AM003  product missing
--     AM004  not permitted
--     AM005  invalid input
-- =============================================================================

-- -----------------------------------------------------------------------------
-- record_stock_in — goods arrived
-- -----------------------------------------------------------------------------
create or replace function public.record_stock_in(
  p_product_id uuid,
  p_quantity   integer,
  p_reason     text default null
)
returns table (product_id uuid, quantity_on_hand integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_new_qty  integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can add stock.'
      using errcode = 'AM004';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Stock-in quantity must be at least 1.'
      using errcode = 'AM005';
  end if;

  -- Lock the balance row first. Two people receiving the same delivery at the
  -- same moment serialise here instead of overwriting each other.
  update public.inventory i
     set quantity_on_hand = i.quantity_on_hand + p_quantity,
         updated_at = now()
   where i.product_id = p_product_id
  returning i.quantity_on_hand into v_new_qty;

  if v_new_qty is null then
    raise exception 'Product % was not found.', p_product_id
      using errcode = 'AM003';
  end if;

  insert into public.inventory_movements
    (product_id, movement_type, quantity_delta, resulting_quantity, reason, recorded_by)
  values
    (p_product_id, 'stock_in', p_quantity, v_new_qty, nullif(btrim(coalesce(p_reason, '')), ''), v_actor);

  return query select p_product_id, v_new_qty;
end;
$$;

-- -----------------------------------------------------------------------------
-- record_stock_adjustment — a stock take found a different number
-- -----------------------------------------------------------------------------
-- Takes the counted figure, not a delta. The person doing a stock take knows
-- what they counted; making them work out the difference is how mistakes get
-- entered.
create or replace function public.record_stock_adjustment(
  p_product_id       uuid,
  p_counted_quantity integer,
  p_reason           text
)
returns table (product_id uuid, quantity_on_hand integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_current integer;
  v_delta   integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can adjust stock.'
      using errcode = 'AM004';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'A counted quantity cannot be negative.'
      using errcode = 'AM005';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give a reason for the adjustment.'
      using errcode = 'AM005';
  end if;

  select i.quantity_on_hand into v_current
  from public.inventory i
  where i.product_id = p_product_id
  for update;

  if v_current is null then
    raise exception 'Product % was not found.', p_product_id
      using errcode = 'AM003';
  end if;

  v_delta := p_counted_quantity - v_current;

  if v_delta = 0 then
    -- Counting the same number is not a movement. Nothing to record, and no
    -- error either: the count simply confirmed the books.
    return query select p_product_id, v_current;
    return;
  end if;

  update public.inventory i
     set quantity_on_hand = p_counted_quantity,
         updated_at = now()
   where i.product_id = p_product_id;

  insert into public.inventory_movements
    (product_id, movement_type, quantity_delta, resulting_quantity, reason, recorded_by)
  values
    (p_product_id, 'adjustment', v_delta, p_counted_quantity, btrim(p_reason), v_actor);

  return query select p_product_id, p_counted_quantity;
end;
$$;

-- Nobody gets these by default; signed-in staff get them and the functions
-- check the role themselves.
revoke execute on function public.record_stock_in(uuid, integer, text) from public;
revoke execute on function public.record_stock_adjustment(uuid, integer, text) from public;
grant execute on function public.record_stock_in(uuid, integer, text) to authenticated;
grant execute on function public.record_stock_adjustment(uuid, integer, text) to authenticated;
