"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/application/services/result";
import type { StaffDto } from "@/application/use-cases/manage-staff";
import { Button } from "../components/ui/button";
import { Select, TextInput } from "../components/ui/field";
import { Sheet } from "../components/ui/sheet";
import { useToast } from "../components/ui/toast";

type StaffAction = (
  previous: ActionResult<StaffDto> | null,
  formData: FormData,
) => Promise<ActionResult<StaffDto>>;

/**
 * Adding a staff member.
 *
 * The manager sets an initial password and passes it on however they normally
 * would. No invitation email, because this is a shop where the owner and the
 * cashier are standing in the same room — and an email flow that depends on a
 * cashier having an inbox they check is a flow that strands people.
 */
export function AddStaffControl({ action }: { action: StaffAction }) {
  const [open, setOpen] = useState(false);
  const [createdFor, setCreatedFor] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const [state, formAction] = useActionState(
    async (previous: ActionResult<StaffDto> | null, formData: FormData) => {
      const result = await action(previous, formData);

      if (result.ok) {
        toast.success(`${result.data.fullName} can now sign in.`);
        setCreatedFor(result.data.fullName);
        setOpen(false);
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
    <>
      <Button size="lg" fullWidth onClick={() => setOpen(true)}>
        Add a staff member
      </Button>

      {createdFor && (
        <div
          role="status"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-brand-900 dark:bg-brand-950"
        >
          <p className="font-medium text-brand-900 dark:text-brand-200">
            {createdFor}&rsquo;s account is ready.
          </p>
          <p className="mt-1 text-brand-800 dark:text-brand-300">
            Give them the password you set. They should change it once they are
            signed in.
          </p>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add a staff member"
        description="They will be able to sign in straight away."
      >
        <form action={formAction} className="flex flex-col gap-4 pt-1" noValidate>
          <TextInput
            label="Full name"
            name="fullName"
            required
            autoFocus
            autoComplete="off"
            placeholder="Kofi Boateng"
            error={fieldErrors?.fullName}
          />

          <TextInput
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoComplete="off"
            hint="What they will sign in with."
            error={fieldErrors?.email}
          />

          <Select
            label="Role"
            name="role"
            required
            defaultValue="cashier"
            options={[
              { value: "cashier", label: "Cashier — sells, and nothing else" },
              {
                value: "admin",
                label: "Administrator — full access to the business",
              },
            ]}
            error={fieldErrors?.role}
          />

          <TextInput
            label="Starting password"
            name="initialPassword"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            hint="At least 12 characters. Shown as you type so you can read it out — they change it after signing in."
            error={fieldErrors?.initialPassword}
          />

          <PendingButton label="Create account" pendingLabel="Creating…" />
        </form>
      </Sheet>
    </>
  );
}

/**
 * Changing someone's role, or switching their account off.
 *
 * Both are plain forms rather than toggles: they take effect immediately and
 * change what a person can see, so a stray tap should not be enough.
 * Deactivating is never a delete — a cashier's sales have to keep pointing at
 * a real person for the history to mean anything.
 */
export function StaffControls({
  member,
  assignRole,
  setActive,
}: {
  member: StaffDto;
  assignRole: StaffAction;
  setActive: StaffAction;
}) {
  const toast = useToast();
  const router = useRouter();

  const handle = async (
    action: StaffAction,
    previous: ActionResult<StaffDto> | null,
    formData: FormData,
    successMessage: (result: StaffDto) => string,
  ) => {
    const result = await action(previous, formData);

    if (result.ok) {
      toast.success(successMessage(result.data));
      router.refresh();
    } else {
      toast.error(result.message);
    }

    return result;
  };

  const [, roleAction] = useActionState(
    (previous: ActionResult<StaffDto> | null, formData: FormData) =>
      handle(
        assignRole,
        previous,
        formData,
        (updated) =>
          `${updated.fullName} is now ${updated.role === "admin" ? "an administrator" : "a cashier"}.`,
      ),
    null,
  );

  const [, activeAction] = useActionState(
    (previous: ActionResult<StaffDto> | null, formData: FormData) =>
      handle(setActive, previous, formData, (updated) =>
        updated.isActive
          ? `${updated.fullName} can sign in again.`
          : `${updated.fullName} has been deactivated.`,
      ),
    null,
  );

  if (member.isSelf) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        This is you. Another administrator has to change your role or switch
        your account off — which is what stops the business locking itself out.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form action={roleAction}>
        <input type="hidden" name="staffId" value={member.id} />
        <input
          type="hidden"
          name="role"
          value={member.role === "admin" ? "cashier" : "admin"}
        />
        <SmallButton>
          {member.role === "admin" ? "Make cashier" : "Make administrator"}
        </SmallButton>
      </form>

      <form action={activeAction}>
        <input type="hidden" name="staffId" value={member.id} />
        <input
          type="hidden"
          name="isActive"
          value={member.isActive ? "false" : "true"}
        />
        <SmallButton danger={member.isActive}>
          {member.isActive ? "Deactivate" : "Reactivate"}
        </SmallButton>
      </form>
    </div>
  );
}

function SmallButton({
  children,
  danger,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={danger ? "danger" : "secondary"}
      loading={pending}
    >
      {children}
    </Button>
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
