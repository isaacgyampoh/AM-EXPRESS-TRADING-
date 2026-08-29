-- =============================================================================
-- AM Express Trading — credential isolation and auth repair
-- =============================================================================
--
-- This migration fixes the reason nobody could sign in, and closes a hole that
-- would have let one staff member recover another's PIN.
--
-- Why login was impossible
-- -----------------------
-- 20260828100000_pin_authentication.sql seeded the first administrator with a
-- hand-written `INSERT INTO auth.users`. That table is GoTrue's, not ours, and
-- a hand-written row is not a working account for two reasons:
--
--   1. GoTrue scans several token columns into Go strings. They have no
--      DEFAULT, so a hand-written row leaves them NULL, and every sign-in for
--      that user dies in the driver with "converting NULL to string is
--      unsupported" long before any password is compared.
--
--   2. Email sign-in resolves the account through `auth.identities`. The seed
--      never wrote one, so to GoTrue the account did not exist.
--
-- The seeded administrator is the only account a fresh deployment has, and
-- creating more staff requires being signed in as one. So the whole system was
-- unbootable: not a wrong PIN, an unusable account.
--
-- The repair below is written to run safely against a database in any of those
-- states, and to be inert against the cut-down `auth` schema that
-- `npm run db:test` uses. Accounts made through the app were always fine —
-- `auth.admin.createUser()` writes both tables correctly — so this only ever
-- touches rows that are already broken.
--
-- Why credentials move out of `profiles`
-- -------------------------------------
-- `profiles` is readable under RLS by the row's owner and by any admin, and
-- the policy grants the whole row. With `pin_hash` sitting on it, any admin
-- could read every cashier's hash, and a 4-digit PIN has ten thousand
-- candidates — an offline break takes seconds. Sales are attributed to the
-- cashier who rang them up, so that is a real hole, not a theoretical one.
--
-- Secrets move to `staff_credentials`, which has RLS on and no policies at
-- all: only the service-role key reaches it, and that key never leaves the
-- server. The same table holds `auth_secret`, which is why it must never be
-- exposed — anyone holding another person's auth secret can sign in as them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  repair_auth_accounts() — make hand-written auth.users rows usable
-- -----------------------------------------------------------------------------
-- Written as a callable, idempotent function rather than a one-off DO block for
-- two reasons: the database tests can create a broken account and prove the
-- repair fixes it, and an operator who adds a user through the SQL editor later
-- (a very easy mistake to make) has something to run afterwards.
--
-- Not granted to anybody. SECURITY DEFINER plus writes to the auth schema is
-- exactly the shape of a privilege escalation, so execution is left to the
-- owner — migrations, the test harness, and a human in the SQL editor.
CREATE OR REPLACE FUNCTION public.repair_auth_accounts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  col text;
BEGIN
  -- (a) Token columns GoTrue reads as non-null strings.
  --
  -- They have no DEFAULT, so a hand-written INSERT leaves them NULL and every
  -- sign-in for that user dies in the Go driver with "converting NULL to
  -- string is unsupported" before any password is compared. Which columns
  -- exist varies by GoTrue version, so each is checked rather than assumed.
  FOREACH col IN ARRAY ARRAY[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = col
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = '''' WHERE %I IS NULL', col, col
      );
    END IF;
  END LOOP;

  -- (b) The missing email identity.
  --
  -- Password sign-in resolves the account through auth.identities. A user with
  -- no email identity cannot sign in however correct their password is.
  --
  -- The table's shape changed in GoTrue: older versions keyed it on a text
  -- `id` holding the provider's subject, newer ones use a uuid `id` with a
  -- separate `provider_id`. Both are handled.
  IF to_regclass('auth.identities') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name = 'provider_id'
  ) THEN
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      u.id::text,
      u.id,
      jsonb_build_object(
        'sub',            u.id::text,
        'email',          u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'email'
      );
  ELSE
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    SELECT
      u.id::text,
      u.id,
      jsonb_build_object(
        'sub',            u.id::text,
        'email',          u.email,
        'email_verified', true
      ),
      'email',
      now(), now(), now()
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.identities i
        WHERE i.user_id = u.id AND i.provider = 'email'
      );
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.repair_auth_accounts() IS
  'Makes hand-written auth.users rows usable: fills NULL token columns GoTrue '
  'reads as non-null strings, and adds the email identity that password '
  'sign-in resolves accounts through. Idempotent. Run it after inserting a '
  'user by hand — though creating staff through the application, or '
  'npm run bootstrap:admin, avoids needing it at all.';

-- Deliberately callable by nobody but the owner.
REVOKE ALL ON FUNCTION public.repair_auth_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_auth_accounts() FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2.  Repair whatever is already broken, including the seeded administrator
-- -----------------------------------------------------------------------------
SELECT public.repair_auth_accounts();

-- -----------------------------------------------------------------------------
-- 3.  staff_credentials — everything an attacker would want, behind service role
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_credentials (
  staff_id    UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  pin_hash    TEXT NOT NULL,
  auth_secret TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_credentials IS
  'PIN hashes and internal auth secrets. RLS is on with no policies, so only '
  'the service-role key can read or write it. Never exposed to any client: a '
  '4-digit PIN hash is brute-forceable offline in seconds, and auth_secret is '
  'enough to sign in as its owner.';

COMMENT ON COLUMN public.staff_credentials.pin_hash IS
  'bcrypt (cost 12) hash of the staff member''s 4-digit PIN.';

COMMENT ON COLUMN public.staff_credentials.auth_secret IS
  'Stable random password held on the GoTrue account, used server-side to mint '
  'a session once the PIN has been verified. NULL until first provisioned, '
  'which happens lazily on the account''s next sign-in.';

-- Guarded because CREATE TRIGGER has no IF NOT EXISTS, and the rest of this
-- migration is written to be safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'staff_credentials_touch_updated_at'
      AND tgrelid = 'public.staff_credentials'::regclass
  ) THEN
    CREATE TRIGGER staff_credentials_touch_updated_at
      BEFORE UPDATE ON public.staff_credentials
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END
$$;

-- RLS on, no policies: authenticated and anon are denied everything. The
-- REVOKE is belt and braces — Supabase grants table privileges broadly and
-- leans on RLS, so this makes the intent explicit to anyone reading the schema.
ALTER TABLE public.staff_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_credentials FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4.  Move existing PIN hashes across, then drop the exposed column
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'pin_hash'
  ) THEN
    INSERT INTO public.staff_credentials (staff_id, pin_hash)
    SELECT id, pin_hash
    FROM public.profiles
    WHERE pin_hash IS NOT NULL
    ON CONFLICT (staff_id) DO NOTHING;
  END IF;
END
$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;

-- -----------------------------------------------------------------------------
-- 5.  Remove the unused self-service PIN function
-- -----------------------------------------------------------------------------
-- Nothing ever called it: ChangeOwnPin verifies the current PIN in the
-- application layer and writes through the service-role client. A SECURITY
-- DEFINER function that looks like an access control but enforces nothing is
-- worse than no function, because the next reader will believe it.
DROP FUNCTION IF EXISTS public.update_own_pin_hash(TEXT);
