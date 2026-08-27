import { describe, expect, it } from "vitest";
import { Role, PERMISSIONS } from "@/domain/value-objects/role";
import { ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import { InactiveStaffError } from "@/domain/errors/business-errors";
import { aStaff } from "../support/builders";

describe("Role", () => {
  it("lets an admin do everything the system defines", () => {
    const admin = Role.admin();
    for (const permission of PERMISSIONS) {
      expect(admin.can(permission)).toBe(true);
    }
  });

  it("lets a cashier sell and look things up", () => {
    const cashier = Role.cashier();
    expect(cashier.can("sale:create")).toBe(true);
    expect(cashier.can("product:read")).toBe(true);
    expect(cashier.can("inventory:read")).toBe(true);
    expect(cashier.can("sale:read:own")).toBe(true);
  });

  it.each([
    "product:write",
    "inventory:adjust",
    "expense:read",
    "expense:write",
    "staff:read",
    "staff:write",
    "report:sales",
    "report:profit",
    "settings:write",
    "sale:read:all",
    "sale:void",
  ] as const)("does not let a cashier %s", (permission) => {
    expect(Role.cashier().can(permission)).toBe(false);
  });

  it("rejects an unknown role name", () => {
    expect(() => Role.of("manager")).toThrow(ValidationError);
  });

  it("normalises case and whitespace", () => {
    expect(Role.of("  ADMIN ").isAdmin).toBe(true);
  });
});

describe("Staff.assertCan", () => {
  it("permits an active admin", () => {
    expect(() => aStaff({ role: "admin" }).assertCan("settings:write")).not.toThrow();
  });

  it("blocks a cashier from an admin operation with a clear error", () => {
    const cashier = aStaff({ role: "cashier" });
    expect(() => cashier.assertCan("report:profit")).toThrow(ForbiddenError);
  });

  it("blocks a deactivated staff member from everything, including selling", () => {
    const suspended = aStaff({ role: "cashier", isActive: false });
    expect(() => suspended.assertCan("sale:create")).toThrow(InactiveStaffError);
    expect(suspended.can("sale:create")).toBe(false);
  });

  it("blocks a deactivated admin too", () => {
    const suspended = aStaff({ role: "admin", isActive: false });
    expect(() => suspended.assertCan("settings:write")).toThrow(
      InactiveStaffError,
    );
  });
});
