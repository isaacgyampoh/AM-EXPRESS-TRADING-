"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BusinessSettingsDto } from "@/application/dto/settings-dto";
import { formatMoney } from "@/lib/utils/format";

const SettingsContext = createContext<BusinessSettingsDto | null>(null);

/**
 * The business's own details, available to any component that renders money or
 * prints its name.
 *
 * This is what keeps "AM Express Trading" and "GH₵" out of the components.
 * Settings are read once on the server, per request, and passed down — so
 * changing the currency symbol in one settings form changes every price in the
 * application, including the ones on receipts already in a customer's hand.
 */
export function SettingsProvider({
  settings,
  children,
}: {
  settings: BusinessSettingsDto;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): BusinessSettingsDto {
  const settings = useContext(SettingsContext);
  if (!settings) {
    throw new Error("useSettings must be used inside <SettingsProvider>.");
  }
  return settings;
}

/** Formats an amount in the business's currency. */
export function useMoneyFormatter() {
  const { currencySymbol } = useSettings();
  return (amount: string) => formatMoney(amount, currencySymbol);
}

/**
 * Money on screen.
 *
 * Always tabular figures, so a column of prices lines up and a total that
 * changes as items are added does not shift the layout under the cashier's
 * thumb.
 */
export function Money({
  amount,
  className,
}: {
  amount: string;
  className?: string;
}) {
  const format = useMoneyFormatter();
  return <span className={`numeric ${className ?? ""}`}>{format(amount)}</span>;
}
