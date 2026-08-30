import { beforeEach, describe, expect, it } from "vitest";
import {
  CreateUnit,
  ListUnits,
  SetUnitActive,
} from "@/application/use-cases/manage-units";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { aStaff } from "../support/builders";
import { FakeUnitRepository } from "../support/fakes";

const admin = aStaff({ role: "admin", fullName: "Akosua Mensah" });
const cashier = aStaff({ role: "cashier", fullName: "Kofi Boateng" });

describe("CreateUnit", () => {
  let units: FakeUnitRepository;
  let useCase: CreateUnit;

  beforeEach(() => {
    units = new FakeUnitRepository([
      { name: "Piece", isActive: true, usageCount: 3 },
    ]);
    useCase = new CreateUnit(units);
  });

  it("stores the name in the case it will be displayed in", async () => {
    // These appear verbatim on the POS tiles and on receipts, so "BOX" and
    // "box" arriving from different admins would show up as written.
    expect((await useCase.execute(admin, { name: "crate" })).name).toBe("Crate");
    expect((await useCase.execute(admin, { name: "TIN" })).name).toBe("Tin");
  });

  it("refuses a duplicate once normalised", async () => {
    // "piece" normalises onto the existing "Piece", which is the primary key.
    await expect(useCase.execute(admin, { name: "piece" })).rejects.toThrow(
      ConflictError,
    );
  });

  it("refuses an empty name", async () => {
    await expect(useCase.execute(admin, { name: "  " })).rejects.toThrow(
      ValidationError,
    );
  });

  it("refuses a cashier", async () => {
    await expect(useCase.execute(cashier, { name: "Crate" })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("SetUnitActive", () => {
  let units: FakeUnitRepository;
  let useCase: SetUnitActive;

  beforeEach(() => {
    units = new FakeUnitRepository([
      { name: "Piece", isActive: true, usageCount: 3 },
      { name: "Crate", isActive: true, usageCount: 0 },
      { name: "Tin", isActive: false, usageCount: 0 },
    ]);
    useCase = new SetUnitActive(units);
  });

  it("retires a unit nothing is sold in", async () => {
    const unit = await useCase.execute(admin, { name: "Crate", isActive: "" });
    expect(unit.isActive).toBe(false);
  });

  it("refuses to retire a unit products are sold in", async () => {
    // The products would keep selling — the price lives on product_units, not
    // here — but the unit would vanish from the forms, leaving an admin unable
    // to see what a product's pack size is counted in.
    await expect(
      useCase.execute(admin, { name: "Piece", isActive: "" }),
    ).rejects.toThrow(/used by 3 products/i);
  });

  it("says 'product' rather than 'products' for one", async () => {
    const one = new SetUnitActive(
      new FakeUnitRepository([{ name: "Bag", isActive: true, usageCount: 1 }]),
    );
    await expect(
      one.execute(admin, { name: "Bag", isActive: "" }),
    ).rejects.toThrow(/used by 1 product\./i);
  });

  it("restores a retired unit without checking usage", async () => {
    const unit = await useCase.execute(admin, { name: "Tin", isActive: "true" });
    expect(unit.isActive).toBe(true);
  });

  it("refuses a cashier", async () => {
    await expect(
      useCase.execute(cashier, { name: "Crate", isActive: "" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("ListUnits", () => {
  it("is readable by a cashier, because the till needs it", async () => {
    const units = new FakeUnitRepository([
      { name: "Piece", isActive: true, usageCount: 1 },
    ]);
    const listed = await new ListUnits(units).execute(cashier);
    expect(listed).toHaveLength(1);
  });
});
