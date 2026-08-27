"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import type {
  ExpenseCategoryDto,
  ExpenseDto,
} from "@/application/use-cases/manage-expenses";
import { Button } from "../components/ui/button";
import { MoneyInput, Select, TextArea, TextInput } from "../components/ui/field";
import { Sheet } from "../components/ui/sheet";
import { useToast } from "../components/ui/toast";
import { useSettings } from "../components/settings-provider";

type ExpenseAction = (
  previous: ActionResult<ExpenseDto> | null,
  formData: FormData,
) => Promise<ActionResult<ExpenseDto>>;

type CategoryAction = (
  previous: ActionResult<ExpenseCategoryDto> | null,
  formData: FormData,
) => Promise<ActionResult<ExpenseCategoryDto>>;

/** Local calendar date — not UTC, which would shift the day after 00:00 GMT. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function ExpenseControls({
  categories,
  createExpense,
  createCategory,
}: {
  categories: readonly ExpenseCategoryDto[];
  createExpense: ExpenseAction;
  createCategory: CategoryAction;
}) {
  const [open, setOpen] = useState<"expense" | "category" | null>(null);

  return (
    <>
      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={() => setOpen("expense")}>
          Record an expense
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setOpen("category")}
        >
          New category
        </Button>
      </div>

      <Sheet
        open={open === "expense"}
        onClose={() => setOpen(null)}
        title="Record an expense"
        description="Money that went out of the business."
      >
        <ExpenseForm
          categories={categories}
          action={createExpense}
          onDone={() => setOpen(null)}
        />
      </Sheet>

      <Sheet
        open={open === "category"}
        onClose={() => setOpen(null)}
        title="New expense category"
        description="Used to group expenses in reports."
      >
        <CategoryForm action={createCategory} onDone={() => setOpen(null)} />
      </Sheet>
    </>
  );
}

function ExpenseForm({
  categories,
  action,
  onDone,
}: {
  categories: readonly ExpenseCategoryDto[];
  action: ExpenseAction;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const { currencySymbol } = useSettings();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Expense recorded.");
      onDone();
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, toast, onDone, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (categories.length === 0) {
    return (
      <p className="py-4 text-sm text-[var(--text-muted)]">
        Create an expense category first — expenses are grouped by category in
        every report, so there is nowhere to file this one yet.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
      <MoneyInput
        label="Amount"
        name="amount"
        symbol={currencySymbol}
        required
        autoFocus
        error={fieldErrors?.amount}
      />

      <Select
        label="Category"
        name="categoryId"
        required
        placeholder="Choose a category"
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        error={fieldErrors?.categoryId}
      />

      <Select
        label="Paid with"
        name="method"
        required
        defaultValue="cash"
        options={[
          { value: "cash", label: "Cash" },
          { value: "mobile_money", label: "Mobile Money" },
        ]}
        error={fieldErrors?.method}
      />

      <TextArea
        label="What was it for?"
        name="description"
        required
        placeholder="Taxi to the market for stock"
        error={fieldErrors?.description}
      />

      <TextInput
        label="Date"
        name="incurredOn"
        type="date"
        defaultValue={today()}
        hint="The day the money actually left, which is not always today."
        error={fieldErrors?.incurredOn}
      />

      <PendingButton label="Record expense" pendingLabel="Recording…" />
    </form>
  );
}

function CategoryForm({
  action,
  onDone,
}: {
  action: CategoryAction;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Category added.");
      onDone();
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, toast, onDone, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
      <TextInput
        label="Category name"
        name="name"
        required
        autoFocus
        placeholder="Transport"
        error={fieldErrors?.name}
      />
      <PendingButton label="Add category" pendingLabel="Adding…" />
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
