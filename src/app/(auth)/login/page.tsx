import type { Metadata } from "next";
import { branding, brandInitials } from "@/lib/config/branding";
import { PinLoginForm } from "@/presentation/forms/pin-login-form";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The sign-in screen.
 *
 * Staff sign in with a 4-digit PIN — no email, no username. The business name
 * and initials come from the compile-time `branding` config because this page
 * renders before a session exists, and RLS refuses to serve the settings table
 * to an unauthenticated request.
 *
 * Deliberately plain. This is the first screen of a till that someone opens
 * several times a day, standing up, often with a customer waiting: it wants to
 * be legible and fast, not impressive. One column, one field, one button, and
 * enough breathing room that nothing is mis-tapped.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-12 bg-[var(--surface-sunken)]">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          <div
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-white text-sm font-semibold"
            aria-hidden="true"
          >
            {brandInitials()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight truncate">
              {branding.name}
            </h1>
            <p className="text-sm text-[var(--text-muted)] leading-tight">
              Staff sign in
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
          <PinLoginForm action={signIn} next={next} />
        </div>

        <p className="mt-5 text-xs text-[var(--text-muted)]">
          Accounts are managed by an administrator. If you cannot sign in, ask
          them to reset your PIN.
        </p>
      </div>
    </main>
  );
}
