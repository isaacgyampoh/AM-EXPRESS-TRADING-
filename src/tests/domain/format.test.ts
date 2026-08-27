import { describe, expect, it } from "vitest";
import { formatCount, formatMoney } from "@/lib/utils/format";

describe("formatMoney", () => {
  it.each([
    ["0.00", "GH₵0.00"],
    ["5.00", "GH₵5.00"],
    ["15.50", "GH₵15.50"],
    ["1234.56", "GH₵1,234.56"],
    ["1234567.89", "GH₵1,234,567.89"],
    ["-3.05", "-GH₵3.05"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it("pads a single decimal place rather than dropping it", () => {
    expect(formatMoney("7.5")).toBe("GH₵7.50");
  });

  it("uses whatever symbol the business is configured with", () => {
    expect(formatMoney("10.00", "₦")).toBe("₦10.00");
  });

  it("can omit the symbol for use inside an input", () => {
    expect(formatMoney("10.00", "GH₵", { showSymbol: false })).toBe("10.00");
  });
});

describe("formatCount", () => {
  it("groups large counts", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(7)).toBe("7");
  });
});
