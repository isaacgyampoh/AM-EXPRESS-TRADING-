/**
 * Display formatting.
 *
 * One place, so "GH₵15.50" is written the same way on a receipt, a dashboard
 * tile and a report — and so changing the currency is a settings change rather
 * than a search through components.
 *
 * Amounts arrive as decimal strings ("15.50") and are grouped as strings.
 * Nothing here parses money into a float on the way to the screen; a display
 * bug that rounds is still a bug people will act on.
 */

/** Groups the whole part with thin spaces the way people read large numbers. */
function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMoney(
  amount: string,
  symbol = "GH₵",
  options: { showSymbol?: boolean } = {},
): string {
  const showSymbol = options.showSymbol ?? true;
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = "00"] = amount.replace("-", "").split(".");
  const body = `${groupThousands(whole)}.${fraction.padEnd(2, "0")}`;

  return `${negative ? "-" : ""}${showSymbol ? symbol : ""}${body}`;
}

/** For inputs and anywhere a symbol would be noise. */
export function formatAmount(amount: string): string {
  return formatMoney(amount, "", { showSymbol: false });
}

export function formatCount(value: number): string {
  return groupThousands(String(Math.trunc(value)));
}

/**
 * Dates are rendered in the reader's own timezone by the browser. A server
 * that formats a timestamp bakes in its own timezone, which for a business in
 * Accra reading a UTC server means every evening sale lands on tomorrow.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  split: "Cash + Mobile Money",
};

export function formatPaymentMethod(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}
