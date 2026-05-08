/**
 * Kill-switch service worker.
 *
 * This file exists ONLY to neutralize stale service workers that were
 * registered by a previous version of the site. The current Next.js app
 * does not register any service worker — but browsers and iOS PWAs that
 * cached an old SW keep intercepting fetches with a broken handler,
 * which surfaces as:
 *
 *   - "FetchEvent ... resulted in a network error response: promise was rejected"
 *   - "service-worker.js: TypeError: Failed to convert value to 'Response'"
 *
 * On install, this SW takes control of all clients, deletes every cache,
 * and unregisters itself. After one full reload, the browser is back to
 * a clean no-SW state.
 *
 * Once you confirm in production that no users still have a SW
 * (DevTools → Application → Service Workers should report "no service
 * worker" on every device that has visited the site post-deploy), this
 * file can be removed.
 */

self.addEventListener("install", () => {
  // Take over from any older waiting/active SW immediately.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch {
        /* ignore — caches API not available */
      }

      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }

      try {
        const windowClients = await self.clients.matchAll({ type: "window" });
        for (const client of windowClients) {
          // Force a hard reload so the page comes back with no SW interception.
          client.navigate(client.url);
        }
      } catch {
        /* ignore */
      }
    })()
  );
});

// Pass-through fetch — never intercept, never cache. If something in this
// SW lifecycle delays activation, requests still hit the network normally.
self.addEventListener("fetch", () => {
  // Intentionally do nothing — let the browser handle it.
});
