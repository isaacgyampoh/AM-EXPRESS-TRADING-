import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asCategoryId,
  asExpenseCategoryId,
  asProductId,
  asStaffId,
  type StaffId,
} from "@/domain/entities/identifiers";
import type { PaymentMethod } from "@/domain/entities/payment";
import type {
  CashierSalesRow,
  CategorySalesRow,
  DashboardSnapshot,
  ExpenseSummary,
  InventoryValuation,
  ProductSalesRow,
  ProfitabilitySummary,
  ReportsRepository,
  SalesSummary,
} from "@/domain/repositories/reports-repository";
import type { DateRange } from "@/domain/repositories/shared";
import { Money } from "@/domain/value-objects/money";
import type { Database } from "../database.types";
import { mapDatabaseError } from "../errors";

type Client = SupabaseClient<Database>;

/** NUMERIC arrives as a string; it goes straight to Money, never via Number(). */
const money = (value: string | null): Money =>
  value === null ? Money.zero() : Money.fromDecimalString(value);

const maybeMoney = (value: string | null): Money | null =>
  value === null ? null : Money.fromDecimalString(value);

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Reports, computed in Postgres.
 *
 * Each of these is one call to a SECURITY DEFINER function that aggregates over
 * the stored rows. Nothing is summed in JavaScript: pulling a month of sale
 * items to a phone to add them up would be slow, expensive, and would put the
 * business's arithmetic somewhere a client could get it wrong.
 *
 * The functions enforce scope themselves — a cashier gets their own figures
 * whatever they ask for, and is refused the business-wide reports outright.
 */
export class SupabaseReportsRepository implements ReportsRepository {
  constructor(private readonly client: Client) {}

  async salesSummary(
    range: DateRange,
    cashierId?: StaffId,
  ): Promise<SalesSummary> {
    const { data, error } = await this.client.rpc("report_sales_summary", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_cashier_id: cashierId ?? null,
    });

    if (error) throw mapDatabaseError(error, { resource: "Sales report" });

