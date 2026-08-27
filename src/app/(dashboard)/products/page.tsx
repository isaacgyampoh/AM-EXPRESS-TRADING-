import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { formatCount } from "@/lib/utils/format";
import { PageHeader } from "@/presentation/components/app-shell";
import { ProductFilters } from "@/presentation/components/products/product-filters";
import { ProductRow } from "@/presentation/components/products/product-row";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card } from "@/presentation/components/ui/card";
import { BoxIcon, PlusIcon } from "@/presentation/components/ui/icons";
import { EmptyState, LoadingList } from "@/presentation/components/ui/states";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    filter?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const staff = await requireStaff();
  const cases = await getUseCases();

  const categories = await cases.listCategories.execute(staff, {
    activeOnly: true,
  });

  return (
    <>
      <PageHeader
        title="Products"
        description="What the shop sells, and what is on the shelf."
        action={
          staff.can("product:write") ? (
            <Link
              href="/products/new"
              className={linkButtonClasses({ size: "md" })}
            >
              <PlusIcon />
              <span className="sr-only sm:not-sr-only">Add product</span>
            </Link>
          ) : undefined
        }
      />

      <div className="px-4 md:px-6 pb-8 flex flex-col gap-4">
        <ProductFilters categories={categories} />

        {/* Keyed on the query so switching filters shows the skeleton rather
            than the previous result set with the wrong heading. */}
        <Suspense
          key={JSON.stringify(params)}
          fallback={<LoadingList rows={6} />}
        >
          <ProductList params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function ProductList({
  params,
}: {
  params: { q?: string; category?: string; filter?: string; page?: string };
}) {
  const staff = await requireStaff();
  const cases = await getUseCases();

  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const result = await cases.listProducts.execute(staff, {
    search: params.q,
    categoryId: params.category,
    page,
    pageSize: PAGE_SIZE,
  });

  // The low-stock view narrows what the page already fetched. It is a filter
  // on a bounded page, not a separate query, so the count shown is the count
  // on screen — no claim is made about the whole catalogue.
  const items =
    params.filter === "low"
      ? result.items.filter((product) => product.isLowStock)
      : result.items;

  if (items.length === 0) {
    const isFiltered = Boolean(params.q || params.category || params.filter);

    return (
      <Card>
        <EmptyState
          icon={<BoxIcon />}
          title={isFiltered ? "Nothing matches that" : "No products yet"}
          description={
            isFiltered
              ? "Try a different search, or clear the filters."
              : staff.can("product:write")
                ? "Add your first product and its opening stock, and it will be ready to sell."
                : "An administrator has not added any products yet."
          }
          action={
            !isFiltered && staff.can("product:write") ? (
              <Link href="/products/new" className={linkButtonClasses()}>
                Add a product
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
        {params.filter === "low"
          ? `${formatCount(items.length)} running low on this page`
          : `${formatCount(result.total)} ${result.total === 1 ? "product" : "products"}`}
      </p>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {items.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              href={`/products/${product.id}`}
            />
          ))}
        </ul>
      </Card>

      {result.total > PAGE_SIZE && (
        <Pagination
          page={result.page}
          hasMore={result.hasMore}
          params={params}
        />
      )}
    </>
  );
}

function Pagination({
  page,
  hasMore,
  params,
}: {
  page: number;
  hasMore: boolean;
  params: Record<string, string | undefined>;
}) {
  const linkTo = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, value);
    }
    next.set("page", String(target));
    return `/products?${next.toString()}`;
  };

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pages">
      {page > 1 ? (
        <Link
          href={linkTo(page - 1)}
          className={linkButtonClasses({ variant: "secondary" })}
        >
          Previous
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-[var(--text-muted)]">Page {page}</span>

      {hasMore ? (
        <Link
          href={linkTo(page + 1)}
          className={linkButtonClasses({ variant: "secondary" })}
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
