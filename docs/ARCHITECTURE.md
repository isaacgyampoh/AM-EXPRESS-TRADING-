# Architecture

## The shape

```
        ┌───────────────────────────────────────────┐
        │              Presentation                 │
        │   components, forms, pages, server actions│
        └───────────────────┬───────────────────────┘
                            │ calls
                            ▼
        ┌───────────────────────────────────────────┐
        │              Application                  │
        │   use cases, validators, DTOs             │
        └───────────────────┬───────────────────────┘
                            │ depends on
                            ▼
        ┌───────────────────────────────────────────┐
        │                Domain                     │
        │   entities, value objects, rules,         │
        │   repository contracts                    │
        └───────────────────▲───────────────────────┘
                            │ implements
        ┌───────────────────┴───────────────────────┐
        │             Infrastructure                │
        │   Supabase clients, repositories, mappers │
        └───────────────────────────────────────────┘
```

Arrows point at what a layer is allowed to know about. Infrastructure points
*inward* because it implements interfaces the domain defines — that inversion
is what makes the business logic independent of Supabase rather than merely
separated from it by folders.

## What each layer may import

Enforced by `eslint-plugin-boundaries` in `eslint.config.mjs`:

| Layer | May import |
| --- | --- |
| `domain` | `domain` only. **No npm packages at all**, not even Node built-ins |
| `application` | `application`, `domain`, `lib` |
| `infrastructure` | `infrastructure`, `application`, `domain`, `lib` |
| `presentation` | `presentation`, `application`, `domain`, `lib` |
| `app` | everything — it is the composition root |
| `lib` | `lib` |

Plus one rule that matters more than the rest: **nothing outside
`infrastructure` may import `@supabase/*`**. That is what stops
`supabase.from("products")` reappearing inside a component in six months.

### These rules are tested

`src/tests/architecture/boundaries.test.ts` writes files that break each rule,
lints them, and fails if ESLint does *not* report a violation.

That suite exists because of a real failure during this project's construction:
the boundary rules were configured, the lint was green, and the rules were
matching nothing at all — the TypeScript import resolver was missing, so every
dependency looked unresolvable and was silently skipped. A green build proved
nothing for as long as that lasted. Now the rules have to fire on purpose-built
violations, or the test suite fails.

## Where each kind of decision lives

**Domain** — anything that would still be true if the business swapped
databases, or ran the shop on paper.

- Cash + Mobile Money must equal the sale total, exactly (`Tender.assertCovers`)
- A sale of N units reduces stock by N, and never below zero
- A cashier cannot perform administrator operations (`Role`, `Staff.assertCan`)
- Money is a whole number of minor units, never a float (`Money`)

**Application** — orchestration. Which repository to call, in what order, and
what the caller gets back. Every use case follows the same sequence:

1. `actor.assertCan(...)` — permission, first, always
2. Parse and validate the input's shape
3. Apply the domain rules
4. Write

Permission before validation is deliberate. Validating first describes the
system to someone who should not be here, and spends a database round trip on
a request that was never going to succeed. There is a test for the ordering.

**Infrastructure** — everything that knows Supabase exists: the three clients,
the repositories, the mappers, the SQLSTATE-to-domain-error translation.

**Presentation** — rendering, and nothing else. No business rules, no queries.

## Decisions worth knowing

### Money is an integer of pesewas

`Money` holds a whole number of minor units. Decimal strings from forms are
parsed digit by digit rather than through `Number()`. NUMERIC(14,2) in the
database, never `double precision`.

`0.1 + 0.2 !== 0.3` is not an acceptable property for a cash drawer, and a POS
that is a pesewa out per transaction is real money missing at month end.

### The client never sends a price

`complete_sale()` takes product ids and quantities. It reads every price from
the catalogue itself, under a row lock. There is no request field for a unit
price or a total, so there is nothing for a modified client to lie about — not
"we validate it", but "the value does not travel".

### Stock and its ledger move together, or not at all

`inventory` and `inventory_movements` have **no write policies**. With RLS
enabled and no permissive policy, every direct write from any signed-in user —
administrators included — is refused. The only way stock moves is through the
`SECURITY DEFINER` functions, each of which updates the balance and appends the
movement in one transaction.

That is what makes "sum of movements = quantity on hand" an invariant rather
than an aspiration.

### Checkout is checked twice, on purpose

Once in `CompleteSale` against a fresh read, so the cashier gets a specific
error at the till — *"Not enough stock for Rice 5kg: 4 requested, 3
available"*. Once inside `complete_sale()` under row locks, where it is
authoritative.

The two are not redundant. The first is about the person standing at the
counter; the second is about two cashiers selling the last unit at the same
instant, which only the database can settle.

### Idempotency is the client's key, the database's constraint

Each checkout carries a client-generated `clientTransactionId`, unique in the
database. A retry after a dropped connection returns the original sale rather
than selling the stock twice. Mobile networks drop connections; a POS that
turns one tap into two sales is not usable.

### Roles come from the database, never from the request

`currentStaff()` reads the role from `profiles` using `getUser()` — which
verifies the token with Supabase — rather than `getSession()`, which trusts the
cookie. No repository method takes an actor id: an argument that can be passed
is an argument that can be forged, so cashier identity, stock recorder and
expense author all come from `auth.uid()` inside the database.

### Business identity lives in one row

`business_settings` holds the name, currency, symbol, receipt prefix and
footer. Components read the symbol from context; nothing hardcodes "GH₵".

The exception is `src/lib/config/branding.ts`: the sign-in heading, the tab
title and the PWA manifest all render *before* a session exists, and RLS
correctly refuses to hand out settings to an anonymous request. Those three
strings come from environment variables with defaults.

## Testing, in layers

| Suite | Where | What it can prove |
| --- | --- | --- |
| Domain | `src/tests/domain` | Money arithmetic, split payments, stock limits, permissions |
| Application | `src/tests/application` | Use cases over in-memory fakes: orchestration, ordering, error mapping |
| Component | `src/tests/components` | The payment guard and the basket, in a real DOM |
| Architecture | `src/tests/architecture` | That the boundary rules actually fire |
| Database | `supabase/tests` | RLS, atomicity, locking, idempotency, report correctness — against real PostgreSQL |

The fakes in `src/tests/support/fakes.ts` deliberately cannot model atomicity,
row locks or RLS. Anything they appeared to prove about concurrency would be a
lie, so those guarantees are tested where they actually live.
