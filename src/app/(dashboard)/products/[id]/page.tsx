import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/errors/domain-error";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { Money } from "@/presentation/components/settings-provider";
import { StockBadge } from "@/presentation/components/ui/badge";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { AddProductUnitForm } from "@/presentation/forms/add-product-unit-form";
import { ProductForm } from "@/presentation/forms/product-form";
import { StockControls } from "@/presentation/forms/stock-forms";
import {
  addProductUnitAction,
  addStockAction,
  adjustStockAction,
  updateProductAction,
} from "../actions";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  const cases = await getUseCases();

  let product;
  try {
    product = await cases.getProduct.execute(staff, id);
  } catch (error) {
    // A product that does not exist and one this person may not see produce
    // the same 404, which is the correct answer to both.
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const canManage = staff.can("product:write");
  const canAdjust = staff.can("inventory:adjust");

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.sku}${product.categoryName ? ` · ${product.categoryName}` : ""}`}
        action={
          <Link
            href="/products"
            className={linkButtonClasses({ variant: "secondary", size: "sm" })}
          >
            Back
          </Link>
        }
      />

      <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 max-w-2xl">
        <Card>
          <CardHeader title="On the shelf" />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-3xl font-semibold numeric">
                  {product.quantityOnHand}
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  units on hand · warns at {product.minimumStock}
                </p>
              </div>
              <StockBadge
                quantity={product.quantityOnHand}
                isLowStock={product.isLowStock}
                isOutOfStock={product.isOutOfStock}
              />
            </div>

            {canAdjust ? (
              <StockControls
                productId={product.id}
                productName={product.name}
                quantityOnHand={product.quantityOnHand}
                addStock={addStockAction}
                adjustStock={adjustStockAction}
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Stock is managed by an administrator.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Prices"
            description={
              product.units.length > 1
                ? `Sold ${product.units.length} ways. Each has its own prices.`
                : undefined
            }
          />
          <CardBody className="flex flex-col gap-5">
            {/* One row per selling unit. Nothing here is calculated from
                anything else on the screen — every figure was typed in. */}
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {product.units.map((unit) => (
                <li
                  key={unit.id}
                  className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0"
                >
                  <span className="font-medium">
                    {unit.unitName}
                    {unit.baseQuantity > 1 && (
                      <span className="text-[var(--text-muted)] font-normal">
                        {" "}
                        · {unit.baseQuantity} per{" "}
                        {product.units.find((u) => u.baseQuantity === 1)
                          ?.unitName.toLowerCase() ?? "unit"}
                      </span>
                    )}
                  </span>
                  <span className="text-right numeric">
                    <span className="font-semibold">
                      <Money amount={unit.retailPrice} />
                    </span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {unit.wholesalePrice ? (
                        <>
                          <Money amount={unit.wholesalePrice} /> wholesale
                        </>
                      ) : (
                        "retail only"
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4">
              <div>
                <dt className="text-sm text-[var(--text-muted)]">
                  Cost per{" "}
                  {product.units
                    .find((u) => u.baseQuantity === 1)
                    ?.unitName.toLowerCase() ?? "unit"}
                </dt>
                <dd className="text-lg font-semibold mt-0.5">
                  {product.costPrice ? (
                    <Money amount={product.costPrice} />
                  ) : (
                    <span className="text-base font-normal text-[var(--text-muted)]">
                      Not recorded
                    </span>
                  )}
                </dd>
              </div>
              {product.unitMargin && (
                <div>
                  <dt className="text-sm text-[var(--text-muted)]">
                    Margin per unit
                  </dt>
                  <dd className="text-lg font-semibold mt-0.5 text-brand-700 dark:text-brand-400">
                    <Money amount={product.unitMargin} />
                  </dd>
                </div>
              )}
            </dl>

            {!product.costPrice && (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Without a cost price, this product is left out of profit
                reports rather than counted as pure profit.
              </p>
            )}
          </CardBody>
        </Card>

        {canManage && (
          <Card>
            <CardHeader
              title="Add another way to sell this"
              description="A Box of these, say. It gets its own prices — nothing is worked out from the price above."
            />
            <CardBody>
              <AddProductUnitForm
                action={addProductUnitAction}
                product={product}
              />
            </CardBody>
          </Card>
        )}

        {canManage && (
          <Card>
            <CardHeader
              title="Edit"
              description="Changes here do not move stock."
            />
            <CardBody>
              <EditForm product={product} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

async function EditForm({
  product,
}: {
  product: Awaited<
    ReturnType<Awaited<ReturnType<typeof getUseCases>>["getProduct"]["execute"]>
  >;
}) {
  const staff = await requireStaff();
  const cases = await getUseCases();
  const categories = await cases.listCategories.execute(staff, {
    activeOnly: true,
  });

  return (
    <ProductForm
      action={updateProductAction}
      categories={categories}
      product={product}
      submitLabel="Save changes"
    />
  );
}
