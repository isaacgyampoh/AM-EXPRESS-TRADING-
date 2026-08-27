import { DomainError } from "./domain-error";

/**
 * A sale line asked for more units than exist on hand.
 *
 * This is checked twice on purpose: once in the domain (fast feedback in the
 * POS, using the stock snapshot the cashier is looking at) and once inside the
 * database transaction (authoritative, immune to two cashiers racing).
 */
export class InsufficientStockError extends DomainError {
  readonly code = "INSUFFICIENT_STOCK";

  constructor(
    readonly productName: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(
      `Not enough stock for ${productName}: ${requested} requested, ${available} available.`,
      { productName, requested, available },
    );
  }
}

/**
 * Cash + Mobile Money did not add up to the sale total.
 *
 * The core money rule of the business. Amounts are reported in minor units
 * (pesewas) so the message layer can format them however it likes.
 */
export class PaymentMismatchError extends DomainError {
  readonly code = "PAYMENT_MISMATCH";

  constructor(
    readonly totalMinor: number,
    readonly tenderedMinor: number,
  ) {
    const difference = tenderedMinor - totalMinor;
    super(
      difference > 0
        ? `Payment exceeds the sale total by ${difference} pesewas.`
        : `Payment is short of the sale total by ${-difference} pesewas.`,
      { totalMinor, tenderedMinor, differenceMinor: difference },
    );
  }
}

/** A Mobile Money payment was recorded without its transaction reference. */
export class MissingPaymentReferenceError extends DomainError {
  readonly code = "MISSING_PAYMENT_REFERENCE";

  constructor() {
    super("A Mobile Money payment needs its transaction reference.");
  }
}

/** Checkout was attempted with nothing in the cart. */
export class EmptyCartError extends DomainError {
  readonly code = "EMPTY_CART";

  constructor() {
    super("Add at least one product before completing the sale.");
  }
}

/** An inactive product cannot be sold. */
export class InactiveProductError extends DomainError {
  readonly code = "INACTIVE_PRODUCT";

  constructor(readonly productName: string) {
    super(`${productName} is not active and cannot be sold.`, { productName });
  }
}

/** A stock adjustment would drive quantity on hand below zero. */
export class NegativeStockError extends DomainError {
  readonly code = "NEGATIVE_STOCK";

  constructor(
    readonly productName: string,
    readonly resulting: number,
  ) {
    super(
      `That adjustment would leave ${productName} at ${resulting} units. Stock cannot go below zero.`,
      { productName, resulting },
    );
  }
}

/** A deactivated staff member cannot sign in or transact. */
export class InactiveStaffError extends DomainError {
  readonly code = "INACTIVE_STAFF";

  constructor(readonly staffName: string) {
    super(`${staffName}'s account is deactivated.`, { staffName });
  }
}

/**
 * The same client transaction id was submitted twice.
 *
 * Not strictly an error for the caller — the use case turns this into the
 * original sale — but the domain needs a way to name it.
 */
export class DuplicateTransactionError extends DomainError {
  readonly code = "DUPLICATE_TRANSACTION";

  constructor(readonly clientTransactionId: string) {
    super(`Transaction ${clientTransactionId} was already recorded.`, {
      clientTransactionId,
    });
  }
}
