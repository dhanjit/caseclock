/**
 * Self-retiring service worker.
 *
 * An earlier version of this SW cached the app shell, which could trap users on
 * a stale build across redeploys. This replacement unregisters itself and wipes
 * all caches the moment it activates, then reloads open tabs so they fetch the
 * latest build straight from the network. The app no longer registers a SW (see
 * main.tsx); offline/installability can return later via a proper build-time SW
 * (e.g. vite-plugin-pwa with auto-update) that versions its cache per build.
 *
 * Browsers always revalidate the SW script against the network on navigation,
 * so shipping this byte-changed sw.js reaches and cleans up existing installs.
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        for (const c of clients) c.navigate(c.url);
      } catch {
        /* best-effort cleanup */
      }
    })(),
  );
});
