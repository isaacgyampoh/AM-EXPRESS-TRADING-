import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";
import { Sku } from "../value-objects/sku";
import type { CategoryId, ProductId } from "./identifiers";

export interface ProductProps {
  readonly id: ProductId;
  readonly sku: Sku;
  readonly name: string;
  readonly categoryId: CategoryId | null;
  readonly sellingPrice: Money;
  /** Null when the business has not recorded what this cost them. */
  readonly costPrice: Money | null;
  readonly minimumStock: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A thing AM Express Trading sells.
 *
 * Stock level deliberately does NOT live here — it lives on InventoryItem.
 * A product is a catalogue fact that changes rarely; stock is a ledger balance
 * that changes on every sale. Keeping them apart is what lets the movement
 * history be the source of truth for the balance.
 */
export class Product {
  private constructor(private readonly props: ProductProps) {
    Object.freeze(this);
  }

  static create(props: ProductProps): Product {
    const name = props.name.trim();

    if (name.length === 0) {
      throw new ValidationError("Enter a product name.");
    }
    if (name.length > 120) {
      throw new ValidationError("A product name can be at most 120 characters.");
    }
    if (props.sellingPrice.isNegative) {
      throw new ValidationError("Selling price cannot be negative.", {
        sellingPrice: props.sellingPrice.toDecimalString(),
      });
    }
    if (props.costPrice?.isNegative) {
      throw new ValidationError("Cost price cannot be negative.", {
        costPrice: props.costPrice.toDecimalString(),
      });
    }
    if (!Number.isInteger(props.minimumStock) || props.minimumStock < 0) {
      throw new ValidationError(
        "Minimum stock must be zero or a whole number of units.",
        { minimumStock: props.minimumStock },
      );
    }

    return new Product({ ...props, name });
  }

  get id(): ProductId {
    return this.props.id;
  }
  get sku(): Sku {
    return this.props.sku;
  }
  get name(): string {
    return this.props.name;
  }
  get categoryId(): CategoryId | null {
    return this.props.categoryId;
  }
  get sellingPrice(): Money {
    return this.props.sellingPrice;
  }
  get costPrice(): Money | null {
    return this.props.costPrice;
  }
  get minimumStock(): number {
    return this.props.minimumStock;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Margin per unit, only when cost is actually known.
   *
   * Returns null rather than assuming a zero cost — a "100% margin" that is
   * really "we never entered the cost" is the kind of number that gets a
   * business into trouble. Reports must treat null as "not calculable".
   */
  get unitMargin(): Money | null {
    if (!this.props.costPrice) return null;
    return this.props.sellingPrice.subtract(this.props.costPrice);
  }

  get hasReliableCost(): boolean {
    return this.props.costPrice !== null && this.props.costPrice.isPositive;
  }

  withChanges(
    changes: Partial<
      Pick<
        ProductProps,
        | "name"
        | "categoryId"
        | "sellingPrice"
        | "costPrice"
        | "minimumStock"
        | "isActive"
        | "sku"
      >
    >,
  ): Product {
    return Product.create({
      ...this.props,
      ...changes,
      updatedAt: new Date(),
    });
  }

  deactivate(): Product {
    return this.withChanges({ isActive: false });
  }

  activate(): Product {
    return this.withChanges({ isActive: true });
  }
}
