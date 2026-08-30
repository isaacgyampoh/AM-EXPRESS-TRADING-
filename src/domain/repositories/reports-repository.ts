import type {
  CategoryId,
  ExpenseCategoryId,
  ProductId,
  StaffId,
} from "../entities/identifiers";
import type { PaymentMethod } from "../entities/payment";
import type { Money } from "../value-objects/money";
import type { DateRange } from "./shared";

/**
 * Report shapes.
 *
 * Every figure here is computed from stored rows — sales, sale_items,
 * payments, inventory_movements, expenses. Nothing is sampled, estimated or
 * seeded. Where a number cannot be derived honestly (profit without cost
 * prices) the type says so with `null` rather than quietly using zero.
 */

export interface SalesSummary {
  readonly range: DateRange;
  readonly totalSales: Money;
  readonly transactionCount: number;
  readonly cashTotal: Money;
  readonly mobileMoneyTotal: Money;
  /** Transactions settled with both methods. Their money is already counted above. */
  readonly splitTransactionCount: number;
  readonly averageSale: Money;
  readonly unitsSold: number;
}

export interface ProductSalesRow {
  readonly productId: ProductId;
  readonly sku: string;
  readonly name: string;
  readonly categoryName: string | null;
  readonly unitsSold: number;
  readonly revenue: Money;
  /** Null when any unit sold had no recorded cost. */
  readonly profit: Money | null;
}

export interface CategorySalesRow {
  readonly categoryId: CategoryId | null;
  readonly categoryName: string;
  readonly unitsSold: number;
  readonly revenue: Money;
}

export interface CashierSalesRow {
  readonly cashierId: StaffId;
  readonly cashierName: string;
  readonly transactionCount: number;
  readonly revenue: Money;
  readonly cashTotal: Money;
  readonly mobileMoneyTotal: Money;
}

export interface ExpenseSummary {
  readonly range: DateRange;
  readonly total: Money;
  readonly byCategory: readonly {
    readonly categoryId: ExpenseCategoryId;
    readonly categoryName: string;
    readonly total: Money;
  }[];
  readonly byMethod: readonly {
    readonly method: PaymentMethod;
    readonly total: Money;
  }[];
}

export interface InventoryValuation {
  readonly productsTracked: number;
  readonly unitsOnHand: number;
  readonly lowStockCount: number;
  readonly outOfStockCount: number;
  /** Stock at cost. Null when any tracked product has no cost price. */
  readonly valueAtCost: Money | null;
  readonly valueAtSellingPrice: Money;
}

export interface ProfitabilitySummary {
  readonly range: DateRange;
  readonly revenue: Money;
  /** Null when cost data is incomplete for the period. */
  readonly costOfGoodsSold: Money | null;
  readonly grossProfit: Money | null;
  readonly expenses: Money;
  readonly netProfit: Money | null;
  /** Line items the figures could not cover, so the gap is visible not hidden. */
  readonly productsMissingCost: readonly string[];
}

export interface DashboardSnapshot {
  readonly today: SalesSummary;
  readonly todayExpenses: Money;
  readonly lowStockCount: number;
  readonly topProducts: readonly ProductSalesRow[];
  readonly recentSales: readonly {
    readonly saleId: string;
    readonly receiptNumber: string;
    readonly total: Money;
    readonly cashierName: string;
    readonly paymentSummary: PaymentMethod | "split";
    readonly soldAt: Date;
  }[];
  readonly cashierTotals: readonly CashierSalesRow[];
}

export interface ReportsRepository {
  salesSummary(range: DateRange, cashierId?: StaffId): Promise<SalesSummary>;
  salesByProduct(range: DateRange, limit?: number): Promise<ProductSalesRow[]>;
  salesByCategory(range: DateRange): Promise<CategorySalesRow[]>;
  salesByCashier(range: DateRange): Promise<CashierSalesRow[]>;
  expenseSummary(range: DateRange): Promise<ExpenseSummary>;
  inventoryValuation(): Promise<InventoryValuation>;
  profitability(range: DateRange): Promise<ProfitabilitySummary>;

  /**
   * Incentives owed and paid in a period, per staff member.
   *
   * Reported beside expenses, never inside them: an admin who pays a bonus
   * usually records the payment in the cash book as well, and folding these
   * into the expense total would count it twice.
   */
  staffIncentives(range: DateRange): Promise<IncentiveSummaryRow[]>;
  dashboard(range: DateRange): Promise<DashboardSnapshot>;
}

export interface IncentiveSummaryRow {
  readonly staffId: StaffId;
  readonly staffName: string;
  readonly count: number;
  readonly pending: Money;
  readonly paid: Money;
}
