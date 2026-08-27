import { describe, expect, it } from "vitest";
import { Tender } from "@/domain/entities/payment";
import { Money } from "@/domain/value-objects/money";
import {
  MissingPaymentReferenceError,
  PaymentMismatchError,
} from "@/domain/errors/business-errors";
import { ValidationError } from "@/domain/errors/domain-error";

const ghs = (amount: string) => Money.fromDecimalString(amount);

describe("Tender — the cash + Mobile Money rule", () => {
  it("accepts a cash-only sale that balances", () => {
    const tender = Tender.cash(ghs("150.00"));
    expect(() => tender.assertCovers(ghs("150.00"))).not.toThrow();
    expect(tender.summaryMethod).toBe("cash");
  });

  it("accepts a Mobile Money sale that balances", () => {
    const tender = Tender.mobileMoney(ghs("150.00"), "MM-773421");
    expect(() => tender.assertCovers(ghs("150.00"))).not.toThrow();
    expect(tender.summaryMethod).toBe("mobile_money");
  });

  it("accepts the worked example from the brief: 50 cash + 100 MoMo = 150", () => {
    const tender = Tender.split(ghs("50.00"), ghs("100.00"), "MM-773421");

    expect(tender.total.toDecimalString()).toBe("150.00");
    expect(() => tender.assertCovers(ghs("150.00"))).not.toThrow();
    expect(tender.summaryMethod).toBe("split");
    expect(tender.amountFor("cash").toDecimalString()).toBe("50.00");
    expect(tender.amountFor("mobile_money").toDecimalString()).toBe("100.00");
  });

  it("rejects a split that is one pesewa short", () => {
    const tender = Tender.split(ghs("50.00"), ghs("99.99"), "MM-773421");

    expect(() => tender.assertCovers(ghs("150.00"))).toThrow(
      PaymentMismatchError,
    );

    try {
      tender.assertCovers(ghs("150.00"));
    } catch (error) {
      expect((error as PaymentMismatchError).details).toMatchObject({
        totalMinor: 15000,
        tenderedMinor: 14999,
        differenceMinor: -1,
      });
    }
  });

  it("rejects a split that overpays", () => {
    const tender = Tender.split(ghs("60.00"), ghs("100.00"), "MM-773421");
    expect(() => tender.assertCovers(ghs("150.00"))).toThrow(
      PaymentMismatchError,
    );
  });

  it("rejects Mobile Money without a transaction reference", () => {
    expect(() => Tender.mobileMoney(ghs("100.00"), "   ")).toThrow(
      MissingPaymentReferenceError,
    );
  });

  it("rejects a zero or negative tender line", () => {
    expect(() => Tender.cash(ghs("0"))).toThrow(ValidationError);
    expect(() => Tender.cash(ghs("-5.00"))).toThrow(ValidationError);
  });

  it("rejects an empty tender", () => {
    expect(() => Tender.of([])).toThrow(ValidationError);
  });

  it("rejects two lines with the same method", () => {
    expect(() =>
      Tender.of([
        { method: "cash", amount: ghs("50.00"), reference: null },
        { method: "cash", amount: ghs("100.00"), reference: null },
      ]),
    ).toThrow(ValidationError);
  });

  it("reports zero for a method that was not used", () => {
    const tender = Tender.cash(ghs("150.00"));
    expect(tender.amountFor("mobile_money").isZero).toBe(true);
  });
});
