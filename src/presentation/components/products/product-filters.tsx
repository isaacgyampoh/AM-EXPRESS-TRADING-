"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { SearchInput } from "../ui/search-input";
import { cn } from "@/lib/utils/cn";

/**
 * Search and filtering, kept in the URL.
 *
 * The list itself stays a server component — filtering happens in Postgres, so
 * a catalogue of five thousand products is the same amount of work as fifty.
 * Putting the query in the URL means the back button behaves, a filtered view
 * can be sent to someone, and a refresh does not lose the cashier's place.
 */
export function ProductFilters({
  categories,
}: {
  categories: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      // Any filter change resets to the first page: staying on page 4 of a
      // different result set is disorienting and usually empty.
      params.delete("page");

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const activeCategory = searchParams.get("category") ?? "";
  const lowOnly = searchParams.get("filter") === "low";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <SearchInput
        value={searchParams.get("q") ?? ""}
        onChange={(value) => update({ q: value || null })}
        placeholder="Search by name or SKU"
        label="Search products"
      />

      {/* Horizontally scrollable chips: on a 320px screen a wrapped row of
          category buttons pushes the list off the fold. */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          <FilterChip
            label="All"
            active={!activeCategory && !lowOnly}
            onClick={() => update({ category: null, filter: null })}
          />
          <FilterChip
            label="Low stock"
            active={lowOnly}
            onClick={() => update({ filter: lowOnly ? null : "low" })}
          />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              label={category.name}
              active={activeCategory === category.id}
              onClick={() =>
                update({
                  category: activeCategory === category.id ? null : category.id,
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 whitespace-nowrap rounded-full border px-4 text-sm font-medium",
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}
