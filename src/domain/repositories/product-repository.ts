import type { Category } from "../entities/category";
import type { CategoryId, ProductId } from "../entities/identifiers";
import type { Product } from "../entities/product";
import type { Money } from "../value-objects/money";
import type { Sku } from "../value-objects/sku";
import type { Page, PageRequest } from "./shared";

export interface ProductFilter {
  /** Matches name or SKU. Applied in the database, not in memory. */
  readonly search?: string;
  readonly categoryId?: CategoryId | null;
  readonly activeOnly?: boolean;
}

export interface NewProduct {
  readonly sku: Sku;
  readonly name: string;
  readonly categoryId: CategoryId | null;
  /** Retail price of one base unit. */
  readonly sellingPrice: Money;
  readonly costPrice: Money | null;
  readonly minimumStock: number;
  readonly isActive: boolean;
  /** Stock to record at creation. Written as a stock_in movement, not a bare balance. */
  readonly openingStock: number;
  /**
   * The base unit — what the opening stock is counted in, and what stock stays
   * counted in. Defaults to "Piece". This is why the form asks: "10" is not a
   * quantity, "10 Box" is.
   */
  readonly unitName?: string;
  /**
   * Wholesale price for one base unit, when the shop sells it that way.
   * Undefined or null means it does not, and a wholesale sale is refused
   * rather than served at the retail price.
   */
  readonly wholesalePrice?: Money | null;
}

export interface ProductChanges {
  readonly sku?: Sku;
  readonly name?: string;
  readonly categoryId?: CategoryId | null;
  readonly sellingPrice?: Money;
  readonly costPrice?: Money | null;
  readonly minimumStock?: number;
  readonly isActive?: boolean;
}

/**
 * The catalogue.
 *
 * Implemented by SupabaseProductRepository in the infrastructure layer. The
 * application layer only ever sees this interface, which is what makes the
 * business logic portable off Supabase if that ever becomes necessary.
 */
export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  findBySku(sku: Sku): Promise<Product | null>;
  /** Bulk read for checkout — one round trip, not one per cart line. */
  findByIds(ids: readonly ProductId[]): Promise<Product[]>;
  search(filter: ProductFilter, page: PageRequest): Promise<Page<Product>>;
  /**
   * No actor parameter, deliberately. Who created a product is derived from
   * the authenticated session inside the database, never passed in — an
   * argument that could be supplied is an argument that could be forged.
   */
  create(product: NewProduct): Promise<Product>;
  update(id: ProductId, changes: ProductChanges): Promise<Product>;
  skuExists(sku: Sku, excludingId?: ProductId): Promise<boolean>;
}

export interface CategoryRepository {
  findById(id: CategoryId): Promise<Category | null>;
  list(options?: { activeOnly?: boolean }): Promise<Category[]>;
  create(name: string, description: string | null): Promise<Category>;
  update(
    id: CategoryId,
    changes: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<Category>;
  nameExists(name: string, excludingId?: CategoryId): Promise<boolean>;
}
