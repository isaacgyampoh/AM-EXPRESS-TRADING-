import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/errors/domain-error";
import { requireStaff } from "@/infrastructure/auth/session";
import { getUseCases } from "@/infrastructure/container";
import { PaperSizePicker } from "@/presentation/components/receipt/paper-size";
import {
  ReceiptActions,
  ReceiptView,
} from "@/presentation/components/receipt/receipt-view";

export const metadata: Metadata = { title: "Receipt" };

/**
 * The printable receipt.
 *
 * Deliberately outside the application shell: no navigation, no header, no tab
 * bar. Printing works because there is nothing else on the page to hide, which
 * is more reliable than a stylesheet trying to suppress an entire app — that
 * approach works right up until someone adds a component that forgets to opt
 * out, and then a customer gets a receipt with a nav bar on it.
 *
 * It is still behind authentication. A receipt names the business, the
 * cashier, and what was bought.
 */
export default async function PrintableReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  const cases = await getUseCases();

  let receipt;
  try {
    receipt = await cases.generateReceipt.execute(staff, id, {
      isReprint: true,
    });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  return (
    <main className="min-h-dvh bg-[var(--surface-sunken)] print:bg-white py-6 px-4">
      <div className="mx-auto max-w-[380px] flex flex-col gap-4">
        <Link
          href={`/sales/${id}`}
          className="print:hidden text-sm font-medium text-brand-700 dark:text-brand-400 min-h-11 flex items-center"
        >
          ← Back to the sale
        </Link>

        <ReceiptView receipt={receipt} />

        <PaperSizePicker />

        <ReceiptActions receiptNumber={receipt.receiptNumber} />
      </div>
    </main>
  );
}
