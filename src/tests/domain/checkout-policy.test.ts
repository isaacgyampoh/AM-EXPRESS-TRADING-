import { describe, expect, it } from "vitest";
import { Cart } from "@/domain/entities/cart";
import { Tender } from "@/domain/entities/payment";
import { CheckoutPolicy } from "@/domain/services/checkout-policy";
import {
  InactiveProductError,
  InsufficientStockError,
  EmptyCartError,
  PaymentMismatchError,
} from "@/domain/errors/business-errors";
import { NotFoundError } from "@/domain/errors/domain-error";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";
import { aProduct, checkoutContext } from "../support/builders";

const ghs = (amount: string) => Money.fromDecimalString(amount);

describe("CheckoutPolicy", () => {
  it("prices a cart from the catalogue and totals it", () => {
    const rice = aProduct({ name: "Rice 5kg", sellingPrice: "50.00" });
    const oil = aProduct({ name: "Cooking Oil 1L", sellingPrice: "25.00" });
    const context = checkoutContext([
      { product: rice, onHand: 10 },
      { product: oil, onHand: 4 },
    ]);

    const cart = Cart.empty()
      .addProduct(rice, Quantity.positive(2))
      .addProduct(oil, Quantity.positive(2));

    const result = CheckoutPolicy.reprice(cart, context);

    expect(result.total.toDecimalString()).toBe("150.00");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].lineTotal.toDecimalString()).toBe("100.00");
    expect(result.lines[1].lineTotal.toDecimalString()).toBe("50.00");
  });

  it("ignores a price the client tampered with and uses the catalogue price", () => {
    const rice = aProduct({ name: "Rice 5kg", sellingPrice: "50.00" });
    const context = checkoutContext([{ product: rice, onHand: 10 }]);

    // A hostile client claims the item costs one pesewa.
    const tamperedCart = Cart.of([
      {
        productId: rice.id,
        sku: rice.sku.toString(),
        name: rice.name,
        unitPrice: ghs("0.01"),
        quantity: Quantity.positive(2),
      },
    ]);

    const result = CheckoutPolicy.reprice(tamperedCart, context);

    expect(result.lines[0].unitPrice.toDecimalString()).toBe("50.00");
    expect(result.total.toDecimalString()).toBe("100.00");
  });

  it("refuses a sale of more units than are on hand", () => {
    const rice = aProduct({ name: "Rice 5kg" });
    const context = checkoutContext([{ product: rice, onHand: 3 }]);
    const cart = Cart.empty().addProduct(rice, Quantity.positive(4));

    expect(() => CheckoutPolicy.reprice(cart, context)).toThrow(
      InsufficientStockError,
    );

    try {
      CheckoutPolicy.reprice(cart, context);
    } catch (error) {
      expect((error as InsufficientStockError).details).toMatchObject({
        productName: "Rice 5kg",
        requested: 4,
        available: 3,
      });
    }
  });

  it("allows selling exactly the last unit", () => {
    const rice = aProduct();
    const context = checkoutContext([{ product: rice, onHand: 1 }]);
    const cart = Cart.empty().addProduct(rice, Quantity.positive(1));

    expect(() => CheckoutPolicy.reprice(cart, context)).not.toThrow();
  });

  it("refuses an inactive product", () => {
    const retired = aProduct({ name: "Old Stock", isActive: false });
    const context = checkoutContext([{ product: retired, onHand: 10 }]);
    const cart = Cart.of([
      {
        productId: retired.id,
        sku: retired.sku.toString(),
        name: retired.name,
        unitPrice: retired.sellingPrice,
        quantity: Quantity.positive(1),
      },
    ]);

    expect(() => CheckoutPolicy.reprice(cart, context)).toThrow(
      InactiveProductError,
    );
  });

  it("refuses a product that is not in the catalogue", () => {
    const known = aProduct();
    const unknown = aProduct();
    const context = checkoutContext([{ product: known, onHand: 5 }]);
    const cart = Cart.empty().addProduct(unknown, Quantity.positive(1));

    expect(() => CheckoutPolicy.reprice(cart, context)).toThrow(NotFoundError);
  });

  it("refuses an empty cart", () => {
    expect(() => CheckoutPolicy.reprice(Cart.empty(), checkoutContext([]))).toThrow(
      EmptyCartError,
    );
  });

  describe("tender validation against the repriced total", () => {
    const rice = aProduct({ sellingPrice: "50.00" });
    const oil = aProduct({ sellingPrice: "25.00" });
    const context = checkoutContext([
      { product: rice, onHand: 10 },
      { product: oil, onHand: 10 },
    ]);
    const cart = Cart.empty()
      .addProduct(rice, Quantity.positive(2))
      .addProduct(oil, Quantity.positive(2));

    it("accepts a split that matches", () => {
      const { total } = CheckoutPolicy.reprice(cart, context);
      const tender = Tender.split(ghs("50.00"), ghs("100.00"), "MM-1");
      expect(() =>
        CheckoutPolicy.assertTenderBalances(tender, total),
      ).not.toThrow();
    });

    it("rejects a tender matching the client's total rather than the real one", () => {
      const { total } = CheckoutPolicy.reprice(cart, context);
      // Client thought the sale was GH₵1.00 and paid that.
      const tender = Tender.cash(ghs("1.00"));
      expect(() => CheckoutPolicy.assertTenderBalances(tender, total)).toThrow(
        PaymentMismatchError,
      );
    });
  });
});
