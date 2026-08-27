import { ValidationError } from "../errors/domain-error";
import type { MovementId, ProductId, SaleId, StaffId } from "./identifiers";

/**
 * Why stock moved. Every change to a balance carries one of these, so the
 * question "where did those twelve units go?" always has an answer.
 */
export const MOVEMENT_TYPES = [
  "stock_in",
  "sale",
  "adjustment",
  "sale_reversal",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface InventoryMovementProps {
  readonly id: MovementId;
  readonly productId: ProductId;
  readonly type: MovementType;
  /** Signed: positive adds stock, negative removes it. Never zero. */
  readonly quantityDelta: number;
  /** Balance after this movement was applied — makes the ledger auditable. */
  readonly resultingQuantity: number;
  readonly reason: string | null;
  readonly saleId: SaleId | null;
  readonly recordedBy: StaffId;
  readonly occurredAt: Date;
}

/**
 * One immutable line in the stock ledger.
 *
 * There is no update and no delete. A mistake is corrected by recording a
 * compensating movement, which is what makes the history worth keeping.
 */
export class InventoryMovement {
  private constructor(private readonly props: InventoryMovementProps) {
    Object.freeze(this);
  }

  static create(props: InventoryMovementProps): InventoryMovement {
    if (!Number.isInteger(props.quantityDelta)) {
      throw new ValidationError("A stock movement must be a whole number.", {
        quantityDelta: props.quantityDelta,
      });
    }
    if (props.quantityDelta === 0) {
      throw new ValidationError(
        "A stock movement of zero units is not a movement.",
      );
    }
    if (props.type === "stock_in" && props.quantityDelta < 0) {
      throw new ValidationError("A stock-in must add units.");
    }
    if (props.type === "sale" && props.quantityDelta > 0) {
      throw new ValidationError("A sale must remove units.");
    }
    if (props.resultingQuantity < 0) {
      throw new ValidationError("A movement cannot leave stock below zero.", {
        resultingQuantity: props.resultingQuantity,
      });
    }
    return new InventoryMovement(props);
  }

  get id(): MovementId {
    return this.props.id;
  }
  get productId(): ProductId {
    return this.props.productId;
  }
  get type(): MovementType {
    return this.props.type;
  }
  get quantityDelta(): number {
    return this.props.quantityDelta;
  }
  get resultingQuantity(): number {
    return this.props.resultingQuantity;
  }
  get reason(): string | null {
    return this.props.reason;
  }
  get saleId(): SaleId | null {
    return this.props.saleId;
  }
  get recordedBy(): StaffId {
    return this.props.recordedBy;
  }
  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get isIncrease(): boolean {
    return this.props.quantityDelta > 0;
  }
}
