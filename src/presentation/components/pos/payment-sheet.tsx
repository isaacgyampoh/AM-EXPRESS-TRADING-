"use client";

import { useMemo, useState } from "react";
import { Money } from "@/domain/value-objects/money";
import { cn } from "@/lib/utils/cn";
import { Button } from "../ui/button";
import { MoneyInput, TextInput } from "../ui/field";
import { Sheet } from "../ui/sheet";
import { useSettings } from "../settings-provider";
import { formatMoney } from "@/lib/utils/format";

type Method = "cash" | "mobile_money" | "split";

export interface TenderInput {
  readonly method: "cash" | "mobile_money";
  readonly amount: string;
  readonly reference?: string | null;
}

/**
 * Taking payment.
 *
 * The rule the whole business runs on is enforced here, live, as the cashier
 * types: cash + Mobile Money must equal the total exactly. The button stays
 * disabled until it does, and the shortfall or overpayment is shown in words
 * rather than left for someone to work out at the counter.
 *
 * Every calculation uses Money — whole pesewas — for the same reason the
 * server does. A payment screen that is a pesewa out because of floating point
 * would refuse a sale that is actually correct, and the cashier would have no
 * idea why.
 */
export function PaymentSheet({
  open,
  onClose,
  total,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  /** Decimal string. */
  total: string;
  onConfirm: (tenders: readonly TenderInput[]) => void;
  isSubmitting: boolean;
}) {
  const { currencySymbol } = useSettings();
  const [method, setMethod] = useState<Method>("cash");
  const [cash, setCash] = useState("");
  const [momo, setMomo] = useState("");
  const [reference, setReference] = useState("");

  const totalMoney = useMemo(() => Money.fromDecimalString(total), [total]);

  const parse = (value: string): Money | null => {
    const trimmed = value.trim();
    if (trimmed === "") return Money.zero();
    try {
      return Money.fromDecimalString(trimmed);
    } catch {
      return null;
    }
  };

  const cashAmount = method === "mobile_money" ? Money.zero() : parse(cash);
  const momoAmount = method === "cash" ? Money.zero() : parse(momo);

  const amountsAreValid = cashAmount !== null && momoAmount !== null;

  const tendered = amountsAreValid
    ? cashAmount.add(momoAmount)
    : Money.zero();

  const difference = amountsAreValid
    ? tendered.subtract(totalMoney)
    : Money.zero();

  const needsReference = momoAmount !== null && momoAmount.isPositive;
  const hasReference = reference.trim().length > 0;

  const canComplete =
    amountsAreValid &&
    difference.isZero &&
    tendered.isPositive &&
    (!needsReference || hasReference);

  const balanceMessage = !amountsAreValid
    ? "Enter an amount like 15.50"
    : difference.isZero
      ? "Payment matches the total"
      : difference.isNegative
        ? `Short by ${formatMoney(difference.negate().toDecimalString(), currencySymbol)}`
        : `Over by ${formatMoney(difference.toDecimalString(), currencySymbol)}`;

  const confirm = () => {
    if (!canComplete || cashAmount === null || momoAmount === null) return;

    const tenders: TenderInput[] = [];
    if (cashAmount.isPositive) {
      tenders.push({ method: "cash", amount: cashAmount.toDecimalString() });
    }
    if (momoAmount.isPositive) {
      tenders.push({
        method: "mobile_money",
        amount: momoAmount.toDecimalString(),
        reference: reference.trim(),
      });
    }

    onConfirm(tenders);
  };

  /** Fills the field with the exact total — the common case, one tap. */
  const fillExact = (target: "cash" | "momo") => {
    const value = totalMoney.toDecimalString();
    if (target === "cash") setCash(value);
    else setMomo(value);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Take payment"
      description={`Total ${formatMoney(total, currencySymbol)}`}
      footer={
        <Button
          size="lg"
          fullWidth
          onClick={confirm}
          disabled={!canComplete}
          loading={isSubmitting}
        >
          {isSubmitting ? "Recording sale…" : "Complete sale"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <fieldset>
          <legend className="text-sm font-medium mb-2">How are they paying?</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            <MethodChip
              label="Cash"
              active={method === "cash"}
              onClick={() => setMethod("cash")}
            />
            <MethodChip
              label="Mobile Money"
              active={method === "mobile_money"}
              onClick={() => setMethod("mobile_money")}
            />
            <MethodChip
              label="Both"
              active={method === "split"}
              onClick={() => setMethod("split")}
            />
          </div>
        </fieldset>

        {method !== "mobile_money" && (
          <div>
            <MoneyInput
              label="Cash"
              symbol={currencySymbol}
              value={cash}
              onChange={(event) => setCash(event.target.value)}
              autoFocus
            />
            {method === "cash" && (
              <button
                type="button"
                onClick={() => fillExact("cash")}
                className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-400 min-h-11 px-1"
              >
                Exact amount ({formatMoney(total, currencySymbol)})
              </button>
            )}
          </div>
        )}

        {method !== "cash" && (
          <div className="flex flex-col gap-4">
            <div>
              <MoneyInput
                label="Mobile Money"
                symbol={currencySymbol}
                value={momo}
                onChange={(event) => setMomo(event.target.value)}
                autoFocus={method === "mobile_money"}
              />
              {method === "mobile_money" && (
                <button
                  type="button"
                  onClick={() => fillExact("momo")}
                  className="mt-2 text-sm font-medium text-brand-700 dark:text-brand-400 min-h-11 px-1"
                >
                  Exact amount ({formatMoney(total, currencySymbol)})
                </button>
              )}
            </div>

            <TextInput
              label="Transaction reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. MM-773421"
              autoComplete="off"
              spellCheck={false}
              required
              hint="From the Mobile Money confirmation message. Required — it is how this payment gets reconciled later."
              error={
                needsReference && !hasReference && momo.trim() !== ""
                  ? "Enter the transaction reference"
                  : undefined
              }
            />
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-xl px-4 py-3 text-sm font-medium",
            difference.isZero && amountsAreValid && tendered.isPositive
              ? "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
              : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          <div className="flex justify-between">
            <span>Tendered</span>
            <span className="numeric">
              {formatMoney(tendered.toDecimalString(), currencySymbol)}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Total</span>
            <span className="numeric">
              {formatMoney(total, currencySymbol)}
            </span>
          </div>
          <p className="mt-2">{balanceMessage}</p>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          No change is given and no partial payment is recorded — the amounts
          must add up to the total exactly. The server checks this again before
          anything is written.
        </p>
      </div>
    </Sheet>
  );
}

function MethodChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-xl border px-2 text-sm font-medium",
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-[var(--border)] bg-[var(--surface-raised)]",
      )}
    >
      {label}
    </button>
  );
}
