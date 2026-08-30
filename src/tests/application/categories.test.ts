import { beforeEach, describe, expect, it } from "vitest";
import {
  CreateCategory,
  UpdateCategory,
} from "@/application/use-cases/manage-categories";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { aStaff } from "../support/builders";
import { FakeCategoryRepository } from "../support/fakes";

const admin = aStaff({ role: "admin", fullName: "Akosua Mensah" });
const cashier = aStaff({ role: "cashier", fullName: "Kofi Boateng" });

describe("CreateCategory", () => {
  let categories: FakeCategoryRepository;
  let useCase: CreateCategory;

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    useCase = new CreateCategory(categories);
  });

  it("creates a category", async () => {
    const dto = await useCase.execute(admin, { name: "Provisions" });
    expect(dto.name).toBe("Provisions");
    expect(dto.isActive).toBe(true);
  });

  it("trims the name so a stray space cannot make a second category", async () => {
    const dto = await useCase.execute(admin, { name: "  Drinks  " });
    expect(dto.name).toBe("Drinks");
  });

  it("refuses a name that already exists, whatever its case", async () => {
    await useCase.execute(admin, { name: "Provisions" });

    // The database's unique index is case-insensitive, so this check exists to
    // produce a sentence rather than a constraint violation.
    await expect(useCase.execute(admin, { name: "provisions" })).rejects.toThrow(
      ConflictError,
    );
  });

  it("refuses an empty name", async () => {
    await expect(useCase.execute(admin, { name: "   " })).rejects.toThrow(
      ValidationError,
    );
  });

  it("refuses a cashier", async () => {
    await expect(
      useCase.execute(cashier, { name: "Free stuff" }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("UpdateCategory", () => {
  let categories: FakeCategoryRepository;
  let create: CreateCategory;
  let useCase: UpdateCategory;

  beforeEach(() => {
    categories = new FakeCategoryRepository();
    create = new CreateCategory(categories);
    useCase = new UpdateCategory(categories);
  });

  const seed = async (name: string) =>
    (await create.execute(admin, { name })).id;

  it("renames a category", async () => {
    const id = await seed("Provisons");

    const dto = await useCase.execute(admin, { id, name: "Provisions" });
    expect(dto.name).toBe("Provisions");
  });

  it("retires a category instead of deleting it", async () => {
    // Retiring keeps every report that already groups by this category intact.
    const id = await seed("Seasonal");

    const dto = await useCase.execute(admin, { id, isActive: "" });
    expect(dto.isActive).toBe(false);

    const all = await categories.list();
    expect(all).toHaveLength(1);
  });

  it("restores a retired category", async () => {
    const id = await seed("Seasonal");
    await useCase.execute(admin, { id, isActive: "" });

    const dto = await useCase.execute(admin, { id, isActive: "true" });
    expect(dto.isActive).toBe(true);
  });

  it("refuses a rename onto another category's name", async () => {
    await seed("Provisions");
    const id = await seed("Drinks");

    await expect(
      useCase.execute(admin, { id, name: "provisions" }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows a category to keep its own name", async () => {
    const id = await seed("Provisions");

    // Changing only the description must not trip the uniqueness check against
    // the category's own name.
    const dto = await useCase.execute(admin, {
      id,
      name: "Provisions",
      description: "Dry goods",
    });
    expect(dto.name).toBe("Provisions");
  });

  it("refuses a category that does not exist", async () => {
    await expect(
      useCase.execute(admin, {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Ghost",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses a cashier", async () => {
    const id = await seed("Provisions");
    await expect(
      useCase.execute(cashier, { id, name: "Mine now" }),
    ).rejects.toThrow(ForbiddenError);
  });
});
