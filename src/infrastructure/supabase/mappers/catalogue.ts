import { Category } from "@/domain/entities/category";
import {
  asCategoryId,
  asMovementId,
  asProductId,
  asSaleId,
  asStaffId,
} from "@/domain/entities/identifiers";
import { InventoryItem } from "@/domain/entities/inventory-item";
import { InventoryMovement } from "@/domain/entities/inventory-movement";
import { Product } from "@/domain/entities/product";
import { ProductUnit } from "@/domain/entities/product-unit";
import { Money } from "@/domain/value-objects/money";
import { Quantity } from "@/domain/value-objects/quantity";
import { Sku } from "@/domain/value-objects/sku";
import type { Tables } from "../database.types";

/**
 * Database rows in, domain entities out.
 *
 * All the coupling to Supabase's column names lives here. If the schema is
 * renamed, this file changes and nothing above it does.
 *
 * NUMERIC columns arrive as JS numbers, not strings — PostgREST serialises a
 * row with PostgreSQL's `to_json`, which emits them unquoted. They go through
 * `Money.from`, which refuses anything finer than a pesewa.
 *
 * Nullable money is tested with `!= null` rather than for truthiness: a cost
 * price of 0 is a falsy number, and treating it as "no cost recorded" would
 * quietly turn a free item into an unknown-margin one in every profit report.
 */

export function toCategory(row: Tables<"categories">): Category {
  return Category.create({
    id: asCategoryId(row.id),
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
  });
}

/** A product row, with its selling units when the query asked for them. */
export type ProductRowWithUnits = Tables<"products"> & {
  product_units?: Tables<"product_units">[] | null;
};

export function toProductUnit(row: Tables<"product_units">): ProductUnit {
  return ProductUnit.create({
    id: row.id,
    unitName: row.unit_name,
    baseQuantity: row.base_quantity,
    retailPrice: Money.from(row.retail_price),
    // `!= null` and not truthiness: a wholesale price of 0 is a real price,
    // and treating it as "not sold wholesale" would refuse a legitimate sale.
    wholesalePrice:
      row.wholesale_price != null ? Money.from(row.wholesale_price) : null,
    isDefault: row.is_default,
    isActive: row.is_active,
  });
}

export function toProduct(row: ProductRowWithUnits): Product {
  const units = (row.product_units ?? []).map(toProductUnit);

  return Product.create({
    id: asProductId(row.id),
    sku: Sku.of(row.sku),
    name: row.name,
    categoryId: row.category_id ? asCategoryId(row.category_id) : null,
    // The price of one default unit. When units were loaded, Product reads it
    // from the default unit instead, so this fallback only matters for a query
    // that did not ask for them.
    sellingPrice:
      units.find((u) => u.isDefault)?.retailPrice ?? Money.zero(),
    costPrice: row.cost_price != null ? Money.from(row.cost_price) : null,
    minimumStock: row.minimum_stock,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    units,
  });
}

/**
 * Stock joined to its product. The product's name and minimum come from the
 * join because an InventoryItem is meaningless without them — a bare
 * "product 3f2a… : 4" cannot tell anyone whether that is a problem.
 */
export interface InventoryRowWithProduct {
  product_id: string;
  quantity_on_hand: number;
  updated_at: string;
  products: { name: string; minimum_stock: number } | null;
}

export function toInventoryItem(row: InventoryRowWithProduct): InventoryItem {
  return InventoryItem.create({
    productId: asProductId(row.product_id),
    productName: row.products?.name ?? "Unknown product",
    quantityOnHand: Quantity.of(row.quantity_on_hand),
    minimumStock: row.products?.minimum_stock ?? 0,
    updatedAt: new Date(row.updated_at),
  });
}

export function toInventoryMovement(
  row: Tables<"inventory_movements">,
): InventoryMovement {
  return InventoryMovement.create({
    id: asMovementId(row.id),
    productId: asProductId(row.product_id),
    type: row.movement_type,
    quantityDelta: row.quantity_delta,
    resultingQuantity: row.resulting_quantity,
    reason: row.reason,
    saleId: row.sale_id ? asSaleId(row.sale_id) : null,
    recordedBy: asStaffId(row.recorded_by),
    occurredAt: new Date(row.occurred_at),
  });
}
