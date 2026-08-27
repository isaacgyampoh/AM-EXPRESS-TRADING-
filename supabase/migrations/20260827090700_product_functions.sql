-- =============================================================================
-- AM Express Trading — creating a product with its opening stock
-- =============================================================================
--
-- A product and the stock that came with it are one event, not two. Doing it
-- in two round trips leaves a window where the product exists at zero — which
-- the POS would show as "out of stock" for goods sitting on the shelf.
--
-- Opening stock is recorded as a `stock_in` movement rather than written
-- straight into the balance, so the ledger explains where the first units came
-- from just as it explains every later delivery.
-- =============================================================================

create or replace function public.create_product_with_stock(
  p_sku            text,
  p_name           text,
  p_selling_price  numeric,
  p_cost_price     numeric default null,
  p_category_id    uuid default null,
  p_minimum_stock  integer default 0,
  p_is_active      boolean default true,
  p_opening_stock  integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := (select auth.uid());
  v_product_id uuid;
  v_new_qty    integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can create a product.'
      using errcode = 'AM004';
  end if;

  if p_opening_stock is null or p_opening_stock < 0 then
    raise exception 'Opening stock cannot be negative.'
      using errcode = 'AM005';
  end if;

  insert into public.products
    (sku, name, category_id, selling_price, cost_price, minimum_stock, is_active, created_by)
  values
    (upper(btrim(p_sku)), btrim(p_name), p_category_id, p_selling_price,
     p_cost_price, coalesce(p_minimum_stock, 0), coalesce(p_is_active, true), v_actor)
  returning id into v_product_id;

  if p_opening_stock > 0 then
    update public.inventory i
       set quantity_on_hand = i.quantity_on_hand + p_opening_stock,
           updated_at = now()
     where i.product_id = v_product_id
    returning i.quantity_on_hand into v_new_qty;

    insert into public.inventory_movements
      (product_id, movement_type, quantity_delta, resulting_quantity, reason, recorded_by)
    values
      (v_product_id, 'stock_in', p_opening_stock, v_new_qty, 'Opening stock', v_actor);
  end if;

  return v_product_id;
end;
$$;

revoke execute on function public.create_product_with_stock(text, text, numeric, numeric, uuid, integer, boolean, integer) from public;
grant execute on function public.create_product_with_stock(text, text, numeric, numeric, uuid, integer, boolean, integer) to authenticated;
