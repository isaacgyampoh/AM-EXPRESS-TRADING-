-- =============================================================================
-- AM Express Trading — selling units, and wholesale vs retail pricing
-- =============================================================================
--
-- The shop sells the same goods two ways: by the box and by the piece, at
-- wholesale and at retail. Until now a product had one price and stock was an
-- unexplained integer, so "12" could mean twelve boxes or twelve sachets and
-- nothing in the system could tell you which.
--
-- Two rules this schema exists to enforce
-- ---------------------------------------
-- 1. **No price is ever derived from another price.** A piece price is not a
--    box price divided by the pack size, and a wholesale price is not a retail
--    price with a discount. Someone types each one in, or the product is not
--    sold that way. Division is how a business loses a few pesewas on every
--    piece and finds it at stocktake.
--
-- 2. **Stock is counted in one unit and one unit only** — the base unit, the
--    smallest thing the shop sells. `product_units.base_quantity` says how many
--    base units each sellable unit contains, and selling one box of twelve
--    deducts twelve. Keeping a separate "boxes" and "pieces" counter would let
--    them disagree, and worse, would report "out of stock" on pieces while ten
--    sealed boxes sat on the shelf.
--
-- Quantities convert; prices do not. That asymmetry is the whole design.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  units — the vocabulary, so an admin can add one without a deploy
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.units (
  name       TEXT PRIMARY KEY CHECK (length(btrim(name)) BETWEEN 1 AND 30),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.units IS
  'Units a product can be sold in. A lookup table rather than a CHECK list so '
  'the shop can add "Crate" without a migration.';

INSERT INTO public.units (name) VALUES
  ('Piece'), ('Box'), ('Carton'), ('Pack'), ('Bag'),
  ('Bottle'), ('Crate'), ('Dozen'), ('Sachet'), ('Roll')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_select_staff ON public.units
  FOR SELECT TO authenticated USING (public.is_active_staff());

CREATE POLICY units_write_admin ON public.units
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2.  product_units — how a product is sold, and for how much
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  unit_name       TEXT NOT NULL REFERENCES public.units (name),

  -- How many base units this one contains. 1 for the base unit itself.
  base_quantity   INTEGER NOT NULL CHECK (base_quantity > 0),

  -- Both typed in by a person. retail is required because every sellable unit
  -- has a shelf price; wholesale is NULL when the shop does not sell that unit
  -- in bulk, and NULL means refused, never "work it out from retail".
  retail_price    NUMERIC(14, 2) NOT NULL CHECK (retail_price >= 0),
  wholesale_price NUMERIC(14, 2) CHECK (wholesale_price >= 0),

  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_units_unique_per_product UNIQUE (product_id, unit_name)
);

COMMENT ON TABLE public.product_units IS
  'The ways a product can be sold: which unit, how many base units it holds, '
  'and its retail and wholesale prices. Prices are entered, never derived.';
COMMENT ON COLUMN public.product_units.base_quantity IS
  'Base units contained. A Box of 12 Pieces is 12; the base unit itself is 1. '
  'Stock is held in base units, so this is the multiplier when selling.';
COMMENT ON COLUMN public.product_units.wholesale_price IS
  'NULL means this unit is not sold wholesale. complete_sale refuses a '
  'wholesale line rather than falling back to the retail price.';

-- At most one base unit and at most one default per product. "At least one" is
-- guaranteed by create_product_with_stock, which makes the base unit in the
-- same transaction as the product.
CREATE UNIQUE INDEX product_units_one_base_idx
  ON public.product_units (product_id) WHERE base_quantity = 1;
CREATE UNIQUE INDEX product_units_one_default_idx
  ON public.product_units (product_id) WHERE is_default;

CREATE INDEX product_units_product_idx ON public.product_units (product_id);

CREATE TRIGGER product_units_touch_updated_at
  BEFORE UPDATE ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;

-- A cashier cannot sell what they cannot price, so reading is open to staff.
CREATE POLICY product_units_select_staff ON public.product_units
  FOR SELECT TO authenticated USING (public.is_active_staff());

-- Prices are an admin decision. This is the policy that stops a cashier
-- discounting their own sale.
CREATE POLICY product_units_write_admin ON public.product_units
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3.  Carry existing products across
-- -----------------------------------------------------------------------------
-- Every product so far was priced per piece with one number, so each becomes a
-- single base unit at that price. Wholesale is left NULL: nobody has told us
-- what the wholesale price is, and inventing one is exactly what rule 1
-- forbids.
INSERT INTO public.product_units
  (product_id, unit_name, base_quantity, retail_price, wholesale_price, is_default)
SELECT p.id, 'Piece', 1, p.selling_price, NULL, true
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_units u WHERE u.product_id = p.id
);

-- Pricing now lives on product_units. Leaving a second copy on products would
-- give the shop two prices for one thing and no rule for which wins.
ALTER TABLE public.products DROP COLUMN IF EXISTS selling_price;

COMMENT ON COLUMN public.products.cost_price IS
  'What one BASE unit cost the business. NULL means unknown — profit reports '
  'exclude the product rather than assume zero.';

