"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
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
 * Mirrors the seed of the `units` lookup table.
 *
 * The database is the authority — `product_units.unit_name` has a foreign key
 * to it — so anything offered here must exist there. When unit management gets
 * a screen, this list comes from that table instead and this constant goes.
 */
const UNIT_OPTIONS = [
  "Piece",
  "Box",
  "Carton",
  "Pack",
  "Bag",
  "Bottle",
  "Crate",
  "Dozen",
  "Sachet",
  "Roll",
] as const;

/**
 * Create and edit a product.
 *
 * One form for both, because the fields are the same and two nearly-identical
 * forms drift apart. The only difference is opening stock, which exists once:
 * after a product is created, stock moves through the stock functions so that
 * every change has a movement row behind it.
 *
 * The unit is chosen before the prices, and every money label repeats it —
 * "Retail price per Box" — because a price with no unit attached is the bug
 * this whole change exists to remove.
 */
export function ProductForm({
  action,
  categories,
  product,
  submitLabel,
  units = UNIT_OPTIONS,
}: {
  action: ProductAction;
  categories: readonly CategoryDto[];
  product?: ProductDto;
  submitLabel: string;
  units?: readonly string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const { currencySymbol } = useSettings();

  const isEditing = Boolean(product);

  // Tracked so the price and stock fields can say what they are counting.
  // "Selling price" and "Opening stock: 10" are ambiguous on their own; ten
  // boxes and ten sachets are very different deliveries.
  const [unitName, setUnitName] = useState<string>(
    product?.unitName ?? "Piece",
  );

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

      {!isEditing && (
        <Select
          label="Sold and counted by"
          name="unitName"
          value={unitName}
          onChange={(e) => setUnitName(e.target.value)}
          options={units.map((unit) => ({ value: unit, label: unit }))}
          hint="Stock is counted in this unit. You can add other ways to sell it — a Box of these, say — after it is created."
          error={fieldErrors?.unitName}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <MoneyInput
          label={`Retail price per ${unitName}`}
          name="sellingPrice"
          symbol={currencySymbol}
          defaultValue={product?.sellingPrice}
          required
          error={fieldErrors?.sellingPrice}
        />

        <MoneyInput
          label={`Wholesale price per ${unitName}`}
          name="wholesalePrice"
          symbol={currencySymbol}
          defaultValue={product?.wholesalePrice ?? ""}
          hint="Leave blank if you do not sell this wholesale. It is never worked out from the retail price — a wholesale sale is refused instead."
          error={fieldErrors?.wholesalePrice}
        />
      </div>

      <MoneyInput
        label={`Cost price per ${unitName}`}
        name="costPrice"
        symbol={currencySymbol}
        defaultValue={product?.costPrice ?? ""}
        hint="What you paid. Leave blank if you do not know — profit reports will skip this product rather than assume it cost nothing."
        error={fieldErrors?.costPrice}
      />

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
            label={`Opening stock (${unitName})`}
            name="openingStock"
            defaultValue={0}
            hint={`How many ${unitName.toLowerCase()} you have right now. Recorded as a stock-in so the history starts here.`}
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
