import { beforeEach, describe, expect, it } from "vitest";
import { CreateProduct } from "@/application/use-cases/create-product";
import { UpdateProduct } from "@/application/use-cases/update-product";
import { AddStock, AdjustStock } from "@/application/use-cases/manage-stock";
import { ListProducts } from "@/application/use-cases/list-products";
import { ConflictError, ForbiddenError, ValidationError } from "@/domain/errors/domain-error";
import { aProduct, aStaff } from "../support/builders";
import {
  FakeCategoryRepository,
  FakeInventoryRepository,
  FakeProductRepository,
} from "../support/fakes";

const admin = aStaff({ role: "admin", fullName: "Akosua Mensah" });
const cashier = aStaff({ role: "cashier", fullName: "Kofi Boateng" });

describe("CreateProduct", () => {
  let products: FakeProductRepository;
  let inventory: FakeInventoryRepository;
  let useCase: CreateProduct;

  beforeEach(() => {
    products = new FakeProductRepository();
    inventory = new FakeInventoryRepository();
    useCase = new CreateProduct(
      products,
      new FakeCategoryRepository(),
      inventory,
    );
  });

  const validInput = {
    sku: "rice-5kg",
    name: "  Rice 5kg  ",
    sellingPrice: "50.00",
    costPrice: "38.00",
    minimumStock: 5,
    openingStock: 0,
    isActive: true,
  };

  it("creates a product, normalising the SKU and trimming the name", async () => {
    const product = await useCase.execute(admin, validInput);

    expect(product.sku).toBe("RICE-5KG");
    expect(product.name).toBe("Rice 5kg");
    expect(product.sellingPrice).toBe("50.00");
    expect(product.unitMargin).toBe("12.00");
  });

  it("refuses a cashier", async () => {
    await expect(useCase.execute(cashier, validInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("checks permission before it checks the form", async () => {
    // Nonsense input, wrong role. The role must be what stops it — otherwise
    // the validation messages describe the system to someone who is not
    // allowed to see it.
    await expect(
      useCase.execute(cashier, { sku: "", name: "", sellingPrice: "nope" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a duplicate SKU, comparing normalised values", async () => {
    await useCase.execute(admin, validInput);

    await expect(
      useCase.execute(admin, { ...validInput, sku: " RICE-5kg " }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses a price that is not money", async () => {
    await expect(
      useCase.execute(admin, { ...validInput, sellingPrice: "12.345" }),
    ).rejects.toThrow(ValidationError);
  });

  it("treats a blank cost price as unknown rather than zero", async () => {
    const product = await useCase.execute(admin, {
      ...validInput,
      costPrice: "",
    });

    expect(product.costPrice).toBeNull();
    expect(product.unitMargin).toBeNull();
  });
});

describe("UpdateProduct", () => {
  const rice = aProduct({ sku: "RICE-5KG", sellingPrice: "50.00" });
  const oil = aProduct({ sku: "OIL-1L", sellingPrice: "25.00" });

  let products: FakeProductRepository;
  let useCase: UpdateProduct;

  beforeEach(() => {
    products = new FakeProductRepository([rice, oil]);
    useCase = new UpdateProduct(
      products,
      new FakeCategoryRepository(),
      new FakeInventoryRepository([
        { product: rice, onHand: 6 },
        { product: oil, onHand: 2 },
      ]),
    );
  });

  it("changes a price", async () => {
    const updated = await useCase.execute(admin, {
      id: rice.id,
      sellingPrice: "55.00",
    });

    expect(updated.sellingPrice).toBe("55.00");
  });

  it("refuses a SKU that belongs to another product", async () => {
    await expect(
      useCase.execute(admin, { id: rice.id, sku: "OIL-1L" }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows a product to keep its own SKU", async () => {
    await expect(
      useCase.execute(admin, { id: rice.id, sku: "rice-5kg", name: "Rice 5kg bag" }),
    ).resolves.toBeDefined();
  });

  it("refuses a cashier", async () => {
    await expect(
      useCase.execute(cashier, { id: rice.id, sellingPrice: "0.01" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("reports the stock alongside the product", async () => {
    const updated = await useCase.execute(admin, {
      id: rice.id,
      name: "Rice 5kg bag",
    });

    // Editing the catalogue never moves a balance — that is what makes the
    // movement ledger trustworthy. The quantity comes back unchanged.
    expect(updated.quantityOnHand).toBe(6);
    expect(updated.name).toBe("Rice 5kg bag");
  });
});

describe("AddStock and AdjustStock", () => {
  const rice = aProduct({ name: "Rice 5kg", minimumStock: 5 });

  let inventory: FakeInventoryRepository;
  let addStock: AddStock;
  let adjustStock: AdjustStock;

  beforeEach(() => {
    const products = new FakeProductRepository([rice]);
    inventory = new FakeInventoryRepository([{ product: rice, onHand: 10 }]);
    addStock = new AddStock(inventory, products);
    adjustStock = new AdjustStock(inventory, products);
  });

  it("adds received stock", async () => {
    const result = await addStock.execute(admin, {
      productId: rice.id,
      quantity: 12,
      reason: "Delivery from supplier",
    });

    expect(result.quantityOnHand).toBe(22);
    expect(inventory.movements).toEqual([
      { productId: rice.id, delta: 12, reason: "Delivery from supplier" },
    ]);
  });

  it("refuses a cashier adding stock", async () => {
    await expect(
      addStock.execute(cashier, { productId: rice.id, quantity: 12 }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a stock-in of zero", async () => {
    await expect(
      addStock.execute(admin, { productId: rice.id, quantity: 0 }),
    ).rejects.toThrow(ValidationError);
  });

  it("sets stock to a counted figure and records the difference", async () => {
    const result = await adjustStock.execute(admin, {
      productId: rice.id,
      countedQuantity: 7,
      reason: "Stock take: three bags damaged",
    });

    expect(result.quantityOnHand).toBe(7);
    expect(inventory.movements[0].delta).toBe(-3);
  });

  it("refuses an adjustment with no reason", async () => {
    await expect(
      adjustStock.execute(admin, {
        productId: rice.id,
        countedQuantity: 7,
        reason: "   ",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("flags low stock after an adjustment takes it below the minimum", async () => {
    const result = await adjustStock.execute(admin, {
      productId: rice.id,
      countedQuantity: 3,
      reason: "Stock take",
    });

    expect(result.isLowStock).toBe(true);
  });
});

describe("ListProducts", () => {
  it("returns each product with its stock in one pass", async () => {
    const rice = aProduct({ name: "Rice 5kg", minimumStock: 5 });
    const oil = aProduct({ name: "Cooking Oil 1L", minimumStock: 3 });

    const useCase = new ListProducts(
      new FakeProductRepository([rice, oil]),
      new FakeInventoryRepository([
        { product: rice, onHand: 12 },
        { product: oil, onHand: 2 },
      ]),
      new FakeCategoryRepository(),
    );

    const page = await useCase.execute(cashier, {});

    expect(page.items).toHaveLength(2);
    expect(page.items.find((p) => p.name === "Rice 5kg")?.quantityOnHand).toBe(12);
    expect(page.items.find((p) => p.name === "Cooking Oil 1L")?.isLowStock).toBe(
      true,
    );
  });

  it("lets a cashier read the catalogue", async () => {
    const useCase = new ListProducts(
      new FakeProductRepository([aProduct()]),
      new FakeInventoryRepository(),
      new FakeCategoryRepository(),
    );

    await expect(useCase.execute(cashier)).resolves.toBeDefined();
  });

  it("caps an unreasonable page size rather than trying to serve it", async () => {
    const useCase = new ListProducts(
      new FakeProductRepository([aProduct()]),
      new FakeInventoryRepository(),
      new FakeCategoryRepository(),
    );

    const page = await useCase.execute(cashier, { pageSize: 100_000 });
    expect(page.pageSize).toBe(100);
  });
});
