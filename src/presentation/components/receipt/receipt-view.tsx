"use client";

import type { ReceiptDto } from "@/application/dto/sale-dto";
import { formatDateTime, formatMoney, formatPaymentMethod } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * The receipt.
 *
 * Laid out at the width of a till roll (about 80mm) and centred, so it looks
 * the same on a phone screen as it does on paper. `print:` utilities strip the
 * card, the shadow and the surrounding app chrome when it goes to a printer —
 * the print stylesheet lives in globals.css.
 *
 * Everything the brief requires is here: business details, receipt number,
 * date and time, cashier, lines with quantities and prices, the total, the
 * payment method, the split breakdown, and the Mobile Money reference.
 */
export function ReceiptView({
  receipt,
  className,
}: {
  receipt: ReceiptDto;
  className?: string;
}) {
  const money = (amount: string) => formatMoney(amount, receipt.currencySymbol);

  return (
    <article
      className={cn(
        "mx-auto w-full max-w-[380px] bg-white text-black",
        "rounded-2xl border border-[var(--border)] p-5",
        "print:max-w-none print:rounded-none print:border-0 print:p-0",
        className,
      )}
      aria-label={`Receipt ${receipt.receiptNumber}`}
    >
      <header className="text-center border-b border-dashed border-neutral-400 pb-3">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          {receipt.businessName}
        </h2>
        {receipt.address && (
          <p className="text-xs mt-1 text-neutral-700">{receipt.address}</p>
        )}
        {(receipt.phone || receipt.email) && (
          <p className="text-xs text-neutral-700">
            {[receipt.phone, receipt.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      {receipt.isVoided && (
        <p
          className="mt-3 border-2 border-red-700 text-red-700 text-center font-bold py-1 text-sm uppercase"
          role="status"
        >
          Voided
        </p>
      )}

      {receipt.isReprint && !receipt.isVoided && (
        // Printed, not just displayed. A customer holding two identical
        // receipts for one sale is how a dispute starts.
        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600">
          Reprint
        </p>
      )}

      <dl className="mt-3 text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-neutral-600">Receipt</dt>
        <dd className="text-right font-semibold numeric">
          {receipt.receiptNumber}
        </dd>

        <dt className="text-neutral-600">Date</dt>
        <dd className="text-right numeric">{formatDateTime(receipt.issuedAt)}</dd>

        <dt className="text-neutral-600">Served by</dt>
        <dd className="text-right">{receipt.cashierName}</dd>
      </dl>

      <div className="mt-3 border-t border-dashed border-neutral-400 pt-3">
        <ul className="flex flex-col gap-2">
          {receipt.items.map((item) => (
            <li key={item.sku} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{item.name}</span>
                <span className="numeric font-semibold whitespace-nowrap">
                  {money(item.lineTotal)}
                </span>
              </div>
              <div className="text-xs text-neutral-600 numeric">
                {item.quantity} × {money(item.unitPrice)}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 border-t-2 border-black pt-2 flex justify-between items-baseline">
        <span className="font-bold uppercase text-sm">Total</span>
        <span className="text-xl font-bold numeric">{money(receipt.total)}</span>
      </div>

      <div className="mt-3 border-t border-dashed border-neutral-400 pt-2 text-sm">
        <p className="text-xs uppercase text-neutral-600 mb-1">
          Paid by {formatPaymentMethod(receipt.paymentSummary)}
        </p>
        <ul className="flex flex-col gap-1">
          {receipt.payments.map((payment) => (
            <li key={payment.method}>
              <div className="flex justify-between gap-3">
                <span>{formatPaymentMethod(payment.method)}</span>
                <span className="numeric">{money(payment.amount)}</span>
              </div>
              {payment.reference && (
                <div className="text-xs text-neutral-600 numeric">
                  Ref: {payment.reference}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {receipt.footer && (
        <footer className="mt-4 border-t border-dashed border-neutral-400 pt-3 text-center text-xs text-neutral-700">
          {receipt.footer}
        </footer>
      )}
    </article>
  );
}

/**
 * Print and share.
 *
 * Share uses the Web Share API where the browser has it — on a phone that
 * opens WhatsApp, which is how most receipts in this market actually reach a
 * customer. Where it does not exist, the link is copied instead, and the
 * button says so rather than silently doing nothing.
 */
export function ReceiptActions({
  receiptNumber,
  shareUrl,
  onDone,
}: {
  receiptNumber: string;
  shareUrl?: string;
  onDone?: () => void;
}) {
  const share = async () => {
    const url = shareUrl ?? window.location.href;
    const text = `Receipt ${receiptNumber}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch {
        // The person dismissed the share sheet. Not an error.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      window.alert("Receipt link copied.");
    } catch {
      window.prompt("Copy this receipt link:", url);
    }
  };

  return (
    <div className="flex gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex-1 min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] font-medium"
      >
        Print
      </button>
      <button
        type="button"
        onClick={share}
        className="flex-1 min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] font-medium"
      >
        Share
      </button>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="flex-1 min-h-12 rounded-xl bg-brand-700 text-white font-medium"
        >
          Done
        </button>
      )}
    </div>
  );
}
