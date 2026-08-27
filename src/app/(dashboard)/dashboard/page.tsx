import type { Metadata } from "next";
import Link from "next/link";
import { getUseCases } from "@/infrastructure/container";
import { requireStaff } from "@/infrastructure/auth/session";
import { PageHeader } from "@/presentation/components/app-shell";
import { Card, CardBody, CardHeader, StatTile } from "@/presentation/components/ui/card";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { EmptyState } from "@/presentation/components/ui/states";
import { StockBadge } from "@/presentation/components/ui/badge";
import { BoxIcon } from "@/presentation/components/ui/icons";
import { formatCount } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Home" };

/**
 * The dashboard.
 *
 * Every figure here is counted from the database. There are no illustrative
 * charts and no placeholder numbers — a dashboard that shows invented data is
 * worse than an empty one, because someone will eventually make a decision
 * from it.
 *
 * Sales, takings and expense figures arrive with the reporting work; until the
 * queries behind them exist, this page shows what it can actually answer and
 * says nothing about the rest.
 */
export default async function DashboardPage() {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const overview = await cases.getStockOverview.execute(staff);

  return (
    <>
      <PageHeader
        title={`Good day, ${staff.fullName.split(" ")[0]}`}
        description={
          staff.role.isAdmin
            ? "Here is where the business stands right now."
            : "Here is what you need to sell today."
        }
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Products"
            value={formatCount(overview.productCount)}
            sublabel="In the catalogue"
          />
          <StatTile
            label="Low stock"
            value={formatCount(overview.lowStockCount)}
            sublabel={
              overview.lowStockCount === 0
                ? "Nothing to reorder"
                : "Needs reordering"
            }
            tone={overview.lowStockCount > 0 ? "warning" : "positive"}
          />
        </div>

        <Card>
          <CardHeader
            title="Running low"
            description="At or below the minimum you set."
            action={
              overview.lowStock.length > 0 ? (
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
            {overview.lowStock.length === 0 ? (
              <EmptyState
                icon={<BoxIcon />}
                title="Nothing is running low"
                description={
                  overview.productCount === 0
                    ? "Add your products and their stock, and low-stock warnings will appear here."
                    : "Every product is above its minimum stock level."
                }
                action={
                  overview.productCount === 0 && staff.role.isAdmin ? (
                    <Link
                      href="/products/new"
                      className={linkButtonClasses()}
                    >
                      Add your first product
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {overview.lowStock.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {item.productName}
                    </span>
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
      </div>
    </>
  );
}
