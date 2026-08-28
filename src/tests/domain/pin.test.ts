import { describe, expect, it } from "vitest";
import { Pin } from "@/domain/value-objects/pin";
import { ValidationError } from "@/domain/errors/domain-error";

describe("Pin value object", () => {
  it("accepts exactly 4 decimal digits", () => {
    expect(() => Pin.parse("0000")).not.toThrow();
    expect(() => Pin.parse("1234")).not.toThrow();
    expect(() => Pin.parse("9999")).not.toThrow();
    // Leading zeros are valid
    expect(() => Pin.parse("0123")).not.toThrow();
    expect(Pin.parse("1024").value).toBe("1024");
  });

  it("rejects strings that are not exactly 4 characters", () => {
    expect(() => Pin.parse("123")).toThrow(ValidationError);
    expect(() => Pin.parse("12345")).toThrow(ValidationError);
    expect(() => Pin.parse("")).toThrow(ValidationError);
  });

  it("rejects non-digit characters", () => {
    expect(() => Pin.parse("12a4")).toThrow(ValidationError);
    expect(() => Pin.parse("ab12")).toThrow(ValidationError);
    expect(() => Pin.parse("12 4")).toThrow(ValidationError);
    expect(() => Pin.parse("12.4")).toThrow(ValidationError);
    expect(() => Pin.parse("12-4")).toThrow(ValidationError);
  });

  it("rejects non-string inputs", () => {
    expect(() => Pin.parse(1234)).toThrow(ValidationError);
    expect(() => Pin.parse(null)).toThrow(ValidationError);
    expect(() => Pin.parse(undefined)).toThrow(ValidationError);
  });

  it("exposes the validated value", () => {
    expect(Pin.parse("4567").value).toBe("4567");
  });
});
