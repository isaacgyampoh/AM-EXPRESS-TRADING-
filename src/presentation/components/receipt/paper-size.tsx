"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

export type PaperSize = "80mm" | "58mm" | "a4";

/**
 * Per till, not per business.
 *
 * One shop can easily have an 80mm printer at the counter and print an A4 copy
 * from the back office, so this is a property of the machine rather than of
 * the business. It lives in localStorage on the device and never reaches the
 * database.
 */
const STORAGE_KEY = "amx.receipt.paper.v1";

const OPTIONS: { value: PaperSize; label: string }[] = [
  { value: "80mm", label: "80mm" },
  { value: "58mm", label: "58mm" },
  { value: "a4", label: "A4" },
];

/**
 * `@page` cannot be written with a CSS variable, and cannot be scoped by a
 * selector — a stylesheet has one page size. So the rule is generated and
 * injected rather than sitting in globals.css.
 *
 * The widths are the paper minus its margins. A roll is continuous, so the
 * height is `auto`: fixing it would pad every short receipt out to a full page
 * and feed a hand's length of blank paper after each sale.
 */
const PAGE_RULES: Record<PaperSize, string> = {
  "80mm": "@page { size: 80mm auto; margin: 3mm; }",
  "58mm": "@page { size: 58mm auto; margin: 2mm; }",
  a4: "@page { size: A4; margin: 12mm; }",
};

/** Printed width of the receipt body, inside the page margins. */
const BODY_RULES: Record<PaperSize, string> = {
  "80mm": "@media print { .receipt-body { width: 74mm; font-size: 11px; } }",
  // 58mm rolls are narrow enough that the default size wraps product names
  // onto three lines each, so the type comes down with the paper.
  "58mm": "@media print { .receipt-body { width: 54mm; font-size: 9.5px; } }",
  a4: "@media print { .receipt-body { width: 100mm; } }",
};

/**
 * localStorage read as an external store, which is what it is.
 *
 * The project settled on useSyncExternalStore for this rather than an effect
 * that copies storage into state — an effect renders once with the default and
 * again with the real value, which here is a visible flash of the wrong paper
 * size on every receipt.
 */
const listeners = new Set<() => void>();

function read(): PaperSize {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "80mm" || stored === "58mm" || stored === "a4") return stored;
  } catch {
    // Private browsing, or storage disabled by policy on a locked-down
    // terminal. The default is a working printer setting, not an error.
  }
  return "80mm";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing it counts too: a back office and a till open on the
  // same machine should not disagree about the printer.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(next: PaperSize): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not being able to remember the choice is survivable; not being able to
    // make it would not be. The listeners still fire, so this session honours
    // it even when storage is refused.
  }
  for (const listener of listeners) listener();
}

/**
 * Chooses the paper the receipt prints on.
 *
 * Defaults to 80mm because that is what almost every counter-top thermal
 * printer takes. Without any of this the browser prints at the driver's
 * default — which on a printer installed as a generic device is A4, and an A4
 * page of an 80mm receipt is a stamp in the corner of a sheet.
 */
export function PaperSizePicker() {
  // The server has no localStorage, so it renders the default and the client
  // takes over from the stored value on hydration.
  const paper = useSyncExternalStore(subscribe, read, () => "80mm" as PaperSize);

  return (
    <>
      <style>{`${PAGE_RULES[paper]} ${BODY_RULES[paper]}`}</style>

      <div className="print:hidden flex items-center justify-center gap-2">
        <span className="text-sm text-[var(--text-muted)]">Paper</span>
        <div
          role="group"
          aria-label="Receipt paper size"
          className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--surface-raised)]"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => write(option.value)}
              aria-pressed={paper === option.value}
              className={cn(
                "min-h-9 px-3 rounded-md text-sm font-medium transition-colors",
                paper === option.value
                  ? "bg-brand-700 text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
