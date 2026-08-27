"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { SearchInput } from "../ui/search-input";

/**
 * Date range and search, held in the URL.
 *
 * Presets first, because "today" and "this month" are what someone actually
 * wants nine times out of ten, and picking two dates on a phone keyboard is
 * a chore. The custom inputs are there for the tenth time.
 *
 * Dates are computed in the browser's timezone. A shop in Accra asking for
 * "today" means their today, and a server working in UTC would quietly move
 * every evening sale into tomorrow.
 */
export function DateRangeFilter({
  searchPlaceholder,
  showSearch = true,
}: {
  searchPlaceholder?: string;
  showSearch?: boolean;
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
      params.delete("page");

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const applyPreset = (preset: "today" | "week" | "month" | "all") => {
    if (preset === "all") {
      update({ from: null, to: null });
      return;
    }

    const now = new Date();
    const end = isoDate(now);
    const start = new Date(now);

    if (preset === "week") start.setDate(start.getDate() - 6);
    if (preset === "month") start.setDate(1);

    update({ from: isoDate(start), to: end });
  };

  const activePreset = (() => {
    if (!from && !to) return "all";
    const today = isoDate(new Date());
    if (from === today && to === today) return "today";

    const monthStart = new Date();
    monthStart.setDate(1);
    if (from === isoDate(monthStart) && to === today) return "month";

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    if (from === isoDate(weekStart) && to === today) return "week";

    return "custom";
  })();

  return (
    <div className={cn("flex flex-col gap-3", isPending && "opacity-60")}>
      {showSearch && (
        <SearchInput
          value={searchParams.get("q") ?? ""}
          onChange={(value) => update({ q: value || null })}
          placeholder={searchPlaceholder ?? "Search"}
        />
      )}

      <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        <div className="flex gap-2 w-max pb-1">
          <PresetChip
            label="Today"
            active={activePreset === "today"}
            onClick={() => applyPreset("today")}
          />
          <PresetChip
            label="Last 7 days"
            active={activePreset === "week"}
            onClick={() => applyPreset("week")}
          />
          <PresetChip
            label="This month"
            active={activePreset === "month"}
            onClick={() => applyPreset("month")}
          />
          <PresetChip
            label="All time"
            active={activePreset === "all"}
            onClick={() => applyPreset("all")}
          />
        </div>
      </div>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
        <summary className="min-h-11 px-4 flex items-center text-sm font-medium cursor-pointer select-none">
          {activePreset === "custom" && from && to
            ? `${from} to ${to}`
            : "Choose exact dates"}
        </summary>
        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => update({ from: event.target.value || null })}
              className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-base"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => update({ to: event.target.value || null })}
              className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-base"
            />
          </label>
        </div>
      </details>
    </div>
  );
}

function isoDate(date: Date): string {
  // Local calendar date, not UTC. `toISOString()` would shift the day for
  // anyone west of Greenwich late in the evening.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function PresetChip({
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
          : "border-[var(--border)] bg-[var(--surface-raised)]",
      )}
    >
      {label}
    </button>
  );
}
