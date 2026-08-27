import "server-only";

import { cache } from "react";
import type { Staff } from "@/domain/entities/staff";
import { UnauthenticatedError } from "@/domain/errors/domain-error";
import { InactiveStaffError } from "@/domain/errors/business-errors";
import { serverSupabase } from "../supabase/client/server-client";
import { toStaff } from "../supabase/mappers/people";

/**
 * Who is making this request.
 *
 * The role comes from the `profiles` table, read server-side using the
 * authenticated session — never from a cookie, a header, a form field or a JWT
 * claim the client could shape. That is the whole point: authorisation
 * decisions upstream of this function are decisions about a value an attacker
 * controls.
 *
 * `getUser()` rather than `getSession()`, deliberately: getSession reads the
 * cookie and trusts it, while getUser verifies the token with Supabase.
 *
 * Wrapped in React's `cache` so a page that asks four times in one render
 * makes one round trip.
 */
export const currentStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await serverSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !data) return null;

  return toStaff(data);
});

/**
 * The signed-in staff member, or an error.
 *
 * Every server action and protected page starts here. A deactivated account
 * gets a distinct error from a signed-out one, so the sign-in screen can say
 * "your account has been deactivated" rather than "wrong password".
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) throw new UnauthenticatedError();
  if (!staff.isActive) throw new InactiveStaffError(staff.fullName);
  return staff;
}

/** Convenience for pages that only admins may render at all. */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  staff.assertCan("settings:write");
  return staff;
}
