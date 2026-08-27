"use server";

import { revalidatePath } from "next/cache";
import type { BusinessSettingsDto } from "@/application/dto/settings-dto";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

export async function updateSettingsAction(
  _previous: ActionResult<BusinessSettingsDto> | null,
  formData: FormData,
): Promise<ActionResult<BusinessSettingsDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const values: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") values[key] = value;
    }

    const settings = await cases.updateBusinessSettings.execute(staff, values);

    // The business name, currency symbol and receipt footer appear on every
    // screen and every receipt, so everything is stale after this.
    revalidatePath("/", "layout");

    return settings;
  });
}
