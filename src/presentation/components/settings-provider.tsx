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
 * Tabular figures by default, so a column of prices lines up and a total that
 * changes as items are added does not shift the layout under the cashier's
 * thumb.
 *
 * Set `tabular={false}` for a single large figure standing on its own: tabular
 * numerals give every digit the width of a zero, which at display sizes makes
 * a number like 121 look gappy. Alignment is what tabular is for, and a lone
 * figure has nothing to align with.
 */
export function Money({
  amount,
  className,
  tabular = true,
}: {
  amount: string;
  className?: string;
  tabular?: boolean;
}) {
  const format = useMoneyFormatter();
  return (
    <span className={`${tabular ? "numeric " : ""}${className ?? ""}`}>
      {format(amount)}
    </span>
  );
}
