import type { Metadata } from "next";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/ui/states";
import {
  CategoryRow,
  CreateCategoryForm,
} from "@/presentation/forms/category-forms";
import { CreateUnitForm, UnitRow } from "@/presentation/forms/unit-forms";
import {
  createCategoryAction,
  createUnitAction,
  setUnitActiveAction,
  updateCategoryAction,
} from "./actions";

export const metadata: Metadata = { title: "Catalogue setup" };

/**
 * Categories.
 *
 * Admin-only, and enforced here as well as by RLS: a cashier reaching this URL
 * gets the same refusal the database would give them.
 *
 * Retired categories are listed rather than hidden. An admin looking for
 * "Provisions" and not finding it would otherwise create a second one, and end
 * up with the same category twice under slightly different names.
 */
export default async function CategoriesPage() {
  const staff = await requireStaff();
  staff.assertCan("product:write");

  const cases = await getUseCases();
  const [categories, units] = await Promise.all([
    cases.listCategories.execute(staff, { activeOnly: false }),
    cases.listUnits.execute(staff),
  ]);

  const active = categories.filter((category) => category.isActive);

  return (
    <>
      <PageHeader
        title="Catalogue setup"
        description="The words your catalogue uses: how products are grouped, and how they are sold and counted."
      />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Add a category" />
          <CardBody>
            <CreateCategoryForm action={createCategoryAction} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="All categories"
            description={
              categories.length > 0
                ? `${active.length} in use${
                    categories.length > active.length
                      ? `, ${categories.length - active.length} retired`
                      : ""
                  }`
                : undefined
            }
          />
          <CardBody>
            {categories.length === 0 ? (
              <EmptyState
                title="No categories yet"
                description="Add one above. Products can be sold without a category, so this is for keeping the till and the reports tidy rather than something you must do first."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    action={updateCategoryAction}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Units"
            description="How products are sold and counted — by the Piece, the Box, the Crate."
          />
          <CardBody className="flex flex-col gap-5">
            <CreateUnitForm action={createUnitAction} />

            <ul className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)] pt-1">
              {units.map((unit) => (
                <UnitRow
                  key={unit.name}
                  unit={unit}
                  action={setUnitActiveAction}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
