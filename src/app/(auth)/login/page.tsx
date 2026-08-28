import type { Metadata } from "next";
import { branding, brandInitials } from "@/lib/config/branding";
import { PinLoginForm } from "@/presentation/forms/pin-login-form";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The PIN sign-in screen.
 *
 * Staff see a 4-digit keypad only — no email, no password, no username.
 * The business name and initials come from the compile-time `branding` config
 * because this page renders before a session exists, and RLS refuses to serve
 * the settings table to unauthenticated requests.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-10 bg-[var(--surface-sunken)]">
      <div className="w-full max-w-xs">
        {/* Business branding */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand-700 text-white text-xl font-semibold shadow-md"
            aria-hidden="true"
          >
            {brandInitials()}
          </div>
          <h1 className="text-2xl font-semibold">{branding.name}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Enter your PIN to sign in.
          </p>
        </div>

        {/* PIN keypad */}
        <PinLoginForm action={signIn} next={next} />

        <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
          Accounts are managed by an administrator.
        </p>
      </div>
    </main>
  );
}
