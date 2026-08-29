import { describe, expect, it } from "vitest";
import { toProduct } from "@/infrastructure/supabase/mappers/catalogue";
import { toExpense } from "@/infrastructure/supabase/mappers/people";
import { toSale } from "@/infrastructure/supabase/mappers/sales";

/**
 * The mappers, fed what PostgREST actually sends.
 *
 * These exist because of a production outage. Every NUMERIC column was typed
 * as `string` and handed to `Money.fromDecimalString`, which starts with
 * `input.trim()`. PostgREST serialises a row with PostgreSQL's `to_json`, and
 * `to_json(15.50::numeric)` emits `15.50` unquoted — so the value arrives as
 * the JS number 15.5 and every one of those calls throws
 * "a.trim is not a function".
 *
 * It type-checked, so nothing local caught it: the SQL suites never cross this
 * boundary, and the unit suites build domain objects from fakes rather than
 * from rows. The gap was tests that use the wire format, which is what these
 * are. Numbers here are deliberate — writing them as strings would restore the
 * exact assumption that broke.
 */

/** A product_units row as PostgREST sends it: NUMERIC prices as JS numbers. */
const unitRow = (retail: number, wholesale: number | null = null) => ({
  id: "99999999-9999-4999-8999-999999999999",
  product_id: "11111111-1111-4111-8111-111111111111",
  unit_name: "Piece",
  base_quantity: 1,
  retail_price: retail,
  wholesale_price: wholesale,
  is_default: true,
  is_active: true,
  created_at: "2026-08-29T00:00:00Z",
  updated_at: "2026-08-29T00:00:00Z",
});

describe("NUMERIC columns arrive as numbers, not strings", () => {
  it("maps a product's prices from numbers", () => {
    const product = toProduct({
      id: "11111111-1111-4111-8111-111111111111",
      sku: "RICE-5KG",
      name: "Rice 5kg",
      category_id: null,
      product_units: [unitRow(15.5)],
      cost_price: 12.25,
      minimum_stock: 3,
      is_active: true,
      created_by: null,
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    });

    expect(product.sellingPrice.toMinor()).toBe(1550);
    expect(product.costPrice?.toMinor()).toBe(1225);
  });

  it("keeps a zero cost price as zero, not as 'no cost recorded'", () => {
    // The second half of the same bug. `row.cost_price ? … : null` reads a
    // NUMERIC 0 as falsy, where the string "0.00" was truthy. A free item
    // would silently become one with an unknown margin, and one costless line
    // is enough to make a whole profit report incalculable.
    const product = toProduct({
      id: "11111111-1111-4111-8111-111111111111",
      sku: "SAMPLE",
      name: "Free sample",
      category_id: null,
      product_units: [unitRow(0)],
      cost_price: 0,
      minimum_stock: 0,
      is_active: true,
      created_by: null,
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    });

    expect(product.costPrice).not.toBeNull();
    expect(product.costPrice?.toMinor()).toBe(0);
  });

  it("maps a sale, its items and its payments from numbers", () => {
    const sale = toSale({
      id: "22222222-2222-4222-8222-222222222222",
      receipt_number: "AMX-000001",
      cashier_id: "33333333-3333-4333-8333-333333333333",
      total: 100,
      status: "completed",
      client_transaction_id: "txn-1",
      sold_at: "2026-08-29T00:00:00Z",
      profiles: { full_name: "Kofi Boateng" },
      sale_items: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          product_id: "11111111-1111-4111-8111-111111111111",
          sku: "RICE-5KG",
          name: "Rice 5kg",
          unit_price: 50,
          unit_cost: 38,
          quantity: 2,
          line_total: 100,
        },
      ],
      payments: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          method: "cash",
          amount: 100,
          reference: null,
          recorded_at: "2026-08-29T00:00:00Z",
        },
      ],
    });

    expect(sale.total.toMinor()).toBe(10000);
    expect(sale.items[0].unitPrice.toMinor()).toBe(5000);
    expect(sale.items[0].lineTotal.toMinor()).toBe(10000);
    expect(sale.items[0].unitCost?.toMinor()).toBe(3800);
    expect(sale.payments[0].amount.toMinor()).toBe(10000);
  });

  it("maps an expense amount from a number", () => {
    const expense = toExpense({
      id: "66666666-6666-4666-8666-666666666666",
      category_id: "77777777-7777-4777-8777-777777777777",
      amount: 40.75,
      method: "cash",
      description: "Taxi to the market",
      incurred_on: "2026-08-29",
      recorded_by: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-08-29T00:00:00Z",
      expense_categories: { name: "Transport" },
      profiles: { full_name: "Kofi Boateng" },
    });

    expect(expense.amount.toMinor()).toBe(4075);
  });

  it("keeps a price with a trailing-zero pesewa exact", () => {
    // 15.10 arrives as 15.1. Rounding must land on 1510, not 1509.
    const product = toProduct({
      id: "11111111-1111-4111-8111-111111111111",
      sku: "X",
      name: "X",
      category_id: null,
      product_units: [unitRow(15.1)],
      cost_price: null,
      minimum_stock: 0,
      is_active: true,
      created_by: null,
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    });

    expect(product.sellingPrice.toMinor()).toBe(1510);
    expect(product.costPrice).toBeNull();
  });
});
