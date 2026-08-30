import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryId, ProductId } from "@/domain/entities/identifiers";
import { asCategoryId } from "@/domain/entities/identifiers";
import type { Category } from "@/domain/entities/category";
import type { Product } from "@/domain/entities/product";
import type {
  CategoryRepository,
  NewProduct,
  NewProductUnit,
  ProductChanges,
  ProductFilter,
  ProductRepository,
} from "@/domain/repositories/product-repository";
import type { Page, PageRequest } from "@/domain/repositories/shared";
import type { Sku } from "@/domain/value-objects/sku";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";
import { toCategory, toProduct } from "../mappers/catalogue";

type Client = SupabaseClient<Database>;

// Selling units come back with the product rather than in a second round trip:
// a price is not optional information about a product, and on a mobile
// connection the extra request costs more than the wider row.
const PRODUCT_COLUMNS =
  "id, sku, name, category_id, cost_price, minimum_stock, is_active, created_by, created_at, updated_at, product_units(*)";

/**
 * The catalogue, in Supabase.
 *
 * Every query runs as the signed-in user, so RLS decides what comes back. A
 * cashier reading products gets products; a cashier attempting an update gets
 * a refusal from the database, not from a hidden button.
 *
 * Search and paging happen in Postgres. Nothing here pulls the catalogue into
 * memory to filter it — the POS runs on a phone over a mobile network.
 */
