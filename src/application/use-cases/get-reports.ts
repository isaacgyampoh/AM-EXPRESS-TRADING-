import type { Staff } from "@/domain/entities/staff";
import type { InventoryRepository } from "@/domain/repositories/inventory-repository";
import type { ReportsRepository } from "@/domain/repositories/reports-repository";
import type { DateRange } from "@/domain/repositories/shared";
import {
  toCashierSalesDto,
  toCategorySalesDto,
  toExpenseSummaryDto,
  toInventoryValuationDto,
  toProductSalesDto,
  toProfitabilityDto,
  toSalesSummaryDto,
  type CashierSalesDto,
  type CategorySalesDto,
  type DashboardDto,
  type ExpenseSummaryDto,
  type InventoryValuationDto,
  type ProductSalesDto,
  type ProfitabilityDto,
  type SalesSummaryDto,
} from "../dto/report-dto";

/**
 * Turns a pair of date strings into an inclusive range.
 *
 * The end of the day is 23:59:59.999 local to the browser that sent the dates,
 * not UTC midnight. A sale at 20:00 in Accra on the 27th belongs to the 27th,
 * and would be missing from that day's takings if the range ended at UTC
 * midnight — which is exactly the sort of bug that makes an owner distrust
 * the whole system.
 */
export function dayRange(from: string, to: string): DateRange {
  return {
    from: new Date(`${from}T00:00:00.000`),
    to: new Date(`${to}T23:59:59.999`),
  };
}

export function todayRange(): DateRange {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

export interface SalesReportDto {
  readonly summary: SalesSummaryDto;
  readonly byProduct: readonly ProductSalesDto[];
  readonly byCategory: readonly CategorySalesDto[];
  readonly byCashier: readonly CashierSalesDto[];
}

/**
 * The sales report.
 *
 * An admin gets the business; a cashier gets their own summary and nothing
 * else — the breakdowns are refused by the database, so the use case does not
 * even ask for them.
 */
export class GetSalesReport {
  constructor(private readonly reports: ReportsRepository) {}

  async execute(actor: Staff, range: DateRange): Promise<SalesReportDto> {
    if (!actor.can("report:sales")) {
      actor.assertCan("sale:read:own");

      const summary = await this.reports.salesSummary(range, actor.id);
      return {
        summary: toSalesSummaryDto(summary),
        byProduct: [],
        byCategory: [],
        byCashier: [],
      };
    }

    const [summary, byProduct, byCategory, byCashier] = await Promise.all([
      this.reports.salesSummary(range),
      this.reports.salesByProduct(range, 50),
      this.reports.salesByCategory(range),
      this.reports.salesByCashier(range),
    ]);

    return {
      summary: toSalesSummaryDto(summary),
      byProduct: byProduct.map(toProductSalesDto),
      byCategory: byCategory.map(toCategorySalesDto),
      byCashier: byCashier.map(toCashierSalesDto),
    };
  }
}

export interface InventoryReportDto {
  readonly valuation: InventoryValuationDto;
  readonly lowStock: readonly {
    readonly productId: string;
    readonly productName: string;
    readonly quantityOnHand: number;
    readonly minimumStock: number;
  }[];
  readonly movements: readonly {
    readonly id: string;
    readonly productId: string;
    readonly type: string;
    readonly quantityDelta: number;
    readonly resultingQuantity: number;
    readonly reason: string | null;
    readonly occurredAt: string;
  }[];
}

export class GetInventoryReport {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  async execute(actor: Staff, range: DateRange): Promise<InventoryReportDto> {
    actor.assertCan("report:inventory");

    const [valuation, lowStock, movements] = await Promise.all([
      this.reports.inventoryValuation(),
      this.inventory.listLowStock(20),
      this.inventory.listMovements({ range }, { page: 1, pageSize: 50 }),
    ]);

    return {
      valuation: toInventoryValuationDto(valuation),
      lowStock: lowStock.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantityOnHand: item.quantityOnHand.toNumber(),
        minimumStock: item.minimumStock,
      })),
      movements: movements.items.map((movement) => ({
        id: movement.id,
        productId: movement.productId,
        type: movement.type,
        quantityDelta: movement.quantityDelta,
        resultingQuantity: movement.resultingQuantity,
        reason: movement.reason,
        occurredAt: movement.occurredAt.toISOString(),
      })),
    };
  }
}

export class GetExpenseReport {
  constructor(private readonly reports: ReportsRepository) {}

  async execute(actor: Staff, range: DateRange): Promise<ExpenseSummaryDto> {
    actor.assertCan("report:expenses");
    return toExpenseSummaryDto(await this.reports.expenseSummary(range));
  }
}

export class GetProfitReport {
  constructor(private readonly reports: ReportsRepository) {}

  async execute(actor: Staff, range: DateRange): Promise<ProfitabilityDto> {
    actor.assertCan("report:profit");
    return toProfitabilityDto(await this.reports.profitability(range));
  }
}

/**
 * The home screen.
 *
 * A cashier sees their own takings for today. An admin sees the business.
 * Which one you get is decided here, from the role resolved on the server, and
 * enforced again by the report functions themselves.
 */
export class GetDashboard {
  constructor(private readonly reports: ReportsRepository) {}

  async execute(actor: Staff): Promise<DashboardDto> {
    actor.assertCan("sale:read:own");

    const range = todayRange();
    const isBusinessWide = actor.can("report:sales");

    if (!isBusinessWide) {
      const summary = await this.reports.salesSummary(range, actor.id);
      return {
        today: toSalesSummaryDto(summary),
        todayExpenses: "0.00",
        lowStockCount: 0,
        topProducts: [],
        recentSales: [],
        cashierTotals: [],
        isBusinessWide: false,
      };
    }

    const snapshot = await this.reports.dashboard(range);

    return {
      today: toSalesSummaryDto(snapshot.today),
      todayExpenses: snapshot.todayExpenses.toDecimalString(),
      lowStockCount: snapshot.lowStockCount,
      topProducts: snapshot.topProducts.map(toProductSalesDto),
      recentSales: snapshot.recentSales.map((sale) => ({
        saleId: sale.saleId,
        receiptNumber: sale.receiptNumber,
        total: sale.total.toDecimalString(),
        cashierName: sale.cashierName,
        paymentSummary: sale.paymentSummary,
        soldAt: sale.soldAt.toISOString(),
      })),
      cashierTotals: snapshot.cashierTotals.map(toCashierSalesDto),
      isBusinessWide: true,
    };
  }
}
