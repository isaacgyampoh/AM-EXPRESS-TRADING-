"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/application/services/result";
import type {
  ExpenseCategoryDto,
  ExpenseDto,
} from "@/application/use-cases/manage-expenses";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export async function createExpenseAction(
  _previous: ActionResult<ExpenseDto> | null,
  formData: FormData,
): Promise<ActionResult<ExpenseDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const expense = await cases.createExpense.execute(staff, formValues(formData));

    revalidatePath("/expenses");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return expense;
  });
}

export async function createExpenseCategoryAction(
  _previous: ActionResult<ExpenseCategoryDto> | null,
  formData: FormData,
): Promise<ActionResult<ExpenseCategoryDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const category = await cases.createExpenseCategory.execute(
      staff,
      formValues(formData),
    );

    revalidatePath("/expenses");
    return category;
  });
}

export async function deleteExpenseAction(
  _previous: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    await cases.deleteExpense.execute(staff, String(formData.get("id") ?? ""));

    revalidatePath("/expenses");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return null;
  });
}
