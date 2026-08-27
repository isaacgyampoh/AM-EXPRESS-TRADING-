import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import {
  formatCount,
  formatPaymentMethod,
  formatTime,
} from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { RankedBars } from "@/presentation/components/reports/ranked-bars";
import { Money } from "@/presentation/components/settings-provider";
import { StockBadge } from "@/presentation/components/ui/badge";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card, CardBody, CardHeader, StatTile } from "@/presentation/components/ui/card";
import { BoxIcon, CartIcon } from "@/presentation/components/ui/icons";
import { EmptyState, LoadingList } from "@/presentation/components/ui/states";

export const metadata: Metadata = { title: "Home" };

/**
 * The home screen.
 *
 * Every figure is counted from the database for today. There are no
 * illustrative charts and no placeholder numbers — a dashboard showing invented
 * data is worse than an empty one, because someone eventually makes a decision
 * from it.
 *
 * What is shown depends on who is looking: an admin sees the business, a
 * cashier sees their own takings. That is decided from the role resolved on the
 * server, and enforced again by the report functions themselves.
 */
export default async function DashboardPage() {
  const staff = await requireStaff();

  return (
    <>
      <PageHeader
        title={`Good day, ${staff.fullName.split(" ")[0]}`}
        description={
          staff.can("report:sales")
            ? "Where the business stands today."
            : "What you have taken today."
        }
        action={
          <Link href="/pos" className={linkButtonClasses({ size: "md" })}>
            <CartIcon />
            <span className="sr-only sm:not-sr-only">Sell</span>
          </Link>
        }
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <Suspense fallback={<LoadingList rows={4} />}>
          <Today />
        </Suspense>
      </div>
    </>
  );
}

async function Today() {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const [dashboard, stock] = await Promise.all([
    cases.getDashboard.execute(staff),
    cases.getStockOverview.execute(staff),
  ]);

  const { today } = dashboard;

  return (
    <>
      {/* The hero figure. One per view, and the number the screen is about. */}
      <Card className="p-5">
        <p className="text-sm text-[var(--text-muted)]">
          {dashboard.isBusinessWide ? "Taken today" : "You have taken today"}
        </p>
        <p className="mt-1">
          <Money
            amount={today.totalSales}
            tabular={false}
            className="text-4xl sm:text-5xl font-semibold"
          />
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {formatCount(today.transactionCount)}{" "}
          {today.transactionCount === 1 ? "sale" : "sales"} ·{" "}
          {formatCount(today.unitsSold)} units
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Cash" value={today.cashTotal} tone="positive" />
        <StatTile label="Mobile Money" value={today.mobileMoneyTotal} />

        {dashboard.isBusinessWide && (
          <>
            <StatTile
              label="Expenses today"
              value={dashboard.todayExpenses}
              tone="warning"
            />
            <StatTile
              label="Low stock"
              value={formatCount(stock.lowStockCount)}
              tone={stock.lowStockCount > 0 ? "warning" : "positive"}
              sublabel={
                stock.lowStockCount === 0
                  ? "Nothing to reorder"
                  : "Needs reordering"
              }
            />
          </>
        )}
      </div>

      {dashboard.isBusinessWide && dashboard.topProducts.length > 0 && (
        <Card>
          <CardHeader
            title="Selling best today"
            description="By revenue."
            action={
              <Link
                href="/reports"
                className={linkButtonClasses({
                  variant: "secondary",
                  size: "sm",
                })}
              >
                Reports
              </Link>
            }
          />
          <CardBody>
            <RankedBars
              rows={dashboard.topProducts.map((row) => ({
                id: row.productId,
                label: row.name,
                sublabel: `${formatCount(row.unitsSold)} sold`,
                value: Number(row.revenue),
                display: row.revenue,
              }))}
            />
          </CardBody>
        </Card>
      )}

      {dashboard.isBusinessWide && dashboard.recentSales.length > 0 && (
        <Card>
          <CardHeader
            title="Latest sales"
            action={
              <Link
                href="/sales"
                className={linkButtonClasses({
                  variant: "secondary",
                  size: "sm",
                })}
              >
                All sales
              </Link>
            }
          />
          <CardBody className="px-0 pb-0">
            <ul className="divide-y divide-[var(--border)]">
              {dashboard.recentSales.slice(0, 6).map((sale) => (
                <li key={sale.saleId}>
                  <Link
                    href={`/sales/${sale.saleId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 min-h-14 hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium numeric">
                        {sale.receiptNumber}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                        {formatTime(sale.soldAt)} · {sale.cashierName} ·{" "}
                        {formatPaymentMethod(sale.paymentSummary)}
                      </span>
                    </span>
                    <Money amount={sale.total} className="font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Running low"
          description="At or below the minimum you set."
          action={
            stock.lowStock.length > 0 ? (
              <Link
                href="/products?filter=low"
                className={linkButtonClasses({
                  variant: "secondary",
                  size: "sm",
                })}
              >
                View all
              </Link>
            ) : undefined
          }
        />
        <CardBody>
          {stock.lowStock.length === 0 ? (
            <EmptyState
              icon={<BoxIcon />}
              title="Nothing is running low"
              description={
                stock.productCount === 0
                  ? "Add your products and their stock, and low-stock warnings will appear here."
                  : "Every product is above its minimum stock level."
              }
              action={
                stock.productCount === 0 && staff.can("product:write") ? (
                  <Link href="/products/new" className={linkButtonClasses()}>
                    Add your first product
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {stock.lowStock.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <Link
                    href={`/products/${item.productId}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <StockBadge
                    quantity={item.quantityOnHand}
                    isLowStock={item.isLowStock}
                    isOutOfStock={item.isOutOfStock}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
