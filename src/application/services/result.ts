import { DomainError } from "@/domain/errors/domain-error";

/**
 * What a server action gives back to a form.
 *
 * Server actions cannot throw across the network boundary usefully — Next
 * turns an uncaught error into an opaque "an error occurred" in production,
 * deliberately, so that stack traces do not leak. So actions catch their own
 * domain errors and return them as data.
 *
 * `code` is the machine-readable domain error code; `message` is already
 * written for a person, because domain errors are written that way.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      /** Per-field messages, for form validation. */
      fieldErrors?: Record<string, string>;
      details?: Record<string, unknown>;
    };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(
  code: string,
  message: string,
  extra: {
    fieldErrors?: Record<string, string>;
    details?: Record<string, unknown>;
  } = {},
): ActionResult<never> {
  return { ok: false, code, message, ...extra };
}

/**
 * Runs an action and converts any DomainError into a failure result.
 *
 * Anything that is not a DomainError is genuinely unexpected — a bug, or the
 * database being unreachable — so it is logged server-side and reported to the
 * user in general terms. Echoing an arbitrary exception message to the browser
 * is how internal detail escapes.
 */
export async function attempt<T>(
  operation: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return success(await operation());
  } catch (error) {
    if (error instanceof DomainError) {
      return failure(error.code, error.message, {
        details: error.details as Record<string, unknown>,
      });
    }

    console.error("Unexpected failure in a server action:", error);
    return failure(
      "UNEXPECTED",
      "Something went wrong. Please try again — nothing was saved.",
    );
  }
}
