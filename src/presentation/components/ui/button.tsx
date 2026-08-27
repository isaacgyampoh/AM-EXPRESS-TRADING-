import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50",
  secondary:
    "bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-sunken)]",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-sunken)]",
  danger: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
};

/**
 * Sizes are set by what a thumb can hit, not by what looks neat.
 *
 * `md` is 44px tall — the smallest target most accessibility guidance accepts
 * — and `lg` is 56px, for the buttons that end a transaction, where a mis-tap
 * costs a customer's time and the cashier's confidence.
 */
const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-base gap-2",
  lg: "min-h-14 px-6 text-lg gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Shows a spinner and blocks repeat presses. */
  loading?: boolean;
  leadingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      // Disabled while loading, so a slow network cannot turn one tap into two
      // sales. The idempotency key makes a duplicate harmless; this makes it
      // unlikely in the first place.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "touch-manipulation select-none",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner />
      ) : (
        leadingIcon && <span aria-hidden="true">{leadingIcon}</span>
      )}
      {children}
    </button>
  );
}

/**
 * A link that looks like a button.
 *
 * Navigation is a link, not a button with an onClick — so it opens in a new
 * tab on middle-click, is announced as a link by a screen reader, and works
 * before JavaScript has loaded. The shared style comes from the same maps
 * above so the two never drift apart.
 */
export function linkButtonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-xl font-medium",
    "transition-colors duration-150 touch-manipulation select-none",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
