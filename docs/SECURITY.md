# Security

## The stance

The browser is not trusted with anything the business cares about. Every rule
that protects money is enforced on the server, and the important ones are
enforced again by the database — so bypassing the interface entirely gains an
attacker nothing.

Row Level Security is the enforcement. Hiding a button is a courtesy.

## What a cashier can and cannot do

A cashier holds a real Supabase session and could, in principle, issue any
PostgREST request they like with their own token. Here is what happens when
they do. Each of these is asserted in `supabase/tests/rls-and-sales.test.sql`.

| Attempt | Result |
| --- | --- |
| Read the catalogue | Allowed — they cannot sell what they cannot see |
| Create or reprice a product | Refused by RLS |
| Add or adjust stock | Refused — the stock functions check the role themselves |
| Write `inventory` directly | Refused — no write policy exists on the table |
| Read `inventory_movements` | Refused — the ledger is management information |
| Read another cashier's sales, items or payments | Refused |
| Read any expense, or any expense category | Refused |
| Insert a sale row directly, with their own total | Refused — no insert policy on `sales` |
| Void a sale | Refused |
| Read business settings | Allowed — a receipt needs the business name |

An anonymous request reads nothing at all: no products, no sales, no settings.

## Where each control lives

**Authentication.** Supabase Auth. `currentStaff()` calls `getUser()`, which
verifies the token with Supabase, rather than `getSession()`, which trusts
whatever is in the cookie.

**Authorisation, in the application.** `Staff.assertCan(permission)` at the top
of every use case. This produces good errors and hides irrelevant UI.

**Authorisation, in the database.** RLS policies on every table, plus explicit
role checks inside every `SECURITY DEFINER` function — those bypass RLS by
design, so they must do their own checking, and they do.

**Identity.** No repository method accepts an actor id. Cashier, stock
recorder and expense author are all taken from `auth.uid()` inside the
database. There is no field to forge.

**Prices and totals.** Never sent by the client. `complete_sale()` reads them
from the catalogue under a row lock.

## Privilege escalation, specifically

Sign-up metadata is attacker-controlled: anyone who can reach the sign-up
endpoint can put `{"role":"admin"}` in it. So the trigger on `auth.users`
**never reads a role from metadata**. Every new profile is a cashier, without
exception, and the test suite proves it by creating a user whose metadata asks
for admin and asserting they land as a cashier.

The first administrator is created once, by hand, by someone holding the
service-role key — `npm run bootstrap:admin`. After that, staff are created
inside the application by an existing admin.

**PIN hashes are not on `profiles`.** They live in `staff_credentials`, which
has RLS enabled and no policies at all, so only the service-role key reaches
it. The reason is that the `profiles` select policy grants the whole row to its
owner and to any admin: a hash sitting there would let one admin read every
cashier's, and four digits is ten thousand candidates — an offline break of
seconds. Since sales are attributed to the cashier who rang them up, that is a
repudiation problem, not just a login one. The same table holds each account's
`auth_secret`, which is sufficient on its own to sign in as its owner.

Two further guards, in a trigger rather than a policy, because a policy sees
either the old row or the new row but never both:

- Nobody can change their own role or deactivate their own account
- The last active administrator cannot be demoted or deactivated **by anyone**,
  including through the SQL editor with RLS bypassed — that is the update which
  locks a business out of its own system, and it is always a mistake

## Nothing talks to Supabase from the browser

There is no browser Supabase client. Every read and write goes through a
server component, a server action or a route handler, so the anon key is never
shipped and no query is ever composed where a user can edit it.

This was not always deliberate. A `browser-client.ts` existed for signing in
and out, was left unused when PIN authentication replaced it, and sat there as
dead code — an import away from putting `@supabase/ssr` and a live client into
the browser bundle. It has been deleted. Measuring the deployed bundle confirms
the result: no `GoTrueClient`, no `SupabaseClient`, no `PostgrestClient` in any
chunk the browser downloads.

If a future change needs Supabase in the browser, that is a decision worth
making on purpose rather than by importing a file that happened to be lying
around.

## The service role key

It is needed for exactly one operation: creating a staff member's auth
identity, which the auth admin API will not do for an ordinary session.

Four things keep it off the client:

1. `src/infrastructure/supabase/client/admin-client.ts` starts with
   `import "server-only"` — the build fails if a client component pulls it in
2. `serverOnlyEnv()` throws if evaluated where `window` exists
3. The variable has no `NEXT_PUBLIC_` prefix, so Next never inlines it
4. `npm run check:secrets` greps the built client bundle for the key, for the
   variable name, and for anything decoding to a `service_role` token — and
   fails the build if it finds them

Point 4 exists because the first three are all "we were careful", and being
careful is not evidence.

## Data integrity

Constraints the database will not let the application get wrong:

- `line_total = unit_price * quantity` — a CHECK constraint
- `quantity_on_hand >= 0` — the last line of defence; even a bug in the sale
  function cannot drive stock negative
- A Mobile Money payment without a reference is rejected
- One payment row per method per sale; one line per product per sale
- `client_transaction_id` is unique, so a retry cannot become a second sale
- Money is `NUMERIC(14,2)` everywhere. No floating point touches an amount, in
  the database or in TypeScript
- A voided sale keeps its original rows and gains reversal movements. Nothing
  is deleted, and staff are deactivated rather than removed so historic sales
  keep a valid cashier

## What is not covered yet

Honest gaps, as of the foundation phase:

- **Rate limiting.** Sign-in attempts are not throttled beyond Supabase's own
  defaults.
- **Audit log for catalogue edits.** Stock movements are fully audited; price
  and name changes record only `updated_at`.
- **Session revocation on deactivation.** A deactivated cashier loses all data
  access immediately — every policy checks `is_active` — but their token
  remains technically valid until it expires. They can load a shell that shows
  them nothing.
- **Offline sales.** Not implemented, and deliberately so: a queue of
  unsynchronised transactions that can double-post is worse than being told the
  network is down.
- **Visual verification of the signed-in screens.** The sign-in and offline
  pages were rendered and measured at 320, 390, 768 and 1280px with no
  horizontal overflow and no console errors. Everything behind authentication
  needs a live Supabase project to render, so it has been verified by its
  tests and its types rather than by looking at it. Walk Step 6 of
  DEPLOYMENT.md on a phone before trusting it with a customer.
