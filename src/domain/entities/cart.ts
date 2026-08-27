import { EmptyCartError, InactiveProductError } from "../errors/business-errors";
import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import { Quantity } from "../value-objects/quantity";
import type { ProductId } from "./identifiers";
import type { Product } from "./product";

export interface CartLine {
  readonly productId: ProductId;
  readonly sku: string;
  readonly name: string;
  /**
   * Price captured when the line was added.
   *
   * Snapshotted on purpose: if the owner changes a price mid-transaction, the
   * cashier still charges what they quoted the customer. The server re-reads
   * the catalogue price at checkout and refuses a line whose price the client
   * has tampered with — see CompleteSale.
   */
  readonly unitPrice: Money;
  readonly quantity: Quantity;
}

/**
 * The POS basket before it becomes a sale.
 *
 * Immutable: every operation returns a new Cart. That is what makes the
 * offline-safe draft in the POS trivial to serialise, restore and reason
 * about — there is no hidden mutable state to get out of step with the UI.
 */
export class Cart {
  private constructor(readonly lines: readonly CartLine[]) {
    Object.freeze(this);
  }

  static empty(): Cart {
    return new Cart([]);
  }

  static of(lines: readonly CartLine[]): Cart {
    return new Cart([...lines]);
  }

  /**
   * Adds a product, or increases the quantity if it is already in the basket —
   * which is what tapping the same item twice on a phone should do.
   */
  addProduct(product: Product, quantity: Quantity): Cart {
    if (!product.isActive) {
      throw new InactiveProductError(product.name);
    }

    const existing = this.lines.find((line) => line.productId === product.id);
    if (existing) {
      return this.setQuantity(product.id, existing.quantity.add(quantity));
    }

    return new Cart([
      ...this.lines,
      {
        productId: product.id,
        sku: product.sku.toString(),
        name: product.name,
        unitPrice: product.sellingPrice,
        quantity,
      },
    ]);
  }

  setQuantity(productId: ProductId, quantity: Quantity): Cart {
    if (quantity.isZero) {
      return this.removeProduct(productId);
    }
    if (!this.lines.some((line) => line.productId === productId)) {
      throw new ValidationError("That product is not in the basket.", {
        productId,
      });
    }
    return new Cart(
      this.lines.map((line) =>
        line.productId === productId ? { ...line, quantity } : line,
      ),
    );
  }

  removeProduct(productId: ProductId): Cart {
    return new Cart(this.lines.filter((line) => line.productId !== productId));
  }

  clear(): Cart {
    return Cart.empty();
  }

  lineFor(productId: ProductId): CartLine | undefined {
    return this.lines.find((line) => line.productId === productId);
  }

  static lineTotal(line: CartLine): Money {
    return line.unitPrice.multiply(line.quantity.toNumber());
  }

  get total(): Money {
    return Money.sum(this.lines.map((line) => Cart.lineTotal(line)));
  }

  /** Number of distinct products. */
  get lineCount(): number {
    return this.lines.length;
  }

  /** Total units across all lines — what the badge on the cart icon shows. */
  get unitCount(): number {
    return this.lines.reduce(
      (total, line) => total + line.quantity.toNumber(),
      0,
    );
  }

  get isEmpty(): boolean {
    return this.lines.length === 0;
  }

  assertNotEmpty(): void {
    if (this.isEmpty) {
      throw new EmptyCartError();
    }
  }
}
