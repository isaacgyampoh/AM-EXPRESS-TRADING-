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
   * @param ip   Requester's IP address.
   * @param staffId  Matched staff ID for successful attempts; null for failures.
   * @param succeeded  Whether the attempt was successful.
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
   * Establishes a Supabase Auth session for the given internal email address.
   *
   * Internally generates a short-lived magic-link token via the admin API and
   * immediately exchanges it server-side.  The session cookies are written to
   * the response by the SSR client's cookie handler.
   *
   * Throws on failure so the caller can treat it as a hard error.
   */
  establishSession(email: string): Promise<void>;

  /**
   * Updates `pin_hash` for a given staff member (admin-only path).
   *
   * Used when an admin resets another staff member's PIN.  Uses the privileged
   * client because RLS only allows admins to update profiles.
   */
  updatePinHash(staffId: string, newPinHash: string): Promise<void>;
}
