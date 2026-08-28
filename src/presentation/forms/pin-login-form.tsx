"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/application/services/result";
import { PinKeypad } from "../components/pin-keypad";

/**
 * PIN login form — wraps the keypad with the server action wiring.
 *
 * `attemptKey` is incremented on every failed attempt, which causes React to
 * remount `PinKeypad` (clearing its internal digit state) without needing
 * synchronous setState in effects.
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
  const [error, setError] = useState<string | undefined>(undefined);
  const [attemptKey, setAttemptKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const previousRef = useRef<ActionResult<null> | null>(null);

  const handleComplete = (pin: string) => {
    const formData = new FormData();
    formData.set("pin", pin);
    if (next) formData.set("next", next);

    startTransition(async () => {
      const result = await action(previousRef.current, formData);
      previousRef.current = result;
      if (!result.ok) {
        setError(result.message);
        // Remount the keypad so it starts fresh for the next attempt.
        setAttemptKey((k) => k + 1);
      }
      // On success the server action redirects; no client-side handling needed.
    });
  };

  return (
    <div className="flex flex-col items-center">
      <PinKeypad
        key={attemptKey}
        onComplete={handleComplete}
        disabled={isPending}
        error={error}
        onInput={() => setError(undefined)}
      />
    </div>
  );
}
