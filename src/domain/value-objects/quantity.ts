import { ValidationError } from "../errors/domain-error";

/**
 * A count of stock units.
 *
 * AM Express Trading sells discrete goods, so quantity is a whole number.
 * Keeping it integral means stock arithmetic is exact and a movement ledger
 * always reconciles: sum(movements) === quantity on hand, with no drift.
 *
 * If the business later sells by weight, this is the single place to change —
 * that is the point of it being a value object rather than a bare `number`
 * scattered through the codebase.
 */
export class Quantity {
  private constructor(private readonly value: number) {
    Object.freeze(this);
  }

  /** A quantity that may be zero or positive. Used for stock on hand. */
  static of(value: number): Quantity {
    if (!Number.isInteger(value)) {
      throw new ValidationError("Quantity must be a whole number of units.", {
        value,
      });
    }
    if (!Number.isSafeInteger(value)) {
      throw new ValidationError("Quantity is out of range.", { value });
    }
    if (value < 0) {
      throw new ValidationError("Quantity cannot be negative.", { value });
    }
    return new Quantity(value);
  }

  /** A quantity that must be at least one. Used for sale and stock-in lines. */
  static positive(value: number): Quantity {
    const quantity = Quantity.of(value);
    if (quantity.value === 0) {
      throw new ValidationError("Quantity must be at least 1.", { value });
    }
    return quantity;
  }

  static zero(): Quantity {
    return new Quantity(0);
  }

  add(other: Quantity): Quantity {
    return Quantity.of(this.value + other.value);
  }

  /** Throws if the result would be negative — stock cannot go below zero. */
  subtract(other: Quantity): Quantity {
    return Quantity.of(this.value - other.value);
  }

  isAtLeast(other: Quantity): boolean {
    return this.value >= other.value;
  }

  isLessThan(other: Quantity): boolean {
    return this.value < other.value;
  }

  equals(other: Quantity): boolean {
    return this.value === other.value;
  }

  get isZero(): boolean {
    return this.value === 0;
  }

  toNumber(): number {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }

  toJSON(): number {
    return this.value;
  }
}
