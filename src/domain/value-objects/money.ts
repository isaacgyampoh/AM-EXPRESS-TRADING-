import { ValidationError } from "../errors/domain-error";

/**
 * Money, held as a whole number of minor units (pesewas for GH₵).
 *
 * Nothing in this system ever puts a monetary amount in a JavaScript float.
 * `0.1 + 0.2 !== 0.3` is not an acceptable property for a cash drawer, and a
 * POS that is off by a pesewa per transaction is off by real money at the end
 * of the month. Every amount enters as an integer of minor units or as a
 * decimal *string* that is parsed digit by digit, and leaves the same way.
 *
 * The database side of this is NUMERIC(14,2) — never DOUBLE PRECISION.
 */
export class Money {
  /** Minor units. 1550 === GH₵15.50. */
  private readonly minor: number;

  private constructor(minor: number, readonly currency: string) {
    this.minor = minor;
    Object.freeze(this);
  }

  // -- construction ---------------------------------------------------------

  /** Build from a whole number of minor units (pesewas). */
  static fromMinor(minor: number, currency = "GHS"): Money {
    if (!Number.isInteger(minor)) {
      throw new ValidationError(
        "A money amount must be a whole number of minor units.",
        { minor },
      );
    }
    if (!Number.isSafeInteger(minor)) {
      throw new ValidationError("Money amount is out of range.", { minor });
    }
    return new Money(minor, currency);
  }

  /**
   * Build from a decimal string such as "15.50", "15.5", "15" or "-3.05".
   *
   * Deliberately string-based: this is what arrives from a form field, and
   * routing it through Number() first would reintroduce binary rounding before
   * we ever got to the integer representation.
   */
  static fromDecimalString(input: string, currency = "GHS"): Money {
    const raw = input.trim();
    if (raw === "") {
      throw new ValidationError("Enter an amount.", { input });
    }

    const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
    if (!match) {
      throw new ValidationError(
        `'${input}' is not a valid amount. Use up to two decimal places, e.g. 15.50.`,
        { input },
      );
    }

    const [, sign, whole, fraction = ""] = match;
    const pesewas = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(pesewas)) {
      throw new ValidationError("That amount is too large.", { input });
    }

    return new Money(sign === "-" ? -pesewas : pesewas, currency);
  }

  /**
   * Build from a value that may already be a number or a decimal string.
   * Numbers are only accepted when they are whole-pesewa exact.
   */
  static from(value: number | string, currency = "GHS"): Money {
    if (typeof value === "string") {
      return Money.fromDecimalString(value, currency);
    }
    if (!Number.isFinite(value)) {
      throw new ValidationError("Enter a valid amount.", { value });
    }
    const scaled = Math.round(value * 100);
    if (Math.abs(value * 100 - scaled) > 1e-6) {
      throw new ValidationError(
        "Amounts cannot be finer than one pesewa.",
        { value },
      );
    }
    return Money.fromMinor(scaled, currency);
  }

  static zero(currency = "GHS"): Money {
    return new Money(0, currency);
  }

  // -- arithmetic -----------------------------------------------------------

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromMinor(this.minor - other.minor, this.currency);
  }

  /**
   * Multiply by a whole count — a line total is a unit price times a quantity.
   * Fractional multipliers are refused rather than silently rounded, because
   * the rounding rule would be a business decision, not a maths one.
   */
  multiply(count: number): Money {
    if (!Number.isInteger(count)) {
      throw new ValidationError(
        "Money can only be multiplied by a whole quantity.",
        { count },
      );
    }
    return Money.fromMinor(this.minor * count, this.currency);
  }

  negate(): Money {
    return Money.fromMinor(-this.minor, this.currency);
  }

  static sum(amounts: readonly Money[], currency = "GHS"): Money {
    return amounts.reduce<Money>(
      (total, amount) => total.add(amount),
      Money.zero(currency),
    );
  }

  // -- comparison -----------------------------------------------------------

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  /** -1, 0 or 1. */
  compare(other: Money): number {
    this.assertSameCurrency(other);
    return this.minor === other.minor ? 0 : this.minor < other.minor ? -1 : 1;
  }

  isGreaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  isLessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  get isZero(): boolean {
    return this.minor === 0;
  }

  get isNegative(): boolean {
    return this.minor < 0;
  }

  get isPositive(): boolean {
    return this.minor > 0;
  }

  // -- output ---------------------------------------------------------------

  /** Whole minor units, for persistence and transport. */
  toMinor(): number {
    return this.minor;
  }

  /**
   * "15.50" — the canonical decimal form. This is what goes into a NUMERIC
   * column and what the formatter in lib/utils turns into "GH₵15.50".
   */
  toDecimalString(): string {
    const negative = this.minor < 0;
    const absolute = Math.abs(this.minor);
    const whole = Math.trunc(absolute / 100);
    const fraction = (absolute % 100).toString().padStart(2, "0");
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  }

  toString(): string {
    return this.toDecimalString();
  }

  toJSON(): { minor: number; currency: string } {
    return { minor: this.minor, currency: this.currency };
  }

  // -- internals ------------------------------------------------------------

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new ValidationError(
        `Cannot combine ${this.currency} with ${other.currency}.`,
        { left: this.currency, right: other.currency },
      );
    }
  }
}
