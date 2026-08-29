# Deploying AM Express Trading

GitHub → Vercel, with Supabase behind it. Six steps, about twenty minutes.

You should not need to edit any source code.

---

## Step 1 — Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick the region
   closest to your customers.
2. **Save the database password.** Supabase shows it once, and you need it to
   apply migrations.
3. Go to **Project Settings → API** and copy three values — you will paste them
   into Vercel in Step 3:
   - **Project URL**
   - **anon public** key
   - **service_role** key

The anon key is public by design; Row Level Security is what protects the data.
The service_role key bypasses RLS entirely — it goes into Vercel and nowhere
else. Never into a file, never into a `NEXT_PUBLIC_` variable, never into a
message.

---

## Step 2 — Apply the database migrations

From a terminal with the repository checked out:

```bash
npm install
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

`db:push` applies the nine migration files in order. They create every table,
constraint, index, function, trigger and RLS policy the application needs.

The migrations in git are the authoritative schema. Do not edit tables by hand
in the Supabase dashboard, or the next environment you set up will not match.

To preview what will be applied:

```bash
npx supabase db diff --linked
```

---

## Step 3 — Connect the repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import
   `isaacgyampoh/AM-EXPRESS-TRADING-`.
2. Leave the build settings alone — Next.js is detected automatically.
3. Add the environment variables below **before** the first deploy.

### Environment variables

| Variable | Required | Public / Server | Where to obtain |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | **Public** — sent to the browser | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | **Public** — safe, protected by RLS | Supabase → Project Settings → API → `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only — never exposed** | Supabase → Project Settings → API → `service_role` |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Public | Your Vercel production URL, e.g. `https://am-express.vercel.app` |
| `NEXT_PUBLIC_BUSINESS_NAME` | Optional | Public | Only if the business name differs from "AM Express Trading" |
| `NEXT_PUBLIC_BUSINESS_SHORT_NAME` | Optional | Public | Name on a phone's home screen. Defaults to "AM Express" |

Set them for **Production**, **Preview** and **Development**.

**What the service role key is for.** Exactly one operation: creating a staff
member's auth identity, which the auth admin API will not do for an ordinary
signed-in user. Everything else in the application — every read, every sale,
every report — runs as the signed-in user under Row Level Security. The key is
read only in server code that starts with `import "server-only"`, and
`npm run check:secrets` fails the build if it ever appears in a browser bundle.

**Preview environments should use a separate Supabase project.** A preview
branch running migrations against live data is how a Tuesday afternoon becomes
a very bad Tuesday afternoon.

---

## Step 4 — Point Supabase back at the deployment

In Supabase, **Authentication → URL Configuration**: add your Vercel production
URL as the Site URL, and to the redirect allow-list.

Sign-in fails with a redirect error until you do this.

Also in **Authentication → Providers → Email**: turn **sign-ups off**. This is
an internal business system; nobody joins it. (Even with sign-ups on, a new
account could only ever be a cashier — the trigger in the first migration
refuses to read a role from sign-up metadata — but there is no reason to leave
the door open.)

---

## Region: keep Vercel next to the database

`vercel.json` pins the functions to `lhr1` (London). This is not arbitrary and
should not be removed.

Supabase hosts this project in `eu-west-2`, which is London. Vercel's default
was `iad1`, Washington DC, so every database round trip crossed the Atlantic —
and a page makes several in sequence: the proxy verifies the session, the page
verifies it again, then reads the profile, then reads its data. Measured on the
deployed app with an empty database, that was 1.0–1.6s of time-to-first-byte
and 3.5–4.7s page loads, none of it caused by data volume.

The shop is in Ghana. Accra to London is roughly half the round trip of Accra
to Washington, so co-locating helps the people using it as well as the queries.

**If the Supabase project ever moves region, move this with it.** The two
belong together; a mismatch is invisible in code review and costs whole seconds
per page.

---

## Step 5 — Deploy, then create the first administrator

Deploy from Vercel. Then create the owner's account, which is the one step that
has to be done by hand. With `.env.local` filled in, from the project root:

```bash
npm run bootstrap:admin -- --pin 4821 --name "Owner name here"
```

Choose a PIN that is not in the script's refusal list — the lockout allows ten
attempts, so a PIN anyone would guess in ten is not worth having. Then sign in
with it. From then on staff are created inside the application under **Staff**,
and no further SQL or scripts are needed.

To change that PIN later without the app (a forgotten owner PIN, say):

```bash
npm run bootstrap:admin -- --pin 5937 --reset
```

**Why a script and not SQL.** `auth.users` belongs to GoTrue. A hand-written
`INSERT` into it produces an account nobody can sign into: several token
columns have no default and GoTrue reads them as non-null strings, and email
sign-in resolves accounts through `auth.identities`, which the insert does not
write. The script calls the admin API, which writes both correctly.

**Why it is manual at all.** Sign-up metadata is attacker-controlled — anyone
who can reach the sign-up endpoint could put `{"role":"admin"}` in it — so the
database never reads a role from it. Every account starts as a cashier. The
first admin has to be promoted by someone holding the service-role key, once.

After this, the database will not let the business lock itself out: the last
active administrator cannot be demoted or deactivated by anyone, including
through the SQL editor.

---

## Step 6 — Verify

Sign in as the administrator and check, in this order:

1. **Settings** — set the business name, address, phone and receipt footer.
   These appear on every receipt.
2. **Products** — add a product with a selling price, a cost price and opening
   stock.
3. **Staff** — create a cashier account.
4. **Sell** — add the product to the basket, take a split payment (some cash,
   some Mobile Money with a reference), and complete the sale.
5. **The receipt** — check the business details, the split breakdown and the
   Mobile Money reference. Print it.
6. **Products** — confirm the stock went down by exactly what you sold.
7. **Reports** — confirm today's sales match what you just took, and that cash
   plus Mobile Money adds up to the total.

Then sign in as the cashier and confirm they can sell but cannot reach
Expenses, Staff, Settings or the business-wide reports.

### Installing it on a phone

Open the production URL on the phone:

- **Android / Chrome** — an install prompt appears, or use ⋮ → *Add to home
  screen*
- **iOS / Safari** — Share → *Add to Home Screen*

The app then runs full screen without the browser bar. Nothing in the code
forces or nags about installation; that is the browser's prompt and the user's
choice.

---

## Verifying a change before you ship it

```bash
npm run verify
```

Runs, in order: typecheck, lint (including the architecture boundary rules),
170 unit and component tests, 94 database assertions against a throwaway
PostgreSQL, the production build, and the client-bundle secret check.

A green `npm run build` on its own is not evidence that the system works. It is
evidence that it compiles.

---

## Troubleshooting

**"Supabase is not configured"** — a variable is missing or malformed. The
error names it.

**Sign-in redirects to an error page** — the deployment URL is not in Supabase's
redirect allow-list. See Step 4.

**Signed in but everything is empty** — the account has no profile row, or
`is_active` is false. Check `select * from public.profiles;`.

**"Only an administrator can…" as the owner** — the promotion in Step 5 did not
run, or ran against a different email. Check the `role` column.

**The install prompt never appears** — the app must be served over HTTPS (Vercel
is), and Chrome only offers installation once it has seen the site work. iOS
never fires a prompt at all; it installs through the Share menu.
