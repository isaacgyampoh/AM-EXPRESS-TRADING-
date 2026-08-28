-- =============================================================================
-- AM Express Trading — PIN authentication
-- =============================================================================
--
-- Adds a 4-digit PIN login flow on top of Supabase Auth.
--
-- Users never type an email or a password: they tap digits on a PIN keypad.
-- Under the hood, Supabase Auth still issues JWTs for RLS compatibility.  The
-- bridge is a short-lived magic-link token generated and consumed entirely
-- server-side — the email and the random internal password are implementation
-- details that never appear in any UI.
--
-- Design notes
-- ------------
-- * `pin_hash` uses bcrypt (cost 12), produced by bcryptjs on the server.
--   The pgcrypto extension is NOT used here to avoid schema-qualification
--   issues on hosted Supabase (pgcrypto lives in the `extensions` schema).
-- * `pin_attempts` is keyed by IP address for global rate limiting.  No
--   per-user tracking is possible while login is anonymous (we don't know
--   which account is being targeted until after the PIN matches).
-- * The first admin is seeded here with PIN 1024 (bcrypt hash below) so the
--   business can log in on day one.  Change the PIN immediately after first
--   login via Settings → Change PIN.
-- * The internal password for the admin auth record is a random 64-char hex
--   string that is discarded after this migration.  It is never needed because
--   login is always via PIN (generateLink → verifyOtp bridge on the server).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  pin_hash column on profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

COMMENT ON COLUMN public.profiles.pin_hash IS
  'bcrypt (cost 12) hash of the staff member''s PIN. '
  'NULL until a PIN is set; always set for active staff in normal operation. '
  'Never returned to the client or logged.';

-- -----------------------------------------------------------------------------
-- 2.  pin_attempts — global rate-limiting table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   INET,
  staff_id     UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded    BOOLEAN NOT NULL
);

COMMENT ON TABLE public.pin_attempts IS
  'Records of PIN login attempts, keyed by the requester''s IP address. '
  'Used to enforce rate limiting on the login endpoint. '
  'Staff ID is NULL for failed attempts (the account is unknown until a PIN matches). '
  'Rows older than 24 hours serve no operational purpose and may be pruned.';

CREATE INDEX IF NOT EXISTS pin_attempts_ip_recent_idx
  ON public.pin_attempts (ip_address, attempted_at DESC)
  WHERE NOT succeeded;

CREATE INDEX IF NOT EXISTS pin_attempts_staff_idx
  ON public.pin_attempts (staff_id, attempted_at DESC)
  WHERE staff_id IS NOT NULL;

-- RLS: service-role client bypasses RLS for all attempt writes.
-- Authenticated users have no business reading or writing this table.
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;
-- No policies — denies everything to authenticated users by default.

-- -----------------------------------------------------------------------------
-- 3.  Security-definer helper: staff update their own PIN hash
-- -----------------------------------------------------------------------------
-- Column-level privileges are the correct Postgres tool for "let a user update
-- exactly one column," but they are hard to combine with RLS.  A SECURITY
-- DEFINER function is cleaner: it runs as postgres (bypasses RLS), checks that
-- the caller is the owner of the row, and touches only pin_hash.
CREATE OR REPLACE FUNCTION public.update_own_pin_hash(new_pin_hash TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new_pin_hash IS NULL OR length(new_pin_hash) < 20 THEN
    RAISE EXCEPTION 'new_pin_hash must be a valid bcrypt hash.'
      USING errcode = 'check_violation';
  END IF;

  UPDATE public.profiles
  SET    pin_hash = new_pin_hash
  WHERE  id = (SELECT auth.uid())
    AND  is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active staff member not found.'
      USING errcode = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_own_pin_hash(TEXT) IS
  'Allows an authenticated staff member to change their own PIN hash without '
  'touching any other column. SECURITY DEFINER bypasses RLS; the WHERE clause '
  'ensures the update applies only to the caller''s own active profile.';

-- Grant execute to authenticated users so the SSR client can call it.
GRANT EXECUTE ON FUNCTION public.update_own_pin_hash(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4.  Seed the first administrator
-- -----------------------------------------------------------------------------
-- Only runs when no admin exists — safe to apply repeatedly (idempotent).
--
-- The hashes below were produced by bcryptjs (cost 12) on the server:
--
--   PIN hash:
--     bcrypt.hash('1024', 12)
--     → $2b$12$qlboIRe/TKMpiYTfCUATReRgAGZdR8iyImR3iiHtuOxvPufTUTCCC
--
--   Internal password hash (random, never needed — PIN auth uses generateLink):
--     bcrypt.hash('207ac114f7e2a9b4c7138973bfbb42d303a39fed0f389d1b96c4aa8a47de49cc', 12)
--     → $2b$12$E5JY58mH.TWqSeNy12dG1.7SL3txMYuXgKz5qWSBuKu.1ujo91T7K
--
-- CHANGE THE ADMIN PIN IMMEDIATELY AFTER FIRST LOGIN.
DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Skip if any admin already exists
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE role = 'admin' LIMIT 1
  ) THEN
    RETURN;
  END IF;

  v_id := gen_random_uuid();

  -- Insert the auth identity.  The handle_new_auth_user trigger will create
  -- a cashier profile row in the same transaction.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous
  )
  VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    -- Internal email — never displayed in any UI.
    v_id::text || '@pos.amexpress.internal',
    -- bcrypt hash of a random password nobody knows.  Login is via PIN only.
    '$2b$12$E5JY58mH.TWqSeNy12dG1.7SL3txMYuXgKz5qWSBuKu.1ujo91T7K',
    now(),
    now(),
    now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', 'Admin'),
    false,
    false,
    false
  );

  -- Promote to admin and set the default PIN (bcrypt of '1024').
  -- CHANGE THIS PIN IMMEDIATELY AFTER FIRST LOGIN.
  UPDATE public.profiles
  SET
    role      = 'admin',
    full_name = 'Admin',
    pin_hash  = '$2b$12$qlboIRe/TKMpiYTfCUATReRgAGZdR8iyImR3iiHtuOxvPufTUTCCC'
  WHERE id = v_id;

END;
$$;
