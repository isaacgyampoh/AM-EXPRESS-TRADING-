import type { Metadata } from "next";
import { branding } from "@/lib/config/branding";

export const metadata: Metadata = { title: "No connection" };

/**
 * The offline screen.
 *
 * Precached by the service worker and served when a navigation cannot reach
 * the network. Deliberately static and signed-out: it renders from the cache,
 * so it can contain no session and no business data.
 *
 * It says the one thing a cashier standing in front of a customer needs to
 * know — the basket is safe — because the alternative is them starting the
 * sale again from scratch and, later, finding they charged twice.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-dvh grid place-items-center px-6 py-10 bg-[var(--surface-sunken)]">
      <div className="w-full max-w-sm text-center">
        <div
          className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <path d="M3 3l18 18" />
            <path d="M8.5 15.5a5 5 0 017 0" />
            <path d="M5 12a10 10 0 013.5-2.3M19 12a10 10 0 00-6.6-2.9" />
            <path d="M12 19h.01" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold">No connection</h1>

        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {branding.shortName} needs a connection to record a sale, because
          stock and takings are kept on the server where they can be trusted.
        </p>

        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-left">
          <p className="text-sm font-medium">Your basket is safe</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Anything you had added is still on this phone. Go back to the till
            when you have signal and complete the sale — it will not be recorded
            twice, even if you tapped more than once.
          </p>
        </div>

        <a
          href="/pos"
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-700 px-6 font-medium text-white"
        >
          Try again
        </a>
      </div>
    </main>
  );
}
