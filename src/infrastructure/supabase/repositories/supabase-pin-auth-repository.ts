import "server-only";

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
 *   - `updatePinHash` (admin reset path) needs to touch any profile row.
 *
 * The SSR client is used only for `establishSession`, where it is needed to
 * write the resulting cookies back into the response.
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

  async establishSession(email: string): Promise<void> {
    // Generate a short-lived magic-link token using the admin API.
    // No email is sent — we consume the token immediately server-side.
    const { data: linkData, error: linkError } =
      await this.privileged.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error(
        `Failed to generate session link: ${linkError?.message ?? "no token returned"}`,
      );
    }

    // Exchange the hashed token for a session.  The SSR client's setAll
    // cookie handler writes the JWT cookies into the Next.js response.
    const { error: otpError } = await this.ssr.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (otpError) {
      throw new Error(`Failed to establish session: ${otpError.message}`);
    }
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
