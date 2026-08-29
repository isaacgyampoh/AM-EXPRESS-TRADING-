import { ValidationError } from "../errors/domain-error";
import { Money } from "../value-objects/money";

/** Which price applies to a line: what a walk-in pays, or what a trader pays. */
export type PriceTier = "retail" | "wholesale";

export interface ProductUnitProps {
  readonly id: string;
  /** "Piece", "Box", "Carton" — from the `units` lookup, not a fixed list. */
  readonly unitName: string;
  /** How many base units this contains. 1 for the base unit itself. */
  readonly baseQuantity: number;
  readonly retailPrice: Money;
  /** Null when the shop does not sell this unit wholesale. */
  readonly wholesalePrice: Money | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

/**
 * One way a product is sold: a unit, and the prices for it.
 *
 * The class exists mostly to hold one rule, and the rule is a refusal.
 * `priceFor("wholesale")` throws when there is no wholesale price rather than
 * returning the retail one, because the alternative — a silent fallback —
 * is how a shop sells a carton at the counter price and only notices at
 * stocktake.
 *
 * Nothing here divides or multiplies a price. A Box price is not twelve Piece
 * prices; a wholesale price is not retail with a discount. Quantities convert,
 * prices are typed in.
 */
export class ProductUnit {
  private constructor(private readonly props: ProductUnitProps) {}

  static create(props: ProductUnitProps): ProductUnit {
    if (!Number.isInteger(props.baseQuantity) || props.baseQuantity < 1) {
      throw new ValidationError(
        `A ${props.unitName} must contain at least one base unit.`,
        { baseQuantity: props.baseQuantity },
      );
    }
    if (props.retailPrice.isNegative) {
      throw new ValidationError("A retail price cannot be negative.", {
        retailPrice: props.retailPrice.toDecimalString(),
      });
    }
    if (props.wholesalePrice?.isNegative) {
      throw new ValidationError("A wholesale price cannot be negative.", {
        wholesalePrice: props.wholesalePrice.toDecimalString(),
      });
    }
    return new ProductUnit(props);
  }

  get id(): string {
    return this.props.id;
  }
  get unitName(): string {
    return this.props.unitName;
  }
  get baseQuantity(): number {
    return this.props.baseQuantity;
  }
  get retailPrice(): Money {
    return this.props.retailPrice;
  }
  get wholesalePrice(): Money | null {
    return this.props.wholesalePrice;
  }
  get isDefault(): boolean {
    return this.props.isDefault;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  /** The base unit is the one stock is counted in. */
  get isBaseUnit(): boolean {
    return this.props.baseQuantity === 1;
  }
  get sellsWholesale(): boolean {
    return this.props.wholesalePrice !== null;
  }

  /**
   * The price for this tier, or a refusal.
   *
   * Deliberately throws rather than falling back. The database refuses the
   * same case in `complete_sale`; this is the copy that lets the till say so
   * before the customer is waiting for a receipt.
   */
  priceFor(tier: PriceTier): Money {
    if (tier === "wholesale") {
      if (!this.props.wholesalePrice) {
        throw new ValidationError(
          `There is no wholesale price for one ${this.props.unitName}. Set one, or sell it at retail.`,
          { unit: this.props.unitName },
        );
      }
      return this.props.wholesalePrice;
    }
    return this.props.retailPrice;
  }

  /** Base units removed from stock by selling `quantity` of this unit. */
  baseUnitsFor(quantity: number): number {
    return this.props.baseQuantity * quantity;
  }
}
