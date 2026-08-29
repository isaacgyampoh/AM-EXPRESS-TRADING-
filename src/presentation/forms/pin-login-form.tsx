"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/application/services/result";
import { PinInput, PIN_LENGTH } from "../components/pin-input";
import { Button } from "../components/ui/button";

/**
 * PIN sign-in.
 *
 * Submission is explicit rather than firing the moment a fourth digit lands.
 * Auto-submit saves one tap and costs a correction: a mistyped digit becomes a
 * failed attempt against a ten-attempt lockout before the cashier can reach
 * the backspace key, and the lockout is by IP, so it is the whole shop's
 * lockout, not one person's.
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

  const complete = pin.length === PIN_LENGTH;

  const submit = () => {
    if (!complete || isPending) return;

    const formData = new FormData();
    formData.set("pin", pin);
    if (next) formData.set("next", next);

    startTransition(async () => {
      const result = await action(previousRef.current, formData);
      previousRef.current = result;
      // Success redirects server-side; only a failure comes back here.
      if (!result.ok) {
        setError(result.message);
        setPin("");
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="pin" className="text-sm font-medium">
          PIN
        </label>

        <PinInput
          value={pin}
          onChange={(next) => {
            setPin(next);
            if (error) setError(undefined);
          }}
          onSubmit={submit}
          disabled={isPending}
          invalid={Boolean(error)}
          describedBy={error ? "pin-error" : undefined}
        />

        {/* Reserves its own line so the button does not jump when an error
            appears — a moving target under the thumb causes mis-taps. */}
        <p
          id="pin-error"
          role="alert"
          className="min-h-5 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={isPending}
        disabled={!complete}
      >
        Sign in
      </Button>
    </form>
  );
}
