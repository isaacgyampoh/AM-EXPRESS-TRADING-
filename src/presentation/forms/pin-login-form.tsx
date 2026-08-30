"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/application/services/result";
import { PinInput, PIN_LENGTH } from "../components/pin-input";

/**
 * PIN sign-in.
 *
 * Submits itself the moment the fourth digit lands. A till is used standing
 * up, often one-handed, with someone waiting — four taps and it opens, or four
 * taps and it says why not. There is no button because there is nothing left
 * to decide once the fourth digit is in.
 *
 * The cost of that is real and worth stating: a mistyped digit is spent
 * immediately, and the lockout is ten failures per IP address, which for a
 * shop is the whole shop. Two things blunt it. The counter only counts
 * failures since the last success, so one good sign-in clears it. And the last
 * digit is never resubmitted — `attempted` holds the PIN that was just tried,
 * so a re-render, a double tap or a stray keystroke cannot spend a second
 * attempt on the same four digits.
 */
export function PinLoginForm({
  action,
  next,
}: {
  action: (
    previous: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
  next?: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const previousRef = useRef<ActionResult<null> | null>(null);
  /** The PIN already sent. Guards against spending a second attempt on it. */
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    if (isPending) return;
    if (attemptedRef.current === pin) return;

    attemptedRef.current = pin;

    const formData = new FormData();
    formData.set("pin", pin);
    if (next) formData.set("next", next);

    startTransition(async () => {
      const result = await action(previousRef.current, formData);
      previousRef.current = result;

      // Success redirects server-side and this component goes away. Only a
      // refusal comes back here.
      if (!result.ok) {
        setError(result.message);
        setPin("");
      }
    });
  }, [pin, isPending, action, next]);

  return (
    <div className="flex flex-col gap-4">
      <PinInput
        value={pin}
        onChange={(nextPin) => {
          setPin(nextPin);
          // Clear the message as soon as they start again, so the screen is
          // not still saying "Invalid PIN" over digits they have just retyped.
          if (error) setError(undefined);
          // Retyping the same four digits is a deliberate retry; allow it.
          if (nextPin.length < PIN_LENGTH) attemptedRef.current = null;
        }}
        disabled={isPending}
        invalid={Boolean(error)}
        describedBy="pin-status"
        status={
          /* One fixed-height line for all three states, so the reveal control
             below it does not jump when a message appears. */
          <p
            id="pin-status"
            role="status"
            aria-live="polite"
            className="min-h-10 px-2 text-center text-sm flex items-center justify-center"
          >
            {isPending ? (
              <span className="text-[var(--text-muted)]">Signing in…</span>
            ) : error ? (
              <span className="font-medium text-red-600 dark:text-red-400">
                {error}
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">
                Enter your 4-digit PIN
              </span>
            )}
          </p>
        }
      />
    </div>
  );
}
