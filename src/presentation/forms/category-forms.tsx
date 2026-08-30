"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CategoryDto } from "@/application/dto/product-dto";
import type { ActionResult } from "@/application/services/result";
import { Button } from "../components/ui/button";
import { TextInput } from "../components/ui/field";
import { useToast } from "../components/ui/toast";

type CategoryAction = (
  previous: ActionResult<CategoryDto> | null,
  formData: FormData,
) => Promise<ActionResult<CategoryDto>>;

export function CreateCategoryForm({ action }: { action: CategoryAction }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");

  const [state, formAction] = useActionState(
    async (previous: ActionResult<CategoryDto> | null, formData: FormData) => {
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
          label="Category name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Provisions"
          autoComplete="off"
          required
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
      {pending ? "Adding…" : "Add category"}
    </Button>
  );
}

/**
 * Rename, or retire.
 *
 * There is no delete. Products point at a category and reports group by it, so
 * removing one would either orphan history or cascade into it. Retiring takes
 * it off the product form and leaves every report that already mentions it
 * exactly as it was.
 */
export function CategoryRow({
  category,
  action,
}: {
  category: CategoryDto;
  action: CategoryAction;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  const [, formAction] = useActionState(
    async (previous: ActionResult<CategoryDto> | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        toast.success("Category updated.");
        setEditing(false);
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
      {editing ? (
        <form action={formAction} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`Rename ${category.name}`}
            className="flex-1 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-base"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setName(category.name);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 min-w-0">
            <span className={category.isActive ? "" : "text-[var(--text-muted)]"}>
              {category.name}
            </span>
            {!category.isActive && (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                retired
              </span>
            )}
          </span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Rename
          </Button>

          <form action={formAction}>
            <input type="hidden" name="id" value={category.id} />
            <input
              type="hidden"
              name="isActive"
              value={category.isActive ? "" : "true"}
            />
            <Button type="submit" variant="ghost" size="sm">
              {category.isActive ? "Retire" : "Restore"}
            </Button>
          </form>
        </>
      )}
    </li>
  );
}
