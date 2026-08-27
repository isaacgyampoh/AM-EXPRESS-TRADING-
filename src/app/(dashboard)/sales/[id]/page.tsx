import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/errors/domain-error";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { ReceiptView } from "@/presentation/components/receipt/receipt-view";
import { linkButtonClasses } from "@/presentation/components/ui/button";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { VoidSaleControl } from "@/presentation/forms/void-sale-form";
import { voidSaleAction } from "../actions";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  const cases = await getUseCases();

  let receipt;
  let sale;
  try {
    [sale, receipt] = await Promise.all([
      cases.getSale.execute(staff, id),
      cases.generateReceipt.execute(staff, id, { isReprint: true }),
    ]);
  } catch (error) {
    // Row Level Security turns another cashier's sale into "no rows", so a
    // sale that does not exist and one this person may not see land here
    // together — and 404 is the right answer to both.
    if (error instanceof DomainError) notFound();
    throw error;
  }

  return (
    <>
      <PageHeader
        title={sale.receiptNumber}
        description={`Served by ${sale.cashierName}`}
        action={
          <Link
            href="/sales"
            className={linkButtonClasses({ variant: "secondary", size: "sm" })}
          >
            Back
          </Link>
        }
      />

      <div className="px-4 md:px-6 pb-10 flex flex-col gap-4 max-w-2xl">
        <ReceiptView receipt={receipt} />

        <div className="flex gap-3">
          <Link
            href={`/receipts/${sale.id}`}
            className={linkButtonClasses({ variant: "secondary", fullWidth: true })}
          >
            Open printable receipt
          </Link>
        </div>

        {staff.can("sale:void") && sale.status === "completed" && (
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader
              title="Something wrong with this sale?"
              description="Voiding puts the stock back and removes the money from the takings. The receipt is kept and marked voided."
            />
            <CardBody>
              <VoidSaleControl
                saleId={sale.id}
                receiptNumber={sale.receiptNumber}
                action={voidSaleAction}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
