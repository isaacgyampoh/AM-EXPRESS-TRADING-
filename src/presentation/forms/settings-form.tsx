"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BusinessSettingsDto } from "@/application/dto/settings-dto";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { TextInput } from "../components/ui/field";
import { useToast } from "../components/ui/toast";

/**
 * The business's own details.
 *
 * Everything on this form appears somewhere a customer can see it — the name
 * and contact details head every receipt, the symbol prefixes every price, the
 * footer closes every receipt. Changing it here changes all of them, which is
 * the whole point: nothing downstream hardcodes any of it.
 */
export function SettingsForm({
  settings,
  action,
}: {
  settings: BusinessSettingsDto;
  action: (
    previous: ActionResult<BusinessSettingsDto> | null,
    formData: FormData,
  ) => Promise<ActionResult<BusinessSettingsDto>>;
}) {
  const toast = useToast();
  const router = useRouter();

  const [state, formAction] = useActionState(
    async (
      previous: ActionResult<BusinessSettingsDto> | null,
      formData: FormData,
    ) => {
      const result = await action(previous, formData);

      if (result.ok) {
        toast.success("Saved. Receipts and prices will use this from now on.");
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
      <TextInput
        label="Business name"
        name="businessName"
        defaultValue={settings.businessName}
        required
        hint="Printed at the top of every receipt."
        error={fieldErrors?.businessName}
      />

      <TextInput
        label="Address"
        name="address"
        defaultValue={settings.address ?? ""}
        placeholder="Kaneshie Market, Accra"
        error={fieldErrors?.address}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={settings.phone ?? ""}
          placeholder="+233 20 000 0000"
          error={fieldErrors?.phone}
        />

        <TextInput
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={settings.email ?? ""}
          error={fieldErrors?.email}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Currency code"
          name="currency"
          defaultValue={settings.currency}
          required
          maxLength={3}
          autoCapitalize="characters"
          spellCheck={false}
          hint="Three letters, e.g. GHS."
          error={fieldErrors?.currency}
          className="numeric"
        />

        <TextInput
          label="Currency symbol"
          name="currencySymbol"
          defaultValue={settings.currencySymbol}
          required
          maxLength={8}
          hint="Shown before every amount, e.g. GH₵."
          error={fieldErrors?.currencySymbol}
        />
      </div>

      <TextInput
        label="Receipt footer"
        name="receiptFooter"
        defaultValue={settings.receiptFooter ?? ""}
        placeholder="Thank you for your business."
        hint="The last line on every receipt."
        error={fieldErrors?.receiptFooter}
      />

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" loading={pending} className="self-start">
      {pending ? "Saving…" : "Save settings"}
    </Button>
  );
}
