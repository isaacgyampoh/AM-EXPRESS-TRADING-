"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A search box that reports what the user has stopped typing.
 *
 * Debounced, because every keystroke here becomes a database query over a
 * mobile connection. 250ms is short enough to feel immediate and long enough
 * that "rice" is one request rather than four.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label = "Search",
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Adjusting state during render when a prop changes, rather than in an
  // effect. This is the case React documents for it: an effect here would
  // render once with the stale draft, then immediately render again — visible
  // as a flicker when the browser's back button restores an earlier query.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(timer);
  }, [draft, onChange, value]);

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <svg
        viewBox="0 0 24 24"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[var(--text-muted)] pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        type="search"
        inputMode="search"
        autoFocus={autoFocus}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full min-h-12 rounded-xl pl-11 pr-4 text-base",
          "bg-[var(--surface-raised)] text-[var(--text)]",
          "border border-[var(--border)]",
          "placeholder:text-[var(--text-muted)]",
        )}
      />
    </div>
  );
}
