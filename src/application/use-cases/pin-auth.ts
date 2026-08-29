import bcrypt from "bcryptjs";
import type { Staff } from "@/domain/entities/staff";
import { ValidationError } from "@/domain/errors/domain-error";
import type { PinAuthRepository } from "@/domain/repositories/pin-auth-repository";
import { parseOrThrow } from "../validators/product-validators";
import { changePinSchema, loginWithPinSchema } from "../validators/staff-validators";

/** How many failed attempts from a single IP triggers a lockout. */
const MAX_ATTEMPTS = 10;
/** Length of the rate-limiting window in seconds (15 minutes). */
const WINDOW_SECONDS = 15 * 60;

/**
 * Verifies a PIN against every active staff member's stored hash and, on a
 * match, establishes a Supabase Auth session so RLS policies can work normally.
 *
 * Security design
 * ---------------
 * * All hashes are compared in parallel to keep total latency proportional to
 *   one bcrypt comparison (~200-400 ms at cost 12) rather than n × that.
 * * Rate limiting counts failures since the last success from that IP, not
 *   every failure in the window.  Per-user limiting is not possible during
 *   anonymous login because we don't know which account is targeted, and a
 *   shop is a single public IP — see the repository interface for why the
 *   distinction is what keeps a fumbled PIN from closing the till.
 * * On a mismatch the response is the same generic string regardless of
 *   whether the PIN format was wrong, the PIN was valid but matched nobody, or
 *   the account is deactivated.  No timing side-channel: all hashes are still
 *   checked when the PIN is well-formed.
 */
export class LoginWithPin {
  constructor(private readonly pinAuth: PinAuthRepository) {}

  async execute(ip: string, input: unknown): Promise<void> {
    // 1. Rate limiting
    const recent = await this.pinAuth.failedAttemptsSinceLastSuccess(
      ip,
      WINDOW_SECONDS,
    );
    if (recent >= MAX_ATTEMPTS) {
      throw new ValidationError(
        "Too many failed attempts. Try again in 15 minutes.",
      );
    }

    // 2. Parse and validate PIN format
    const data = parseOrThrow(loginWithPinSchema, input);

    // 3. Compare PIN against all active credentials in parallel
    const credentials = await this.pinAuth.listActiveCredentials();
    const results = await Promise.all(
      credentials.map(async (cred) => ({
        cred,
        matches:
          cred.pinHash !== null &&
          (await bcrypt.compare(data.pin, cred.pinHash)),
      })),
    );

    const matched = results.find((r) => r.matches);

    if (!matched) {
      // Record failure; generic message regardless of reason.
      await this.pinAuth.recordAttempt(ip, null, false);
      throw new ValidationError("Invalid PIN.");
    }

    // 4. Record success and establish Supabase Auth session.
    await this.pinAuth.recordAttempt(ip, matched.cred.staffId, true);
    await this.pinAuth.establishSession(matched.cred.staffId, matched.cred.email);
  }
}

/**
 * Allows an authenticated staff member to change their own PIN.
 *
 * Requires the current PIN as proof that the person at the screen is the
 * account holder, not someone who briefly had access to an unlocked device.
 */
export class ChangeOwnPin {
  constructor(private readonly pinAuth: PinAuthRepository) {}

  async execute(actor: Staff, ip: string, input: unknown): Promise<void> {
    const data = parseOrThrow(changePinSchema, input);

    // Fetch the current hash from the privileged repository (bypasses RLS).
    const credentials = await this.pinAuth.listActiveCredentials();
    const mine = credentials.find((c) => c.staffId === actor.id);
    if (!mine || !mine.pinHash) {
      throw new ValidationError("PIN record not found. Contact an administrator.");
    }

    // Verify current PIN with same rate-limiting as login.
    const recent = await this.pinAuth.failedAttemptsSinceLastSuccess(
      ip,
      WINDOW_SECONDS,
    );
    if (recent >= MAX_ATTEMPTS) {
      throw new ValidationError(
        "Too many failed attempts. Try again in 15 minutes.",
      );
    }

    const currentMatches = await bcrypt.compare(data.currentPin, mine.pinHash);
    if (!currentMatches) {
      await this.pinAuth.recordAttempt(ip, actor.id, false);
      throw new ValidationError("Current PIN is incorrect.");
    }

    // Hash the new PIN and store it.
    const newHash = await bcrypt.hash(data.newPin, 12);
    await this.pinAuth.updatePinHash(actor.id, newHash);
  }
}
