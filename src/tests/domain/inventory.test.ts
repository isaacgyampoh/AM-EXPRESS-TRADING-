import { describe, expect, it } from "vitest";
import { InventoryMovement } from "@/domain/entities/inventory-movement";
import { asMovementId, asStaffId } from "@/domain/entities/identifiers";
import { NegativeStockError } from "@/domain/errors/business-errors";
import { ValidationError } from "@/domain/errors/domain-error";
import { Quantity } from "@/domain/value-objects/quantity";
import { AT, aProduct, stockOf } from "../support/builders";

describe("InventoryItem", () => {
  it("adds received stock", () => {
    const item = stockOf(aProduct(), 10).receive(Quantity.positive(5));
    expect(item.quantityOnHand.toNumber()).toBe(15);
  });

  it("removes sold stock", () => {
    const item = stockOf(aProduct(), 10).release(Quantity.positive(4));
    expect(item.quantityOnHand.toNumber()).toBe(6);
  });

  it("refuses to go below zero", () => {
    expect(() => stockOf(aProduct(), 3).release(Quantity.positive(4))).toThrow(
      NegativeStockError,
    );
  });

  it("flags low stock at or below the minimum", () => {
    const product = aProduct({ minimumStock: 5 });
    expect(stockOf(product, 6).isLowStock).toBe(false);
    expect(stockOf(product, 5).isLowStock).toBe(true);
    expect(stockOf(product, 4).isLowStock).toBe(true);
  });

  it("flags out of stock separately from low stock", () => {
    const item = stockOf(aProduct({ minimumStock: 5 }), 0);
    expect(item.isOutOfStock).toBe(true);
    expect(item.isLowStock).toBe(true);
  });

  it("computes the delta needed to reach a counted figure", () => {
    const item = stockOf(aProduct(), 10);
    expect(item.deltaTo(Quantity.of(7))).toBe(-3);
    expect(item.deltaTo(Quantity.of(14))).toBe(4);
  });

  it("does not mutate the original when stock changes", () => {
    const original = stockOf(aProduct(), 10);
    original.release(Quantity.positive(5));
    expect(original.quantityOnHand.toNumber()).toBe(10);
  });
});

describe("InventoryMovement", () => {
  const base = {
    id: asMovementId("00000000-0000-4000-8000-00000000aaaa"),
    productId: aProduct().id,
    reason: null,
    saleId: null,
    recordedBy: asStaffId("00000000-0000-4000-8000-00000000bbbb"),
    occurredAt: AT,
  };

  it("records a stock-in as a positive delta", () => {
    const movement = InventoryMovement.create({
      ...base,
      type: "stock_in",
      quantityDelta: 12,
      resultingQuantity: 22,
    });
    expect(movement.isIncrease).toBe(true);
  });

  it("refuses a zero movement", () => {
    expect(() =>
      InventoryMovement.create({
        ...base,
        type: "adjustment",
        quantityDelta: 0,
        resultingQuantity: 10,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses a stock-in that removes units", () => {
    expect(() =>
      InventoryMovement.create({
        ...base,
        type: "stock_in",
        quantityDelta: -5,
        resultingQuantity: 5,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses a sale that adds units", () => {
    expect(() =>
      InventoryMovement.create({
        ...base,
        type: "sale",
        quantityDelta: 3,
        resultingQuantity: 13,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses a movement that would leave stock negative", () => {
    expect(() =>
      InventoryMovement.create({
        ...base,
        type: "sale",
        quantityDelta: -5,
        resultingQuantity: -2,
      }),
    ).toThrow(ValidationError);
  });
});

describe("Quantity", () => {
  it("refuses fractions", () => {
    expect(() => Quantity.of(1.5)).toThrow(ValidationError);
  });

  it("refuses negatives", () => {
    expect(() => Quantity.of(-1)).toThrow(ValidationError);
  });

  it("allows zero for stock on hand but not for a sale line", () => {
    expect(Quantity.of(0).isZero).toBe(true);
    expect(() => Quantity.positive(0)).toThrow(ValidationError);
  });
});
