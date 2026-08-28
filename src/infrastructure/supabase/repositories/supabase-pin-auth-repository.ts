import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PinAuthRepository, PinCredential } from "@/domain/repositories/pin-auth-repository";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

/**
 * PIN authentication repository.
 *
 * ALL reads/writes here use the service-role (privileged) client because:
 *   - `listActiveCredentials` is called before any session exists (no RLS).
 *   - `pin_attempts` has no authenticated policies (see migration).
 *   - `updatePinHash` needs to touch any profile row as an admin operation.
 *
 * The SSR client is used only for `establishSession`, where it is needed to
 * write the resulting session cookies back into the Next.js response.
 *
 * Session establishment uses a disposable-password handshake:
 *   1. Admin API sets a random 64-hex-char password on the user.
 *   2. SSR client calls signInWithPassword — this is the battle-tested path
 *      that properly writes session cookies via the @supabase/ssr setAll hook.
 *   3. Admin API immediately rotates the password to a second random value so
 *      the disposable value used in step 2 cannot be reused.
 *
 * This replaces the deprecated `type: "magiclink"` OTP flow which was removed
 * in recent Supabase auth server versions.
 */
export class SupabasePinAuthRepository implements PinAuthRepository {
  constructor(
    /** Service-role client — bypasses RLS. */
    private readonly privileged: Client,
    /** SSR anon client for this request — used only to establish the session. */
    private readonly ssr: Client,
  ) {}

  async listActiveCredentials(): Promise<PinCredential[]> {
    const { data, error } = await this.privileged
      .from("profiles")
      .select("id, email, pin_hash, is_active")
      .eq("is_active", true);

    if (error) {
      throw new Error(`Failed to list credentials: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      staffId: row.id,
      email: row.email,
      pinHash: row.pin_hash ?? null,
      isActive: row.is_active,
    }));
  }

  async recordAttempt(
    ip: string,
    staffId: string | null,
    succeeded: boolean,
  ): Promise<void> {
    // Fire-and-forget: a failed write here must not block the login response.
    // If it throws, swallow — rate limiting degrades gracefully (prefers login
    // availability over perfect attempt tracking).
    try {
      await this.privileged.from("pin_attempts").insert({
        ip_address: ip,
        staff_id: staffId,
        succeeded,
      });
    } catch {
      // Intentionally swallowed.
    }
  }

  async recentFailedAttempts(ip: string, windowSeconds: number): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count, error } = await this.privileged
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("succeeded", false)
      .gte("attempted_at", since);

    if (error) {
      // Fail open: if we can't read attempts, don't block login. The admin
      // can investigate the database error separately.
      return 0;
    }

    return count ?? 0;
  }

  /**
   * Establishes a session for `staffId` using the disposable-password handshake.
   *
   * Step 1 — set disposable password:
   *   The admin client updates the user's auth.users record with a fresh random
   *   password.  This password is never stored anywhere — it exists only in this
   *   function call's stack frame.
   *
   * Step 2 — sign in:
   *   The SSR client calls signInWithPassword.  On success the @supabase/ssr
   *   setAll cookie handler writes the JWT session cookies into the Next.js
   *   response, so the browser gets them on the server-action redirect.
   *
   * Step 3 — rotate password immediately:
   *   The admin client sets another random password, making the disposable value
   *   from step 1 permanently invalid.  Errors here are non-fatal; the session
   *   is already established and the user is logged in.
   */
  async establishSession(staffId: string, email: string): Promise<void> {
    // --- Step 1: set a disposable password ---
    const disposable = randomBytes(32).toString("hex"); // 64 hex chars

    const { error: setError } = await this.privileged.auth.admin.updateUserById(
      staffId,
      { password: disposable },
    );
    if (setError) {
      throw new Error(`Session setup failed (set): ${setError.message}`);
    }

    // --- Step 2: sign in with the disposable password ---
    const { error: signInError } = await this.ssr.auth.signInWithPassword({
      email,
      password: disposable,
    });
    if (signInError) {
      throw new Error(`Session setup failed (sign-in): ${signInError.message}`);
    }

    // --- Step 3: rotate to a fresh random password (invalidate the disposable) ---
    // Non-fatal: the session is live. A failure here is a minor security
    // hygiene issue (the disposable stays valid until the next login) but it
    // cannot be exploited without knowing the internal email, which is an
    // implementation detail never shown to users.
    await this.privileged.auth.admin
      .updateUserById(staffId, { password: randomBytes(32).toString("hex") })
      .catch(() => {
        /* intentionally swallowed */
      });
  }

  async updatePinHash(staffId: string, newPinHash: string): Promise<void> {
    const { error } = await this.privileged
      .from("profiles")
      .update({ pin_hash: newPinHash })
      .eq("id", staffId);

    if (error) {
      throw new Error(`Failed to update PIN hash: ${error.message}`);
    }
  }
}
