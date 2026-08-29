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
-- from it. That means the very first admin has to be created once, by hand, by
-- someone holding the service-role key:
--
--   npm run bootstrap:admin -- --pin 4821 --name "Owner name here"
--
-- Deliberately not done in SQL. `auth.users` belongs to GoTrue, and a
-- hand-written INSERT into it produces an account nobody can sign into: token
-- columns with no default that GoTrue reads as non-null strings, and no
-- `auth.identities` row for email sign-in to resolve. An earlier migration
-- seeded an admin that way and left the system unbootable. The script uses the
-- admin API, which writes both tables correctly.
--
-- The PIN is passed on the command line rather than written here, so that no
-- working credential is ever committed to this repository.
--
-- After this, the database will not let the business lock itself out: the last
-- active admin cannot be demoted or deactivated by anyone, including through
-- the SQL editor.
