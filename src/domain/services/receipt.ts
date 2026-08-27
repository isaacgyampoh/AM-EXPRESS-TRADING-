import type { BusinessSettings } from "../entities/business-settings";
import type { PaymentMethod } from "../entities/payment";
import type { Sale } from "../entities/sale";
import type { Money } from "../value-objects/money";

export interface ReceiptPaymentLine {
  readonly method: PaymentMethod;
  readonly amount: Money;
  readonly reference: string | null;
}

export interface ReceiptItemLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

export interface Receipt {
  readonly businessName: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly receiptNumber: string;
  readonly issuedAt: Date;
  readonly cashierName: string;
  readonly items: readonly ReceiptItemLine[];
  readonly total: Money;
  readonly payments: readonly ReceiptPaymentLine[];
  readonly paymentSummary: PaymentMethod | "split";
  readonly footer: string | null;
  readonly isVoided: boolean;
  /** True on every render after the first. Printed so a reprint is honest. */
  readonly isReprint: boolean;
}

/**
 * Turns a stored sale plus the business's own details into the thing a
 * customer is handed.
 *
 * A pure projection: no formatting, no currency symbols, no HTML. The
 * presentation layer decides how a Money renders and what a printed page looks
 * like; this decides what is *on* the receipt, which is a business question.
 */
export class ReceiptBuilder {
  static from(
    sale: Sale,
    settings: BusinessSettings,
    options: { isReprint?: boolean } = {},
  ): Receipt {
    return {
      businessName: settings.businessName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      receiptNumber: sale.receiptNumber,
      issuedAt: sale.soldAt,
      cashierName: sale.cashierName,
      items: sale.items.map((item) => ({
        sku: item.sku,
        name: item.name,
        quantity: item.quantity.toNumber(),
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      total: sale.total,
      payments: sale.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
      })),
      paymentSummary: sale.paymentSummary,
      footer: settings.receiptFooter,
      isVoided: sale.isVoided,
      isReprint: options.isReprint ?? false,
    };
  }
}
