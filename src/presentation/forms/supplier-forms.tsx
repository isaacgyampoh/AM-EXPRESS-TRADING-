"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  SupplierDto,
  SupplierInvoiceDto,
} from "@/application/use-cases/manage-suppliers";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { MoneyInput, Select, TextArea, TextInput } from "../components/ui/field";
import { useSettings } from "../components/settings-provider";
import { useToast } from "../components/ui/toast";

type SupplierAction = (
  previous: ActionResult<SupplierDto> | null,
  formData: FormData,
) => Promise<ActionResult<SupplierDto>>;

type InvoiceAction = (
  previous: ActionResult<SupplierInvoiceDto> | null,
  formData: FormData,
) => Promise<ActionResult<SupplierInvoiceDto>>;

export function CreateSupplierForm({ action }: { action: SupplierAction }) {
  const toast = useToast();
  const router = useRouter();

  const [state, formAction] = useActionState(
    async (previous: ActionResult<SupplierDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`${result.data.name} added.`);
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
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <TextInput
        label="Supplier name"
        name="name"
        placeholder="Kofi Traders"
        autoComplete="off"
        required
        error={fieldErrors?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          error={fieldErrors?.phone}
        />
        <TextInput
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          error={fieldErrors?.email}
        />
      </div>

      <TextInput label="Address" name="address" autoComplete="off" error={fieldErrors?.address} />
      <TextArea label="Notes" name="notes" error={fieldErrors?.notes} />

      <SubmitButton idle="Add supplier" busy="Adding…" />
    </form>
  );
}

/**
 * Records an invoice and attaches the document.
 *
 * `encType` is set explicitly because the file is the point: without
 * multipart, the browser sends only the filename and the server would store an
 * empty document with a perfectly valid-looking row beside it.
 */
export function RecordInvoiceForm({
  action,
  suppliers,
}: {
  action: InvoiceAction;
  suppliers: readonly SupplierDto[];
}) {
  const toast = useToast();
  const router = useRouter();
  const { currencySymbol } = useSettings();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");

  const [state, formAction] = useActionState(
    async (
      previous: ActionResult<SupplierInvoiceDto> | null,
      formData: FormData,
    ) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success(`Invoice ${result.data.invoiceNumber} recorded.`);
        router.refresh();
      } else if (!result.fieldErrors) {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Add a supplier before recording an invoice.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="flex flex-col gap-4"
      noValidate
    >
      {state && !state.ok && !state.fieldErrors && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </p>
      )}

      <Select
        label="Supplier"
        name="supplierId"
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        error={fieldErrors?.supplierId}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Invoice number"
          name="invoiceNumber"
          autoComplete="off"
          required
          error={fieldErrors?.invoiceNumber}
        />
        <TextInput
          label="Invoice date"
          name="invoiceDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
          error={fieldErrors?.invoiceDate}
        />
      </div>

      <MoneyInput
        label="Amount"
        name="amount"
        symbol={currencySymbol}
        required
        error={fieldErrors?.amount}
      />

      <TextArea label="Description" name="description" error={fieldErrors?.description} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="document" className="text-sm font-medium">
          Invoice document
          <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
        </label>
        <input
          id="document"
          name="document"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
          className="w-full min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-sunken)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-sm text-[var(--text-muted)]">
          PDF, JPG or PNG, up to 10MB. Stored privately — only administrators
          can open it.
        </p>
        {fieldErrors?.file && (
          <p role="alert" className="text-sm text-red-600">
            {fieldErrors.file}
          </p>
        )}
      </div>

      <SubmitButton idle="Record invoice" busy="Uploading…" />
    </form>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} className="self-start">
      {pending ? busy : idle}
    </Button>
  );
}

export function SupplierRow({
  supplier,
  action,
}: {
  supplier: SupplierDto;
  action: SupplierAction;
}) {
  const toast = useToast();
  const router = useRouter();

  const [, formAction] = useActionState(
    async (previous: ActionResult<SupplierDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success("Supplier updated.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    },
    null,
  );

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex-1 min-w-0">
        <span className={supplier.isActive ? "font-medium" : "font-medium text-[var(--text-muted)]"}>
          {supplier.name}
        </span>
        {!supplier.isActive && (
          <span className="ml-2 text-xs text-[var(--text-muted)]">inactive</span>
        )}
        {(supplier.phone || supplier.email) && (
          <span className="block text-sm text-[var(--text-muted)]">
            {[supplier.phone, supplier.email].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>

      <form action={formAction}>
        <input type="hidden" name="id" value={supplier.id} />
        <input type="hidden" name="isActive" value={supplier.isActive ? "" : "true"} />
        <Button type="submit" variant="ghost" size="sm">
          {supplier.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </form>
    </li>
  );
}
