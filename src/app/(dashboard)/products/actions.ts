"use server";

import { revalidatePath } from "next/cache";
import type { ProductDto } from "@/application/dto/product-dto";
import type { StockLevelDto } from "@/application/use-cases/manage-stock";
import { attempt, type ActionResult } from "@/application/services/result";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";

/**
 * Server actions for the catalogue.
 *
 * Every one of these starts by resolving who is asking from the session, then
 * hands straight to a use case. There is no business logic in this file and
 * there should never be: an action is a transport adapter that happens to be
 * a function call instead of an HTTP route.
 *
 * Note what is *not* passed in from the form: the actor. A hidden field
 * carrying a staff id would be a hidden field an attacker can edit.
 */

function formValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export async function createProductAction(
  _previous: ActionResult<ProductDto> | null,
  formData: FormData,
): Promise<ActionResult<ProductDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const product = await cases.createProduct.execute(staff, {
      ...formValues(formData),
      isActive: formData.get("isActive") === "on",
    } as Parameters<typeof cases.createProduct.execute>[1]);

    revalidatePath("/products");
    revalidatePath("/dashboard");
    return product;
  });
}

export async function updateProductAction(
  _previous: ActionResult<ProductDto> | null,
  formData: FormData,
): Promise<ActionResult<ProductDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const product = await cases.updateProduct.execute(staff, {
      ...formValues(formData),
      isActive: formData.get("isActive") === "on",
    } as Parameters<typeof cases.updateProduct.execute>[1]);

    revalidatePath("/products");
    revalidatePath(`/products/${product.id}`);
    revalidatePath("/dashboard");
    return product;
  });
}

/**
 * Adds another way to sell a product — a Box of the Pieces already stocked.
 *
 * Its own action rather than part of updateProductAction because it is not an
 * edit to the product: the product is unchanged and gains a price list entry,
 * with prices of its own that nothing derives.
 */
export async function addProductUnitAction(
  _previous: ActionResult<ProductDto> | null,
  formData: FormData,
): Promise<ActionResult<ProductDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.addProductUnit.execute(staff, formValues(formData));

    revalidatePath("/products");
    revalidatePath(`/products/${result.id}`);
    revalidatePath("/pos");
    return result;
  });
}

export async function addStockAction(
  _previous: ActionResult<StockLevelDto> | null,
  formData: FormData,
): Promise<ActionResult<StockLevelDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.addStock.execute(staff, formValues(formData));

    revalidatePath("/products");
    revalidatePath(`/products/${result.productId}`);
    revalidatePath("/dashboard");
    return result;
  });
}

export async function adjustStockAction(
  _previous: ActionResult<StockLevelDto> | null,
  formData: FormData,
): Promise<ActionResult<StockLevelDto>> {
  return attempt(async () => {
    const staff = await requireStaff();
    const cases = await getUseCases();

    const result = await cases.adjustStock.execute(staff, formValues(formData));

    revalidatePath("/products");
    revalidatePath(`/products/${result.productId}`);
    revalidatePath("/dashboard");
    return result;
  });
}
