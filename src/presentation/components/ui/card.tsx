import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 px-4 pt-4 pb-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold truncate">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}

/**
 * A headline figure.
 *
 * The number is the largest thing on it, with tabular figures so a dashboard
 * refreshing every minute does not make the row twitch as digits change width.
 */
export function StatTile({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const tones = {
    neutral: "text-[var(--text)]",
    positive: "text-brand-700 dark:text-brand-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
  } as const;

  return (
    <Card className="p-4">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold numeric", tones[tone])}>
        {value}
      </p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sublabel}</p>
      )}
    </Card>
  );
}
