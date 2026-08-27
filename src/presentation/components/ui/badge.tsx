import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "positive" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral:
    "bg-[var(--surface-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  positive:
    "bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:border-brand-900",
  warning:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  danger:
    "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  info: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
};

/**
 * Colour is never the only signal — every badge carries its own words too, so
 * it still reads correctly in greyscale or to someone who does not distinguish
 * red from green.
 */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StockBadge({
  quantity,
  isLowStock,
  isOutOfStock,
}: {
  quantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}) {
  if (isOutOfStock) return <Badge tone="danger">Out of stock</Badge>;
  if (isLowStock) return <Badge tone="warning">Low · {quantity} left</Badge>;
  return <Badge tone="positive">{quantity} in stock</Badge>;
}
