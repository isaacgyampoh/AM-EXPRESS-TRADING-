"use server";

import { revalidatePath } from "next/cache";
import type { ProductDto } from "@/application/dto/product-dto";
import { attempt, type ActionResult } from "@/application/services/result";
import type { CompleteSaleResult } from "@/application/use-cases/complete-sale";
import type { CompleteSaleInput } from "@/application/validators/sale-validators";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

/**
 * Server actions for the till.
 *
 * The checkout action takes product ids, quantities, payment amounts and an
 * idempotency key. It does not take a price or a total — those are read from
 * the catalogue on the server and again inside the database transaction, so
 * there is nothing here a modified client could use to change what is charged.
 */

/**
 * Product search for the POS.
 *
 * Runs against Postgres with a small limit rather than shipping the catalogue
 * to the phone. A shop with three thousand products should search as fast as
 * one with thirty.
 */
export async function searchPosProductsAction(
  query: string,
): Promise<ActionResult<readonly ProductDto[]>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const page = await cases.listProducts.execute(staff, {
      search: query.trim() || undefined,
      activeOnly: true,
      pageSize: 30,
    });

    return page.items;
  });
}

export async function completeSaleAction(
  input: CompleteSaleInput,
): Promise<ActionResult<CompleteSaleResult>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.completeSale.execute(staff, input);

    // Stock moved, so anything showing a quantity is now stale.
    revalidatePath("/pos");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/sales");

    return result;
  });
}
