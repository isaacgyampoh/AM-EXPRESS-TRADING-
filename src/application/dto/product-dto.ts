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
/** One way a product is sold, flattened for the client. */
export interface ProductUnitDto {
  readonly id: string;
  readonly unitName: string;
  /** Base units contained. Selling one removes this many from stock. */
  readonly baseQuantity: number;
  readonly retailPrice: string;
  /** Null means not sold wholesale — the till refuses rather than substitutes. */
  readonly wholesalePrice: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

export interface ProductDto {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  /** Retail price of one default selling unit. */
  readonly sellingPrice: string;
  /** Wholesale price of that unit, or null when it is not sold wholesale. */
  readonly wholesalePrice: string | null;
  /** The unit that price is per, and that stock is counted in. */
  readonly unitName: string;
  /** How this product can be sold — a Box as well as a Piece, say. */
  readonly units: readonly ProductUnitDto[];
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
    wholesalePrice:
      product.defaultUnit?.wholesalePrice?.toDecimalString() ?? null,
    unitName: product.defaultUnit?.unitName ?? "Piece",
    units: product.units.map((unit) => ({
      id: unit.id,
      unitName: unit.unitName,
      baseQuantity: unit.baseQuantity,
      retailPrice: unit.retailPrice.toDecimalString(),
      wholesalePrice: unit.wholesalePrice?.toDecimalString() ?? null,
      isDefault: unit.isDefault,
      isActive: unit.isActive,
    })),
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
