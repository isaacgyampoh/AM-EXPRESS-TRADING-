-- =============================================================================
-- AM Express Trading — staff incentives
-- =============================================================================
--
-- Bonuses, commissions and thank-yous paid to staff. Money leaving the
-- business, recorded against the person and the period it was earned in.
--
-- Deliberately not an expense row
-- ------------------------------
-- An incentive is a cost, and it is tempting to write it straight into
-- `expenses` so profit picks it up. It is not done here, for one reason: an
-- admin who pays a bonus will very often also record it in the cash book as an
-- expense, and a system that silently created a second row would double-count
-- it. Two numbers for one payment is worse than one number in the wrong place.
--
-- So incentives are their own ledger and their own report line. Reports show
-- them beside expenses rather than inside them, and say so on screen. If the
-- business wants them inside the profit figure, they record the payment as an
-- expense too — once, knowingly.
--
-- Not mixed with sales at all
-- ---------------------------
-- A commission is calculated *from* sales, but it is not a sale and must never
-- be added to takings. Nothing in this table touches `sales`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff_incentives (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Restricted, not cascaded: a staff member who has been paid cannot be
  -- deleted out from under the record of it. Staff are deactivated, never
  -- erased — the same rule sales already follow.
  staff_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,

  amount       NUMERIC(14, 2) NOT NULL CHECK (amount > 0),

  -- What the payment was for. A single date would not answer "which month was
  -- this commission for", which is the question asked at the end of every one.
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,

  reason       TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),

  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'cancelled')),

  recorded_by  UUID NOT NULL REFERENCES public.profiles (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT incentive_period_ordered CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.staff_incentives IS
  'Bonuses and commissions paid to staff. Reported separately from expenses '
  'and never added to sales: an incentive may be calculated from takings, but '
  'it is money going out, not coming in.';
COMMENT ON COLUMN public.staff_incentives.status IS
  'pending until paid. Cancelled records are kept rather than deleted, so a '
  'promise that was withdrawn leaves a trace.';

CREATE INDEX IF NOT EXISTS incentives_staff_period_idx
  ON public.staff_incentives (staff_id, period_end DESC);
CREATE INDEX IF NOT EXISTS incentives_period_idx
  ON public.staff_incentives (period_end DESC);
CREATE INDEX IF NOT EXISTS incentives_status_idx
  ON public.staff_incentives (status);

CREATE TRIGGER staff_incentives_touch_updated_at
  BEFORE UPDATE ON public.staff_incentives
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.staff_incentives ENABLE ROW LEVEL SECURITY;

-- An admin manages every incentive.
CREATE POLICY incentives_all_admin ON public.staff_incentives
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- A staff member may read their own, and only their own. Someone should be
-- able to see what they have been promised without being able to see what
-- anybody else was — pay is the fastest way to sour a small team.
CREATE POLICY incentives_select_own ON public.staff_incentives
  FOR SELECT TO authenticated
  USING (staff_id = (SELECT auth.uid()) AND public.is_active_staff());

-- -----------------------------------------------------------------------------
-- report_staff_incentives — totals for a period
-- -----------------------------------------------------------------------------
-- Admin-only, like every other business-wide report. Returns one row per staff
-- member so the screen can show who was paid what without pulling every record
-- to the phone to add them up.
CREATE OR REPLACE FUNCTION public.report_staff_incentives(
  p_from date,
  p_to   date
)
RETURNS TABLE (
  staff_id        uuid,
  staff_name      text,
  incentive_count bigint,
  total_pending   numeric,
  total_paid      numeric
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
    p.id,
    p.full_name,
    count(i.id)::bigint,
    -- Cancelled records are excluded from both totals: they are kept as
    -- history, not as money.
    coalesce(sum(i.amount) FILTER (WHERE i.status = 'pending'), 0)::numeric(14, 2),
    coalesce(sum(i.amount) FILTER (WHERE i.status = 'paid'), 0)::numeric(14, 2)
  FROM public.staff_incentives i
  JOIN public.profiles p ON p.id = i.staff_id
  WHERE i.period_end >= p_from
    AND i.period_start <= p_to
    AND i.status <> 'cancelled'
  GROUP BY p.id, p.full_name
  ORDER BY p.full_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_staff_incentives(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.report_staff_incentives(date, date) TO authenticated;
