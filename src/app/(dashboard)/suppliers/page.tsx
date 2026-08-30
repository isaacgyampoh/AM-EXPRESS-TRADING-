import type { Metadata } from "next";
import { requireAdmin } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PageHeader } from "@/presentation/components/app-shell";
import { Money } from "@/presentation/components/settings-provider";
import { Card, CardBody, CardHeader } from "@/presentation/components/ui/card";
import { EmptyState } from "@/presentation/components/ui/states";
import {
  CreateSupplierForm,
  RecordInvoiceForm,
  SupplierRow,
} from "@/presentation/forms/supplier-forms";
import {
  createSupplierAction,
  recordSupplierInvoiceAction,
  setSupplierActiveAction,
} from "./actions";

export const metadata: Metadata = { title: "Suppliers" };

/**
 * Suppliers and the invoices they send.
 *
 * `requireAdmin`, not `requireStaff`. An invoice shows what the business pays
 * for stock, which is the margin on everything a cashier sells and the
 * business's position with its own suppliers. RLS refuses a cashier the rows
 * and the storage policy refuses them the documents; this is the third refusal,
 * the one that stops the page rendering at all.
 */
export default async function SuppliersPage() {
  const staff = await requireAdmin();
  const cases = await getUseCases();

  const [suppliers, invoices] = await Promise.all([
    cases.listSuppliers.execute(staff),
    cases.listSupplierInvoices.execute(staff),
  ]);

  const active = suppliers.filter((supplier) => supplier.isActive);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who the business buys from, and the invoices that came with the goods."
      />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Record an invoice" />
          <CardBody>
            <RecordInvoiceForm
              action={recordSupplierInvoiceAction}
              suppliers={active}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Invoices"
            description={
              invoices.length > 0 ? `${invoices.length} recorded` : undefined
            }
          />
          <CardBody>
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Upload one above. Documents are stored privately and only an administrator can open them."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{invoice.supplierName}</p>
                        <p className="text-sm text-[var(--text-muted)] numeric">
                          {invoice.invoiceNumber} · {invoice.invoiceDate}
                        </p>
                        {invoice.description && (
                          <p className="text-sm text-[var(--text-muted)] mt-0.5">
                            {invoice.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold numeric">
                          <Money amount={invoice.amount} />
                        </p>
                        {invoice.documentUrl ? (
                          <a
                            href={invoice.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-brand-700 dark:text-brand-400 underline"
                          >
                            Open document
                          </a>
                        ) : (
                          <span className="text-sm text-[var(--text-muted)]">
                            Document unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Add a supplier" />
          <CardBody>
            <CreateSupplierForm action={createSupplierAction} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="All suppliers"
            description={
              suppliers.length > 0
                ? `${active.length} active${
                    suppliers.length > active.length
                      ? `, ${suppliers.length - active.length} inactive`
                      : ""
                  }`
                : undefined
            }
          />
          <CardBody>
            {suppliers.length === 0 ? (
              <EmptyState
                title="No suppliers yet"
                description="Add the businesses you buy stock from."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {suppliers.map((supplier) => (
                  <SupplierRow
                    key={supplier.id}
                    supplier={supplier}
                    action={setSupplierActiveAction}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
