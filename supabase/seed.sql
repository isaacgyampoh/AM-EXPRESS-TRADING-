-- =============================================================================
-- First-run setup for AM Express Trading
-- =============================================================================
--
-- Applied automatically by `supabase db reset` on a local stack. On a hosted
-- project, run the promotion step by hand — see below.
--
-- Everything in here is safe to run more than once.
-- =============================================================================

-- Expense categories the business actually has. Add or rename them in the app;
-- these are a starting point, not a fixed list.
insert into public.expense_categories (name)
values
  ('Transport'),
  ('Utilities'),
  ('Rent'),
  ('Supplies'),
  ('Wages'),
  ('Repairs and maintenance'),
  ('Bank and Mobile Money charges')
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Creating the first administrator
-- -----------------------------------------------------------------------------
-- Every account created through sign-up starts as a cashier, deliberately:
-- sign-up metadata is attacker-controlled, so the trigger never reads a role
-- from it. That means the very first admin has to be promoted once, by hand,
-- by someone with database access.
--
-- Steps on a hosted Supabase project:
--
--   1. In the dashboard, Authentication -> Users -> Add user, and create the
--      owner's account with a password they will change.
--   2. In the SQL editor, run:
--
--        update public.profiles
--        set role = 'admin', full_name = 'Owner name here'
--        where email = 'owner@example.com';
--
--   3. Sign in as that account. From then on, staff are created inside the
--      application and no further SQL is needed.
--
-- After this, the database will not let the business lock itself out: the last
-- active admin cannot be demoted or deactivated by anyone, including through
-- the SQL editor.
