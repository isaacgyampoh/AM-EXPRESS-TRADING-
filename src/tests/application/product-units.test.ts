import { beforeEach, describe, expect, it } from "vitest";
import { AddProductUnit } from "@/application/use-cases/update-product";
import { ProductUnit } from "@/domain/entities/product-unit";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { Money } from "@/domain/value-objects/money";
import { aProduct, aStaff } from "../support/builders";
import { FakeProductRepository } from "../support/fakes";

const admin = aStaff({ role: "admin", fullName: "Akosua Mensah" });
const cashier = aStaff({ role: "cashier", fullName: "Kofi Boateng" });

/**
 * Adding a second way to sell something.
 *
 * The prices below are chosen so that no correct answer can be reached by
 * arithmetic: a Box of twelve costs 120.00 while a Piece costs 12.00, and
 * twelve pieces would be 144.00. If anything in this path ever multiplied the
 * base price to fill in a Box price, these tests would still pass with the
 * wrong number unless the expectation is the number that was typed in — which
 * is what they assert.
 */
describe("AddProductUnit", () => {
  let products: FakeProductRepository;
  let useCase: AddProductUnit;

  const base = ProductUnit.create({
    id: "unit-base",
    unitName: "Piece",
    baseQuantity: 1,
    retailPrice: Money.fromDecimalString("12.00"),
    wholesalePrice: Money.fromDecimalString("9.00"),
    isDefault: true,
    isActive: true,
  });

  const product = aProduct({ name: "Milk sachet", units: [base] });

  beforeEach(() => {
    products = new FakeProductRepository([product]);
    useCase = new AddProductUnit(products);
  });

  const addBox = (over: Record<string, unknown> = {}) =>
    useCase.execute(admin, {
      productId: product.id,
      unitName: "Box",
      baseQuantity: "12",
      retailPrice: "120.00",
      wholesalePrice: "110.00",
      ...over,
    });

  it("stores exactly the prices that were entered", async () => {
    await addBox();

    const [added] = products.addedUnits;
    expect(added.unit.unitName).toBe("Box");
    expect(added.unit.baseQuantity).toBe(12);
    // Not 144.00, which is what twelve Pieces would cost.
    expect(added.unit.retailPrice.toDecimalString()).toBe("120.00");
    // Not 108.00, which is what twelve wholesale Pieces would cost.
    expect(added.unit.wholesalePrice?.toDecimalString()).toBe("110.00");
  });

  it("leaves wholesale null when it is left blank, rather than filling it in", async () => {
    await addBox({ wholesalePrice: "" });

    const [added] = products.addedUnits;
    expect(added.unit.wholesalePrice).toBeNull();
  });

  it("returns the product with the new unit on it", async () => {
    const dto = await addBox();

    expect(dto.units).toHaveLength(2);
    expect(dto.units.map((unit) => unit.unitName)).toContain("Box");
  });

  it("refuses a cashier", async () => {
    await expect(
      useCase.execute(cashier, {
        productId: product.id,
        unitName: "Box",
        baseQuantity: "12",
        retailPrice: "0.01",
      }),
    ).rejects.toThrow(ForbiddenError);

    // Refused before anything was written, not after.
    expect(products.addedUnits).toHaveLength(0);
  });

  it("refuses a unit the product already has", async () => {
    await expect(addBox({ unitName: "Piece" })).rejects.toThrow(ConflictError);
    expect(products.addedUnits).toHaveLength(0);
  });

  it("refuses a unit with no price", async () => {
    await expect(addBox({ retailPrice: "" })).rejects.toThrow(ValidationError);
  });

  it("refuses a pack size below one", async () => {
    // A unit holding zero base units would sell without moving stock.
    await expect(addBox({ baseQuantity: "0" })).rejects.toThrow(ValidationError);
  });

  it("refuses a product that does not exist", async () => {
    await expect(
      addBox({ productId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow(NotFoundError);
  });
});
