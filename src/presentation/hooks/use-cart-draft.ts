"use client";

import { useCallback, useEffect, useState } from "react";

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
   * twice — and neither they nor the customer would know until the books did
   * not balance.
   */
  readonly transactionId: string;
}

const STORAGE_KEY = "amx.pos.draft.v1";

const EMPTY: CartDraft = { lines: [], transactionId: "" };

function newTransactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Older browsers. Good enough for an idempotency key, and the database's
  // unique constraint is what actually enforces it.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

function read(): CartDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;

    const parsed = JSON.parse(raw) as CartDraft;
    if (!Array.isArray(parsed.lines)) return EMPTY;

    return {
      lines: parsed.lines.filter(
        (line) =>
          typeof line?.productId === "string" &&
          typeof line?.quantity === "number" &&
          line.quantity > 0,
      ),
      transactionId: parsed.transactionId || newTransactionId(),
    };
  } catch {
    // Private browsing, cleared storage, or a draft written by an older
    // version of the app. An unusable draft is not worth an error message.
    return EMPTY;
  }
}

function write(draft: CartDraft): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked. The basket still works for this session; it
    // just will not survive a reload, which is a degradation, not a failure.
  }
}

/**
 * The basket, kept in the browser so it survives a reload, a phone locking, or
 * the signal dropping mid-sale.
 *
 * This is the *only* thing this application does offline, and that restraint
 * is deliberate. A queue of unsynchronised sales that syncs later sounds
 * helpful and is how stock counts drift and transactions get posted twice.
 * Preserving the basket costs nothing and cannot corrupt anything; the sale
 * itself only ever happens against the live database.
 */
export function useCartDraft() {
  const [draft, setDraft] = useState<CartDraft>(EMPTY);
  const [isRestored, setIsRestored] = useState(false);

  // Read after mount: localStorage does not exist during the server render,
  // and reading it during the first client render would mismatch the HTML.
  useEffect(() => {
    setDraft(read());
    setIsRestored(true);
  }, []);

  const update = useCallback((next: CartDraft) => {
    setDraft(next);
    write(next);
  }, []);

  const addLine = useCallback(
    (line: Omit<DraftLine, "quantity">, quantity = 1) => {
      setDraft((current) => {
        const existing = current.lines.find(
          (candidate) => candidate.productId === line.productId,
        );

        const lines = existing
          ? current.lines.map((candidate) =>
              candidate.productId === line.productId
                ? {
                    ...candidate,
                    // Never past what is on the shelf. The server refuses it
                    // too; stopping here means the cashier finds out while
                    // they are still talking to the customer.
                    quantity: Math.min(
                      candidate.quantity + quantity,
                      line.availableStock,
                    ),
                  }
                : candidate,
            )
          : [
              ...current.lines,
              { ...line, quantity: Math.min(quantity, line.availableStock) },
            ];

        const next = {
          lines,
          transactionId: current.transactionId || newTransactionId(),
        };
        write(next);
        return next;
      });
    },
    [],
  );

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setDraft((current) => {
      const lines =
        quantity <= 0
          ? current.lines.filter((line) => line.productId !== productId)
          : current.lines.map((line) =>
              line.productId === productId
                ? {
                    ...line,
                    quantity: Math.min(quantity, line.availableStock),
                  }
                : line,
            );

      const next = {
        lines,
        transactionId: lines.length
          ? current.transactionId || newTransactionId()
          : "",
      };
      write(next);
      return next;
    });
  }, []);

  const removeLine = useCallback(
    (productId: string) => setQuantity(productId, 0),
    [setQuantity],
  );

  /** Called after a sale is recorded. The next basket gets a fresh key. */
  const clear = useCallback(() => update(EMPTY), [update]);

  return {
    draft,
    isRestored,
    addLine,
    setQuantity,
    removeLine,
    clear,
  };
}
