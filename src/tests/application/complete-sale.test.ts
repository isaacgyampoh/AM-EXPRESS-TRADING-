import { beforeEach, describe, expect, it } from "vitest";
import { CompleteSale } from "@/application/use-cases/complete-sale";
import {
  InsufficientStockError,
  MissingPaymentReferenceError,
  PaymentMismatchError,
} from "@/domain/errors/business-errors";
import { ValidationError } from "@/domain/errors/domain-error";
import { InactiveStaffError } from "@/domain/errors/business-errors";
import { aProduct, aStaff } from "../support/builders";
import {
  FakeInventoryRepository,
  FakeProductRepository,
  FakeSalesRepository,
  FakeSettingsRepository,
} from "../support/fakes";

const TXN = "9f1d2c3b-4a5e-4f6a-8b7c-0d1e2f3a4b5c";
const TXN2 = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("CompleteSale", () => {
  const rice = aProduct({
    name: "Rice 5kg",
    sellingPrice: "50.00",
    costPrice: "38.00",
  });
  const oil = aProduct({ name: "Cooking Oil 1L", sellingPrice: "25.00" });

  let products: FakeProductRepository;
  let inventory: FakeInventoryRepository;
  let sales: FakeSalesRepository;
  let useCase: CompleteSale;

  const cashier = aStaff({ role: "cashier", fullName: "Kofi Boateng" });

  beforeEach(() => {
    products = new FakeProductRepository([rice, oil]);
    inventory = new FakeInventoryRepository([
      { product: rice, onHand: 10 },
      { product: oil, onHand: 4 },
    ]);
    sales = new FakeSalesRepository(products, inventory);
    useCase = new CompleteSale(
      sales,
      products,
      inventory,
      new FakeSettingsRepository(),
    );
  });

  describe("payment methods", () => {
    it("takes a cash sale", async () => {
      const result = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [{ productId: rice.id, quantity: 2 }],
        payments: [{ method: "cash", amount: "100.00" }],
      });

      expect(result.sale.total).toBe("100.00");
      expect(result.sale.paymentSummary).toBe("cash");
      expect(result.wasAlreadyRecorded).toBe(false);
    });

    it("takes a Mobile Money sale with its reference", async () => {
      const result = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [{ productId: rice.id, quantity: 1 }],
        payments: [
          { method: "mobile_money", amount: "50.00", reference: "MM-773421" },
        ],
      });

      expect(result.sale.paymentSummary).toBe("mobile_money");
      expect(result.receipt.payments[0].reference).toBe("MM-773421");
    });

    it("takes the split from the brief: 50 cash + 100 MoMo for a 150 sale", async () => {
      const result = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [
          { productId: rice.id, quantity: 2 },
          { productId: oil.id, quantity: 2 },
        ],
        payments: [
          { method: "cash", amount: "50.00" },
          { method: "mobile_money", amount: "100.00", reference: "MM-773421" },
        ],
      });

      expect(result.sale.total).toBe("150.00");
      expect(result.sale.paymentSummary).toBe("split");
      expect(result.sale.payments).toHaveLength(2);
    });

    it("refuses a split that is a pesewa short", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 2 }],
          payments: [
            { method: "cash", amount: "50.00" },
            { method: "mobile_money", amount: "49.99", reference: "MM-1" },
          ],
        }),
      ).rejects.toThrow(PaymentMismatchError);
    });

    it("refuses a split that overpays", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1 }],
          payments: [
            { method: "cash", amount: "30.00" },
            { method: "mobile_money", amount: "30.00", reference: "MM-1" },
          ],
        }),
      ).rejects.toThrow(PaymentMismatchError);
    });

    it("refuses Mobile Money with no reference", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1 }],
          payments: [{ method: "mobile_money", amount: "50.00" }],
        }),
      ).rejects.toThrow(MissingPaymentReferenceError);
    });
  });

  describe("stock", () => {
    it("reduces stock by exactly what was sold", async () => {
      await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [
          { productId: rice.id, quantity: 3 },
          { productId: oil.id, quantity: 1 },
        ],
        payments: [{ method: "cash", amount: "175.00" }],
      });

      expect(inventory.items.get(rice.id)?.quantityOnHand.toNumber()).toBe(7);
      expect(inventory.items.get(oil.id)?.quantityOnHand.toNumber()).toBe(3);
    });

    it("refuses a sale of more than is on hand, naming the shortfall", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: oil.id, quantity: 5 }],
          payments: [{ method: "cash", amount: "125.00" }],
        }),
      ).rejects.toThrow(InsufficientStockError);
    });

    it("leaves stock untouched when the sale is refused", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: oil.id, quantity: 5 }],
          payments: [{ method: "cash", amount: "125.00" }],
        }),
      ).rejects.toThrow();

      expect(inventory.items.get(oil.id)?.quantityOnHand.toNumber()).toBe(4);
      expect(sales.sales.size).toBe(0);
    });

    it("allows selling the last unit", async () => {
      await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [{ productId: oil.id, quantity: 4 }],
        payments: [{ method: "cash", amount: "100.00" }],
      });

      expect(inventory.items.get(oil.id)?.quantityOnHand.toNumber()).toBe(0);
    });
  });

  describe("the client cannot set the price", () => {
    it("charges the catalogue price whatever the request implies", async () => {
      // The request carries no price at all — by design. The only way to pay
      // less is to send a smaller payment, and that is refused as a mismatch.
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 2 }],
          payments: [{ method: "cash", amount: "0.02" }],
        }),
      ).rejects.toThrow(PaymentMismatchError);

      const result = await useCase.execute(cashier, {
        clientTransactionId: TXN2,
        items: [{ productId: rice.id, quantity: 2 }],
        payments: [{ method: "cash", amount: "100.00" }],
      });

      expect(result.sale.items[0].unitPrice).toBe("50.00");
    });
  });

  describe("idempotency", () => {
    it("returns the original sale when the same transaction is retried", async () => {
      const first = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [{ productId: rice.id, quantity: 2 }],
        payments: [{ method: "cash", amount: "100.00" }],
      });

      const retry = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [{ productId: rice.id, quantity: 2 }],
        payments: [{ method: "cash", amount: "100.00" }],
      });

      expect(retry.sale.id).toBe(first.sale.id);
      expect(retry.wasAlreadyRecorded).toBe(true);
      expect(retry.receipt.isReprint).toBe(true);
    });

    it("does not sell the stock twice on a retry", async () => {
      const request = {
        clientTransactionId: TXN,
        items: [{ productId: rice.id, quantity: 2 }],
        payments: [{ method: "cash" as const, amount: "100.00" }],
      };

      await useCase.execute(cashier, request);
      await useCase.execute(cashier, request);
      await useCase.execute(cashier, request);

      expect(inventory.items.get(rice.id)?.quantityOnHand.toNumber()).toBe(8);
      expect(sales.sales.size).toBe(1);
    });
  });

  describe("authorisation", () => {
    it("lets an admin sell as well as a cashier", async () => {
      const admin = aStaff({ role: "admin" });
      await expect(
        useCase.execute(admin, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1 }],
          payments: [{ method: "cash", amount: "50.00" }],
        }),
      ).resolves.toBeDefined();
    });

    it("refuses a deactivated staff member", async () => {
      const suspended = aStaff({ role: "cashier", isActive: false });
      await expect(
        useCase.execute(suspended, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1 }],
          payments: [{ method: "cash", amount: "50.00" }],
        }),
      ).rejects.toThrow(InactiveStaffError);
    });
  });

  describe("input", () => {
    it("refuses an empty basket", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [],
          payments: [{ method: "cash", amount: "50.00" }],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("refuses a sale with no payment recorded", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1 }],
          payments: [],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("refuses a fractional quantity", async () => {
      await expect(
        useCase.execute(cashier, {
          clientTransactionId: TXN,
          items: [{ productId: rice.id, quantity: 1.5 }],
          payments: [{ method: "cash", amount: "75.00" }],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("the receipt", () => {
    it("carries everything a customer needs", async () => {
      const { receipt } = await useCase.execute(cashier, {
        clientTransactionId: TXN,
        items: [
          { productId: rice.id, quantity: 2 },
          { productId: oil.id, quantity: 2 },
        ],
        payments: [
          { method: "cash", amount: "50.00" },
          { method: "mobile_money", amount: "100.00", reference: "MM-773421" },
        ],
      });

      expect(receipt.businessName).toBe("AM Express Trading");
      expect(receipt.currencySymbol).toBe("GH₵");
      expect(receipt.receiptNumber).toMatch(/^AMX-\d{6}$/);
      expect(receipt.cashierName).toBe("Kofi Boateng");
      expect(receipt.items).toHaveLength(2);
      expect(receipt.total).toBe("150.00");
      expect(receipt.paymentSummary).toBe("split");
      expect(
        receipt.payments.find((p) => p.method === "mobile_money")?.reference,
      ).toBe("MM-773421");
      expect(receipt.footer).toBe("Thank you for your business.");
      expect(receipt.isReprint).toBe(false);
    });
  });
});
