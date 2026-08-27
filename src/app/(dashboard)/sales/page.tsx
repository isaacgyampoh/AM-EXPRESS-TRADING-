import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import {
  formatCount,
  formatDateTime,
  formatPaymentMethod,
} from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { Money } from "@/presentation/components/settings-provider";
import { Badge } from "@/presentation/components/ui/badge";
import { Card } from "@/presentation/components/ui/card";
import { ReceiptIcon } from "@/presentation/components/ui/icons";
import { EmptyState, LoadingList } from "@/presentation/components/ui/states";
import { DateRangeFilter } from "@/presentation/components/reports/date-range-filter";

export const metadata: Metadata = { title: "Sales" };

const PAGE_SIZE = 25;

/**
 * The sales history.
 *
 * Identical code for both roles: Row Level Security decides whether "sales"
 * means the business or just this cashier's own. Nothing here branches on
 * role, because a security rule written twice eventually disagrees with
 * itself.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const staff = await requireStaff();

  return (
    <>
      <PageHeader
        title={staff.can("sale:read:all") ? "Sales" : "My sales"}
        description={
          staff.can("sale:read:all")
            ? "Every completed transaction."
            : "The transactions you have taken."
        }
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <DateRangeFilter searchPlaceholder="Search by receipt number" />

        <Suspense key={JSON.stringify(params)} fallback={<LoadingList rows={6} />}>
          <SalesList params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function SalesList({
  params,
}: {
  params: { from?: string; to?: string; q?: string; page?: string };
}) {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const result = await cases.listSales.execute(staff, {
    from: params.from,
    to: params.to,
    search: params.q,
    page,
    pageSize: PAGE_SIZE,
  });

  if (result.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ReceiptIcon />}
          title="No sales here"
          description={
            params.from || params.q
              ? "Nothing matches those filters. Try a wider date range."
              : "Sales will appear here as soon as the first one is recorded."
          }
        />
      </Card>
    );
  }

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
        {formatCount(result.total)}{" "}
        {result.total === 1 ? "transaction" : "transactions"}
      </p>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {result.items.map((sale) => (
            <li key={sale.id}>
              <Link
                href={`/sales/${sale.id}`}
                className="flex items-center gap-3 px-4 py-3 min-h-16 hover:bg-[var(--surface-sunken)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium numeric">{sale.receiptNumber}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {formatDateTime(sale.soldAt)} · {sale.cashierName}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <Badge tone="neutral">
                      {formatPaymentMethod(sale.paymentSummary)}
                    </Badge>
                    <span className="text-xs text-[var(--text-muted)] numeric">
                      {sale.unitCount} {sale.unitCount === 1 ? "unit" : "units"}
                    </span>
                    {sale.status === "voided" && (
                      <Badge tone="danger">Voided</Badge>
                    )}
                  </div>
                </div>

                <Money
                  amount={sale.total}
                  className={
                    sale.status === "voided"
                      ? "font-semibold line-through text-[var(--text-muted)]"
                      : "font-semibold"
                  }
                />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {result.total > PAGE_SIZE && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Pages"
        >
          {page > 1 ? (
            <Link
              href={`/sales?${new URLSearchParams({ ...cleaned(params), page: String(page - 1) })}`}
              className="min-h-11 px-4 grid place-items-center rounded-xl border border-[var(--border)]"
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-[var(--text-muted)]">Page {page}</span>
          {result.hasMore ? (
            <Link
              href={`/sales?${new URLSearchParams({ ...cleaned(params), page: String(page + 1) })}`}
              className="min-h-11 px-4 grid place-items-center rounded-xl border border-[var(--border)]"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

function cleaned(params: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "page",
    ),
  );
}
