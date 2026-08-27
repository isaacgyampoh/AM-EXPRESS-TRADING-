"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Registration is deferred until after `load` so it never competes with the
 * first render for bandwidth — on a mobile connection, a cashier waiting an
 * extra second for the till because the browser was fetching a worker is a
 * poor trade for an offline screen they may never see.
 *
 * Development is skipped: a stale worker caching a hot-reload bundle is a
 * confusing afternoon.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration costs the offline screen and nothing else.
        // Not worth interrupting anyone over.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