-- -----------------------------------------------------------------------------
-- 4.  sale_items records the unit and the tier it was sold at
-- -----------------------------------------------------------------------------
-- Snapshotted, like unit_cost already is. A receipt reprinted next year must
-- say "2 Box" at the price charged then, even if the product has been
-- repackaged since.
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS product_unit_id UUID REFERENCES public.product_units (id),
  ADD COLUMN IF NOT EXISTS unit_name       TEXT,
  ADD COLUMN IF NOT EXISTS base_quantity   INTEGER,
  ADD COLUMN IF NOT EXISTS price_tier      TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_price_tier_valid'
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_price_tier_valid
      CHECK (price_tier IS NULL OR price_tier IN ('retail', 'wholesale'));
  END IF;
END
$$;

-- One line per product per sale becomes one line per product PER UNIT: selling
-- a box and three loose pieces of the same thing in one transaction is an
-- ordinary morning, not an error.
--
-- The invariant that constraint protected still has to hold. complete_sale now
-- sums the base quantities of every line touching a product and checks that
-- total once against stock, so two lines can no longer each pass a check that
-- together they fail.
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS one_line_per_product;

CREATE UNIQUE INDEX IF NOT EXISTS sale_items_one_line_per_unit_idx
  ON public.sale_items (sale_id, product_id, product_unit_id);

-- -----------------------------------------------------------------------------
-- 5.  create_product_with_stock — now creates the base unit too
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_product_with_stock(text, text, uuid, numeric, numeric, integer, integer);

CREATE OR REPLACE FUNCTION public.create_product_with_stock(
  p_sku            text,
  p_name           text,
  p_category_id    uuid,
  p_unit_name      text,
  p_retail_price   numeric,
  p_wholesale_price numeric,
  p_cost_price     numeric,
  p_minimum_stock  integer,
  p_opening_stock  integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor   uuid := (SELECT auth.uid());
  v_id      uuid;
  v_new_qty integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can create a product.'
      USING errcode = 'AM004';
  END IF;

  IF p_retail_price IS NULL OR p_retail_price < 0 THEN
    RAISE EXCEPTION 'A retail price is required.' USING errcode = 'AM005';
  END IF;

  INSERT INTO public.products (sku, name, category_id, cost_price, minimum_stock, created_by)
  VALUES (upper(btrim(p_sku)), btrim(p_name), p_category_id, p_cost_price,
          coalesce(p_minimum_stock, 0), v_actor)
  RETURNING id INTO v_id;

  -- The base unit. Opening stock is counted in this unit, which is why the
  -- form has to name it: "10" is not a quantity, "10 Box" is.
  INSERT INTO public.product_units
    (product_id, unit_name, base_quantity, retail_price, wholesale_price, is_default)
  VALUES (v_id, coalesce(nullif(btrim(p_unit_name), ''), 'Piece'), 1,
          p_retail_price, p_wholesale_price, true);

  IF coalesce(p_opening_stock, 0) > 0 THEN
    UPDATE public.inventory
    SET quantity_on_hand = quantity_on_hand + p_opening_stock,
        updated_at = now()
    WHERE product_id = v_id
    RETURNING quantity_on_hand INTO v_new_qty;

    INSERT INTO public.inventory_movements
      (product_id, movement_type, quantity_delta, resulting_quantity, reason, recorded_by)
    VALUES (v_id, 'stock_in', p_opening_stock, v_new_qty, 'Opening stock', v_actor);
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_product_with_stock(text, text, uuid, text, numeric, numeric, numeric, integer, integer) IS
  'Creates a product, its base selling unit and its opening stock in one '
  'transaction, so a product can never exist without a unit to price it in.';

REVOKE EXECUTE ON FUNCTION public.create_product_with_stock(text, text, uuid, text, numeric, numeric, numeric, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.create_product_with_stock(text, text, uuid, text, numeric, numeric, numeric, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6.  add_product_unit — a second way to sell an existing product
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_product_unit(
  p_product_id      uuid,
  p_unit_name       text,
  p_base_quantity   integer,
  p_retail_price    numeric,
  p_wholesale_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change how a product is sold.'
      USING errcode = 'AM004';
  END IF;

  IF p_base_quantity IS NULL OR p_base_quantity < 1 THEN
    RAISE EXCEPTION 'Say how many base units this contains.' USING errcode = 'AM005';
  END IF;

  -- The caller must give a price for the unit being added. This is the check
  -- that stops a Box being created and silently priced off the Piece.
  IF p_retail_price IS NULL OR p_retail_price < 0 THEN
    RAISE EXCEPTION 'Enter the retail price for one %.', p_unit_name
      USING errcode = 'AM005';
  END IF;

  INSERT INTO public.product_units
    (product_id, unit_name, base_quantity, retail_price, wholesale_price, is_default)
  VALUES (p_product_id, btrim(p_unit_name), p_base_quantity,
          p_retail_price, p_wholesale_price, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_product_unit(uuid, text, integer, numeric, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.add_product_unit(uuid, text, integer, numeric, numeric) TO authenticated;
