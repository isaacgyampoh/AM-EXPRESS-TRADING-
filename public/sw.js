/*
 * AM Express Trading — service worker
 *
 * What this does, and just as importantly what it refuses to do.
 *
 * It makes the application installable and gives it a real offline screen
 * instead of the browser's dinosaur. It caches the build's static assets,
 * which are content-hashed and therefore safe to serve from cache forever.
 *
 * It does NOT cache page responses.
 *
 * That restraint is the whole design. Every page in this system is rendered
 * for one signed-in person and contains their business's money: today's
 * takings, a customer's receipt, a staff list. A cache that holds those is a
 * cache that can serve them to the next person to pick up the phone, or serve
 * yesterday's stock levels to a cashier who trusts them. Neither is worth the
 * few hundred milliseconds a warm cache would save.
 *
 * So: navigations go to the network. If the network is not there, the offline
 * page explains that plainly. The POS keeps its basket in localStorage and
 * carries an idempotency key, so nothing is lost by waiting for a connection —
 * and no sale is ever recorded from a cache.
 */

const VERSION = "amx-v1";
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;

/* Enough to render the offline screen with its icon and nothing else. */
const SHELL_ASSETS = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      // A missing asset must not leave the previous worker in place forever.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.startsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * There is deliberately no sign-out cache purge here.
 *
 * It would be reassuring machinery guarding a risk that does not exist: the
 * only things cached are content-hashed build assets, icons, the manifest and
 * a static offline page, none of which mention a person, a price or a sale.
 * Code that appears to protect something and protects nothing is worse than no
 * code, because the next reader stops asking the question.
 */

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A POST is a server action — a sale, an expense, a password —
  // and must always reach the server or fail loudly.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Another origin's problem.
  if (url.origin !== self.location.origin) return;

  // Never touch auth. A cached redirect here would be a locked-out cashier
  // with no way to explain why.
  if (url.pathname.startsWith("/auth/")) return;

  // Content-hashed build output: cache-first, because the URL changes whenever
  // the content does. Nothing stale can survive a deploy.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: network only. Offline shows the offline screen rather than someone
  // else's takings from an hour ago.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline")
          .then(
            (cached) =>
              cached ??
              new Response(
                "You are offline, and this device has not saved the offline page yet.",
                { status: 503, headers: { "Content-Type": "text/plain" } },
              ),
          ),
      ),
    );
  }

  // Everything else — data requests included — falls through to the network
  // untouched.
});
