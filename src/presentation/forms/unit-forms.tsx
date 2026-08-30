"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import type { UnitRecord } from "@/domain/repositories/unit-repository";
import { Button } from "../components/ui/button";
import { TextInput } from "../components/ui/field";
import { useToast } from "../components/ui/toast";

type UnitAction = (
  previous: ActionResult<UnitRecord> | null,
  formData: FormData,
) => Promise<ActionResult<UnitRecord>>;

export function CreateUnitForm({ action }: { action: UnitAction }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");

  const [state, formAction] = useActionState(
    async (previous: ActionResult<UnitRecord> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`${result.data.name} added.`);
        setName("");
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
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <TextInput
          label="Unit name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Crate"
          autoComplete="off"
          required
          hint="Written as it will appear: Crate, not CRATE."
          error={fieldErrors?.name}
        />
      </div>
      <AddButton />
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="sm:mt-7">
      {pending ? "Adding…" : "Add unit"}
    </Button>
  );
}

/**
 * One unit, with the count of products sold in it.
 *
 * The count is shown rather than hidden because it is the reason the retire
 * button is refused: a unit in use cannot be retired, and an admin who cannot
 * see why would try again.
 */
export function UnitRow({
  unit,
  action,
}: {
  unit: UnitRecord;
  action: UnitAction;
}) {
  const toast = useToast();
  const router = useRouter();

  const [, formAction] = useActionState(
    async (previous: ActionResult<UnitRecord> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`${result.data.name} ${result.data.isActive ? "restored" : "retired"}.`);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex-1 min-w-0">
        <span className={unit.isActive ? "" : "text-[var(--text-muted)]"}>
          {unit.name}
        </span>
        {!unit.isActive && (
          <span className="ml-2 text-xs text-[var(--text-muted)]">retired</span>
        )}
        {unit.usageCount > 0 && (
          <span className="block text-xs text-[var(--text-muted)]">
            used by {unit.usageCount}{" "}
            {unit.usageCount === 1 ? "product" : "products"}
          </span>
        )}
      </span>

      <form action={formAction}>
        <input type="hidden" name="name" value={unit.name} />
        <input
          type="hidden"
          name="isActive"
          value={unit.isActive ? "" : "true"}
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={unit.isActive && unit.usageCount > 0}
        >
          {unit.isActive ? "Retire" : "Restore"}
        </Button>
      </form>
    </li>
  );
}
