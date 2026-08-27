import type { PaymentMethod } from "@/domain/entities/payment";
import type {
  CashierSalesRow,
  CategorySalesRow,
  ExpenseSummary,
  InventoryValuation,
  ProductSalesRow,
  ProfitabilitySummary,
  SalesSummary,
} from "@/domain/repositories/reports-repository";

/**
 * Report figures, ready to render.
 *
 * Money is a decimal string, and a figure that cannot be calculated honestly
 * stays `null` all the way to the screen — the components render "Not
 * available" and say why, rather than a confident zero.
 */

export interface SalesSummaryDto {
  readonly totalSales: string;
  readonly transactionCount: number;
  readonly cashTotal: string;
  readonly mobileMoneyTotal: string;
  readonly splitTransactionCount: number;
  readonly averageSale: string;
  readonly unitsSold: number;
}

export function toSalesSummaryDto(summary: SalesSummary): SalesSummaryDto {
  return {
    totalSales: summary.totalSales.toDecimalString(),
    transactionCount: summary.transactionCount,
    cashTotal: summary.cashTotal.toDecimalString(),
    mobileMoneyTotal: summary.mobileMoneyTotal.toDecimalString(),
    splitTransactionCount: summary.splitTransactionCount,
    averageSale: summary.averageSale.toDecimalString(),
    unitsSold: summary.unitsSold,
  };
}

export interface ProductSalesDto {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly categoryName: string | null;
  readonly unitsSold: number;
  readonly revenue: string;
  readonly profit: string | null;
}

export function toProductSalesDto(row: ProductSalesRow): ProductSalesDto {
  return {
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    categoryName: row.categoryName,
    unitsSold: row.unitsSold,
    revenue: row.revenue.toDecimalString(),
    profit: row.profit?.toDecimalString() ?? null,
  };
}

export interface CategorySalesDto {
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly unitsSold: number;
  readonly revenue: string;
}

export function toCategorySalesDto(row: CategorySalesRow): CategorySalesDto {
  return {
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    unitsSold: row.unitsSold,
    revenue: row.revenue.toDecimalString(),
  };
}

export interface CashierSalesDto {
  readonly cashierId: string;
  readonly cashierName: string;
  readonly transactionCount: number;
  readonly revenue: string;
  readonly cashTotal: string;
  readonly mobileMoneyTotal: string;
}

export function toCashierSalesDto(row: CashierSalesRow): CashierSalesDto {
  return {
    cashierId: row.cashierId,
    cashierName: row.cashierName,
    transactionCount: row.transactionCount,
    revenue: row.revenue.toDecimalString(),
    cashTotal: row.cashTotal.toDecimalString(),
    mobileMoneyTotal: row.mobileMoneyTotal.toDecimalString(),
  };
}

export interface ExpenseSummaryDto {
  readonly total: string;
  readonly byCategory: readonly {
    readonly categoryId: string;
    readonly categoryName: string;
    readonly total: string;
  }[];
  readonly byMethod: readonly {
    readonly method: PaymentMethod;
    readonly total: string;
  }[];
}

export function toExpenseSummaryDto(summary: ExpenseSummary): ExpenseSummaryDto {
  return {
    total: summary.total.toDecimalString(),
    byCategory: summary.byCategory.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      total: row.total.toDecimalString(),
    })),
    byMethod: summary.byMethod.map((row) => ({
      method: row.method,
      total: row.total.toDecimalString(),
    })),
  };
}

export interface InventoryValuationDto {
  readonly productsTracked: number;
  readonly unitsOnHand: number;
  readonly lowStockCount: number;
  readonly outOfStockCount: number;
  readonly valueAtCost: string | null;
  readonly valueAtSellingPrice: string;
}

export function toInventoryValuationDto(
  valuation: InventoryValuation,
): InventoryValuationDto {
  return {
    productsTracked: valuation.productsTracked,
    unitsOnHand: valuation.unitsOnHand,
    lowStockCount: valuation.lowStockCount,
    outOfStockCount: valuation.outOfStockCount,
    valueAtCost: valuation.valueAtCost?.toDecimalString() ?? null,
    valueAtSellingPrice: valuation.valueAtSellingPrice.toDecimalString(),
  };
}

export interface ProfitabilityDto {
  readonly revenue: string;
  readonly costOfGoodsSold: string | null;
  readonly grossProfit: string | null;
  readonly expenses: string;
  readonly netProfit: string | null;
  /** Named, so the owner knows exactly which products to go and price. */
  readonly productsMissingCost: readonly string[];
}

export function toProfitabilityDto(
  summary: ProfitabilitySummary,
): ProfitabilityDto {
  return {
    revenue: summary.revenue.toDecimalString(),
    costOfGoodsSold: summary.costOfGoodsSold?.toDecimalString() ?? null,
    grossProfit: summary.grossProfit?.toDecimalString() ?? null,
    expenses: summary.expenses.toDecimalString(),
    netProfit: summary.netProfit?.toDecimalString() ?? null,
    productsMissingCost: summary.productsMissingCost,
  };
}

export interface RecentSaleDto {
  readonly saleId: string;
  readonly receiptNumber: string;
  readonly total: string;
  readonly cashierName: string;
  readonly paymentSummary: PaymentMethod | "split";
  readonly soldAt: string;
}

export interface DashboardDto {
  readonly today: SalesSummaryDto;
  readonly todayExpenses: string;
  readonly lowStockCount: number;
  readonly topProducts: readonly ProductSalesDto[];
  readonly recentSales: readonly RecentSaleDto[];
  readonly cashierTotals: readonly CashierSalesDto[];
  /** False for a cashier, whose home screen shows only their own takings. */
  readonly isBusinessWide: boolean;
}
