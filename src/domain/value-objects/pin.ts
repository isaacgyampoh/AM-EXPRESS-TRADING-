import { ValidationError } from "../errors/domain-error";

/**
 * A 4-digit numeric PIN.
 *
 * The value itself is deliberately not exposed after construction — callers
 * pass the raw string to the hashing layer and never need to read it back out
 * of this object.  The value object exists to ensure the string was validated
 * before it reaches any security-sensitive call.
 */
export class Pin {
  private constructor(private readonly _value: string) {
    Object.freeze(this);
  }

  /**
   * Parses and validates a PIN string.
   *
   * Throws `ValidationError` if the input is not exactly 4 decimal digits.
   * Leading zeros are intentional and preserved — 0000, 0123 are valid PINs.
   */
  static parse(raw: unknown): Pin {
    if (typeof raw !== "string") {
      throw new ValidationError("PIN must be a 4-digit number.");
    }
    if (!/^\d{4}$/.test(raw)) {
      throw new ValidationError("PIN must be exactly 4 digits.");
    }
    return new Pin(raw);
  }

  /** The 4-character digit string.  Pass to the hashing layer; never log. */
  get value(): string {
    return this._value;
  }
}
