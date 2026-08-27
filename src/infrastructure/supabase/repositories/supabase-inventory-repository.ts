import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductId } from "@/domain/entities/identifiers";
import type { InventoryItem } from "@/domain/entities/inventory-item";
import type { InventoryMovement } from "@/domain/entities/inventory-movement";
import { NotFoundError } from "@/domain/errors/domain-error";
import type {
  InventoryFilter,
  InventoryRepository,
  MovementFilter,
  StockAdjustmentCommand,
  StockInCommand,
} from "@/domain/repositories/inventory-repository";
import type { Page, PageRequest } from "@/domain/repositories/shared";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";
import { toInventoryItem, toInventoryMovement } from "../mappers/catalogue";

type Client = SupabaseClient<Database>;

const INVENTORY_SELECT =
  "product_id, quantity_on_hand, updated_at, products!inner ( name, minimum_stock, is_active, sku )";

/**
 * Stock balances and the ledger.
 *
 * Both writes are single RPC calls. Neither the balance nor the movement can
 * be written from here directly — RLS has no write policy on either table —
 * which is what guarantees they always move together.
 */
export class SupabaseInventoryRepository implements InventoryRepository {
  constructor(private readonly client: Client) {}

  async findByProductId(productId: ProductId): Promise<InventoryItem | null> {
    const { data, error } = await this.client
      .from("inventory")
      .select(INVENTORY_SELECT)
      .eq("product_id", productId)
      .maybeSingle();

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Stock record",
        identifier: productId,
      });
    }
    return data ? toInventoryItem(data) : null;
  }

  async findByProductIds(ids: readonly ProductId[]): Promise<InventoryItem[]> {
    if (ids.length === 0) return [];

    const { data, error } = await this.client
      .from("inventory")
      .select(INVENTORY_SELECT)
      .in("product_id", [...ids]);

    if (error) throw mapDatabaseError(error, { resource: "Stock record" });
    return (data ?? []).map(toInventoryItem);
  }

  async list(
    filter: InventoryFilter,
    page: PageRequest,
  ): Promise<Page<InventoryItem>> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;

    let query = this.client
      .from("inventory")
      .select(INVENTORY_SELECT, { count: "exact" })
      .order("name", { referencedTable: "products", ascending: true })
      .range(from, to);

    if (filter.activeProductsOnly) {
      query = query.eq("products.is_active", true);
    }
    if (filter.search?.trim()) {
      const term = filter.search.trim().replace(/[%,()]/g, " ");
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`, {
        referencedTable: "products",
      });
    }

    const { data, error, count } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Stock record" });

    let items = (data ?? []).map(toInventoryItem);

    // Low stock compares two columns across a join, which PostgREST cannot
    // express as a filter. The page is already bounded, so narrowing it here
    // is cheap — but it does mean the total below is the pre-filter total, so
    // callers asking for low stock use countLowStock() for the headline.
    if (filter.lowStockOnly) {
      items = items.filter((item) => item.isLowStock);
    }

    const total = count ?? items.length;
    return {
      items,
      total: filter.lowStockOnly ? items.length : total,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: !filter.lowStockOnly && from + items.length < total,
    };
  }

  async countLowStock(): Promise<number> {
    const { data, error } = await this.client
      .from("inventory")
      .select(INVENTORY_SELECT)
      .eq("products.is_active", true);

    if (error) throw mapDatabaseError(error, { resource: "Stock record" });
    return (data ?? [])
      .map(toInventoryItem)
      .filter((item) => item.isLowStock).length;
  }

  async listLowStock(limit: number): Promise<InventoryItem[]> {
    const { data, error } = await this.client
      .from("inventory")
      .select(INVENTORY_SELECT)
      .eq("products.is_active", true)
      .order("quantity_on_hand", { ascending: true })
      .limit(Math.max(limit * 4, limit));

    if (error) throw mapDatabaseError(error, { resource: "Stock record" });
    return (data ?? [])
      .map(toInventoryItem)
      .filter((item) => item.isLowStock)
      .slice(0, limit);
  }

  async recordStockIn(command: StockInCommand): Promise<InventoryItem> {
    const { error } = await this.client.rpc("record_stock_in", {
      p_product_id: command.productId,
      p_quantity: command.quantity,
      p_reason: command.reason,
    });

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Product",
        identifier: command.productId,
      });
    }

    const updated = await this.findByProductId(command.productId);
    if (!updated) throw new NotFoundError("Stock record", command.productId);
    return updated;
  }

  async recordAdjustment(
    command: StockAdjustmentCommand,
  ): Promise<InventoryItem> {
    const { error } = await this.client.rpc("record_stock_adjustment", {
      p_product_id: command.productId,
      p_counted_quantity: command.countedQuantity,
      p_reason: command.reason,
    });

    if (error) {
      throw mapDatabaseError(error, {
        resource: "Product",
        identifier: command.productId,
      });
    }

    const updated = await this.findByProductId(command.productId);
    if (!updated) throw new NotFoundError("Stock record", command.productId);
    return updated;
  }

  async listMovements(
    filter: MovementFilter,
    page: PageRequest,
  ): Promise<Page<InventoryMovement>> {
    const from = (page.page - 1) * page.pageSize;
    const to = from + page.pageSize - 1;

    let query = this.client
      .from("inventory_movements")
      .select("*", { count: "exact" })
      .order("occurred_at", { ascending: false })
      .range(from, to);

    if (filter.productId) query = query.eq("product_id", filter.productId);
    if (filter.type) query = query.eq("movement_type", filter.type);
    if (filter.range) {
      query = query
        .gte("occurred_at", filter.range.from.toISOString())
        .lte("occurred_at", filter.range.to.toISOString());
    }

    const { data, error, count } = await query;
    if (error) throw mapDatabaseError(error, { resource: "Stock movement" });

    const items = (data ?? []).map(toInventoryMovement);
    const total = count ?? items.length;

    return {
      items,
      total,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: from + items.length < total,
    };
  }
}
