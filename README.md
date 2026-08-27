# AM Express Trading

Inventory, point of sale, expenses, staff and reporting for AM Express Trading.

Next.js (App Router) · TypeScript · Supabase (PostgreSQL, Auth, RLS) · Vercel · PWA

---

## What this is

A business system for a real shop, built so that the business logic is
separable from the framework it happens to run on. The core idea running
through every decision:

**The database is the store of record, not the browser.** Prices, totals,
stock levels, roles and cashier identity are all read and enforced server-side.
The client sends intent — which products, how many, how much cash — and never
anything the business would be embarrassed to have forged.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase values
npm run dev
```

You will need a Supabase project. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for creating one, applying the migrations, and promoting the first
administrator.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, including the architecture boundary rules |
| `npm test` | Domain, application and architecture tests (fast, no database) |
| `npm run db:test` | Applies every migration to a throwaway PostgreSQL and runs the RLS, atomicity and payment-rule assertions |
| `npm run check:secrets` | Fails if a privileged key reached the client bundle |
| `npm run verify` | All of the above, in order |
| `npm run db:push` | Applies migrations to the linked Supabase project |
| `npm run db:types` | Regenerates `database.types.ts` from the linked schema |

`npm run db:test` needs a local PostgreSQL 14+ (the `initdb` and `pg_ctl`
binaries). It never touches a Supabase project.

## Layout

```
src/
├── domain/          business rules — no React, no Next, no Supabase, no npm at all
├── application/     use cases, validators, DTOs
├── infrastructure/  Supabase clients, repositories, mappers, auth, composition root
├── presentation/    components and forms
├── app/             routes, server actions
├── lib/             pure helpers and configuration
└── tests/           domain, application and architecture suites

supabase/
├── migrations/      sequential SQL — the only way the schema changes
├── tests/           RLS, atomicity and payment-rule assertions
└── seed.sql         starter expense categories, and how to make the first admin
```

The dependency direction is enforced by ESLint, not by convention:

```
Presentation ──▶ Application ──▶ Domain ◀── Infrastructure
```

`src/tests/architecture` writes files that deliberately break those rules and
fails if the linter does *not* complain — because a boundary rule that silently
stops matching is worse than no rule at all.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the layers, and why each rule exists
- [docs/SECURITY.md](docs/SECURITY.md) — what is enforced, where, and what an attacker cannot do
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Supabase and Vercel, step by step
