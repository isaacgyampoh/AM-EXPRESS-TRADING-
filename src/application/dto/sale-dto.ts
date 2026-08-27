import type { PaymentMethod } from "@/domain/entities/payment";
import type { Sale } from "@/domain/entities/sale";
import type { Receipt } from "@/domain/services/receipt";

export interface SaleItemDto {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly lineTotal: string;
}

export interface PaymentDto {
  readonly method: PaymentMethod;
  readonly amount: string;
  readonly reference: string | null;
}

export interface SaleDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly cashierName: string;
  readonly total: string;
  readonly status: "completed" | "voided";
  readonly paymentSummary: PaymentMethod | "split";
  readonly items: readonly SaleItemDto[];
  readonly payments: readonly PaymentDto[];
  /** ISO 8601, formatted in the browser so it lands in the reader's timezone. */
  readonly soldAt: string;
  readonly unitCount: number;
}

export function toSaleDto(sale: Sale): SaleDto {
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    cashierName: sale.cashierName,
    total: sale.total.toDecimalString(),
    status: sale.status,
    paymentSummary: sale.paymentSummary,
    items: sale.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity.toNumber(),
      unitPrice: item.unitPrice.toDecimalString(),
      lineTotal: item.lineTotal.toDecimalString(),
    })),
    payments: sale.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toDecimalString(),
      reference: payment.reference,
    })),
    soldAt: sale.soldAt.toISOString(),
    unitCount: sale.unitCount,
  };
}

export interface ReceiptDto {
  readonly businessName: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly currencySymbol: string;
  readonly receiptNumber: string;
  readonly issuedAt: string;
  readonly cashierName: string;
  readonly items: readonly {
    readonly sku: string;
    readonly name: string;
    readonly quantity: number;
    readonly unitPrice: string;
    readonly lineTotal: string;
  }[];
  readonly total: string;
  readonly payments: readonly PaymentDto[];
  readonly paymentSummary: PaymentMethod | "split";
  readonly footer: string | null;
  readonly isVoided: boolean;
  readonly isReprint: boolean;
}

export function toReceiptDto(
  receipt: Receipt,
  currencySymbol: string,
): ReceiptDto {
  return {
    businessName: receipt.businessName,
    address: receipt.address,
    phone: receipt.phone,
    email: receipt.email,
    currencySymbol,
    receiptNumber: receipt.receiptNumber,
    issuedAt: receipt.issuedAt.toISOString(),
    cashierName: receipt.cashierName,
    items: receipt.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toDecimalString(),
      lineTotal: item.lineTotal.toDecimalString(),
    })),
    total: receipt.total.toDecimalString(),
    payments: receipt.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toDecimalString(),
      reference: payment.reference,
    })),
    paymentSummary: receipt.paymentSummary,
    footer: receipt.footer,
    isVoided: receipt.isVoided,
    isReprint: receipt.isReprint,
  };
}
