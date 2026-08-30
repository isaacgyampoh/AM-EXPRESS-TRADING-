"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { StaffDto } from "@/application/use-cases/manage-staff";
import type { IncentiveDto } from "@/application/use-cases/manage-incentives";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { MoneyInput, Select, TextArea, TextInput } from "../components/ui/field";
import { useSettings } from "../components/settings-provider";
import { useToast } from "../components/ui/toast";

type IncentiveAction = (
  previous: ActionResult<IncentiveDto> | null,
  formData: FormData,
) => Promise<ActionResult<IncentiveDto>>;

/** First and last day of the month containing `date`, as yyyy-mm-dd. */
function monthBounds(date = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Records a bonus or commission.
 *
 * The period defaults to this month because that is what almost every
 * incentive is for, and because "which month was this for" is the question
 * asked at the end of every one of them. A single date would not answer it.
 */
export function CreateIncentiveForm({
  action,
  staff,
}: {
  action: IncentiveAction;
  staff: readonly StaffDto[];
}) {
  const toast = useToast();
  const router = useRouter();
  const { currencySymbol } = useSettings();
  const bounds = monthBounds();

  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");

  const [state, formAction] = useActionState(
    async (previous: ActionResult<IncentiveDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`Incentive recorded for ${result.data.staffName}.`);
        router.refresh();
      } else if (!result.fieldErrors) {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (staff.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Add a staff member before recording an incentive.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
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
          label="Staff member"
          name="staffId"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={staff.map((member) => ({
            value: member.id,
            label: member.fullName,
          }))}
          error={fieldErrors?.staffId}
        />

        <MoneyInput
          label="Amount"
          name="amount"
          symbol={currencySymbol}
          required
          error={fieldErrors?.amount}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Period from"
          name="periodStart"
          type="date"
          defaultValue={bounds.start}
          required
          error={fieldErrors?.periodStart}
        />
        <TextInput
          label="Period to"
          name="periodEnd"
          type="date"
          defaultValue={bounds.end}
          required
          error={fieldErrors?.periodEnd}
        />
      </div>

      <TextArea
        label="What it is for"
        name="reason"
        placeholder="December sales commission"
        required
        error={fieldErrors?.reason}
      />

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="self-start">
      {pending ? "Recording…" : "Record incentive"}
    </Button>
  );
}

/**
 * One incentive, with the two things an admin does to it.
 *
 * Cancel rather than delete. A bonus that was promised and withdrawn is
 * something the business may have to explain later, and a row that vanished
 * explains nothing.
 */
export function IncentiveRow({
  incentive,
  action,
  canManage,
}: {
  incentive: IncentiveDto;
  action: IncentiveAction;
  canManage: boolean;
}) {
  const toast = useToast();
  const router = useRouter();

  const [, formAction] = useActionState(
    async (previous: ActionResult<IncentiveDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success("Incentive updated.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  const cancelled = incentive.status === "cancelled";

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${cancelled ? "line-through text-[var(--text-muted)]" : ""}`}>
            {incentive.staffName}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {incentive.reason}
          </p>
          <p className="text-xs text-[var(--text-muted)] numeric mt-0.5">
            {incentive.periodStart} to {incentive.periodEnd}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className={`font-semibold numeric ${cancelled ? "line-through text-[var(--text-muted)]" : ""}`}>
            {incentive.amount}
          </p>
          <p className="text-xs text-[var(--text-muted)] capitalize">
            {incentive.status}
          </p>
        </div>
      </div>

      {canManage && !cancelled && (
        <div className="mt-2 flex gap-2">
          {incentive.status === "pending" && (
            <form action={formAction}>
              <input type="hidden" name="id" value={incentive.id} />
              <input type="hidden" name="status" value="paid" />
              <Button type="submit" size="sm" variant="secondary">
                Mark paid
              </Button>
            </form>
          )}
          <form action={formAction}>
            <input type="hidden" name="id" value={incentive.id} />
            <input type="hidden" name="status" value="cancelled" />
            <Button type="submit" size="sm" variant="ghost">
              Cancel
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}
