"use client";

import { useEffect, useRef } from "react";

/**
 * How fast a burst has to be to count as a scanner rather than a person.
 *
 * Hand-held scanners emulate a keyboard and emit characters roughly 5–30ms
 * apart. A person typing manages 100ms between keys at best, and that is
 * someone touch-typing on a real keyboard rather than a cashier hunting for
 * digits on a till. 50ms leaves daylight on both sides.
 */
const MAX_GAP_MS = 50;

/** Shorter than this is a stray keypress, not a product code. */
const MIN_LENGTH = 3;

/**
 * Fires when a barcode scanner types into the page.
 *
 * Listens at the document, not at an input, and that is the whole point. The
 * alternative is to focus the search box and hope the scan lands in it — which
 * means either the cashier must tap the field before every scan, or the field
 * is auto-focused and a phone pops its keyboard over the product tiles the
 * moment the till opens. Neither is acceptable on hardware that is sometimes a
 * terminal with a scanner and sometimes a phone with a thumb.
 *
 * A scan is recognised by its speed, then by its terminator: scanners are
 * configured almost universally to send Enter (or Tab) after the code.
 *
 * Keystrokes are ignored while the person is typing in a field, so this never
 * competes with the search box, a quantity input, or the PIN screen.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  enabled = true,
): void {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  // Held in a ref so the listener does not resubscribe on every render of a
  // parent that rebuilds its handler. Updated in an effect rather than during
  // render: a ref written while rendering is a value React may not have
  // committed yet.
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Someone is typing somewhere on purpose. Leave them alone.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      // A pause means whatever came before was not part of this burst.
      if (gap > MAX_GAP_MS) buffer.current = "";

      if (event.key === "Enter" || event.key === "Tab") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length >= MIN_LENGTH) {
          // Stop the Enter from also activating whatever has focus.
          event.preventDefault();
          handler.current(code);
        }
        return;
      }

      // Printable characters only: a scanner sends the code, not modifiers.
      if (event.key.length === 1) {
        buffer.current += event.key;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
