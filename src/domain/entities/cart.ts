import { EmptyCartError, InactiveProductError } from "../errors/business-errors";
import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import { Quantity } from "../value-objects/quantity";
import type { ProductId } from "./identifiers";
import type { Product } from "./product";
import type { PriceTier } from "./product-unit";

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
  /**
   * Which selling unit this line is for — the Box rather than the Piece.
   *
   * Optional so a basket built before units existed, or restored from an older
   * offline draft, still checks out: the server treats a missing unit as the
   * product's default.
   */
  readonly productUnitId?: string;
  /** Shown on the line and the receipt: "2 Box", not a bare "2". */
  readonly unitName?: string;
  /** How many base units one of these removes from stock. */
  readonly baseQuantity?: number;
  /** Omitted means retail. */
  readonly priceTier?: PriceTier;
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
   *
   * `unitId` and `tier` choose which of the product's prices applies. The
   * price is taken from that unit, never computed: asking for wholesale on a
   * unit that has no wholesale price throws here, the same refusal the
   * database makes, so the cashier learns before the customer is waiting.
   *
   * A basket holds one line per product. The database supports a Box and loose
   * Pieces of the same product in one sale; this basket does not offer it yet,
   * and changing the unit re-prices the existing line rather than adding a
   * second.
   */
  addProduct(
    product: Product,
    quantity: Quantity,
    options: { unitId?: string; tier?: PriceTier } = {},
  ): Cart {
    if (!product.isActive) {
      throw new InactiveProductError(product.name);
    }

    const tier = options.tier ?? "retail";
    const unit = options.unitId
      ? product.unit(options.unitId)
      : product.defaultUnit;

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
        // priceFor throws when wholesale was asked for and none is set.
        unitPrice: unit ? unit.priceFor(tier) : product.sellingPrice,
        quantity,
        productUnitId: unit?.id,
        unitName: unit?.unitName,
        baseQuantity: unit?.baseQuantity,
        priceTier: tier,
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
