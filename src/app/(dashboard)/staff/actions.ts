"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/application/services/result";
import type { StaffDto } from "@/application/use-cases/manage-staff";
import { requireStaff } from "@/infrastructure/auth/session";
import { getPrivilegedUseCases, getUseCases } from "@/infrastructure/container";

function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/**
 * Creates a staff account.
 *
 * The only action in the application that reaches for the privileged Supabase
 * client, and it does so by name — `getPrivilegedUseCases` rather than
 * `getUseCases` — so the elevated path is visible in the code rather than
 * being an ambient capability every action happens to have.
 *
 * The initial password is read from the form, passed to the auth provider, and
 * never stored, logged or returned.
 */
export async function createStaffAction(
  _previous: ActionResult<StaffDto> | null,
  formData: FormData,
): Promise<ActionResult<StaffDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getPrivilegedUseCases();

    const created = await cases.createStaff.execute(staff, formValues(formData));

    revalidatePath("/staff");
    return created;
  });
}

export async function assignRoleAction(
  _previous: ActionResult<StaffDto> | null,
  formData: FormData,
): Promise<ActionResult<StaffDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const updated = await cases.assignRole.execute(staff, formValues(formData));

    revalidatePath("/staff");
    return updated;
  });
}

export async function setStaffActiveAction(
  _previous: ActionResult<StaffDto> | null,
  formData: FormData,
): Promise<ActionResult<StaffDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const updated = await cases.setStaffActive.execute(staff, {
      staffId: formData.get("staffId"),
      isActive: formData.get("isActive") === "true",
    });

    revalidatePath("/staff");
    return updated;
  });
}
