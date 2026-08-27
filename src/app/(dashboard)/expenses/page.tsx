import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { formatCount, formatDate, formatPaymentMethod } from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { DateRangeFilter } from "@/presentation/components/reports/date-range-filter";
import { Money } from "@/presentation/components/settings-provider";
import { Badge } from "@/presentation/components/ui/badge";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card, StatTile } from "@/presentation/components/ui/card";
import { WalletIcon } from "@/presentation/components/ui/icons";
import { EmptyState, ErrorState, LoadingList } from "@/presentation/components/ui/states";
import { ExpenseControls } from "@/presentation/forms/expense-form";
import {
  createExpenseAction,
  createExpenseCategoryAction,
} from "./actions";

export const metadata: Metadata = { title: "Expenses" };

const PAGE_SIZE = 25;

export default async function ExpensesPage({
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

  if (!staff.can("expense:read")) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          title="Not your job"
          message="Expenses are the owner's records. Ask an administrator if you need something recorded."
          action={
            <Link
              href="/pos"
              className={linkButtonClasses({ variant: "secondary", size: "sm" })}
            >
              Back to the till
            </Link>
          }
        />
      </div>
    );
  }

  const cases = await getUseCases();
  const categories = await cases.listExpenseCategories.execute(staff, {
    activeOnly: true,
  });

  return (
    <>
      <PageHeader
        title="Expenses"
        description="What the business spent, and on what."
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <ExpenseControls
          categories={categories}
          createExpense={createExpenseAction}
          createCategory={createExpenseCategoryAction}
        />

        <DateRangeFilter searchPlaceholder="Search descriptions" />

        <Suspense key={JSON.stringify(params)} fallback={<LoadingList rows={5} />}>
          <ExpenseList params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function ExpenseList({
  params,
}: {
  params: { from?: string; to?: string; q?: string; page?: string };
}) {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const [result, summary] = await Promise.all([
    cases.listExpenses.execute(staff, {
      from: params.from,
      to: params.to,
      search: params.q,
      page,
      pageSize: PAGE_SIZE,
    }),
    // Only meaningful for a bounded period; over "all time" the figure would
    // be a running total that grows forever and tells nobody anything.
    params.from && params.to
      ? cases.getExpenseReport.execute(staff, {
          from: new Date(`${params.from}T00:00:00.000`),
          to: new Date(`${params.to}T23:59:59.999`),
        })
      : Promise.resolve(null),
  ]);

  if (result.items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<WalletIcon />}
          title="Nothing recorded here"
          description={
            params.from || params.q
              ? "Nothing matches those filters. Try a wider date range."
              : "Record what the business spends and it will be subtracted from profit properly."
          }
        />
      </Card>
    );
  }

  return (
    <>
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Total for this period"
            value={summary.total}
            tone="warning"
          />
          <StatTile
            label="Entries"
            value={formatCount(result.total)}
            sublabel={
              summary.byCategory.length === 1
                ? "1 category"
                : `${summary.byCategory.length} categories`
            }
          />
        </div>
      )}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {result.items.map((expense) => (
            <li key={expense.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{expense.description}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {formatDate(expense.incurredOn)} · {expense.recordedByName}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <Badge tone="neutral">{expense.categoryName}</Badge>
                    <Badge tone="info">
                      {formatPaymentMethod(expense.method)}
                    </Badge>
                  </div>
                </div>
                <Money amount={expense.amount} className="font-semibold" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
