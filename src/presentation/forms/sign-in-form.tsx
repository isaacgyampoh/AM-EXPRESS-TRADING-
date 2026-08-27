"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { TextInput } from "../components/ui/field";

export function SignInForm({
  action,
  next,
}: {
  action: (
    previous: ActionResult<null> | null,
    formData: FormData,
  ) => Promise<ActionResult<null>>;
  next?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {state && !state.ok && !state.fieldErrors && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <TextInput
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        error={fieldErrors?.email}
      />

      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors?.password}
      />

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // useFormStatus reads the pending state of the enclosing form, which is what
  // keeps a slow connection from producing three sign-in attempts.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
