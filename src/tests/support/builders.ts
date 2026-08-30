import { InventoryItem } from "@/domain/entities/inventory-item";
import { Product } from "@/domain/entities/product";
import type { ProductUnit } from "@/domain/entities/product-unit";
import { Staff } from "@/domain/entities/staff";
import {
  asCategoryId,
  asProductId,
  asStaffId,
  type ProductId,
} from "@/domain/entities/identifiers";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";
import { Role } from "@/domain/value-objects/role";
import { Sku } from "@/domain/value-objects/sku";

/** Fixed instant so nothing in the suite depends on the clock. */
export const AT = new Date("2026-08-27T09:00:00.000Z");

let counter = 0;
const nextId = () =>
  `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export function aProduct(
  overrides: Partial<{
    id: string;
    sku: string;
    name: string;
    categoryId: string | null;
    sellingPrice: string;
    costPrice: string | null;
    minimumStock: number;
    isActive: boolean;
    units: readonly ProductUnit[];
  }> = {},
): Product {
  return Product.create({
    units: overrides.units,
    id: asProductId(overrides.id ?? nextId()),
    sku: Sku.of(overrides.sku ?? `SKU-${counter}`),
    name: overrides.name ?? "Bag of Rice 5kg",
    categoryId:
      overrides.categoryId === undefined
        ? asCategoryId(nextId())
        : overrides.categoryId === null
          ? null
          : asCategoryId(overrides.categoryId),
    sellingPrice: Money.fromDecimalString(overrides.sellingPrice ?? "50.00"),
    costPrice:
      overrides.costPrice === null
        ? null
        : Money.fromDecimalString(overrides.costPrice ?? "38.00"),
    minimumStock: overrides.minimumStock ?? 5,
    isActive: overrides.isActive ?? true,
    createdAt: AT,
    updatedAt: AT,
  });
}

export function stockOf(product: Product, onHand: number): InventoryItem {
  return InventoryItem.create({
    productId: product.id,
    productName: product.name,
    quantityOnHand: Quantity.of(onHand),
    minimumStock: product.minimumStock,
    updatedAt: AT,
  });
}

export function aStaff(
  overrides: Partial<{
    id: string;
    fullName: string;
    email: string;
    role: "admin" | "cashier";
    isActive: boolean;
  }> = {},
): Staff {
  return Staff.create({
    id: asStaffId(overrides.id ?? nextId()),
    fullName: overrides.fullName ?? "Ama Mensah",
    email: overrides.email ?? `staff${counter}@amexpress.test`,
    role: Role.of(overrides.role ?? "cashier"),
    isActive: overrides.isActive ?? true,
    createdAt: AT,
  });
}

/** Builds the two lookup maps CheckoutPolicy expects. */
export function checkoutContext(
  entries: readonly { product: Product; onHand: number }[],
) {
  const products = new Map<ProductId, Product>();
  const stock = new Map<ProductId, InventoryItem>();
  for (const entry of entries) {
    products.set(entry.product.id, entry.product);
    stock.set(entry.product.id, stockOf(entry.product, entry.onHand));
  }
  return { products, stock };
}
