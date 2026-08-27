import { cn } from "@/lib/utils/cn";

export interface RankedRow {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  /** The magnitude the bar encodes. */
  readonly value: number;
  /** Already formatted for display — money, units, whatever the row means. */
  readonly display: string;
}

/**
 * A ranked list where each row carries a proportional bar.
 *
 * One measure, one hue. There is no legend because there is only one series —
 * the heading already says what is being measured, and a box with a single
 * swatch would just repeat it.
 *
 * The bar is deliberately thin and sits under the text rather than beside it:
 * on a 320px screen a side-by-side bar has no room to be proportional, and a
 * bar that cannot show proportion is decoration.
 *
 * Values are text, in text colours. The bar carries the magnitude; colouring
 * the number as well would make a light hue illegible and add nothing.
 */
export function RankedBars({
  rows,
  emptyMessage = "Nothing to show for this period.",
  className,
}: {
  rows: readonly RankedRow[];
  emptyMessage?: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className={cn("text-sm text-[var(--text-muted)] py-2", className)}>
        {emptyMessage}
      </p>
    );
  }

  // Scaled against the largest row, so the leader fills the track and every
  // other row is read relative to it. Guarded against an all-zero period.
  const largest = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ol className={cn("flex flex-col gap-3.5", className)}>
      {rows.map((row) => {
        const proportion = Math.max((row.value / largest) * 100, 1.5);

        return (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">
                {row.label}
              </span>
              <span className="shrink-0 text-sm font-semibold numeric">
                {row.display}
              </span>
            </div>

            {row.sublabel && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {row.sublabel}
              </p>
            )}

            {/* The track is a lighter step of the same ramp, so the unfilled
                part still reads as part of the measure rather than as a gap. */}
            <div
              className="mt-1.5 h-2 w-full rounded-l-sm bg-brand-100 dark:bg-brand-950 overflow-hidden"
              role="presentation"
            >
              <div
                className="h-full rounded-r bg-brand-600 dark:bg-brand-500"
                style={{ width: `${proportion}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
