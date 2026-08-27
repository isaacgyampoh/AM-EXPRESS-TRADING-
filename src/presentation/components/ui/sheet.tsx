"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A dialog that is a bottom sheet on a phone and a centred panel on a desktop.
 *
 * Built on the native `<dialog>` element, which gets focus trapping, Escape to
 * close, inert background content and the top layer from the browser — all
 * things a hand-rolled modal usually gets subtly wrong, and all things a
 * screen reader user depends on.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(event) => {
        // Clicking the backdrop closes. The dialog element reports backdrop
        // clicks as clicks on itself, so comparing target to currentTarget is
        // what distinguishes them from clicks on the content.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        "m-0 w-full max-w-none bg-transparent p-0",
        "max-h-none h-full",
        "open:flex open:items-end sm:open:items-center sm:open:justify-center",
      )}
    >
      <div
        className={cn(
          "w-full sm:max-w-lg",
          "bg-[var(--surface-raised)] text-[var(--text)]",
          "rounded-t-3xl sm:rounded-2xl",
          "border border-[var(--border)]",
          "max-h-[90dvh] flex flex-col",
          "safe-bottom",
        )}
      >
        {/* The grab handle a phone user expects on a sheet. */}
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id="sheet-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 grid place-items-center size-11 -mr-2 -mt-2 rounded-xl hover:bg-[var(--surface-sunken)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-[var(--border)]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
