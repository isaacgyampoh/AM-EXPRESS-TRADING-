import type { Metadata } from "next";
import { branding, brandInitials } from "@/lib/config/branding";
import { SignInForm } from "@/presentation/forms/sign-in-form";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The sign-in screen.
 *
 * The business name comes from `branding` rather than from the settings table,
 * because this page renders before there is a session — and without one, Row
 * Level Security correctly refuses to hand out the business settings.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-10 bg-[var(--surface-sunken)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand-700 text-white text-xl font-semibold"
            aria-hidden="true"
          >
            {brandInitials()}
          </div>
          <h1 className="text-2xl font-semibold">{branding.name}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Sign in to sell, manage stock and see the numbers.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
          <SignInForm action={signIn} next={next} />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Accounts are created by an administrator. If you cannot get in, ask
          them to check your account is still active.
        </p>
      </div>
    </main>
  );
}
