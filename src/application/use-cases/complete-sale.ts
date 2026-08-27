import { Cart } from "@/domain/entities/cart";
import { asProductId, type ProductId } from "@/domain/entities/identifiers";
import type { InventoryItem } from "@/domain/entities/inventory-item";
import { Tender } from "@/domain/entities/payment";
import type { Product } from "@/domain/entities/product";
import type { Staff } from "@/domain/entities/staff";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type { ProductRepository } from "@/domain/repositories/product-repository";
import type { SalesRepository } from "@/domain/repositories/sales-repository";
import type { SettingsRepository } from "@/domain/repositories/settings-repository";
import { CheckoutPolicy } from "@/domain/services/checkout-policy";
import { ReceiptBuilder } from "@/domain/services/receipt";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";
import { toReceiptDto, toSaleDto, type ReceiptDto, type SaleDto } from "../dto/sale-dto";
import { parseOrThrow } from "../validators/product-validators";
import {
  completeSaleSchema,
  type CompleteSaleInput,
} from "../validators/sale-validators";

export interface CompleteSaleResult {
  readonly sale: SaleDto;
  readonly receipt: ReceiptDto;
  /** True when this request matched an already-recorded transaction. */
  readonly wasAlreadyRecorded: boolean;
}

/**
 * Takes payment and records the sale.
 *
 * The rules are checked twice, on purpose, and the two checks are not
 * redundant:
 *
 *   Here, against a fresh read of the catalogue and stock, so the cashier gets
 *   a specific, immediate error — "Not enough stock for Rice 5kg: 4 requested,
 *   3 available" — rather than a generic database failure.
 *
 *   Again inside complete_sale(), under row locks, where it is authoritative.
 *   Two cashiers selling the last unit at the same instant is a race only the
 *   database can settle, and the check here cannot see the other cashier.
 *
 * Deleting either one would be a mistake. The first is about the person at the
 * till; the second is about the truth.
 */
export class CompleteSale {
  constructor(
    private readonly sales: SalesRepository,
    private readonly products: ProductRepository,
    private readonly inventory: InventoryRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async execute(
    actor: Staff,
    input: CompleteSaleInput,
  ): Promise<CompleteSaleResult> {
    actor.assertCan("sale:create");

    const data = parseOrThrow(completeSaleSchema, input);

    // ---------------------------------------------------------------------
    // Already done?
    // ---------------------------------------------------------------------
    // A retry after a dropped connection carries the same transaction id. The
    // database enforces this too — this check is here so the common case
    // returns the original receipt without attempting the write at all.
    const existing = await this.sales.findByClientTransactionId(
      data.clientTransactionId,
    );
    if (existing) {
      const settings = await this.settings.get();
      return {
        sale: toSaleDto(existing),
        receipt: toReceiptDto(
          ReceiptBuilder.from(existing, settings, { isReprint: true }),
          settings.currencySymbol,
        ),
        wasAlreadyRecorded: true,
      };
    }

    // ---------------------------------------------------------------------
    // Price the basket from the catalogue
    // ---------------------------------------------------------------------
    const productIds = data.items.map((item) => asProductId(item.productId));
    const [products, stock] = await Promise.all([
      this.products.findByIds(productIds),
      this.inventory.findByProductIds(productIds),
    ]);

    const productsById = new Map<ProductId, Product>(
      products.map((product) => [product.id, product]),
    );
    const stockById = new Map<ProductId, InventoryItem>(
      stock.map((item) => [item.productId, item]),
    );

    const cart = Cart.of(
      data.items.map((item) => {
        const productId = asProductId(item.productId);
        const product = productsById.get(productId);
        if (!product) throw new NotFoundError("Product", item.productId);
        return {
          productId,
          sku: product.sku.toString(),
          name: product.name,
          // Whatever the client thought the price was is irrelevant; this is
          // the catalogue price, and CheckoutPolicy re-reads it regardless.
          unitPrice: product.sellingPrice,
          quantity: Quantity.positive(item.quantity),
        };
      }),
    );

    const priced = CheckoutPolicy.reprice(cart, {
      products: productsById,
      stock: stockById,
    });

    // ---------------------------------------------------------------------
    // Cash + Mobile Money must equal that total, exactly
    // ---------------------------------------------------------------------
    const tender = Tender.of(
      data.payments.map((payment) => ({
        method: payment.method,
        amount: Money.fromDecimalString(payment.amount),
        reference: payment.reference ?? null,
      })),
    );

    CheckoutPolicy.assertTenderBalances(tender, priced.total);

    // ---------------------------------------------------------------------
    // Write it, atomically
    // ---------------------------------------------------------------------
    const sale = await this.sales.record({
      clientTransactionId: data.clientTransactionId,
      lines: priced.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity.toNumber(),
      })),
      payments: tender.lines.map((line) => ({
        method: line.method,
        amount: line.amount,
        reference: line.reference,
      })),
    });

    const settings = await this.settings.get();

    return {
      sale: toSaleDto(sale),
      receipt: toReceiptDto(
        ReceiptBuilder.from(sale, settings),
        settings.currencySymbol,
      ),
      wasAlreadyRecorded: false,
    };
  }
}
