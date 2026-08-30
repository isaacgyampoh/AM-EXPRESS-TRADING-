import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { Card } from "@/presentation/components/ui/card";
import { ErrorState } from "@/presentation/components/ui/states";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { ProductForm } from "@/presentation/forms/product-form";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const staff = await requireStaff();

  // Checked here as well as in the use case. The use case is what actually
  // protects the data; this is so a cashier who follows a stale link gets a
  // clear page instead of a form that fails on submit.
  if (!staff.can("product:write")) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          title="Not your job"
          message="Only an administrator can add products. Ask them to set it up, and you will be able to sell it straight away."
          action={
            <Link
              href="/products"
              className={linkButtonClasses({ variant: "secondary", size: "sm" })}
            >
              Back to products
            </Link>
          }
        />
      </div>
    );
  }

  const cases = await getUseCases();
  const [categories, units] = await Promise.all([
    cases.listCategories.execute(staff, { activeOnly: true }),
    cases.listUnits.execute(staff),
  ]);

  // Only units still in use are offered. A retired one stays valid for
  // products already priced in it; it just stops being suggested for new ones.
  const unitNames = units.filter((unit) => unit.isActive).map((unit) => unit.name);

  return (
    <>
      <PageHeader
        title="Add product"
        description="Name it, price it, and say how many you have."
      />

      <div className="px-4 md:px-6 pb-10 max-w-2xl">
        <Card className="p-5">
          <ProductForm
            units={unitNames}
            action={createProductAction}
            categories={categories}
            submitLabel="Add product"
          />
        </Card>
      </div>
    </>
  );
}
