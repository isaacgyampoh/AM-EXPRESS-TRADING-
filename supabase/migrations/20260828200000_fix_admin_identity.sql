-- =============================================================================
-- AM Express Trading — Fix admin user: add missing auth.identities row
-- =============================================================================
--
-- RECONSTRUCTED FROM PRODUCTION. This migration was applied directly to the
-- hosted project on 2026-08-28 20:00 without ever being committed, so the
-- repository and the database disagreed about the schema. The body below is
-- the exact SQL read back from supabase_migrations.schema_migrations; it is
-- committed here so that git is the source of truth again and a fresh
-- deployment reproduces production rather than diverging from it.
--
-- It is already applied on the hosted project, so `supabase db push` will skip
-- it there. It still runs on a clean database — including `npm run db:test`.
--
-- Historical note, worth keeping. This migration correctly identified the
-- missing auth.identities row, but it did not fix the other half of the same
-- bug: the seed's hand-written INSERT also leaves auth.users token columns
-- NULL, and GoTrue reads those into non-null Go strings. Production still had
-- confirmation_token, recovery_token, email_change and email_change_token_new
-- NULL after this ran, so sign-in kept failing and the next two commits were
-- debug logging chasing it. 20260829120000 repairs that remaining half.
--
-- Root cause (as recorded when this was written)
-- ---------------------------------------------
-- The seed in 20260828100000_pin_authentication.sql inserted directly into
-- auth.users but omitted the matching auth.identities row.  GoTrue v2's
-- GetUserByID eager-loads identities; without the row every admin API call
-- (updateUserById, generateLink, …) on that user returns "Database error
-- loading user", blocking session establishment even when the PIN is correct.
--
-- What this migration does
-- ------------------------
-- 1. Deletes any existing admin auth user (cascades to auth.identities and
--    public.profiles via ON DELETE CASCADE).
-- 2. Inserts a fresh auth.users row — same format as the original seed.
-- 3. Inserts the auth.identities row for the email provider.  This is the
--    piece that was missing and caused the failure.
-- 4. Updates the trigger-created cashier profile to admin and sets the
--    default PIN hash (bcrypt of '1024', cost 12).
--
-- After applying: log in with PIN 1024.  Change the PIN immediately.
-- =============================================================================

DO $$
DECLARE
  v_id       uuid := gen_random_uuid();
  v_email    text;

  -- bcrypt(cost=12) hash of PIN '1024' — produced by bcryptjs on the server.
  -- CHANGE THE PIN IMMEDIATELY AFTER FIRST LOGIN.
  v_pin_hash text :=
    '$2b$12$qlboIRe/TKMpiYTfCUATReRgAGZdR8iyImR3iiHtuOxvPufTUTCCC';

  -- bcrypt(cost=12) hash of a random internal password nobody knows.
  -- Login is via PIN only; this password is never used or exposed.
  v_pwd_hash text :=
    '$2b$12$E5JY58mH.TWqSeNy12dG1.7SL3txMYuXgKz5qWSBuKu.1ujo91T7K';
BEGIN
  -- -----------------------------------------------------------------
  -- Step 1 — Remove existing admin user(s)
  --
  -- ON DELETE CASCADE on profiles.id → auth.users(id) propagates to
  -- public.profiles.  GoTrue's own FK on auth.identities.user_id also
  -- cascades, removing the (broken / missing) identity rows.
  -- -----------------------------------------------------------------
  DELETE FROM auth.users
  WHERE id IN (SELECT id FROM public.profiles WHERE role = 'admin');

  -- -----------------------------------------------------------------
  -- Step 2 — Insert a fresh auth.users record
  -- -----------------------------------------------------------------
  v_email := v_id::text || '@pos.amexpress.internal';

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
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    v_pwd_hash,
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', 'Admin'),
    false, false, false
  );

  -- -----------------------------------------------------------------
  -- Step 3 — Insert the email identity row
  --
  -- This is the row that was MISSING in the original seed.
  -- GoTrue v2 requires at least one auth.identities row per user for
  -- GetUserByID to succeed.  Without it every admin API call targeting
  -- this user returns "Database error loading user".
  --
  -- provider_id: for the email provider this is the user's email address.
  -- identity_data.sub: the user's UUID (standard OIDC 'subject' claim).
  -- -----------------------------------------------------------------
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_id,
    v_email,   -- email is the provider_id for the email provider
    jsonb_build_object(
      'sub',            v_id::text,
      'email',          v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  );

  -- -----------------------------------------------------------------
  -- Step 4 — Promote the trigger-created cashier profile to admin
  --
  -- on_auth_user_created (after insert on auth.users) ran in step 2
  -- and created a default cashier profile.  We now set the correct
  -- role, display name, and PIN hash.
  -- -----------------------------------------------------------------
  UPDATE public.profiles SET
    role      = 'admin',
    full_name = 'Admin',
    pin_hash  = v_pin_hash
  WHERE id = v_id;

  RAISE NOTICE 'Admin user reset complete.';
  RAISE NOTICE '  auth.users id : %', v_id;
  RAISE NOTICE '  email         : %', v_email;
  RAISE NOTICE '  Login PIN     : 1024  (change this immediately)';
END;
$$
