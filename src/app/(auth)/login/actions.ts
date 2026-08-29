"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/application/services/result";
import { failure } from "@/application/services/result";
import { ValidationError } from "@/domain/errors/domain-error";
import { getPinUseCases } from "@/infrastructure/container";
import { serverSupabase } from "@/infrastructure/supabase/client/server-client";

/**
 * Signs a staff member in with a 4-digit PIN.
 *
 * The PIN is compared server-side against the bcrypt hashes of all active
 * staff members.  On a match, a Supabase Auth session is established from the
 * account's internal secret — the browser never sees a token, an email, or a
 * password.
 *
 * Failures are deliberately generic.  A wrong PIN, an unknown PIN, a
 * deactivated account, and a malformed input all return "Invalid PIN."
 * Distinguishing them would help an attacker enumerate accounts.
 *
 * Rate limiting: 10 failed attempts per IP per 15 minutes → 15-minute block.
 */
export async function signIn(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  // Resolve the IP address for rate limiting.
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "0.0.0.0";

  const pin = formData.get("pin");
  const next = formData.get("next");

  const { loginWithPin } = await getPinUseCases();

  try {
    await loginWithPin.execute(ip, { pin });
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure("SIGN_IN_FAILED", err.message);
    }
    // An infrastructure failure, not a wrong PIN. Log it server-side — the
    // user is told nothing beyond the generic message, so this is the only
    // record that the sign-in broke rather than being refused.
    console.error("[signIn] PIN login failed unexpectedly:", err);
    return failure("SIGN_IN_FAILED", "Invalid PIN.");
  }

  // Only follow a relative path to prevent open redirects.
  const destination =
    typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//")
      ? next
      : "/dashboard";

  redirect(destination);
}

/**
 * Signs the current staff member out and redirects to the login page.
 */
export async function signOut(): Promise<void> {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
