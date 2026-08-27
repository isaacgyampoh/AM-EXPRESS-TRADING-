"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";

/**
 * Chrome's `beforeinstallprompt`, which is not in the DOM lib.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "amx.install.dismissed.v1";

/**
 * Offers to install the app — once, quietly, and never again if declined.
 *
 * The browser decides whether installation is possible; this only surfaces the
 * offer it makes. Nothing here forces or fakes an install, and there is no
 * repeating nag: a cashier who said no is trying to serve a customer, and
 * asking again tomorrow would make the app the problem rather than the tool.
 *
 * On iOS there is no prompt event at all — Safari installs through its own
 * Share menu — so nothing is shown there rather than a button that cannot
 * work. The deployment notes explain the Share → Add to Home Screen route.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      // Storage blocked. Showing the offer is the safe side of this one.
    }
    if (dismissed) return;

    const onPrompt = (event: Event) => {
      // Stop the browser's own mini-infobar so there is one offer, not two.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDeferred(null);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Then it may appear once more on this device. Harmless.
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Either way the event is spent and cannot be reused.
    setDeferred(null);
  }, [deferred]);

  if (!deferred) return null;

  return (
    <div className="mx-4 md:mx-6 mb-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 print:hidden">
      <p className="font-medium">Install this on your phone?</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        It opens full screen without the browser bar, which gives the till more
        room and makes it quicker to get to.
      </p>
      <div className="mt-3 flex gap-3">
        <Button onClick={install}>Install</Button>
        <Button variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
