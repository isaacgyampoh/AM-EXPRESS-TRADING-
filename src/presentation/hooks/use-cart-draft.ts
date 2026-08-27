"use client";

import { useSyncExternalStore } from "react";
import {
  addProduct,
  clearDraft,
  getServerSnapshot,
  getSnapshot,
  removeProduct,
  setLineQuantity,
  subscribe,
  type CartDraft,
  type DraftLine,
} from "../state/cart-store";

export type { CartDraft, DraftLine };

/**
 * The POS basket.
 *
 * A thin hook over the store in ../state/cart-store — see the note there for
 * why the basket is an external store rather than component state, and why
 * this is the only part of the application that works offline.
 */
export function useCartDraft() {
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    draft,
    addLine: addProduct,
    setQuantity: setLineQuantity,
    removeLine: removeProduct,
    clear: clearDraft,
  };
}
