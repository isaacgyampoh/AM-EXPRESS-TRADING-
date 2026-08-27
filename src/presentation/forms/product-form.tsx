"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { CategoryDto, ProductDto } from "@/application/dto/product-dto";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import {
  Checkbox,
  MoneyInput,
  QuantityInput,
  Select,
  TextInput,
} from "../components/ui/field";
import { useToast } from "../components/ui/toast";
import { useSettings } from "../components/settings-provider";

type ProductAction = (
  previous: ActionResult<ProductDto> | null,
  formData: FormData,
) => Promise<ActionResult<ProductDto>>;

/**
 * Create and edit a product.
 *
 * One form for both, because the fields are the same and two nearly-identical
 * forms drift apart. The only difference is opening stock, which exists once:
 * after a product is created, stock moves through the stock functions so that
 * every change has a movement row behind it.
 */
export function ProductForm({
  action,
  categories,
  product,
  submitLabel,
}: {
  action: ProductAction;
  categories: readonly CategoryDto[];
  product?: ProductDto;
  submitLabel: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const { currencySymbol } = useSettings();

  const isEditing = Boolean(product);

  // Handled inside the action rather than in an effect watching its result:
  // navigating a render later shows the old form for a beat, which on a slow
  // connection reads as the save having failed.
  const [state, formAction] = useActionState(
    async (previous: ActionResult<ProductDto> | null, formData: FormData) => {
      const result = await action(previous, formData);

      if (result.ok) {
        toast.success(isEditing ? "Product updated." : "Product added.");
        router.push(`/products/${result.data.id}`);
        router.refresh();
      } else if (!result.fieldErrors) {
        toast.error(result.message);
      }

      return result;
    },
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {product && <input type="hidden" name="id" value={product.id} />}

      {state && !state.ok && !state.fieldErrors && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      <TextInput
        label="Product name"
        name="name"
        defaultValue={product?.name}
        placeholder="Rice 5kg"
        required
        autoComplete="off"
        error={fieldErrors?.name}
      />

      <TextInput
        label="SKU"
        name="sku"
        defaultValue={product?.sku}
        placeholder="RICE-5KG"
        required
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        hint="A short code you use for this product. Letters, numbers, dots, dashes."
        error={fieldErrors?.sku}
        className="numeric"
      />

      <Select
        label="Category"
        name="categoryId"
        defaultValue={product?.categoryId ?? ""}
        placeholder="No category"
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        error={fieldErrors?.categoryId}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <MoneyInput
          label="Selling price"
          name="sellingPrice"
          symbol={currencySymbol}
          defaultValue={product?.sellingPrice}
          required
          error={fieldErrors?.sellingPrice}
        />

        <MoneyInput
          label="Cost price"
          name="costPrice"
          symbol={currencySymbol}
          defaultValue={product?.costPrice ?? ""}
          hint="What you paid. Leave blank if you do not know — profit reports will skip this product rather than assume it cost nothing."
          error={fieldErrors?.costPrice}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <QuantityInput
          label="Low stock warning at"
          name="minimumStock"
          defaultValue={product?.minimumStock ?? 0}
          hint="You will be warned when stock falls to this number."
          error={fieldErrors?.minimumStock}
        />

        {!isEditing && (
          <QuantityInput
            label="Opening stock"
            name="openingStock"
            defaultValue={0}
            hint="How many you have right now. Recorded as a stock-in so the history starts here."
            error={fieldErrors?.openingStock}
          />
        )}
      </div>

      <Checkbox
        label="Available to sell"
        name="isActive"
        defaultChecked={product?.isActive ?? true}
      />

      <div className="flex gap-3 pt-2">
        <SubmitButton label={submitLabel} />
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" loading={pending} className="flex-1">
      {pending ? "Saving…" : label}
    </Button>
  );
}