export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly client: Client) {}

  async findById(id: ProductId): Promise<Product | null> {
    const { data, error } = await this.client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) throw mapDatabaseError(error, { resource: "Product", identifier: id });
    return data ? toProduct(data) : null;
  }

  async findBySku(sku: Sku): Promise<Product | null> {
    const { data, error } = await this.client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("sku", sku.toString())
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Product",
        identifier: sku.toString(),
      });
    }
    return data ? toProduct(data) : null;
  }

  async findByIds(ids: readonly ProductId[]): Promise<Product[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.client
      .from("products")
      .select(PRODUCT_COLUMNS)
      .in("id", [...ids]);

    if (error) throw mapDatabaseError(error, { resource: "Product" });
    return (data ?? []).map(toProduct);
  }

  async search(
    filter: ProductFilter,
    page: PageRequest,
  ): Promise<Page<Product>> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;

    let query = this.client
      .from("products")
      .select(PRODUCT_COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, to);

    if (filter.activeOnly) {
      query = query.eq("is_active", true);
    }
    if (filter.categoryId !== undefined) {
      query =
        filter.categoryId === null
          ? query.is("category_id", null)
          : query.eq("category_id", filter.categoryId);
    }
    if (filter.search?.trim()) {
      // Escape PostgREST's pattern metacharacters and its `or` separator so a
      // search for "50%" or "a,b" is a search, not a syntax error.
      const term = filter.search.trim().replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Product" });

    const items = (data ?? []).map(toProduct);
    const total = count ?? items.length;

    return {
      items,
      total,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: from + items.length < total,
    };
  }

  /**
   * Creates the product and its opening stock in one database call.
   *
   * Two calls would leave a window where the product exists at zero, and the
   * POS would show goods that are on the shelf as out of stock. The function
   * also records the opening quantity as a `stock_in` movement, so the ledger
   * explains the first units the same way it explains every later delivery.
   */
  async create(product: NewProduct): Promise<Product> {
    const { data, error } = await this.client.rpc("create_product_with_stock", {
      p_sku: product.sku.toString(),
      p_name: product.name,
      p_category_id: product.categoryId,
      // The base unit: what the opening quantity is counted in, and what stock
      // stays counted in for the life of the product.
      p_unit_name: product.unitName ?? "Piece",
      p_retail_price: product.sellingPrice.toDecimalString(),
      // Null when the shop has not said what this sells for in bulk. The
      // database refuses a wholesale sale rather than inventing a price.
      p_wholesale_price: product.wholesalePrice?.toDecimalString() ?? null,
      p_cost_price: product.costPrice?.toDecimalString() ?? null,
      p_minimum_stock: product.minimumStock,
      p_opening_stock: product.openingStock,
    });

    if (error) throw mapDatabaseError(error, { resource: "Product" });

    const created = await this.findById(data as ProductId);
    if (!created) {
      throw new NotFoundError("Product", String(data));
    }
    return created;
  }

  async update(id: ProductId, changes: ProductChanges): Promise<Product> {
    const patch: Database["public"]["Tables"]["products"]["Update"] = {};

    if (changes.sku !== undefined) patch.sku = changes.sku.toString();
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.categoryId !== undefined) patch.category_id = changes.categoryId;
    if (changes.costPrice !== undefined) {
      patch.cost_price = changes.costPrice?.toDecimalString() ?? null;
    }
    if (changes.minimumStock !== undefined) {
      patch.minimum_stock = changes.minimumStock;
    }
    if (changes.isActive !== undefined) patch.is_active = changes.isActive;

    // Price lives on the selling unit, so repricing is a separate write. This
    // changes the default unit only: a Box price is its own number and is
    // edited on the unit itself, never moved in step with the Piece price.
    if (changes.sellingPrice !== undefined) {
      const { error: priceError } = await this.client
        .from("product_units")
        .update({ retail_price: changes.sellingPrice.toDecimalString() })
        .eq("product_id", id)
        .eq("is_default", true);

      if (priceError) {
        throw mapDatabaseError(priceError, {
          resource: "Product price",
          identifier: id,
        });
      }
    }

    const { data, error } = await this.client
      .from("products")
      .update(patch)
      .eq("id", id)
      .select(PRODUCT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Product", identifier: id });
    }
    // An RLS refusal on UPDATE returns no rows rather than an error, so a
    // cashier's attempt lands here and is reported as not-found — which is
    // also the right answer for a product that genuinely does not exist.
    if (!data) throw new NotFoundError("Product", id);

    return toProduct(data);
  }

  async addUnit(productId: ProductId, unit: NewProductUnit): Promise<Product> {
    // Goes through the function rather than an insert so the admin check and
    // the "a unit must carry its own price" rule live in one place, next to
    // the data, where a second client cannot skip them.
    const { error } = await this.client.rpc("add_product_unit", {
      p_product_id: productId,
      p_unit_name: unit.unitName,
      p_base_quantity: unit.baseQuantity,
      p_retail_price: unit.retailPrice.toDecimalString(),
      p_wholesale_price: unit.wholesalePrice?.toDecimalString() ?? null,
    });

    if (error) throw mapDatabaseError(error, { resource: "Selling unit" });

    const updated = await this.findById(productId);
    if (!updated) throw new NotFoundError("Product", productId);
    return updated;
  }

  async skuExists(sku: Sku, excludingId?: ProductId): Promise<boolean> {
    let query = this.client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("sku", sku.toString());

    if (excludingId) query = query.neq("id", excludingId);

    const { count, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Product" });
    return (count ?? 0) > 0;
  }
}

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly client: Client) {}

  async findById(id: CategoryId): Promise<Category | null> {
    const { data, error } = await this.client
      .from("categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Category", identifier: id });
    }
    return data ? toCategory(data) : null;
  }

  async list(options: { activeOnly?: boolean } = {}): Promise<Category[]> {
    let query = this.client.from("categories").select("*").order("name");
    if (options.activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Category" });
    return (data ?? []).map(toCategory);
  }

  async create(name: string, description: string | null): Promise<Category> {
    const { data, error } = await this.client
      .from("categories")
      .insert({ name, description })
      .select("*")
      .single();

    if (error) throw mapDatabaseError(error, { resource: "Category" });
    return toCategory(data);
  }

  async update(
    id: CategoryId,
    changes: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<Category> {
    const { data, error } = await this.client
      .from("categories")
      .update({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.description !== undefined
          ? { description: changes.description }
          : {}),
        ...(changes.isActive !== undefined
          ? { is_active: changes.isActive }
          : {}),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, { resource: "Category", identifier: id });
    }
    if (!data) throw new NotFoundError("Category", id);
    return toCategory(data);
  }

  async nameExists(name: string, excludingId?: CategoryId): Promise<boolean> {
    let query = this.client
      .from("categories")
      .select("id", { count: "exact", head: true })
      .ilike("name", name.trim());

    if (excludingId) query = query.neq("id", asCategoryId(excludingId));

    const { count, error } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Category" });
    return (count ?? 0) > 0;
  }
}
