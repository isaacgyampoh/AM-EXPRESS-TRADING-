import { asProductId } from "@/domain/entities/identifiers";
import type { Staff } from "@/domain/entities/staff";
import { NotFoundError } from "@/domain/errors/domain-error";
import { NegativeStockError } from "@/domain/errors/business-errors";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type { ProductRepository } from "@/domain/repositories/product-repository";
import { Quantity } from "@/domain/value-objects/quantity";
import {
  parseOrThrow,
  stockAdjustmentSchema,
  stockInSchema,
} from "../validators/product-validators";

export interface StockLevelDto {
  readonly productId: string;
  readonly productName: string;
  readonly quantityOnHand: number;
  readonly minimumStock: number;
  readonly isLowStock: boolean;
}

/** Goods arrived. Raises the balance and records why. */
export class AddStock {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(actor: Staff, input: unknown): Promise<StockLevelDto> {
    actor.assertCan("inventory:adjust");

    const data = parseOrThrow(stockInSchema, input);
    const productId = asProductId(data.productId);

    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError("Product", data.productId);

    const updated = await this.inventory.recordStockIn({
      productId,
      quantity: data.quantity,
      reason: data.reason?.trim() || null,
      recordedBy: actor.id,
    });

    return toStockLevelDto(updated.productId, updated.productName, updated);
  }
}

/**
 * A stock take found a different number.
 *
 * Takes the counted figure, not a difference — the person holding the
 * clipboard knows what they counted, and making them do the subtraction is how
 * wrong numbers get entered. The reason is required, because an adjustment
 * without an explanation is a loss nobody has accounted for.
 */
export class AdjustStock {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(actor: Staff, input: unknown): Promise<StockLevelDto> {
    actor.assertCan("inventory:adjust");

    const data = parseOrThrow(stockAdjustmentSchema, input);
    const productId = asProductId(data.productId);

    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError("Product", data.productId);

    const current = await this.inventory.findByProductId(productId);
    if (!current) throw new NotFoundError("Stock record", data.productId);

    // The entity applies the change first so the domain rule — a balance never
    // goes below zero — is checked before anything is written.
    const counted = Quantity.of(data.countedQuantity);
    if (counted.toNumber() < 0) {
      throw new NegativeStockError(product.name, counted.toNumber());
    }
    current.adjustTo(counted);

    const updated = await this.inventory.recordAdjustment({
      productId,
      countedQuantity: data.countedQuantity,
      reason: data.reason,
      recordedBy: actor.id,
    });

    return toStockLevelDto(updated.productId, updated.productName, updated);
  }
}

function toStockLevelDto(
  productId: string,
  productName: string,
  item: {
    quantityOnHand: Quantity;
    minimumStock: number;
    isLowStock: boolean;
  },
): StockLevelDto {
  return {
    productId,
    productName,
    quantityOnHand: item.quantityOnHand.toNumber(),
    minimumStock: item.minimumStock,
    isLowStock: item.isLowStock,
  };
}
