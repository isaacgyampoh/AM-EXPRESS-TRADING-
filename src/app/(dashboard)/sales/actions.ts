"use server";

import { revalidatePath } from "next/cache";
import type { SaleDto } from "@/application/dto/sale-dto";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

/**
 * Voids a sale.
 *
 * Restores the stock, writes reversal movements, and marks the sale voided —
 * all inside one database transaction. The original rows stay exactly as they
 * were, because a void is a new fact about a sale rather than an edit to it,
 * and a business that can silently rewrite its own history cannot be audited.
 */
export async function voidSaleAction(
  _previous: ActionResult<SaleDto> | null,
  formData: FormData,
): Promise<ActionResult<SaleDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const sale = await cases.voidSale.execute(staff, {
      saleId: formData.get("saleId"),
      reason: formData.get("reason"),
    });

    revalidatePath("/sales");
    revalidatePath(`/sales/${sale.id}`);
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return sale;
  });
}
