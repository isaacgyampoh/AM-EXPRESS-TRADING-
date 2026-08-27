"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useSettings } from "./settings-provider";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

/**
 * The frame around every signed-in page.
 *
 * Navigation sits at the bottom on a phone, where a thumb reaches, and moves
 * to a rail on a wide screen. The set of items is decided on the server from
 * the signed-in role and passed in — a cashier is not given links they cannot
 * follow, and more to the point, the pages themselves check permission again
 * rather than trusting that the link was hidden.
 */
export function AppShell({
  navItems,
  staffName,
  roleLabel,
  children,
}: {
  navItems: readonly NavItem[];
  staffName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  const settings = useSettings();
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-[var(--surface-sunken)]">
      {/* Skip link, so a keyboard user is not tabbed through the whole nav
          on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-[var(--border)] md:bg-[var(--surface-raised)]"
      >
        <div className="px-5 py-5 border-b border-[var(--border)]">
          <p className="font-semibold leading-tight">{settings.businessName}</p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {staffName} · {roleLabel}
          </p>
        </div>

        <ul className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 min-h-11 text-sm font-medium",
                  isActive(item.href)
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                    : "hover:bg-[var(--surface-sunken)]",
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="p-3 border-t border-[var(--border)]">
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="w-full text-left rounded-xl px-3 min-h-11 text-sm font-medium hover:bg-[var(--surface-sunken)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* Mobile header — just enough to know where you are and who you are. */}
      <header className="md:hidden sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface-raised)]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-semibold truncate leading-tight">
            {settings.businessName}
          </p>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {staffName} · {roleLabel}
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="min-h-11 px-3 rounded-xl text-sm font-medium hover:bg-[var(--surface-sunken)]"
          >
            Sign out
          </button>
        </form>
      </header>

      <main
        id="main"
        className="flex-1 min-w-0 pb-24 md:pb-0 bg-[var(--surface-sunken)]"
      >
        {children}
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--border)] bg-[var(--surface-raised)]/95 backdrop-blur safe-bottom"
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, 1fr)` }}
        >
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-xs font-medium",
                  isActive(item.href)
                    ? "text-brand-700 dark:text-brand-400"
                    : "text-[var(--text-muted)]",
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span className="truncate max-w-full">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Page heading with room for one action, used by every screen. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-3 md:px-6 md:pt-6">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold truncate">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
