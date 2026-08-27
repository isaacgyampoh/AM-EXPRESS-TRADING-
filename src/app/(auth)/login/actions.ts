"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/application/services/result";
import { failure } from "@/application/services/result";
import { serverSupabase } from "@/infrastructure/supabase/client/server-client";

const signInSchema = z.object({
  email: z.email("Enter your email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

/**
 * Signs a staff member in.
 *
 * Runs as a server action so the session cookie is set by the server. The
 * browser never handles a token.
 *
 * Failures are deliberately vague: "Those details are not right" covers a
 * wrong password, an unknown address and a typo alike. Distinguishing them
 * would tell whoever is guessing which addresses have accounts.
 *
 * A deactivated account is the one case worth naming, because that person is
 * not an attacker — they are a former cashier wondering why their password
 * stopped working, and their manager needs to hear the real reason.
 */
export async function signIn(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] ??= issue.message;
    }
    return failure("VALIDATION_ERROR", "Check your details and try again.", {
      fieldErrors,
    });
  }

  const supabase = await serverSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return failure(
      "SIGN_IN_FAILED",
      "Those details are not right. Check your email and password.",
    );
  }

  // A deactivated staff member has valid credentials but no access. Signing
  // them out immediately keeps the "is_active" check in one place — the
  // database — rather than relying on every page to notice.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return failure(
      "INACTIVE_STAFF",
      "This account has been deactivated. Ask an administrator to reactivate it.",
    );
  }

  // Only follow a relative path. An open redirect here would turn the sign-in
  // page into a way to send staff to somebody else's site with the business's
  // own link.
  const next = parsed.data.next;
  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  redirect(destination);
}
