import { NegativeStockError } from "../errors/business-errors";
import { Quantity } from "../value-objects/quantity";
import type { ProductId } from "./identifiers";

export interface InventoryItemProps {
  readonly productId: ProductId;
  readonly productName: string;
  readonly quantityOnHand: Quantity;
  readonly minimumStock: number;
  readonly updatedAt: Date;
}

/**
 * The current stock balance for one product.
 *
 * Every method returns a new instance rather than mutating, so a caller can
 * project "what would stock be after this cart?" without touching the record
 * it started from. The authoritative decrement still happens inside the
 * database transaction — this exists so the POS can refuse an impossible sale
 * before it ever reaches the network.
 */
export class InventoryItem {
  private constructor(private readonly props: InventoryItemProps) {
    Object.freeze(this);
  }

  static create(props: InventoryItemProps): InventoryItem {
    return new InventoryItem(props);
  }

  get productId(): ProductId {
    return this.props.productId;
  }
  get productName(): string {
    return this.props.productName;
  }
  get quantityOnHand(): Quantity {
    return this.props.quantityOnHand;
  }
  get minimumStock(): number {
    return this.props.minimumStock;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isLowStock(): boolean {
    return this.props.quantityOnHand.toNumber() <= this.props.minimumStock;
  }

  get isOutOfStock(): boolean {
    return this.props.quantityOnHand.isZero;
  }

  canFulfil(requested: Quantity): boolean {
    return this.props.quantityOnHand.isAtLeast(requested);
  }

  receive(amount: Quantity): InventoryItem {
    return new InventoryItem({
      ...this.props,
      quantityOnHand: this.props.quantityOnHand.add(amount),
      updatedAt: new Date(),
    });
  }

  /** Removes stock. Throws rather than allowing a negative balance. */
  release(amount: Quantity): InventoryItem {
    const resulting = this.props.quantityOnHand.toNumber() - amount.toNumber();
    if (resulting < 0) {
      throw new NegativeStockError(this.props.productName, resulting);
    }
    return new InventoryItem({
      ...this.props,
      quantityOnHand: Quantity.of(resulting),
      updatedAt: new Date(),
    });
  }

  /** Sets the balance to a counted figure, as after a physical stock take. */
  adjustTo(counted: Quantity): InventoryItem {
    return new InventoryItem({
      ...this.props,
      quantityOnHand: counted,
      updatedAt: new Date(),
    });
  }

  /** Signed difference required to reach `counted` from the current balance. */
  deltaTo(counted: Quantity): number {
    return counted.toNumber() - this.props.quantityOnHand.toNumber();
  }
}
