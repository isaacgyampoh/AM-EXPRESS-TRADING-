-- =============================================================================
-- AM Express Trading — suppliers and their invoices
-- =============================================================================
--
-- Who the business buys from, and the paper that came with the goods.
--
-- Admin-only, both tables and the documents themselves. A supplier invoice
-- shows what the business pays for stock, which is the one number a cashier
-- must not be able to read: it is the margin on every item they sell, and it
-- is the business's negotiating position with its own suppliers.
--
-- Documents live in a PRIVATE storage bucket. Not "unlisted", not "hard to
-- guess" — private, with a policy on storage.objects, reachable only through a
-- signed URL the server mints for an admin. A public bucket with a uuid path
-- is a public bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  suppliers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive, like categories: "Kofi Traders" and "kofi traders" are one
-- supplier, and a business with both in its books cannot tell what it owes.
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key
  ON public.suppliers (lower(btrim(name)));

CREATE TRIGGER suppliers_touch_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_all_admin ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2.  supplier_invoices
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Restricted, not cascaded: a supplier with invoices against them cannot be
  -- deleted out from under the record. Deactivate instead.
  supplier_id    UUID NOT NULL REFERENCES public.suppliers (id) ON DELETE RESTRICT,

  invoice_number TEXT NOT NULL CHECK (length(btrim(invoice_number)) BETWEEN 1 AND 60),
  invoice_date   DATE NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description    TEXT,

  -- Where the file sits in the private bucket. Not a URL: a stored URL would
  -- either be public or would expire, and neither belongs in a table.
  storage_path   TEXT NOT NULL,
  file_type      TEXT,

  uploaded_by    UUID NOT NULL REFERENCES public.profiles (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The same supplier cannot send the same invoice number twice. This is the
  -- check that catches a document uploaded and paid for a second time.
  CONSTRAINT supplier_invoice_number_unique UNIQUE (supplier_id, invoice_number)
);

COMMENT ON TABLE public.supplier_invoices IS
  'Invoices received from suppliers. Admin-only: these show what stock costs, '
  'which is the margin on everything a cashier sells.';
COMMENT ON COLUMN public.supplier_invoices.storage_path IS
  'Object key in the private supplier-invoices bucket. Reached through a '
  'short-lived signed URL minted server-side, never stored as a URL.';

CREATE INDEX IF NOT EXISTS supplier_invoices_supplier_idx
  ON public.supplier_invoices (supplier_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS supplier_invoices_date_idx
  ON public.supplier_invoices (invoice_date DESC);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoices_all_admin ON public.supplier_invoices
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3.  The private bucket
-- -----------------------------------------------------------------------------
-- Guarded: `npm run db:test` runs against a cut-down schema with no storage
-- extension, and the tables above are worth testing there even though the
-- bucket cannot exist.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('supplier-invoices', 'supplier-invoices', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  -- Four separate policies rather than FOR ALL, so that read, write, replace
  -- and delete are each visible in the schema as their own decision.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'supplier_invoices_read_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY supplier_invoices_read_admin ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'supplier-invoices' AND public.is_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'supplier_invoices_insert_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY supplier_invoices_insert_admin ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'supplier-invoices' AND public.is_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'supplier_invoices_update_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY supplier_invoices_update_admin ON storage.objects
        FOR UPDATE TO authenticated
        USING (bucket_id = 'supplier-invoices' AND public.is_admin())
        WITH CHECK (bucket_id = 'supplier-invoices' AND public.is_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'supplier_invoices_delete_admin'
  ) THEN
    EXECUTE $p$
      CREATE POLICY supplier_invoices_delete_admin ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'supplier-invoices' AND public.is_admin())
    $p$;
  END IF;
END
$$;
