import {
  MissingPaymentReferenceError,
  PaymentMismatchError,
} from "../errors/business-errors";
import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import type { PaymentId, SaleId } from "./identifiers";

export const PAYMENT_METHODS = ["cash", "mobile_money"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentProps {
  readonly id: PaymentId;
  readonly saleId: SaleId;
  readonly method: PaymentMethod;
  readonly amount: Money;
  /** Mobile Money transaction reference. Required for mobile_money. */
  readonly reference: string | null;
  readonly recordedAt: Date;
}

/** One tender against a sale. A split sale has two of these. */
export class Payment {
  private constructor(private readonly props: PaymentProps) {
    Object.freeze(this);
  }

  static create(props: PaymentProps): Payment {
    if (!props.amount.isPositive) {
      throw new ValidationError("A payment must be more than zero.", {
        amount: props.amount.toDecimalString(),
      });
    }
    if (props.method === "mobile_money" && !props.reference?.trim()) {
      throw new MissingPaymentReferenceError();
    }
    return new Payment({
      ...props,
      reference: props.reference?.trim() || null,
    });
  }

  get id(): PaymentId {
    return this.props.id;
  }
  get saleId(): SaleId {
    return this.props.saleId;
  }
  get method(): PaymentMethod {
    return this.props.method;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get reference(): string | null {
    return this.props.reference;
  }
  get recordedAt(): Date {
    return this.props.recordedAt;
  }
}

/** A tender line as it exists before the sale is written — no id yet. */
export interface TenderLine {
  readonly method: PaymentMethod;
  readonly amount: Money;
  readonly reference: string | null;
}

/**
 * How a sale is being paid for.
 *
 * This is where the central money rule of the business lives:
 *
 *     cash + mobile money === sale total
 *
 * Not "at least" — exactly. There is no change-giving in this system and no
 * partial payment, so a tender that does not balance is a mistake being caught
 * before it becomes an accounting problem. The same equality is asserted again
 * inside the database function that writes the sale.
 */
export class Tender {
  private constructor(readonly lines: readonly TenderLine[]) {
    Object.freeze(this);
  }

  static of(lines: readonly TenderLine[]): Tender {
    if (lines.length === 0) {
      throw new ValidationError("Record how the sale was paid for.");
    }

    for (const line of lines) {
      if (!line.amount.isPositive) {
        throw new ValidationError(
          `The ${line.method === "cash" ? "cash" : "Mobile Money"} amount must be more than zero.`,
          { method: line.method },
        );
      }
      if (line.method === "mobile_money" && !line.reference?.trim()) {
        throw new MissingPaymentReferenceError();
      }
    }

    const methods = lines.map((line) => line.method);
    if (new Set(methods).size !== methods.length) {
      throw new ValidationError(
        "Record one amount per payment method, not several.",
        { methods },
      );
    }

    return new Tender(
      lines.map((line) => ({
        ...line,
        reference: line.reference?.trim() || null,
      })),
    );
  }

  static cash(amount: Money): Tender {
    return Tender.of([{ method: "cash", amount, reference: null }]);
  }

  static mobileMoney(amount: Money, reference: string): Tender {
    return Tender.of([{ method: "mobile_money", amount, reference }]);
  }

  static split(
    cashAmount: Money,
    mobileMoneyAmount: Money,
    reference: string,
  ): Tender {
    return Tender.of([
      { method: "cash", amount: cashAmount, reference: null },
      { method: "mobile_money", amount: mobileMoneyAmount, reference },
    ]);
  }

  get total(): Money {
    return Money.sum(this.lines.map((line) => line.amount));
  }

  amountFor(method: PaymentMethod): Money {
    const line = this.lines.find((candidate) => candidate.method === method);
    return line ? line.amount : Money.zero();
  }

  get isSplit(): boolean {
    return this.lines.length > 1;
  }

  /**
   * A single label for reporting: "cash", "mobile_money", or "split".
   * Derived, never stored twice — the payment rows remain the source of truth.
   */
  get summaryMethod(): PaymentMethod | "split" {
    return this.isSplit ? "split" : this.lines[0].method;
  }

  /** Throws PaymentMismatchError unless the tender equals the sale total. */
  assertCovers(total: Money): void {
    const tendered = this.total;
    if (!tendered.equals(total)) {
      throw new PaymentMismatchError(total.toMinor(), tendered.toMinor());
    }
  }
}
