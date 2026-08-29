/**
 * Credentials row fetched for PIN verification.
 *
 * Read from `staff_credentials`, which only the service-role client can reach.
 * Never serialised to the client: a 4-digit PIN hash is ten thousand guesses
 * from being broken offline.
 */
export interface PinCredential {
  readonly staffId: string;
  readonly email: string;
  /** bcrypt hash.  Null for an account that has no PIN set yet. */
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
   * The result is only used server-side.  The hash never reaches the browser.
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
   * Failed attempts from this IP since the last *successful* one, within the
   * window.
   *
   * "Since the last success" rather than a plain count, because a shop is one
   * public IP address. Counting every failure in the window means one cashier
   * fumbling their PIN ten times locks the till for everybody, mid-trade, with
   * a queue at the counter — an outage the business feels immediately and an
   * attacker does not.
   *
   * Anyone proving they hold a valid PIN clears the counter. A real brute-force
   * attacker has no valid PIN to clear it with, so the lockout still closes on
   * them at the same threshold.
   */
  failedAttemptsSinceLastSuccess(
    ip: string,
    windowSeconds: number,
  ): Promise<number>;

  /**
   * Establishes a Supabase Auth session for the matched staff member.
   *
   * The caller has already verified the PIN. The implementation mints a real
   * GoTrue session so that every query afterwards runs under RLS as this
   * person, rather than the application carrying its own idea of who is
   * signed in.
   *
   * @param staffId  Auth user ID.
   * @param email    Internal email address stored on the profiles row.
   */
  establishSession(staffId: string, email: string): Promise<void>;

  /**
   * Updates the stored PIN hash for a given staff member.
   *
   * Uses the privileged client: `staff_credentials` has no RLS policies, and
   * the application layer has already verified the current PIN before calling.
   */
  updatePinHash(staffId: string, newPinHash: string): Promise<void>;
}
