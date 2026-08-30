"use server";

import { revalidatePath } from "next/cache";
import type { IncentiveDto } from "@/application/use-cases/manage-incentives";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export async function createIncentiveAction(
  _previous: ActionResult<IncentiveDto> | null,
  formData: FormData,
): Promise<ActionResult<IncentiveDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.createIncentive.execute(staff, formValues(formData));
    revalidatePath("/incentives");
    revalidatePath("/reports");
    return result;
  });
}

export async function setIncentiveStatusAction(
  _previous: ActionResult<IncentiveDto> | null,
  formData: FormData,
): Promise<ActionResult<IncentiveDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.setIncentiveStatus.execute(
      staff,
      formValues(formData),
    );
    revalidatePath("/incentives");
    revalidatePath("/reports");
    return result;
  });
}
