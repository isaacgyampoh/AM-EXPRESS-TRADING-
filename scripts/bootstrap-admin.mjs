#!/usr/bin/env node
/**
 * Creates (or repairs) the first administrator.
 *
 *   npm run bootstrap:admin -- --pin 4821 --name "Ama Mensah"
 *   npm run bootstrap:admin -- --pin 4821 --reset      # re-PIN existing admin
 *
 * Why this is a script and not a migration
 * ----------------------------------------
 * The previous first admin was seeded by `INSERT INTO auth.users`. That table
 * belongs to GoTrue, and a hand-written row is not a usable account: several
 * token columns have no DEFAULT and GoTrue scans them into Go strings, and
 * email sign-in resolves accounts through `auth.identities`, which the insert
 * never wrote. The result was an account nobody could sign into — and since it
 * was the only account on a fresh deployment, a system nobody could enter.
 *
 * `auth.admin.createUser()` writes both tables the way GoTrue expects, so the
 * supported API is used here instead of reimplementing it in SQL.
 *
 * It also keeps the PIN out of the repository. The old migration carried a
 * working admin PIN in a tracked file, which is a credential in git for every
 * deployment that ever applied it.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from the
 * environment or from .env.local. The service-role key is never sent anywhere
 * but Supabase.
 */

import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

/** Reads .env.local into process.env without adding a dotenv dependency. */
function loadEnvFile(path) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return; // No file is fine — the variables may already be exported.
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real exports win over the file.
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "  Put them in .env.local, or export them before running this.",
  );
}

// -----------------------------------------------------------------------------
// Arguments
// -----------------------------------------------------------------------------

const args = process.argv.slice(2);

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

const pin = flag("pin");
const fullName = flag("name") ?? "Administrator";
const reset = args.includes("--reset");

if (!pin || !/^\d{4}$/.test(pin)) {
  fail(
    "Pass a 4-digit PIN:  npm run bootstrap:admin -- --pin 4821 --name \"Ama Mensah\"",
  );
}

// A PIN worth having is one an attacker cannot guess in ten tries. These are
// the sequences people reach for first, and the lockout only allows ten.
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888",
  "9999", "1234", "4321", "1212", "2580", "0852", "1010", "1024",
]);
if (WEAK_PINS.has(pin)) {
  fail(`${pin} is among the first PINs anyone guesses. Choose another.`);
}

// -----------------------------------------------------------------------------
// Work
// -----------------------------------------------------------------------------

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Writes the PIN hash and auth secret for a staff member. */
async function writeCredentials(staffId, plainPin, authSecret) {
  const pinHash = await bcrypt.hash(plainPin, 12);

  const { error } = await supabase
    .from("staff_credentials")
    .upsert(
      { staff_id: staffId, pin_hash: pinHash, auth_secret: authSecret },
      { onConflict: "staff_id" },
    );

  if (error) fail(`Could not save credentials: ${error.message}`);
}

const { data: admins, error: lookupError } = await supabase
  .from("profiles")
  .select("id, full_name, email")
  .eq("role", "admin")
  .eq("is_active", true);

if (lookupError) {
  fail(
    `Could not read profiles: ${lookupError.message}\n` +
      "  Have the migrations been applied?  npm run db:push",
  );
}

if (admins.length > 0 && !reset) {
  console.log(
    `\n  An active administrator already exists: ${admins[0].full_name}\n` +
      "  Re-run with --reset to set a new PIN on that account instead.\n",
  );
  process.exit(0);
}

if (admins.length > 0 && reset) {
  // Reset: keep the account, replace the PIN, and clear the auth secret so the
  // next sign-in provisions a fresh one against GoTrue.
  const admin = admins[0];
  await writeCredentials(admin.id, pin, null);

  console.log(
    `\n  PIN reset for ${admin.full_name}.\n` +
      "  Sign in with the new PIN.\n",
  );
  process.exit(0);
}

// No admin yet — create one properly, through the API that writes both
// auth.users and auth.identities.
const internalEmail = `${randomUUID()}@pos.amexpress.internal`;
const internalPassword = randomBytes(32).toString("hex");

const { data: created, error: createError } = await supabase.auth.admin.createUser(
  {
    email: internalEmail,
    password: internalPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  },
);

if (createError) fail(`Could not create the account: ${createError.message}`);

const staffId = created.user?.id;
if (!staffId) fail("The account was not created. Try again.");

// The on_auth_user_created trigger has already made a cashier profile; promote
// it. Roles are never taken from sign-up metadata, which is why this is a
// second step rather than a field on createUser.
const { error: promoteError } = await supabase
  .from("profiles")
  .update({ role: "admin", full_name: fullName })
  .eq("id", staffId);

if (promoteError) fail(`Could not promote to admin: ${promoteError.message}`);

await writeCredentials(staffId, pin, internalPassword);

console.log(
  `\n  Administrator created: ${fullName}\n` +
    "  Sign in with the PIN you just set.\n",
);
