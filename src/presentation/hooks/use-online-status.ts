"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser currently believes it is online.
 *
 * "Believes" is the operative word: `navigator.onLine` reports whether there
 * is a network interface, not whether anything is reachable. A phone on a
 * carrier with no data credit reports online. So this drives a warning banner
 * and never a decision — the sale still gets attempted, and a real failure is
 * caught by the request itself and retried.
 *
 * Starts as `true` so the first server render and the first client render
 * agree; the real value arrives in the effect.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
