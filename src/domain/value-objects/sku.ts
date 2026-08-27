import { ValidationError } from "../errors/domain-error";

/**
 * A stock keeping unit code.
 *
 * Normalised to uppercase with surrounding whitespace stripped so that
 * "am-100", "AM-100 " and "AM-100" are the same product to a cashier typing
 * fast on a phone, and so the database's unique index means what people think
 * it means.
 */
export class Sku {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static of(input: string): Sku {
    const normalised = input.trim().toUpperCase();

    if (normalised.length === 0) {
      throw new ValidationError("Enter a SKU.", { input });
    }
    if (normalised.length > 40) {
      throw new ValidationError("A SKU can be at most 40 characters.", {
        input,
      });
    }
    if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(normalised)) {
      throw new ValidationError(
        "A SKU may contain letters, numbers, and the characters . _ / - and must start with a letter or number.",
        { input },
      );
    }

    return new Sku(normalised);
  }

  equals(other: Sku): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
