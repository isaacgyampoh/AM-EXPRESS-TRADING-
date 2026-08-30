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
 * renders before a session exists, and RLS refuses the settings table to an
 * unauthenticated request.
 *
 * Centred and deliberately sparse. There is one thing to do here, it takes
 * four taps, and it is done standing up with a customer waiting — so the
 * screen holds a name, four boxes and one line of text, and nothing else
 * competing for the eye. No card around the boxes: they already read as a
 * group, and a border around a border is just furniture.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-dvh grid place-items-center px-6 py-10 bg-[var(--surface)]">
      <div className="w-full max-w-xs flex flex-col items-center">
        <div
          className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white text-base font-semibold"
          aria-hidden="true"
        >
          {brandInitials()}
        </div>

        <h1 className="mt-4 text-xl font-semibold text-center">
          {branding.name}
        </h1>

        <div className="mt-8 w-full">
          <PinLoginForm action={signIn} next={next} />
        </div>

        <p className="mt-12 text-center text-xs text-[var(--text-muted)]">
          Accounts are managed by an administrator.
          <br />
          If you cannot sign in, ask them to reset your PIN.
        </p>
      </div>
    </main>
  );
}
