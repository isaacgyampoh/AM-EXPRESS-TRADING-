import type { Category } from "@/domain/entities/category";
import type { InventoryItem } from "@/domain/entities/inventory-item";
import type { Product } from "@/domain/entities/product";

/**
 * Plain data for the presentation layer.
 *
 * Domain entities are classes with methods and private state; they do not
 * survive the server-to-client boundary in Next.js. So everything that crosses
 * it is a plain object, with money as a decimal string — never a number,
 * because a number is where the pesewa goes missing, and never pre-formatted
 * with a currency symbol, because the symbol is a business setting the
 * component reads for itself.
 */
export interface ProductDto {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly sellingPrice: string;
  readonly costPrice: string | null;
  readonly minimumStock: number;
  readonly isActive: boolean;
  readonly quantityOnHand: number;
  readonly isLowStock: boolean;
  readonly isOutOfStock: boolean;
  /** Null when cost is unknown; reports must not treat that as zero. */
  readonly unitMargin: string | null;
}

export interface CategoryDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isActive: boolean;
}

export function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
  };
}

export function toProductDto(
  product: Product,
  stock: InventoryItem | undefined,
  categoryName: string | null = null,
): ProductDto {
  return {
    id: product.id,
    sku: product.sku.toString(),
    name: product.name,
    categoryId: product.categoryId,
    categoryName,
    sellingPrice: product.sellingPrice.toDecimalString(),
    costPrice: product.costPrice?.toDecimalString() ?? null,
    minimumStock: product.minimumStock,
    isActive: product.isActive,
    quantityOnHand: stock?.quantityOnHand.toNumber() ?? 0,
    isLowStock: stock?.isLowStock ?? true,
    isOutOfStock: stock?.isOutOfStock ?? true,
    unitMargin: product.unitMargin?.toDecimalString() ?? null,
  };
}

export interface PageDto<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}
