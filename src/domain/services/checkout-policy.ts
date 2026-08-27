import type { Cart } from "../entities/cart";
import type { ProductId } from "../entities/identifiers";
import type { InventoryItem } from "../entities/inventory-item";
import type { Tender } from "../entities/payment";
import type { Product } from "../entities/product";
import {
  InactiveProductError,
  InsufficientStockError,
} from "../errors/business-errors";
import { NotFoundError, ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";

export interface CheckoutContext {
  /** Catalogue records, re-read on the server. Never taken from the client. */
  readonly products: ReadonlyMap<ProductId, Product>;
  readonly stock: ReadonlyMap<ProductId, InventoryItem>;
}

/**
 * Everything that must be true before a sale may be written.
 *
 * This runs on the server against freshly-read catalogue and stock, using a
 * cart that arrived from a phone. The client is treated as a source of
 * *intent* — which products, how many — and never as a source of prices or
 * totals. Whatever unit price the browser sent is discarded and replaced with
 * the catalogue price; a client that inflates a discount or deflates a total
 * changes nothing about what gets charged.
 *
 * Stock is checked here for a fast, specific error message. It is checked
 * again, authoritatively, inside the database transaction — two cashiers
 * selling the last unit at the same moment is a race only the database can
 * settle.
 */
export class CheckoutPolicy {
  /**
   * Re-prices the cart from the catalogue and returns the trustworthy version.
   * The returned lines are what the sale is written from.
   */
  static reprice(cart: Cart, context: CheckoutContext): RepricedCheckout {
    cart.assertNotEmpty();

    const lines = cart.lines.map((line) => {
      const product = context.products.get(line.productId);
      if (!product) {
        throw new NotFoundError("Product", line.productId);
      }
      if (!product.isActive) {
        throw new InactiveProductError(product.name);
      }

      const stock = context.stock.get(line.productId);
      if (!stock) {
        throw new NotFoundError("Stock record", product.name);
      }
      if (!stock.canFulfil(line.quantity)) {
        throw new InsufficientStockError(
          product.name,
          line.quantity.toNumber(),
          stock.quantityOnHand.toNumber(),
        );
      }

      // Authoritative price and cost come from the catalogue, not the request.
      const unitPrice = product.sellingPrice;
      return {
        productId: product.id,
        sku: product.sku.toString(),
        name: product.name,
        unitPrice,
        unitCost: product.costPrice,
        quantity: line.quantity,
        lineTotal: unitPrice.multiply(line.quantity.toNumber()),
      };
    });

    // A cart cannot list the same product twice; that would let one line pass
    // the stock check while the pair of them exceeds what is on hand.
    const productIds = lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new ValidationError(
        "The same product appears more than once in the basket.",
      );
    }

    const total = Money.sum(lines.map((line) => line.lineTotal));
    if (!total.isPositive) {
      throw new ValidationError("A sale must come to more than zero.");
    }

    return { lines, total };
  }

  /**
   * The payment rule: cash + Mobile Money must equal the server-computed total
   * exactly. Enforced against the repriced total, never the client's figure.
   */
  static assertTenderBalances(tender: Tender, total: Money): void {
    tender.assertCovers(total);
  }
}

export interface RepricedLine {
  readonly productId: ProductId;
  readonly sku: string;
  readonly name: string;
  readonly unitPrice: Money;
  readonly unitCost: Money | null;
  readonly quantity: import("../value-objects/quantity").Quantity;
  readonly lineTotal: Money;
}

export interface RepricedCheckout {
  readonly lines: readonly RepricedLine[];
  readonly total: Money;
}
