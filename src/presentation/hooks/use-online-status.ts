"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the browser currently believes it is online.
 *
 * "Believes" is the operative word: `navigator.onLine` reports whether there
 * is a network interface, not whether anything is reachable. A phone on a
 * carrier with no data credit reports online. So this drives a warning banner
 * and never a decision — the sale is still attempted, and a real failure is
 * caught by the request itself, where the basket and its idempotency key make
 * a retry safe.
 *
 * Connectivity is an external store, so it is read as one. The server snapshot
 * is `true`: rendering "you are offline" into HTML that is, by definition,
 * being delivered over a working connection would be nonsense.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
