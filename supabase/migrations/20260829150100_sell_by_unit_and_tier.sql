-- =============================================================================
-- AM Express Trading — completing a sale by unit and price tier
-- =============================================================================
--
-- complete_sale now takes, per line:
--
--   { "product_id": …, "product_unit_id": …, "quantity": 2, "price_tier": "wholesale" }
--
-- `product_unit_id` and `price_tier` are optional. Omitted, they mean the
-- product's default unit at retail, so a caller that has not been updated yet
-- keeps working and keeps meaning what it meant before.
--
-- Prices still come from the catalogue and never from the caller. What is new
-- is that there are now up to four of them per product — retail and wholesale,
-- per unit — and picking the wrong one is a way to lose money quietly. So:
--
--   * A wholesale line against a unit with no wholesale price is REFUSED.
--     It is never served at the retail price, and never at retail-minus-
--     something. If the shop has not set a wholesale price for Box, then Box
--     is not sold wholesale, and the cashier is told so.
--
--   * Stock is checked per PRODUCT, summed across every line touching it.
--     A sale of 1 Box (12) plus 3 Pieces needs 15 on hand, and it is that 15
--     that gets compared. The old one-line-per-product constraint used to make
--     this impossible to get wrong; now that a product can appear twice in a
--     basket, the aggregate is what protects it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_client_transaction_id text,
  p_items                 jsonb,
  p_payments              jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := (SELECT auth.uid());
  v_sale_id uuid;
  v_prefix  text;
  v_receipt text;
  v_total   numeric(14, 2) := 0;
  v_paid    numeric(14, 2) := 0;
  v_line    record;
  v_need    record;
  v_new_qty integer;
  v_bad     integer;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'You must be signed in as active staff to record a sale.'
      USING errcode = 'AM004';
  END IF;

  IF length(btrim(coalesce(p_client_transaction_id, ''))) = 0 THEN
    RAISE EXCEPTION 'A transaction reference is required.' USING errcode = 'AM005';
  END IF;

  -- Idempotency: a retry after a dropped connection returns the existing sale
  -- rather than selling the same stock twice.
  SELECT s.id INTO v_sale_id
  FROM public.sales s
  WHERE s.client_transaction_id = p_client_transaction_id;

  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one product before completing the sale.'
      USING errcode = 'AM005';
  END IF;

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Record how the sale was paid for.' USING errcode = 'AM005';
  END IF;

  -- The same product may appear more than once now — a box and some loose
  -- pieces — but not the same product in the same unit twice.
  SELECT count(*) INTO v_bad
  FROM (
    SELECT (e ->> 'product_id')::uuid AS product_id,
           coalesce(nullif(e ->> 'product_unit_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid) AS unit_id
    FROM jsonb_array_elements(p_items) e
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) duplicates;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'The same product and unit appears more than once in the basket.'
      USING errcode = 'AM005';
  END IF;

  -- Lock every affected stock row in a stable order, so two concurrent sales
  -- touching the same products cannot deadlock.
  PERFORM i.product_id
  FROM public.inventory i
  WHERE i.product_id IN (
    SELECT (e ->> 'product_id')::uuid FROM jsonb_array_elements(p_items) e
  )
  ORDER BY i.product_id
  FOR UPDATE;

  -- ---------------------------------------------------------------------
  -- Resolve, price and validate every line
  -- ---------------------------------------------------------------------
  FOR v_line IN
    WITH lines AS (
      SELECT (e ->> 'product_id')::uuid AS product_id,
             nullif(e ->> 'product_unit_id', '')::uuid AS unit_id,
             (e ->> 'quantity')::integer AS quantity,
             coalesce(nullif(btrim(e ->> 'price_tier'), ''), 'retail') AS tier
      FROM jsonb_array_elements(p_items) e
    )
    SELECT l.product_id, l.quantity, l.tier,
           p.sku, p.name AS product_name, p.cost_price, p.is_active AS product_active,
           u.id AS unit_id, u.unit_name, u.base_quantity, u.is_active AS unit_active,
           u.retail_price, u.wholesale_price
    FROM lines l
    LEFT JOIN public.products p ON p.id = l.product_id
    LEFT JOIN public.product_units u
      ON u.product_id = l.product_id
     AND u.id = coalesce(
           l.unit_id,
           (SELECT d.id FROM public.product_units d
             WHERE d.product_id = l.product_id AND d.is_default)
         )
  LOOP
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be at least 1.' USING errcode = 'AM005';
    END IF;

    IF v_line.sku IS NULL THEN
      RAISE EXCEPTION 'A product in the basket no longer exists.' USING errcode = 'AM003';
    END IF;

    IF NOT v_line.product_active THEN
      RAISE EXCEPTION '% is not active and cannot be sold.', v_line.product_name
        USING errcode = 'AM003';
    END IF;

    IF v_line.unit_id IS NULL THEN
      RAISE EXCEPTION 'No selling unit found for %.', v_line.product_name
        USING errcode = 'AM003';
    END IF;

    IF NOT v_line.unit_active THEN
      RAISE EXCEPTION '% is no longer sold by the %.', v_line.product_name, v_line.unit_name
        USING errcode = 'AM003';
    END IF;

    IF v_line.tier NOT IN ('retail', 'wholesale') THEN
      RAISE EXCEPTION 'Unknown price tier "%".', v_line.tier USING errcode = 'AM005';
    END IF;

    -- The rule this whole migration exists for. No wholesale price means not
    -- sold wholesale — not "sold at retail instead", and not "sold at some
    -- fraction of retail".
    IF v_line.tier = 'wholesale' AND v_line.wholesale_price IS NULL THEN
      RAISE EXCEPTION '% has no wholesale price for one %. Set one, or sell it at retail.',
        v_line.product_name, v_line.unit_name
        USING errcode = 'AM005';
    END IF;

    v_total := v_total + (
      CASE v_line.tier WHEN 'wholesale' THEN v_line.wholesale_price
                       ELSE v_line.retail_price END
      * v_line.quantity
    );
  END LOOP;

  -- ---------------------------------------------------------------------
  -- Stock, per product, summed across the lines that touch it
  -- ---------------------------------------------------------------------
  FOR v_need IN
    WITH lines AS (
      SELECT (e ->> 'product_id')::uuid AS product_id,
             nullif(e ->> 'product_unit_id', '')::uuid AS unit_id,
             (e ->> 'quantity')::integer AS quantity
      FROM jsonb_array_elements(p_items) e
    )
    SELECT l.product_id,
           p.name AS product_name,
           sum(l.quantity * u.base_quantity)::integer AS base_needed,
           i.quantity_on_hand
    FROM lines l
    JOIN public.products p ON p.id = l.product_id
    JOIN public.product_units u
      ON u.product_id = l.product_id
     AND u.id = coalesce(
           l.unit_id,
           (SELECT d.id FROM public.product_units d
             WHERE d.product_id = l.product_id AND d.is_default)
         )
    LEFT JOIN public.inventory i ON i.product_id = l.product_id
    GROUP BY l.product_id, p.name, i.quantity_on_hand
  LOOP
    IF v_need.quantity_on_hand IS NULL THEN
      RAISE EXCEPTION 'No stock record exists for %.', v_need.product_name
        USING errcode = 'AM003';
    END IF;

    IF v_need.quantity_on_hand < v_need.base_needed THEN
      RAISE EXCEPTION 'Not enough stock for %: % requested, % available.',
        v_need.product_name, v_need.base_needed, v_need.quantity_on_hand
        USING errcode = 'AM001',
              detail = format('product=%s|requested=%s|available=%s',
                              v_need.product_name, v_need.base_needed,
                              v_need.quantity_on_hand);
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'A sale must come to more than zero.' USING errcode = 'AM005';
  END IF;

  SELECT coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0)
    INTO v_paid
  FROM jsonb_array_elements(p_payments) e;

  IF v_paid <> v_total THEN
    RAISE EXCEPTION 'Payment of % does not match the sale total of %.', v_paid, v_total
      USING errcode = 'AM002',
            detail = format('total=%s|tendered=%s', v_total, v_paid);
  END IF;

  -- ---------------------------------------------------------------------
  -- Write it
  -- ---------------------------------------------------------------------
  SELECT b.receipt_prefix INTO v_prefix
  FROM public.business_settings b
  WHERE b.id;

  v_receipt := coalesce(v_prefix, 'AMX') || '-' ||
               lpad(nextval('public.receipt_number_seq')::text, 6, '0');

  INSERT INTO public.sales (receipt_number, cashier_id, total, client_transaction_id)
  VALUES (v_receipt, v_actor, v_total, p_client_transaction_id)
  RETURNING id INTO v_sale_id;

  -- One line per basket line, with the unit and tier snapshotted so a receipt
  -- reprinted next year still says what was actually sold.
  INSERT INTO public.sale_items
    (sale_id, product_id, product_unit_id, sku, name, unit_name, base_quantity,
     price_tier, unit_price, unit_cost, quantity, line_total)
  SELECT v_sale_id, l.product_id, u.id, p.sku, p.name, u.unit_name, u.base_quantity,
         l.tier,
         CASE l.tier WHEN 'wholesale' THEN u.wholesale_price ELSE u.retail_price END,
         -- Cost is held per base unit, so a Box of 12 cost twelve times one.
         -- This is a quantity conversion, not a price one.
         CASE WHEN p.cost_price IS NULL THEN NULL
              ELSE p.cost_price * u.base_quantity END,
         l.quantity,
         CASE l.tier WHEN 'wholesale' THEN u.wholesale_price ELSE u.retail_price END
           * l.quantity
  FROM (
    SELECT (e ->> 'product_id')::uuid AS product_id,
           nullif(e ->> 'product_unit_id', '')::uuid AS unit_id,
           (e ->> 'quantity')::integer AS quantity,
           coalesce(nullif(btrim(e ->> 'price_tier'), ''), 'retail') AS tier
    FROM jsonb_array_elements(p_items) e
  ) l
  JOIN public.products p ON p.id = l.product_id
  JOIN public.product_units u
    ON u.product_id = l.product_id
   AND u.id = coalesce(
         l.unit_id,
         (SELECT d.id FROM public.product_units d
           WHERE d.product_id = l.product_id AND d.is_default)
       );

  -- One stock movement per product, for the summed base quantity. Two ledger
  -- lines for one product in one sale would be harder to read and would let
  -- the resulting_quantity of the first disagree with the shelf.
  FOR v_need IN
    WITH lines AS (
      SELECT (e ->> 'product_id')::uuid AS product_id,
             nullif(e ->> 'product_unit_id', '')::uuid AS unit_id,
             (e ->> 'quantity')::integer AS quantity
      FROM jsonb_array_elements(p_items) e
    )
    SELECT l.product_id, sum(l.quantity * u.base_quantity)::integer AS base_needed
    FROM lines l
    JOIN public.product_units u
      ON u.product_id = l.product_id
     AND u.id = coalesce(
           l.unit_id,
           (SELECT d.id FROM public.product_units d
             WHERE d.product_id = l.product_id AND d.is_default)
         )
    GROUP BY l.product_id
    ORDER BY l.product_id
  LOOP
    UPDATE public.inventory i
       SET quantity_on_hand = i.quantity_on_hand - v_need.base_needed,
           updated_at = now()
     WHERE i.product_id = v_need.product_id
    RETURNING i.quantity_on_hand INTO v_new_qty;

    INSERT INTO public.inventory_movements
      (product_id, movement_type, quantity_delta, resulting_quantity, sale_id, recorded_by)
    VALUES
      (v_need.product_id, 'sale', -v_need.base_needed, v_new_qty, v_sale_id, v_actor);
  END LOOP;

  INSERT INTO public.payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         e ->> 'method',
         round((e ->> 'amount')::numeric, 2),
         nullif(btrim(coalesce(e ->> 'reference', '')), '')
  FROM jsonb_array_elements(p_payments) e;

  RETURN v_sale_id;

EXCEPTION
  WHEN unique_violation THEN
    SELECT s.id INTO v_sale_id
    FROM public.sales s
    WHERE s.client_transaction_id = p_client_transaction_id;

    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id;
    END IF;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.complete_sale(text, jsonb, jsonb) IS
  'Atomically records a sale by unit and price tier. Prices are read from '
  'product_units, never accepted from the caller and never derived from one '
  'another: a wholesale line with no wholesale price is refused, not discounted.';

-- -----------------------------------------------------------------------------
-- report_inventory_valuation — value stock at the base unit's retail price
-- -----------------------------------------------------------------------------
-- Stock is counted in base units, so it is valued at the base unit's retail
-- price. Valuing it at a Box price would multiply the shop's assets by the
-- pack size.
--
-- Retail, not wholesale: this answers "what is on my shelves worth", and the
-- shelf price is the retail one. Wholesale is a price for a customer, not a
-- property of the stock.
CREATE OR REPLACE FUNCTION public.report_inventory_valuation()
RETURNS TABLE (
  products_tracked        bigint,
  units_on_hand           bigint,
  low_stock_count         bigint,
  out_of_stock_count      bigint,
  value_at_cost           numeric,
  value_at_selling_price  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin_report();

  RETURN QUERY
  SELECT
    count(*)::bigint,
    coalesce(sum(i.quantity_on_hand), 0)::bigint,
    count(*) FILTER (WHERE i.quantity_on_hand <= p.minimum_stock)::bigint,
    count(*) FILTER (WHERE i.quantity_on_hand = 0)::bigint,
    -- NULL when any stocked product has no cost price: a valuation that
    -- quietly treats unknown cost as zero understates the business's assets.
    CASE
      WHEN bool_or(p.cost_price IS NULL AND i.quantity_on_hand > 0) THEN NULL
      ELSE coalesce(sum(p.cost_price * i.quantity_on_hand), 0)::numeric(14, 2)
    END,
    coalesce(sum(base.retail_price * i.quantity_on_hand), 0)::numeric(14, 2)
  FROM public.inventory i
  JOIN public.products p ON p.id = i.product_id
  LEFT JOIN public.product_units base
    ON base.product_id = p.id AND base.base_quantity = 1
  WHERE p.is_active;
END;
$$;