    const row = data?.[0];
    return {
      range,
      totalSales: money(row?.total_sales ?? "0"),
      transactionCount: Number(row?.transaction_count ?? 0),
      cashTotal: money(row?.cash_total ?? "0"),
      mobileMoneyTotal: money(row?.mobile_money_total ?? "0"),
      splitTransactionCount: Number(row?.split_transaction_count ?? 0),
      averageSale: money(row?.average_sale ?? "0"),
      unitsSold: Number(row?.units_sold ?? 0),
    };
  }

  async salesByProduct(
    range: DateRange,
    limit = 50,
  ): Promise<ProductSalesRow[]> {
    const { data, error } = await this.client.rpc("report_sales_by_product", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_limit: limit,
    });

    if (error) throw mapDatabaseError(error, { resource: "Sales report" });

    return (data ?? []).map((row) => ({
      productId: asProductId(row.product_id),
      sku: row.sku,
      name: row.name,
      categoryName: row.category_name,
      unitsSold: Number(row.units_sold),
      revenue: money(row.revenue),
      // Stays null when a unit sold had no recorded cost.
      profit: maybeMoney(row.profit),
    }));
  }

  async salesByCategory(range: DateRange): Promise<CategorySalesRow[]> {
    const { data, error } = await this.client.rpc("report_sales_by_category", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });

    if (error) throw mapDatabaseError(error, { resource: "Sales report" });

    return (data ?? []).map((row) => ({
      categoryId: row.category_id ? asCategoryId(row.category_id) : null,
      categoryName: row.category_name,
      unitsSold: Number(row.units_sold),
      revenue: money(row.revenue),
    }));
  }

  async salesByCashier(range: DateRange): Promise<CashierSalesRow[]> {
    const { data, error } = await this.client.rpc("report_sales_by_cashier", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });

    if (error) throw mapDatabaseError(error, { resource: "Sales report" });

    return (data ?? []).map((row) => ({
      cashierId: asStaffId(row.cashier_id),
      cashierName: row.cashier_name,
      transactionCount: Number(row.transaction_count),
      revenue: money(row.revenue),
      cashTotal: money(row.cash_total),
      mobileMoneyTotal: money(row.mobile_money_total),
    }));
  }

  async expenseSummary(range: DateRange): Promise<ExpenseSummary> {
    const { data, error } = await this.client.rpc("report_expense_summary", {
      p_from: isoDate(range.from),
      p_to: isoDate(range.to),
    });

    if (error) throw mapDatabaseError(error, { resource: "Expense report" });

    const rows = data ?? [];

    return {
      range,
      total: money(
        rows.find((row) => row.grouping_kind === "total")?.total ?? "0",
      ),
      byCategory: rows
        .filter((row) => row.grouping_kind === "category")
        .map((row) => ({
          categoryId: asExpenseCategoryId(row.grouping_id ?? ""),
          categoryName: row.grouping_name,
          total: money(row.total),
        })),
      byMethod: rows
        .filter((row) => row.grouping_kind === "method")
        .map((row) => ({
          method: row.grouping_name as PaymentMethod,
          total: money(row.total),
        })),
    };
  }

  async inventoryValuation(): Promise<InventoryValuation> {
    const { data, error } = await this.client.rpc(
      "report_inventory_valuation",
      {},
    );

    if (error) throw mapDatabaseError(error, { resource: "Inventory report" });

    const row = data?.[0];
    return {
      productsTracked: Number(row?.products_tracked ?? 0),
      unitsOnHand: Number(row?.units_on_hand ?? 0),
      lowStockCount: Number(row?.low_stock_count ?? 0),
      outOfStockCount: Number(row?.out_of_stock_count ?? 0),
      valueAtCost: maybeMoney(row?.value_at_cost ?? null),
      valueAtSellingPrice: money(row?.value_at_selling_price ?? "0"),
    };
  }

  async profitability(range: DateRange): Promise<ProfitabilitySummary> {
    const { data, error } = await this.client.rpc("report_profitability", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });

    if (error) throw mapDatabaseError(error, { resource: "Profit report" });

    const row = data?.[0];
    return {
      range,
      revenue: money(row?.revenue ?? "0"),
      costOfGoodsSold: maybeMoney(row?.cost_of_goods_sold ?? null),
      grossProfit: maybeMoney(row?.gross_profit ?? null),
      expenses: money(row?.expenses ?? "0"),
      netProfit: maybeMoney(row?.net_profit ?? null),
      productsMissingCost: row?.products_missing_cost ?? [],
    };
  }

  /**
   * Everything the home screen needs, in as few round trips as it takes.
   *
   * Issued in parallel rather than in sequence: on a mobile connection the
   * difference between five sequential requests and five concurrent ones is
   * most of the time the cashier spends looking at a loading state.
   */
  async dashboard(range: DateRange): Promise<DashboardSnapshot> {
    const [today, expenses, topProducts, cashierTotals, valuation, recent] =
      await Promise.all([
        this.salesSummary(range),
        this.expenseSummary(range).catch(() => null),
        this.salesByProduct(range, 5).catch(() => []),
        this.salesByCashier(range).catch(() => []),
        this.inventoryValuation().catch(() => null),
        this.recentSales(10),
      ]);

    // A cashier is refused the business-wide reports, and that is not an error
    // worth surfacing on their home screen — they simply see their own sales
    // and nothing else. Hence the catches above.
    return {
      today,
      todayExpenses: expenses?.total ?? Money.zero(),
      lowStockCount: valuation?.lowStockCount ?? 0,
      topProducts,
      recentSales: recent,
      cashierTotals,
    };
  }

  private async recentSales(limit: number) {
    const { data, error } = await this.client
      .from("sales")
      .select(
        "id, receipt_number, total, sold_at, status, profiles:cashier_id ( full_name ), payments ( method )",
      )
      .eq("status", "completed")
      .order("sold_at", { ascending: false })
      .limit(limit);

    if (error) throw mapDatabaseError(error, { resource: "Sale" });

    return (data ?? []).map((row) => {
      const methods = new Set(row.payments.map((payment) => payment.method));
      return {
        saleId: row.id,
        receiptNumber: row.receipt_number,
        total: money(row.total),
        cashierName: row.profiles?.full_name ?? "Unknown",
        paymentSummary: (methods.size > 1
          ? "split"
          : ([...methods][0] ?? "cash")) as PaymentMethod | "split",
        soldAt: new Date(row.sold_at),
      };
    });
  }
}
