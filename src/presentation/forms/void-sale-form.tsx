"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { SaleDto } from "@/application/dto/sale-dto";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { TextArea } from "../components/ui/field";
import { Sheet } from "../components/ui/sheet";
import { useToast } from "../components/ui/toast";

/**
 * Voiding a sale.
 *
 * Behind a confirmation sheet with a required reason, because this puts stock
 * back on the shelf and removes money from the day's takings. Both of those
 * are visible to the owner, and neither should ever happen without a sentence
 * explaining why.
 */
export function VoidSaleControl({
  saleId,
  receiptNumber,
  action,
}: {
  saleId: string;
  receiptNumber: string;
  action: (
    previous: ActionResult<SaleDto> | null,
    formData: FormData,
  ) => Promise<ActionResult<SaleDto>>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Sale voided. The stock has been put back.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [state, toast, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Void this sale
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Void this sale?"
        description={`${receiptNumber} — the stock goes back on the shelf and the money comes out of the day's takings.`}
      >
        <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
          <input type="hidden" name="saleId" value={saleId} />

          <TextArea
            label="Why is this being voided?"
            name="reason"
            required
            autoFocus
            placeholder="Customer returned the goods"
            hint="Recorded against the sale permanently. The original receipt is kept."
            error={fieldErrors?.reason}
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Keep it
            </Button>
            <VoidButton />
          </div>
        </form>
      </Sheet>
    </>
  );
}

function VoidButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="danger"
      size="lg"
      className="flex-1"
      loading={pending}
    >
      {pending ? "Voiding…" : "Void sale"}
    </Button>
  );
}
