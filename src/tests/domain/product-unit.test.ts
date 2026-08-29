import { describe, expect, it } from "vitest";
import { ProductUnit } from "@/domain/entities/product-unit";
import { ValidationError } from "@/domain/errors/domain-error";
import { Money } from "@/domain/value-objects/money";

/**
 * The shop sells the same goods by the box and by the piece, wholesale and
 * retail. That is four prices, and the only rule that matters is that no one
 * of them is ever computed from another.
 *
 * The numbers below are deliberately not multiples of each other. A Box of 12
 * costs 120.00 while a Piece costs 12.00 — twelve pieces would be 144.00, and
 * the gap is the whole point of buying a box. Any code that divided or
 * multiplied to fill a missing price would produce a number the shop never
 * agreed to.
 */
const box = (over: Partial<Parameters<typeof ProductUnit.create>[0]> = {}) =>
  ProductUnit.create({
    id: "u-box",
    unitName: "Box",
    baseQuantity: 12,
    retailPrice: Money.fromDecimalString("120.00"),
    wholesalePrice: Money.fromDecimalString("110.00"),
    isDefault: false,
    isActive: true,
    ...over,
  });

describe("ProductUnit pricing", () => {
  it("charges the retail price at retail", () => {
    expect(box().priceFor("retail").toDecimalString()).toBe("120.00");
  });

  it("charges the wholesale price at wholesale, not a discount off retail", () => {
    expect(box().priceFor("wholesale").toDecimalString()).toBe("110.00");
  });

  it("refuses a wholesale sale when no wholesale price was set", () => {
    // The important half. Falling back to retail here would sell a carton at
    // the counter price and nobody would notice until stocktake.
    const retailOnly = box({ wholesalePrice: null });

    expect(() => retailOnly.priceFor("wholesale")).toThrow(ValidationError);
    expect(() => retailOnly.priceFor("wholesale")).toThrow(/no wholesale price/i);
    expect(retailOnly.sellsWholesale).toBe(false);
  });

  it("never derives one unit's price from another's", () => {
    const piece = ProductUnit.create({
      id: "u-piece",
      unitName: "Piece",
      baseQuantity: 1,
      retailPrice: Money.fromDecimalString("12.00"),
      wholesalePrice: Money.fromDecimalString("9.00"),
      isDefault: true,
      isActive: true,
    });

    // Twelve pieces at retail would be 144.00; the box is 120.00. The two
    // numbers are independent, and the box is not "the piece price x 12".
    expect(piece.priceFor("retail").multiply(12).toDecimalString()).toBe("144.00");
    expect(box().priceFor("retail").toDecimalString()).toBe("120.00");

    // Same again for wholesale: 9.00 x 12 is 108.00, the box is 110.00.
    expect(piece.priceFor("wholesale").multiply(12).toDecimalString()).toBe("108.00");
    expect(box().priceFor("wholesale").toDecimalString()).toBe("110.00");
  });

  it("treats a wholesale price of zero as a real price, not as absent", () => {
    // A giveaway line still has a price. `!= null` rather than truthiness is
    // what keeps this sellable.
    const free = box({ wholesalePrice: Money.zero() });

    expect(free.sellsWholesale).toBe(true);
    expect(free.priceFor("wholesale").toDecimalString()).toBe("0.00");
  });
});

describe("ProductUnit quantities", () => {
  it("converts a quantity of units into base units", () => {
    // Quantities convert; prices do not. This is the one multiplication the
    // model permits.
    expect(box().baseUnitsFor(2)).toBe(24);
  });

  it("knows the base unit from the pack size", () => {
    expect(box().isBaseUnit).toBe(false);
    expect(box({ baseQuantity: 1 }).isBaseUnit).toBe(true);
  });

  it("refuses a unit that contains less than one base unit", () => {
    expect(() => box({ baseQuantity: 0 })).toThrow(ValidationError);
    expect(() => box({ baseQuantity: -1 })).toThrow(ValidationError);
  });

  it("refuses negative prices", () => {
    expect(() =>
      box({ retailPrice: Money.fromDecimalString("-1.00") }),
    ).toThrow(ValidationError);
    expect(() =>
      box({ wholesalePrice: Money.fromDecimalString("-1.00") }),
    ).toThrow(ValidationError);
  });
});
