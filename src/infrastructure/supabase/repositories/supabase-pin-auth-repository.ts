import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PinAuthRepository,
  PinCredential,
} from "@/domain/repositories/pin-auth-repository";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

/** Length of a generated internal auth secret, in bytes before hex encoding. */
const SECRET_BYTES = 32;

/**
 * PIN authentication.
 *
 * Every read and write here uses the service-role client. `staff_credentials`
 * has RLS on and no policies, deliberately: the PIN hashes and auth secrets it
 * holds are the two things that must never reach a browser. The SSR client is
 * used for exactly one call — `signInWithPassword` — because that is what
 * writes the session cookies into the Next.js response.
 *
 * How a PIN becomes a session
 * ---------------------------
 * Supabase has no supported API for minting a session on behalf of a user, so
 * something has to stand in for a password. Each staff member gets one stable
 * random secret, held on their GoTrue account and mirrored in
 * `staff_credentials.auth_secret`. Once the PIN checks out, signing in is a
 * single `signInWithPassword` with that secret.
 *
 * The secret is provisioned lazily on first sign-in rather than seeded, so it
 * never has to exist in a migration, a fixture, or the repository's history.
 *
 * This replaces an earlier design that set a fresh disposable password, signed
 * in with it, and rotated it again on every login. That was three GoTrue round
 * trips on the critical path of a till, and it raced: two devices signing into
 * the same account at once would each overwrite the other's password, and one
 * would be told its PIN was wrong. A stable secret has neither problem.
 */
export class SupabasePinAuthRepository implements PinAuthRepository {
  constructor(
    /** Service-role client — bypasses RLS. */
    private readonly privileged: Client,
    /** SSR anon client for this request — used only to establish the session. */
    private readonly ssr: Client,
  ) {}

  async listActiveCredentials(): Promise<PinCredential[]> {
    // Two reads joined in memory rather than a PostgREST embed. Staff counts
    // here are in the dozens, and the embed's shape is easy to get subtly
    // wrong in a way that silently returns nobody — which would present as
    // "every PIN is invalid".
    const [{ data: profiles, error: profileError }, { data: creds, error: credError }] =
      await Promise.all([
        this.privileged
          .from("profiles")
          .select("id, email, is_active")
          .eq("is_active", true),
        this.privileged.from("staff_credentials").select("staff_id, pin_hash"),
      ]);

    if (profileError) {
      throw new Error(`Failed to list staff: ${profileError.message}`);
    }
    if (credError) {
      throw new Error(`Failed to list credentials: ${credError.message}`);
    }

    const hashByStaffId = new Map(
      (creds ?? []).map((row) => [row.staff_id, row.pin_hash]),
    );

    return (profiles ?? []).map((row) => ({
      staffId: row.id,
      email: row.email,
      pinHash: hashByStaffId.get(row.id) ?? null,
      isActive: row.is_active,
    }));
  }

  async recordAttempt(
    ip: string,
    staffId: string | null,
    succeeded: boolean,
  ): Promise<void> {
    // A failure to record an attempt must not fail the login. Rate limiting
    // degrades rather than locking the shop out of its own till.
    const { error } = await this.privileged.from("pin_attempts").insert({
      ip_address: ip,
      staff_id: staffId,
      succeeded,
    });

    if (error) {
      console.error("[pin-auth] could not record attempt:", error.message);
    }
  }

  async failedAttemptsSinceLastSuccess(
    ip: string,
    windowSeconds: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

    // Find the most recent success from this IP inside the window; count only
    // failures after it. See the interface for why a plain count is wrong for
    // a shop sharing one public address.
    const { data: lastSuccess, error: successError } = await this.privileged
      .from("pin_attempts")
      .select("attempted_at")
      .eq("ip_address", ip)
      .eq("succeeded", true)
      .gte("attempted_at", since)
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (successError) {
      // Fail open: an unreadable attempts table must not block trade.
      return 0;
    }

    const countFrom = lastSuccess?.attempted_at ?? since;

    const { count, error } = await this.privileged
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("succeeded", false)
      .gt("attempted_at", countFrom);

    if (error) return 0;

    return count ?? 0;
  }

  /**
   * Signs the staff member in with their stable internal secret, provisioning
   * one first if this account has never had it.
   *
   * The retry matters. If `auth_secret` and the GoTrue account ever disagree —
   * a half-finished provision, a password reset from the Supabase dashboard,
   * a restored database backup — the stored secret is wrong and sign-in fails
   * with credentials the user cannot possibly fix, because they never see it.
   * Re-provisioning once on that specific failure turns a permanent lockout
   * into a slow login, and it is safe: the PIN was already verified before
   * this method was called.
   */
  async establishSession(staffId: string, email: string): Promise<void> {
    const stored = await this.readAuthSecret(staffId);
    const secret = stored ?? (await this.provisionAuthSecret(staffId));

    const firstAttempt = await this.ssr.auth.signInWithPassword({
      email,
      password: secret,
    });

    if (!firstAttempt.error) return;

    // A freshly provisioned secret failing is a real error, not a stale one —
    // retrying would just set the same thing again.
    if (!stored) {
      throw new Error(
        `Could not start a session: ${firstAttempt.error.message}`,
      );
    }

    const replacement = await this.provisionAuthSecret(staffId);
    const retry = await this.ssr.auth.signInWithPassword({
      email,
      password: replacement,
    });

    if (retry.error) {
      throw new Error(`Could not start a session: ${retry.error.message}`);
    }
  }

  /** Reads the stored secret, or null when the account has never had one. */
  private async readAuthSecret(staffId: string): Promise<string | null> {
    const { data, error } = await this.privileged
      .from("staff_credentials")
      .select("auth_secret")
      .eq("staff_id", staffId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not read credentials: ${error.message}`);
    }
    return data?.auth_secret ?? null;
  }

  /**
   * Generates a secret, sets it on the GoTrue account, and stores it.
   *
   * Order matters: GoTrue first, our table second. If the process dies between
   * them the stored secret is stale, which `establishSession` recovers from.
   * Storing first would leave a secret we believe in and GoTrue has never
   * heard of, and the same recovery would loop.
   */
  private async provisionAuthSecret(staffId: string): Promise<string> {
    const secret = randomBytes(SECRET_BYTES).toString("hex");

    const { error: authError } = await this.privileged.auth.admin.updateUserById(
      staffId,
      { password: secret },
    );
    if (authError) {
      throw new Error(`Could not prepare the account: ${authError.message}`);
    }

    const { data, error } = await this.privileged
      .from("staff_credentials")
      .update({ auth_secret: secret })
      .eq("staff_id", staffId)
      .select("staff_id");

    if (error) {
      throw new Error(`Could not store credentials: ${error.message}`);
    }

    // An update matching nothing is not an error to PostgREST, so it has to be
    // checked. Reaching here with no credentials row should be impossible —
    // sign-in only gets this far after matching a stored PIN hash — but if it
    // ever happens the secret would go unsaved and every subsequent login
    // would silently re-provision. Better to say so than to limp.
    if (!data || data.length === 0) {
      throw new Error(
        `No credentials record for staff ${staffId}; cannot store the auth secret.`,
      );
    }

    return secret;
  }

  async updatePinHash(staffId: string, newPinHash: string): Promise<void> {
    const { error } = await this.privileged
      .from("staff_credentials")
      .update({ pin_hash: newPinHash })
      .eq("staff_id", staffId);

    if (error) {
      throw new Error(`Failed to update PIN: ${error.message}`);
    }
  }
}
