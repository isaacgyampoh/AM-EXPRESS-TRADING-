"use client";

export interface DraftLine {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  /** Decimal string, snapshotted for display only. The server re-prices. */
  readonly unitPrice: string;
  readonly quantity: number;
  readonly availableStock: number;
}

export interface CartDraft {
  readonly lines: readonly DraftLine[];
  /**
   * Idempotency key for this basket, generated once when the first item goes
   * in and reused on every retry until the sale succeeds.
   *
   * This is what makes a dropped connection safe. Without it, a cashier who
   * taps "Complete sale", loses signal, and taps again has sold the stock
   * twice — and neither they nor the customer would know until the books
   * failed to balance.
   */
  readonly transactionId: string;
}

/**
 * The basket, as an external store backed by localStorage.
 *
 * An external store rather than component state because that is what it
 * actually is: something that outlives the component, is written from more
 * than one place, and exists before React mounts. Reading it in an effect and
 * copying it into state would render once with an empty basket and again with
 * the real one — a visible flicker every time the till opens, and exactly the
 * cascading render React warns about.
 *
 * `useSyncExternalStore` handles the server/hydration split properly: the
 * server and the first client render both see an empty basket (there is no
 * localStorage on a server), and the real one arrives immediately after.
 *
 * This is the only thing this application does offline, and that restraint is
 * deliberate. A queue of unsynchronised sales that syncs later sounds helpful
 * and is how stock counts drift and transactions post twice. Preserving the
 * basket costs nothing and cannot corrupt anything; the sale itself only ever
 * happens against the live database.
 */

const STORAGE_KEY = "amx.pos.draft.v1";

export const EMPTY_DRAFT: CartDraft = { lines: [], transactionId: "" };

let snapshot: CartDraft = EMPTY_DRAFT;
let hydrated = false;
const listeners = new Set<() => void>();

function newTransactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Older browsers. Good enough as an idempotency key, and the database's
  // unique constraint is what actually enforces it.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

function readStorage(): CartDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;

    const parsed = JSON.parse(raw) as CartDraft;
    if (!Array.isArray(parsed.lines)) return EMPTY_DRAFT;

    const lines = parsed.lines.filter(
      (line) =>
        typeof line?.productId === "string" &&
        typeof line?.quantity === "number" &&
        line.quantity > 0,
    );

    if (lines.length === 0) return EMPTY_DRAFT;

    return {
      lines,
      transactionId: parsed.transactionId || newTransactionId(),
    };
  } catch {
    // Private browsing, cleared storage, or a draft written by an older
    // version of the app. An unusable draft is not worth an error message.
    return EMPTY_DRAFT;
  }
}

function writeStorage(draft: CartDraft): void {
  try {
    if (draft.lines.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked. The basket still works for this session; it
    // just will not survive a reload, which is a degradation, not a failure.
  }
}

function publish(next: CartDraft): void {
  snapshot = next;
  writeStorage(next);
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  // First subscriber pulls the saved basket in. Doing it here rather than at
  // module scope keeps the module safe to import on the server.
  if (!hydrated) {
    hydrated = true;
    const stored = readStorage();
    if (stored !== EMPTY_DRAFT) snapshot = stored;
  }

  listeners.add(listener);

  // Another tab selling from the same account should not leave this one
  // holding a stale basket.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      snapshot = readStorage();
      for (const each of listeners) each();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): CartDraft {
  return snapshot;
}

/** The server has no basket, and neither does the first client render. */
export function getServerSnapshot(): CartDraft {
  return EMPTY_DRAFT;
}

export function addProduct(
  line: Omit<DraftLine, "quantity">,
  quantity = 1,
): void {
  const existing = snapshot.lines.find(
    (candidate) => candidate.productId === line.productId,
  );

  const lines = existing
    ? snapshot.lines.map((candidate) =>
        candidate.productId === line.productId
          ? {
              ...candidate,
              // Never past what is on the shelf. The server refuses it too;
              // stopping here means the cashier finds out while they are still
              // talking to the customer.
              quantity: Math.min(
                candidate.quantity + quantity,
                line.availableStock,
              ),
            }
          : candidate,
      )
    : [
        ...snapshot.lines,
        { ...line, quantity: Math.min(quantity, line.availableStock) },
      ];

  publish({
    lines,
    transactionId: snapshot.transactionId || newTransactionId(),
  });
}

export function setLineQuantity(productId: string, quantity: number): void {
  const lines =
    quantity <= 0
      ? snapshot.lines.filter((line) => line.productId !== productId)
      : snapshot.lines.map((line) =>
          line.productId === productId
            ? { ...line, quantity: Math.min(quantity, line.availableStock) }
            : line,
        );

  publish({
    lines,
    // An emptied basket surrenders its key, so the next sale is a new
    // transaction rather than a retry of an abandoned one.
    transactionId: lines.length
      ? snapshot.transactionId || newTransactionId()
      : "",
  });
}

export function removeProduct(productId: string): void {
  setLineQuantity(productId, 0);
}

/** Called once a sale is recorded. The next basket gets a fresh key. */
export function clearDraft(): void {
  publish(EMPTY_DRAFT);
}
