import type { Metadata } from "next";
import { Suspense } from "react";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { dayRange, todayRange } from "@/application/use-cases/get-reports";
import { formatCount } from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { DateRangeFilter } from "@/presentation/components/reports/date-range-filter";
import { RankedBars } from "@/presentation/components/reports/ranked-bars";
import { Money } from "@/presentation/components/settings-provider";
import { Card, CardBody, CardHeader, StatTile } from "@/presentation/components/ui/card";
import { LoadingList } from "@/presentation/components/ui/states";

export const metadata: Metadata = { title: "Reports" };

/**
 * Reports.
 *
 * Every figure is aggregated in Postgres from stored rows. Nothing here is
 * illustrative and nothing is estimated: where a number cannot be worked out
 * honestly — profit without cost prices — it says so, names what is missing,
 * and does not print a zero in its place.
 *
 * A cashier gets their own takings and nothing else. That is enforced by the
 * report functions themselves, not by this page choosing what to render.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const staff = await requireStaff();

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          staff.can("report:sales")
            ? "Counted from every recorded sale, expense and stock movement."
            : "Your own takings."
        }
      />

      <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 max-w-3xl">
        <DateRangeFilter showSearch={false} />

        <Suspense key={JSON.stringify(params)} fallback={<LoadingList rows={4} />}>
          <ReportBody params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function ReportBody({
  params,
}: {
  params: { from?: string; to?: string };
}) {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const range =
    params.from && params.to ? dayRange(params.from, params.to) : todayRange();

  const isAdmin = staff.can("report:sales");

  const [sales, profit, inventory] = await Promise.all([
    cases.getSalesReport.execute(staff, range),
    isAdmin ? cases.getProfitReport.execute(staff, range) : Promise.resolve(null),
    isAdmin
      ? cases.getInventoryReport.execute(staff, range)
      : Promise.resolve(null),
  ]);

  const { summary } = sales;

  return (
    <>
      {/* The hero figure. Exactly one per view, and it is the number the whole
          page is about. */}
      <Card className="p-5">
        <p className="text-sm text-[var(--text-muted)]">
          {params.from && params.to ? "Sales for this period" : "Sales today"}
        </p>
        <p className="mt-1">
          <Money
            amount={summary.totalSales}
            tabular={false}
            className="text-4xl sm:text-5xl font-semibold"
          />
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {formatCount(summary.transactionCount)}{" "}
          {summary.transactionCount === 1 ? "transaction" : "transactions"} ·{" "}
          {formatCount(summary.unitsSold)} units
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Cash" value={summary.cashTotal} tone="positive" />
        <StatTile label="Mobile Money" value={summary.mobileMoneyTotal} />
        <StatTile
          label="Average sale"
          value={summary.averageSale}
          sublabel={
            summary.splitTransactionCount > 0
              ? `${formatCount(summary.splitTransactionCount)} paid with both`
              : undefined
          }
        />
        {profit && (
          <StatTile
            label="Expenses"
            value={profit.expenses}
            tone="warning"
            sublabel="Same period"
          />
        )}
      </div>

      {/* Money in must reconcile against the two tenders. Showing it is how an
          owner catches a mis-recorded payment without doing arithmetic. */}
      <p className="text-xs text-[var(--text-muted)] px-1">
        Cash and Mobile Money add up to total sales — the system will not record
        a sale where they do not.
      </p>

      {!isAdmin && (
        <p className="text-sm text-[var(--text-muted)]">
          Product, category and staff breakdowns are the owner&rsquo;s to see.
        </p>
      )}

      {isAdmin && profit && (
        <Card>
          <CardHeader
            title="Profit"
            description="Revenue, less what the goods cost, less expenses."
          />
          <CardBody>
            {profit.netProfit === null ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm">
                  Profit cannot be calculated for this period, because some of
                  what was sold has no cost price recorded against it. A figure
                  worked out without those would be too high, so none is shown.
                </p>
                <div>
                  <p className="text-sm font-medium">Missing a cost price:</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {profit.productsMissingCost.map((name) => (
                      <li
                        key={name}
                        className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Add a cost price on each product. Sales made from now on will
                    carry it, and the figure will start working.
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 pt-1">
                  <Figure label="Revenue" value={profit.revenue} />
                  <Figure label="Expenses" value={profit.expenses} />
                </dl>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <Figure label="Revenue" value={profit.revenue} />
                <Figure label="Cost of goods" value={profit.costOfGoodsSold!} />
                <Figure label="Gross profit" value={profit.grossProfit!} />
                <Figure label="Expenses" value={profit.expenses} />
                <div className="col-span-2 border-t border-[var(--border)] pt-3">
                  <dt className="text-sm text-[var(--text-muted)]">Net profit</dt>
                  <dd className="mt-0.5">
                    <Money
                      amount={profit.netProfit}
                      tabular={false}
                      className="text-2xl font-semibold text-brand-700 dark:text-brand-400"
                    />
                  </dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
      )}

      {isAdmin && (
        <>
          <Card>
            <CardHeader
              title="Best sellers"
              description="By revenue in this period."
            />
            <CardBody>
              <RankedBars
                rows={sales.byProduct.slice(0, 8).map((row) => ({
                  id: row.productId,
                  label: row.name,
                  sublabel: `${formatCount(row.unitsSold)} sold${
                    row.profit ? ` · ${row.profit} profit` : ""
                  }`,
                  value: Number(row.revenue),
                  display: row.revenue,
                }))}
                emptyMessage="No sales in this period."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="By category" />
            <CardBody>
              <RankedBars
                rows={sales.byCategory.map((row) => ({
                  id: row.categoryId ?? row.categoryName,
                  label: row.categoryName,
                  sublabel: `${formatCount(row.unitsSold)} units`,
                  value: Number(row.revenue),
                  display: row.revenue,
                }))}
                emptyMessage="No sales in this period."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="By cashier"
              description="Who sold what, and how it was paid."
            />
            <CardBody>
              <RankedBars
                rows={sales.byCashier.map((row) => ({
                  id: row.cashierId,
                  label: row.cashierName,
                  sublabel: `${formatCount(row.transactionCount)} sales · ${row.cashTotal} cash · ${row.mobileMoneyTotal} Mobile Money`,
                  value: Number(row.revenue),
                  display: row.revenue,
                }))}
                emptyMessage="No sales in this period."
              />
            </CardBody>
          </Card>
        </>
      )}

      {isAdmin && inventory && (
        <Card>
          <CardHeader
            title="Stock"
            description="As it stands right now, not for the period above."
          />
          <CardBody className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3">
              <Figure
                label="Units on hand"
                value={formatCount(inventory.valuation.unitsOnHand)}
                plain
              />
              <Figure
                label="Products tracked"
                value={formatCount(inventory.valuation.productsTracked)}
                plain
              />
              <Figure
                label="Worth at selling price"
                value={inventory.valuation.valueAtSellingPrice}
              />
              <div>
                <dt className="text-sm text-[var(--text-muted)]">
                  Worth at cost
                </dt>
                <dd className="mt-0.5 font-semibold">
                  {inventory.valuation.valueAtCost ? (
                    <Money amount={inventory.valuation.valueAtCost} />
                  ) : (
                    <span className="text-sm font-normal text-[var(--text-muted)]">
                      Not available — some stocked products have no cost price
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {inventory.lowStock.length > 0 && (
              <div className="border-t border-[var(--border)] pt-3">
                <p className="text-sm font-medium mb-2">
                  {formatCount(inventory.valuation.lowStockCount)} running low
                </p>
                <ul className="flex flex-col gap-1.5">
                  {inventory.lowStock.slice(0, 8).map((item) => (
                    <li
                      key={item.productId}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="truncate">{item.productName}</span>
                      <span className="numeric text-amber-700 dark:text-amber-400 shrink-0">
                        {item.quantityOnHand} left · warns at {item.minimumStock}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  plain = false,
}: {
  label: string;
  value: string;
  plain?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-semibold">
        {plain ? <span className="numeric">{value}</span> : <Money amount={value} />}
      </dd>
    </div>
  );
}
