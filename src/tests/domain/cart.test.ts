import { describe, expect, it } from "vitest";
import { Cart } from "@/domain/entities/cart";
import { InactiveProductError } from "@/domain/errors/business-errors";
import { ValidationError } from "@/domain/errors/domain-error";
import { Quantity } from "@/domain/value-objects/quantity";
import { aProduct } from "../support/builders";

describe("Cart", () => {
  it("starts empty", () => {
    const cart = Cart.empty();
    expect(cart.isEmpty).toBe(true);
    expect(cart.total.toDecimalString()).toBe("0.00");
    expect(cart.unitCount).toBe(0);
  });

  it("adds a product and totals it", () => {
    const rice = aProduct({ sellingPrice: "50.00" });
    const cart = Cart.empty().addProduct(rice, Quantity.positive(3));

    expect(cart.lineCount).toBe(1);
    expect(cart.unitCount).toBe(3);
    expect(cart.total.toDecimalString()).toBe("150.00");
  });

  it("increases the quantity when the same product is tapped again", () => {
    const rice = aProduct({ sellingPrice: "50.00" });
    const cart = Cart.empty()
      .addProduct(rice, Quantity.positive(1))
      .addProduct(rice, Quantity.positive(2));

    expect(cart.lineCount).toBe(1);
    expect(cart.lineFor(rice.id)?.quantity.toNumber()).toBe(3);
  });

  it("removes a line when its quantity is set to zero", () => {
    const rice = aProduct();
    const cart = Cart.empty()
      .addProduct(rice, Quantity.positive(2))
      .setQuantity(rice.id, Quantity.zero());

    expect(cart.isEmpty).toBe(true);
  });

  it("refuses to set a quantity on a product that is not in the basket", () => {
    const absent = aProduct();
    expect(() =>
      Cart.empty().setQuantity(absent.id, Quantity.positive(1)),
    ).toThrow(ValidationError);
  });

  it("refuses to add an inactive product", () => {
    const retired = aProduct({ isActive: false });
    expect(() => Cart.empty().addProduct(retired, Quantity.positive(1))).toThrow(
      InactiveProductError,
    );
  });

  it("never mutates — the original basket survives every operation", () => {
    const rice = aProduct({ sellingPrice: "50.00" });
    const original = Cart.empty().addProduct(rice, Quantity.positive(1));

    original.addProduct(rice, Quantity.positive(5));
    original.removeProduct(rice.id);
    original.clear();

    expect(original.unitCount).toBe(1);
    expect(original.total.toDecimalString()).toBe("50.00");
  });

  it("snapshots the price at the moment the line was added", () => {
    const rice = aProduct({ sellingPrice: "50.00" });
    const cart = Cart.empty().addProduct(rice, Quantity.positive(1));

    rice.withChanges({ sellingPrice: rice.sellingPrice.multiply(2) });

    expect(cart.lineFor(rice.id)?.unitPrice.toDecimalString()).toBe("50.00");
  });

  it("totals a mixed basket exactly", () => {
    const a = aProduct({ sellingPrice: "19.99" });
    const b = aProduct({ sellingPrice: "0.07" });
    const cart = Cart.empty()
      .addProduct(a, Quantity.positive(3))
      .addProduct(b, Quantity.positive(100));

    // 59.97 + 7.00
    expect(cart.total.toDecimalString()).toBe("66.97");
  });
});
