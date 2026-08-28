"use server";

import { headers } from "next/headers";
import type { ActionResult } from "@/application/services/result";
import { failure, success } from "@/application/services/result";
import { ValidationError } from "@/domain/errors/domain-error";
import { requireStaff } from "@/infrastructure/auth/session";
import { getPinUseCases } from "@/infrastructure/container";

/**
 * Server action: change the authenticated staff member's own PIN.
 *
 * The current PIN is verified before accepting the new one.  The bcrypt
 * comparison and hash happen on the server; the raw PIN values are never
 * logged and never returned.
 */
export async function changePinAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "0.0.0.0";

  const actor = await requireStaff();
  const { changeOwnPin } = await getPinUseCases();

  try {
    await changeOwnPin.execute(actor, ip, {
      currentPin: formData.get("currentPin"),
      newPin: formData.get("newPin"),
      confirmPin: formData.get("confirmPin"),
    });
    return success(null);
  } catch (err) {
    if (err instanceof ValidationError) {
      return failure("VALIDATION_ERROR", err.message, {
        fieldErrors: (err.details as Record<string, string>) ?? {},
      });
    }
    return failure("CHANGE_PIN_FAILED", "Could not change PIN. Try again.");
  }
}
