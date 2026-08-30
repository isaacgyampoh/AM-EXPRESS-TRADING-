"use server";

import { revalidatePath } from "next/cache";
import type {
  SupplierDto,
  SupplierInvoiceDto,
} from "@/application/use-cases/manage-suppliers";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

/** String fields only. The document is pulled out separately — see below. */
function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export async function createSupplierAction(
  _previous: ActionResult<SupplierDto> | null,
  formData: FormData,
): Promise<ActionResult<SupplierDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.createSupplier.execute(staff, formValues(formData));
    revalidatePath("/suppliers");
    return result;
  });
}

export async function setSupplierActiveAction(
  _previous: ActionResult<SupplierDto> | null,
  formData: FormData,
): Promise<ActionResult<SupplierDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.setSupplierActive.execute(
      staff,
      formValues(formData),
    );
    revalidatePath("/suppliers");
    return result;
  });
}

/**
 * Records an invoice and stores its document.
 *
 * The File is taken out of the form separately rather than going through
 * `formValues`, which keeps strings only. It is never written to disk here —
 * it is handed to the repository, which puts it straight into the private
 * bucket and keeps only the object key.
 */
export async function recordSupplierInvoiceAction(
  _previous: ActionResult<SupplierInvoiceDto> | null,
  formData: FormData,
): Promise<ActionResult<SupplierInvoiceDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const document = formData.get("document");
    const file = document instanceof File ? document : null;

    const result = await cases.recordSupplierInvoice.execute(
      staff,
      formValues(formData),
      file,
    );
    revalidatePath("/suppliers");
    return result;
  });
}
