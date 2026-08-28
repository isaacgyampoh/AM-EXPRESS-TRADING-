/**
 * Credentials row fetched for PIN verification.
 *
 * Only ever read inside server actions, never serialised to the client.
 */
export interface PinCredential {
  readonly staffId: string;
  readonly email: string;
  /** bcrypt hash.  May be null for accounts created before PIN auth was added. */
  readonly pinHash: string | null;
  readonly isActive: boolean;
}

export interface PinAuthRepository {
  /**
   * Returns credentials for all active staff members.
   *
   * Called during login before any session exists, so the implementation MUST
   * use the service-role (privileged) client — the anon client has no RLS
   * access at this point.
   *
   * The result is only used server-side.  pin_hash never reaches the browser.
   */
  listActiveCredentials(): Promise<PinCredential[]>;

  /**
   * Records a single PIN attempt (success or failure) for rate-limiting.
   *
   * @param ip       Requester's IP address.
   * @param staffId  Matched staff ID for successful attempts; null for failures.
   * @param succeeded Whether the attempt was successful.
   */
  recordAttempt(
    ip: string,
    staffId: string | null,
    succeeded: boolean,
  ): Promise<void>;

  /**
   * Returns the number of failed attempts from the given IP in the last
   * `windowSeconds` seconds.
   */
  recentFailedAttempts(ip: string, windowSeconds: number): Promise<number>;

  /**
   * Establishes a Supabase Auth session for the matched staff member.
   *
   * The implementation uses a disposable-password handshake:
   *   1. Admin API sets a fresh random password on the user's auth record.
   *   2. SSR client signs in with that password (writes session cookies).
   *   3. Admin API immediately rotates the password again so the disposable
   *      value cannot be reused.
   *
   * This avoids the deprecated `type: "magiclink"` OTP flow and works with
   * any Supabase project configuration.
   *
   * @param staffId  Auth user ID — needed for admin.updateUserById.
   * @param email    Internal email address stored on the profiles row.
   */
  establishSession(staffId: string, email: string): Promise<void>;

  /**
   * Updates `pin_hash` for a given staff member.
   *
   * Uses the privileged client because the change-PIN path runs server-side
   * under `import "server-only"`, and the application layer has already
   * verified the current PIN before calling this.
   */
  updatePinHash(staffId: string, newPinHash: string): Promise<void>;
}
