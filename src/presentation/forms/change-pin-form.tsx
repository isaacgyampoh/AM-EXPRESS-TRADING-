"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { TextInput } from "../components/ui/field";

/**
 * Change-PIN form.
 *
 * Requires the current PIN for proof of identity, then accepts a new PIN and
 * a confirmation.  All three values are sent to the server — the raw digits
 * never leave the browser in any permanent way, and the hashing happens there.
 */
export function ChangePinForm({
  action,
}: {
  action: (
    previous: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
}) {
  const [state, formAction] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (state?.ok) {
    return (
      <p
        role="status"
        className="text-sm font-medium text-green-700 dark:text-green-400"
      >
        ✓ PIN changed successfully.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state && !state.ok && !state.fieldErrors && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <TextInput
        label="Current PIN"
        name="currentPin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        autoComplete="current-password"
        required
        hint="Your 4-digit PIN."
        error={fieldErrors?.currentPin}
      />

      <TextInput
        label="New PIN"
        name="newPin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        autoComplete="new-password"
        required
        hint="Choose any 4 digits."
        error={fieldErrors?.newPin}
      />

      <TextInput
        label="Confirm new PIN"
        name="confirmPin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        autoComplete="new-password"
        required
        error={fieldErrors?.confirmPin}
      />

      <PendingButton />
    </form>
  );
}

function PendingButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? "Changing PIN…" : "Change PIN"}
    </Button>
  );
}
