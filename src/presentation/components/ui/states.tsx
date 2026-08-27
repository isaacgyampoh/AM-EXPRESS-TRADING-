import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Card } from "./card";

/**
 * The three things a list can be other than a list: empty, broken, or loading.
 *
 * Each is a real component rather than a bare "No data" string, because these
 * are the moments a person decides whether the software works. An empty state
 * that says what to do next is the difference between a new shop getting
 * started and a new shop giving up.
 */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      {icon && (
        <div className="text-[var(--text-muted)]" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "That did not work",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4">
      <div role="alert" className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-red-800 dark:text-red-300">
          {title}
        </h3>
        <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
        {action}
      </div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[var(--surface-sunken)]",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/**
 * A loading placeholder shaped like the content it replaces, so the layout
 * does not jump when the real thing arrives.
 */
export function LoadingList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Card key={index} className="p-4 flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16" />
        </Card>
      ))}
    </div>
  );
}
