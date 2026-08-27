# AM Express Trading

Inventory, point of sale, expenses, staff and reporting for AM Express Trading.

Next.js (App Router) · TypeScript · Supabase (PostgreSQL, Auth, RLS) · Vercel · PWA

---

## What it does

**For a cashier** — open the till, search a product, tap it, adjust the
quantity, take cash or Mobile Money or both, hand over a receipt. The basket
survives the phone locking or the signal dropping.

**For the owner** — the catalogue and its prices, stock with a full movement
ledger, expenses, staff accounts and roles, and reports counted from every
recorded sale.

### The idea running through all of it

**The database is the store of record, not the browser.** Prices, totals, stock
levels, roles and cashier identity are read and enforced server-side. The
client sends intent — which products, how many, how much cash — and never
anything the business would be embarrassed to have forged.

Three consequences worth knowing before reading the code:

- **Money is a whole number of pesewas**, parsed from strings, never a float.
  `NUMERIC(14,2)` in the database. A POS that is a pesewa out per transaction is
  real money missing at month end.
- **The client never sends a price.** `complete_sale()` takes product ids and
  quantities and reads every price from the catalogue under a row lock.
- **Stock and its ledger move together or not at all.** `inventory` and
  `inventory_movements` have no write policies; the only way in is through
  database functions that update both in one transaction.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase values
npm run dev
```

You need a Supabase project — [DEPLOYMENT.md](DEPLOYMENT.md) covers creating
one, applying the migrations and promoting the first administrator.

### Environment variables

| Variable | Required | Public / Server |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public — safe, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only** |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public |
| `NEXT_PUBLIC_BUSINESS_NAME` | Optional | Public |
| `NEXT_PUBLIC_BUSINESS_SHORT_NAME` | Optional | Public |

`.env.example` documents each one. Real `.env` files are gitignored, and
`npm run check:secrets` fails the build if a privileged key ever reaches a
browser bundle.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, including the architecture boundary rules |
| `npm test` | Domain, application, component and architecture tests |
| `npm run db:test` | Applies every migration to a throwaway PostgreSQL and runs the RLS, atomicity, payment and reporting assertions |
| `npm run check:secrets` | Fails if a privileged key reached the client bundle |
| `npm run verify` | All of the above, in order |
| `npm run db:push` | Applies migrations to the linked Supabase project |
| `npm run db:types` | Regenerates `database.types.ts` from the linked schema |

`npm run db:test` needs a local PostgreSQL 14+ (the `initdb` and `pg_ctl`
binaries). It never touches a Supabase project.

## Architecture

```
src/
├── domain/          business rules — no React, no Next, no Supabase, no npm at all
├── application/     use cases, validators, DTOs
├── infrastructure/  Supabase clients, repositories, mappers, auth, composition root
├── presentation/    components, forms, hooks, client state
├── app/             routes and server actions
├── lib/             pure helpers and configuration
└── tests/           domain, application, component and architecture suites

supabase/
├── migrations/      sequential SQL — the only way the schema changes
├── tests/           RLS, atomicity, payment and reporting assertions
└── seed.sql         starter expense categories, and how to make the first admin
```

The dependency direction is enforced by ESLint, not by convention:

```
Presentation ──▶ Application ──▶ Domain ◀── Infrastructure
```

`src/tests/architecture` writes files that deliberately break those rules and
fails if the linter does *not* complain — because a boundary rule that silently
stops matching is worse than no rule at all. That is not hypothetical: these
rules were inert for a while during construction because an import resolver was
missing, and everything passed.

## The database

Nine sequential migrations create the whole schema. Highlights:

- `NUMERIC(14,2)` money everywhere; integral stock
- Constraints carrying arithmetic the application is not trusted with:
  `line_total = unit_price * quantity`, `quantity_on_hand >= 0`, one payment row
  per method, Mobile Money requires a reference
- `complete_sale()` — the whole checkout in one transaction, under row locks,
  with a unique idempotency key so a retry cannot become a second sale
- Row Level Security on every table. A cashier can read the catalogue and their
  own sales, and nothing else — not expenses, not the ledger, not another
  cashier's takings
- Reporting functions that exclude voided sales and return `NULL` rather than an
  understated profit when cost prices are missing

## Testing

| Suite | Where | What it proves |
| --- | --- | --- |
| Domain | `src/tests/domain` | Money arithmetic, split payments, stock limits, permissions |
| Application | `src/tests/application` | Use cases over in-memory fakes |
| Component | `src/tests/components` | The payment guard and the basket, in a real DOM |
| Architecture | `src/tests/architecture` | That the boundary rules actually fire |
| Database | `supabase/tests` | RLS, atomicity, locking, idempotency, report correctness — against real PostgreSQL |

170 unit and component tests, 94 database assertions. Every expected figure in
the reporting suite is worked out by hand from the fixtures rather than read
back from the query under test.

## PWA

Installable, with a manifest, maskable icons, standalone display and a service
worker.

The service worker deliberately **does not cache page responses**. Every page is
rendered for one signed-in person and contains their business's money; a cache
holding those could serve them to the next person to pick up the phone. It
caches content-hashed build assets and a static offline page, and nothing else.

The one offline behaviour is the POS basket, kept in `localStorage` with its
idempotency key. There is no offline sales queue, and that is a decision rather
than an omission: a queue that syncs later is how stock counts drift and
transactions post twice.

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — Supabase and Vercel, step by step
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the layers, and why each rule exists
- [docs/SECURITY.md](docs/SECURITY.md) — what is enforced, where, and what an attacker cannot do
