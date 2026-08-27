/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addProduct,
  clearDraft,
  getSnapshot,
  removeProduct,
  setLineQuantity,
  subscribe,
} from "@/presentation/state/cart-store";

/**
 * The basket that survives a phone locking mid-sale.
 *
 * Two properties matter more than the rest, and both are about money:
 *
 *   - a line can never exceed what is on the shelf, so a cashier finds out
 *     while the customer is still in front of them rather than at checkout
 *   - the transaction id is stable for the life of a basket, because that is
 *     what turns a retry after a dropped connection into the same sale rather
 *     than a second one
 */
const rice = {
  productId: "p-rice",
  sku: "RICE-5KG",
  name: "Rice 5kg",
  unitPrice: "50.00",
  availableStock: 3,
};

const oil = {
  productId: "p-oil",
  sku: "OIL-1L",
  name: "Cooking Oil 1L",
  unitPrice: "25.00",
  availableStock: 10,
};

describe("the POS basket", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // A subscriber makes the store hydrate, the way a mounted component does.
    subscribe(() => {});
    clearDraft();
  });

  it("starts empty, with no transaction id to spend", () => {
    expect(getSnapshot().lines).toHaveLength(0);
    expect(getSnapshot().transactionId).toBe("");
  });

  it("takes a transaction id when the first item goes in", () => {
    addProduct(rice);

    expect(getSnapshot().lines).toHaveLength(1);
    expect(getSnapshot().transactionId).not.toBe("");
  });

  it("keeps the same transaction id while the basket is being built", () => {
    addProduct(rice);
    const first = getSnapshot().transactionId;

    addProduct(oil);
    addProduct(rice);
    setLineQuantity(oil.productId, 4);

    expect(getSnapshot().transactionId).toBe(first);
  });

  it("increases the quantity when the same product is tapped again", () => {
    addProduct(rice);
    addProduct(rice);

    expect(getSnapshot().lines).toHaveLength(1);
    expect(getSnapshot().lines[0].quantity).toBe(2);
  });

  it("never lets a line exceed what is on the shelf", () => {
    addProduct(rice);
    addProduct(rice);
    addProduct(rice);
    addProduct(rice); // a fourth tap, with only three in stock

    expect(getSnapshot().lines[0].quantity).toBe(3);
  });

  it("caps a typed quantity at the stock on hand too", () => {
    addProduct(rice);
    setLineQuantity(rice.productId, 99);

    expect(getSnapshot().lines[0].quantity).toBe(3);
  });

  it("removes a line when its quantity reaches zero", () => {
    addProduct(rice);
    addProduct(oil);
    setLineQuantity(rice.productId, 0);

    expect(getSnapshot().lines).toHaveLength(1);
    expect(getSnapshot().lines[0].productId).toBe(oil.productId);
  });

  it("surrenders the transaction id once the basket is emptied", () => {
    addProduct(rice);
    removeProduct(rice.productId);

    expect(getSnapshot().transactionId).toBe("");
  });

  it("gives the next basket a different transaction id", () => {
    addProduct(rice);
    const first = getSnapshot().transactionId;

    clearDraft();
    addProduct(oil);

    expect(getSnapshot().transactionId).not.toBe(first);
    expect(getSnapshot().transactionId).not.toBe("");
  });

  it("survives a reload", () => {
    addProduct(rice);
    addProduct(oil);
    const saved = getSnapshot();

    // What the browser would still have on disk after the phone locked.
    const raw = window.localStorage.getItem("amx.pos.draft.v1");
    expect(raw).toBeTruthy();

    const restored = JSON.parse(raw as string);
    expect(restored.lines).toHaveLength(2);
    expect(restored.transactionId).toBe(saved.transactionId);
  });

  it("leaves nothing behind once the sale is recorded", () => {
    addProduct(rice);
    clearDraft();

    expect(window.localStorage.getItem("amx.pos.draft.v1")).toBeNull();
  });
});
