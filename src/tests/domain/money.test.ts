import { describe, expect, it } from "vitest";
import { Money } from "@/domain/value-objects/money";
import { ValidationError } from "@/domain/errors/domain-error";

describe("Money", () => {
  describe("does not inherit floating point error", () => {
    it("adds 0.10 and 0.20 to exactly 0.30", () => {
      const result = Money.fromDecimalString("0.10").add(
        Money.fromDecimalString("0.20"),
      );
      expect(result.toDecimalString()).toBe("0.30");
      expect(result.toMinor()).toBe(30);
    });

    it("sums a long list of awkward amounts exactly", () => {
      // 0.07 a hundred times is 7.00 — and is 7.000000000000004 in floats.
      const amounts = Array.from({ length: 100 }, () =>
        Money.fromDecimalString("0.07"),
      );
      expect(Money.sum(amounts).toDecimalString()).toBe("7.00");
    });

    it("multiplies a price by a quantity exactly", () => {
      const line = Money.fromDecimalString("19.99").multiply(3);
      expect(line.toDecimalString()).toBe("59.97");
    });
  });

  describe("parsing", () => {
    it.each([
      ["15.50", 1550],
      ["15.5", 1550],
      ["15", 1500],
      ["0.05", 5],
      ["-3.05", -305],
      ["  12.34  ", 1234],
    ])("parses %s to %d pesewas", (input, expected) => {
      expect(Money.fromDecimalString(input).toMinor()).toBe(expected);
    });

    it.each(["", "abc", "1.234", "1,50", "1.2.3", "GH₵5", "5-"])(
      "rejects %s",
      (input) => {
        expect(() => Money.fromDecimalString(input)).toThrow(ValidationError);
      },
    );

    it("refuses an amount finer than a pesewa", () => {
      expect(() => Money.from(1.005)).toThrow(ValidationError);
    });

    it("refuses a non-integer number of minor units", () => {
      expect(() => Money.fromMinor(10.5)).toThrow(ValidationError);
    });
  });

  describe("formatting", () => {
    it.each([
      [0, "0.00"],
      [5, "0.05"],
      [50, "0.50"],
      [1500, "15.00"],
      [123456, "1234.56"],
      [-305, "-3.05"],
    ])("renders %d pesewas as %s", (minor, expected) => {
      expect(Money.fromMinor(minor).toDecimalString()).toBe(expected);
    });
  });

  describe("comparison", () => {
    it("treats equal amounts in the same currency as equal", () => {
      expect(Money.fromMinor(100).equals(Money.fromMinor(100))).toBe(true);
    });

    it("treats the same number in a different currency as not equal", () => {
      expect(
        Money.fromMinor(100, "GHS").equals(Money.fromMinor(100, "USD")),
      ).toBe(false);
    });

    it("refuses to mix currencies in arithmetic", () => {
      expect(() =>
        Money.fromMinor(100, "GHS").add(Money.fromMinor(100, "USD")),
      ).toThrow(ValidationError);
    });

    it("orders amounts", () => {
      expect(Money.fromMinor(500).isGreaterThan(Money.fromMinor(499))).toBe(
        true,
      );
      expect(Money.fromMinor(500).isLessThan(Money.fromMinor(501))).toBe(true);
    });
  });

  it("refuses to be multiplied by a fraction", () => {
    expect(() => Money.fromMinor(100).multiply(1.5)).toThrow(ValidationError);
  });

  it("is immutable", () => {
    const original = Money.fromMinor(100);
    original.add(Money.fromMinor(50));
    expect(original.toMinor()).toBe(100);
  });
});
