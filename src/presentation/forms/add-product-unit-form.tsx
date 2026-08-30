"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductDto } from "@/application/dto/product-dto";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { MoneyInput, QuantityInput, Select } from "../components/ui/field";
import { useSettings } from "../components/settings-provider";
import { useToast } from "../components/ui/toast";

type AddUnitAction = (
  previous: ActionResult<ProductDto> | null,
  formData: FormData,
) => Promise<ActionResult<ProductDto>>;

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
 * Adds another way to sell a product that already exists.
 *
 * The two numbers that matter are side by side and both are typed in: how many
 * base units this holds, and what it costs. Nothing is prefilled from the base
 * unit's price. A Box of twelve almost never costs twelve times a Piece — that
 * difference is the reason anyone buys a box — so a prefilled figure would be
 * wrong far more often than it was right, and wrong in the direction of giving
 * stock away.
 */
export function AddProductUnitForm({
  action,
  product,
  units = UNIT_OPTIONS,
}: {
  action: AddUnitAction;
  product: ProductDto;
  units?: readonly string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const { currencySymbol } = useSettings();

  const taken = new Set(product.units.map((unit) => unit.unitName));
  const available = units.filter((unit) => !taken.has(unit));

  const [unitName, setUnitName] = useState(available[0] ?? "");
  const [baseQuantity, setBaseQuantity] = useState("1");

  const [state, formAction] = useActionState(
    async (previous: ActionResult<ProductDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`${product.name} can now be sold by the ${unitName}.`);
        router.refresh();
      } else if (!result.fieldErrors) {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const baseUnitName = product.units.find((u) => u.baseQuantity === 1)?.unitName;

  if (available.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Every unit is already in use for this product.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={product.id} />

      {state && !state.ok && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Unit"
          name="unitName"
          value={unitName}
          onChange={(e) => setUnitName(e.target.value)}
          options={available.map((unit) => ({ value: unit, label: unit }))}
          error={fieldErrors?.unitName}
        />

        <QuantityInput
          label={`How many ${baseUnitName?.toLowerCase() ?? "base units"} in one ${unitName || "unit"}`}
          name="baseQuantity"
          value={baseQuantity}
          onChange={(e) => setBaseQuantity(e.target.value)}
          hint="Selling one takes this many off the shelf."
          error={fieldErrors?.baseQuantity}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyInput
          label={`Retail price per ${unitName || "unit"}`}
          name="retailPrice"
          symbol={currencySymbol}
          required
          error={fieldErrors?.retailPrice}
        />

        <MoneyInput
          label={`Wholesale price per ${unitName || "unit"}`}
          name="wholesalePrice"
          symbol={currencySymbol}
          hint="Leave blank if you do not sell it wholesale by this unit."
          error={fieldErrors?.wholesalePrice}
        />
      </div>

      <SubmitButton unitName={unitName} />
    </form>
  );
}

function SubmitButton({ unitName }: { unitName: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="self-start">
      {pending ? "Adding…" : `Sell by the ${unitName || "unit"}`}
    </Button>
  );
}
