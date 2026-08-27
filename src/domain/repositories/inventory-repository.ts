import type { ProductId, StaffId } from "../entities/identifiers";
import type { InventoryItem } from "../entities/inventory-item";
import type { InventoryMovement, MovementType } from "../entities/inventory-movement";
import type { DateRange, Page, PageRequest } from "./shared";

export interface InventoryFilter {
  readonly search?: string;
  readonly lowStockOnly?: boolean;
  readonly activeProductsOnly?: boolean;
}

export interface MovementFilter {
  readonly productId?: ProductId;
  readonly type?: MovementType;
  readonly range?: DateRange;
}

export interface StockInCommand {
  readonly productId: ProductId;
  readonly quantity: number;
  readonly reason: string | null;
  readonly recordedBy: StaffId;
}

export interface StockAdjustmentCommand {
  readonly productId: ProductId;
  /** The counted figure the balance should become, not a delta. */
  readonly countedQuantity: number;
  /** Required: an adjustment without a reason is an unexplained discrepancy. */
  readonly reason: string;
  readonly recordedBy: StaffId;
}

/**
 * Stock balances and the ledger behind them.
 *
 * Both write operations are single database calls that update the balance and
 * append the movement together. Splitting them across two round trips would
 * make it possible to change a balance without a corresponding ledger line,
 * which is exactly the state the audit trail exists to prevent.
 */
export interface InventoryRepository {
  findByProductId(productId: ProductId): Promise<InventoryItem | null>;
  findByProductIds(ids: readonly ProductId[]): Promise<InventoryItem[]>;
  list(filter: InventoryFilter, page: PageRequest): Promise<Page<InventoryItem>>;
  countLowStock(): Promise<number>;
  listLowStock(limit: number): Promise<InventoryItem[]>;

  /** Adds stock and records a `stock_in` movement atomically. */
  recordStockIn(command: StockInCommand): Promise<InventoryItem>;

  /** Sets the balance to a counted figure and records an `adjustment`. */
  recordAdjustment(command: StockAdjustmentCommand): Promise<InventoryItem>;

  listMovements(
    filter: MovementFilter,
    page: PageRequest,
  ): Promise<Page<InventoryMovement>>;
}
