# Deployment

Supabase for the database and auth, Vercel for the application.

---

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick a region near
   your customers — for Ghana, `eu-west-1` (Ireland) is usually the fastest of
   the available options; check the current list.
2. Save the database password somewhere safe. You will need it to push
   migrations, and Supabase will not show it again.
3. From **Project Settings → API**, copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

The anon key is public by design — Row Level Security is what protects the
data. The service role key bypasses RLS entirely: it goes into Vercel's
environment variables and nowhere else. Never into `.env` in git, never into a
`NEXT_PUBLIC_` variable, never into a message.

## 2. Apply the migrations

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

`db:push` applies everything in `supabase/migrations` in filename order. The
migrations are the only way this schema changes — do not edit tables by hand in
the dashboard, or the next environment you set up will not match.

To check what would be applied first:

```bash
npx supabase db diff --linked
```

## 3. Turn off public sign-up

**Authentication → Providers → Email**, and disable sign-ups.

This is an internal business system; nobody joins it. Even with sign-ups on, a
new account could only ever be a cashier — the trigger in the first migration
refuses to read a role from sign-up metadata — but there is no reason to leave
the door open.

## 4. Create the first administrator

Every account starts as a cashier, deliberately, so the first admin is promoted
once by hand.

1. **Authentication → Users → Add user**. Use the owner's email and a password
   they will change.
2. In the **SQL Editor**:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Owner name here'
   where email = 'owner@example.com';
   ```

3. Sign in as that account. From then on, staff are created inside the
   application and no further SQL is needed.

After this the database will not let the business lock itself out: the last
active administrator cannot be demoted or deactivated by anyone.

## 5. Deploy to Vercel

Import the repository at [vercel.com/new](https://vercel.com/new). Framework
detection handles the build settings; nothing custom is needed.

Set these environment variables, for **Production**, **Preview** and
**Development**:

| Variable | Value | Exposed to the browser |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Yes — safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | Yes — safe, RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **No. Server only** |
| `NEXT_PUBLIC_SITE_URL` | Your production URL | Yes |

If the business name differs from the default, also set
`NEXT_PUBLIC_BUSINESS_NAME` and `NEXT_PUBLIC_BUSINESS_SHORT_NAME` — these are
the strings shown before sign-in, where the database settings are not readable.

### Preview environments

Preview deployments should point at a **separate Supabase project**, not at
production. A preview branch running migrations against live data is how a
Tuesday afternoon becomes a very bad Tuesday afternoon.

### Add the deployment URL to Supabase

**Authentication → URL Configuration**, and add your Vercel production URL to
the site URL and redirect allow-list. Sign-in will fail with a redirect error
until you do.

## 6. Verify the production build before shipping

```bash
npm run verify
```

Which runs, in order: typecheck, lint (including the architecture boundary
rules), the unit suites, the database suite against a throwaway PostgreSQL,
the production build, and the client-bundle secret check.

A green `npm run build` on its own is not evidence that the system works. It is
evidence that it compiles.

## 7. Installing on a phone

Once deployed, open the production URL on the phone:

- **Android / Chrome** — an "Install app" prompt appears, or use ⋮ → *Add to
  home screen*
- **iOS / Safari** — Share → *Add to Home Screen*

The app then opens without browser chrome, which gives the POS the full screen.
Nothing in the code forces or nags about installation; that is the browser's
prompt and the user's choice.

## Troubleshooting

**"Supabase is not configured"** — `.env.local` is missing or a value is
malformed. The error message names the variable.

**Sign-in redirects to an error page** — the deployment URL is not in
Supabase's redirect allow-list. See step 5.

**Everything is empty after signing in** — the account has no profile row, or
`is_active` is false. Check `select * from public.profiles;` in the SQL editor.

**"Only an administrator can…" as the owner** — the promotion in step 4 did not
run, or ran against a different email. Check the `role` column.
