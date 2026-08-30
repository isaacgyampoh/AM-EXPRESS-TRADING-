"use server";

import { revalidatePath } from "next/cache";
import type { CategoryDto } from "@/application/dto/product-dto";
import type { UnitRecord } from "@/domain/repositories/unit-repository";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

/**
 * Server actions for categories.
 *
 * Like every action in this system: resolve who is asking from the session,
 * hand straight to a use case, and revalidate what the change is visible on.
 * The actor is never taken from the form — a hidden field carrying a staff id
 * is a hidden field an attacker can edit.
 */

function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/** Everything a category is visible on. A rename shows up on all of them. */
function revalidateCategoryViews(): void {
  revalidatePath("/categories");
  revalidatePath("/products");
  revalidatePath("/products/new");
  revalidatePath("/reports");
}

export async function createCategoryAction(
  _previous: ActionResult<CategoryDto> | null,
  formData: FormData,
): Promise<ActionResult<CategoryDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.createCategory.execute(staff, formValues(formData));
    revalidateCategoryViews();
    return result;
  });
}

export async function updateCategoryAction(
  _previous: ActionResult<CategoryDto> | null,
  formData: FormData,
): Promise<ActionResult<CategoryDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.updateCategory.execute(staff, formValues(formData));
    revalidateCategoryViews();
    return result;
  });
}

export async function createUnitAction(
  _previous: ActionResult<UnitRecord> | null,
  formData: FormData,
): Promise<ActionResult<UnitRecord>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.createUnit.execute(staff, formValues(formData));
    revalidateCategoryViews();
    return result;
  });
}

export async function setUnitActiveAction(
  _previous: ActionResult<UnitRecord> | null,
  formData: FormData,
): Promise<ActionResult<UnitRecord>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.setUnitActive.execute(staff, formValues(formData));
    revalidateCategoryViews();
    return result;
  });
}
