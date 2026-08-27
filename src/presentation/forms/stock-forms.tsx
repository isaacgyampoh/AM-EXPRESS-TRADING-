"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import type { StockLevelDto } from "@/application/use-cases/manage-stock";
import { Button } from "../components/ui/button";
import { QuantityInput, TextArea, TextInput } from "../components/ui/field";
import { Sheet } from "../components/ui/sheet";
import { useToast } from "../components/ui/toast";

type StockAction = (
  previous: ActionResult<StockLevelDto> | null,
  formData: FormData,
) => Promise<ActionResult<StockLevelDto>>;

/**
 * The two ways stock legitimately moves outside a sale.
 *
 * They are separate forms because they are separate events with different
 * evidence behind them. A stock-in is "twelve more arrived" — a delta. An
 * adjustment is "I counted, and there are seven" — an absolute, and one that
 * has to be explained, because the difference is stock the business thought it
 * had and does not.
 */

export function StockControls({
  productId,
  productName,
  quantityOnHand,
  addStock,
  adjustStock,
}: {
  productId: string;
  productName: string;
  quantityOnHand: number;
  addStock: StockAction;
  adjustStock: StockAction;
}) {
  const [open, setOpen] = useState<"add" | "adjust" | null>(null);

  return (
    <>
      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={() => setOpen("add")}
        >
          Add stock
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={() => setOpen("adjust")}
        >
          Correct count
        </Button>
      </div>

      <Sheet
        open={open === "add"}
        onClose={() => setOpen(null)}
        title="Add stock"
        description={`${productName} — ${quantityOnHand} on hand now`}
      >
        <AddStockForm
          productId={productId}
          action={addStock}
          onDone={() => setOpen(null)}
        />
      </Sheet>

      <Sheet
        open={open === "adjust"}
        onClose={() => setOpen(null)}
        title="Correct the count"
        description={`${productName} — the books say ${quantityOnHand}`}
      >
        <AdjustStockForm
          productId={productId}
          quantityOnHand={quantityOnHand}
          action={adjustStock}
          onDone={() => setOpen(null)}
        />
      </Sheet>
    </>
  );
}

function AddStockForm({
  productId,
  action,
  onDone,
}: {
  productId: string;
  action: StockAction;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(`Stock is now ${state.data.quantityOnHand}.`);
      onDone();
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, toast, onDone, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
      <input type="hidden" name="productId" value={productId} />

      <QuantityInput
        label="How many arrived"
        name="quantity"
        min={1}
        defaultValue={1}
        required
        autoFocus
        error={fieldErrors?.quantity}
      />

      <TextInput
        label="Note"
        name="reason"
        placeholder="Delivery from supplier"
        hint="Optional, but it is what makes the history readable later."
        error={fieldErrors?.reason}
      />

      <PendingButton label="Add stock" pendingLabel="Adding…" />
    </form>
  );
}

function AdjustStockForm({
  productId,
  quantityOnHand,
  action,
  onDone,
}: {
  productId: string;
  quantityOnHand: number;
  action: StockAction;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(`Stock corrected to ${state.data.quantityOnHand}.`);
      onDone();
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, toast, onDone, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
      <input type="hidden" name="productId" value={productId} />

      <QuantityInput
        label="How many are actually there"
        name="countedQuantity"
        min={0}
        defaultValue={quantityOnHand}
        required
        autoFocus
        hint="Enter what you counted. The difference is worked out and recorded for you."
        error={fieldErrors?.countedQuantity}
      />

      <TextArea
        label="What happened"
        name="reason"
        required
        placeholder="Stock take — three bags damaged in storage"
        hint="Required. An unexplained correction is stock the business cannot account for."
        error={fieldErrors?.reason}
      />

      <PendingButton label="Save correction" pendingLabel="Saving…" />
    </form>
  );
}

function PendingButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
