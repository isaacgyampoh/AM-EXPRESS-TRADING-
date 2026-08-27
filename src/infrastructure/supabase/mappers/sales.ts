import {
  asPaymentId,
  asProductId,
  asSaleId,
  asSaleItemId,
  asStaffId,
} from "@/domain/entities/identifiers";
import { Payment } from "@/domain/entities/payment";
import { Sale, SaleItem } from "@/domain/entities/sale";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";

/**
 * The row shape a sale is read back in: the sale, its items, its payments and
 * the cashier's name, in one round trip rather than four.
 */
export interface SaleRowWithChildren {
  id: string;
  receipt_number: string;
  cashier_id: string;
  total: string;
  status: "completed" | "voided";
  client_transaction_id: string;
  sold_at: string;
  profiles: { full_name: string } | null;
  sale_items: {
    id: string;
    product_id: string;
    sku: string;
    name: string;
    unit_price: string;
    unit_cost: string | null;
    quantity: number;
    line_total: string;
  }[];
  payments: {
    id: string;
    method: "cash" | "mobile_money";
    amount: string;
    reference: string | null;
    recorded_at: string;
  }[];
}

export function toSale(row: SaleRowWithChildren): Sale {
  const saleId = asSaleId(row.id);

  const items = row.sale_items.map((item) =>
    SaleItem.create({
      id: asSaleItemId(item.id),
      productId: asProductId(item.product_id),
      sku: item.sku,
      name: item.name,
      unitPrice: Money.fromDecimalString(item.unit_price),
      quantity: Quantity.positive(item.quantity),
      lineTotal: Money.fromDecimalString(item.line_total),
      unitCost: item.unit_cost ? Money.fromDecimalString(item.unit_cost) : null,
    }),
  );

  const payments = row.payments.map((payment) =>
    Payment.create({
      id: asPaymentId(payment.id),
      saleId,
      method: payment.method,
      amount: Money.fromDecimalString(payment.amount),
      reference: payment.reference,
      recordedAt: new Date(payment.recorded_at),
    }),
  );

  return Sale.create({
    id: saleId,
    receiptNumber: row.receipt_number,
    cashierId: asStaffId(row.cashier_id),
    // A sale keeps its cashier reference forever — staff are deactivated,
    // never deleted — so this fallback should be unreachable.
    cashierName: row.profiles?.full_name ?? "Unknown cashier",
    items,
    total: Money.fromDecimalString(row.total),
    payments,
    status: row.status,
    clientTransactionId: row.client_transaction_id,
    soldAt: new Date(row.sold_at),
  });
}

/** The select string that produces a SaleRowWithChildren. */
export const SALE_SELECT = `
  id,
  receipt_number,
  cashier_id,
  total,
  status,
  client_transaction_id,
  sold_at,
  profiles:cashier_id ( full_name ),
  sale_items ( id, product_id, sku, name, unit_price, unit_cost, quantity, line_total ),
  payments ( id, method, amount, reference, recorded_at )
` as const;
