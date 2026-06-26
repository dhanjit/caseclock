/**
 * CaseClock service worker — offline shell with always-fresh navigation.
 *
 * Goal: an installed iPad PWA that (a) works fully offline — including a cold
 * launch that was never preceded by an online run — and (b) still picks up a
 * redeploy the moment it reopens online (no "stale build" trap), while making
 * zero cross-origin requests (the no-egress posture around the decrypted vault).
 *
 * Three lanes:
 *   1. the navigation document (HTML) → NETWORK-FIRST. When online, always fetch
 *      the latest index.html (which references the latest content-hashed assets),
 *      so a new deploy is live on the next open. Falls back to the cached shell
 *      only when the network is unreachable.
 *   2. /assets/* (Vite's content-hashed, immutable JS/CSS/WASM) → CACHE-FIRST.
 *      The full set is PRECACHED at install (see PRECACHE below), so the app
 *      boots offline even on a first cold launch; cache-first then serves them
 *      instantly. The filename changes when content changes, so caching is safe.
 *   3. everything else same-origin (icons, manifest) → STALE-WHILE-REVALIDATE.
 *
 * Storage is bounded to ONE build generation: the asset cache name carries a
 * per-build id, and activate() deletes every cache that isn't the current shell
 * or current-build asset cache. So redeploys don't accumulate dead bundles that
 * would compete for the origin quota the encrypted OPFS vault depends on.
 *
 * No cross-origin request is ever touched or cached (the app makes none — the
 * no-egress invariant). The encrypted vault lives in OPFS, never in the Cache
 * Storage this SW manages — the SW only ever caches the static app shell.
 *
 * BUILD and PRECACHE are injected at build time by the caseclockSwPrecache()
 * Vite plugin (see vite.config.ts). The "dev" / [] defaults below keep this file
 * valid JS on its own; in production they are replaced with the real values.
 */

const SW_VERSION = "cc-sw-v1";
const BUILD = "dev";
const PRECACHE = [];

const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets-${BUILD}`;
const SHELL_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // The navigation shell — so an offline launch always has an HTML document.
      const shell = await caches.open(SHELL_CACHE);
      try {
        await shell.add(new Request(SHELL_URL, { cache: "reload" }));
      } catch {
        /* offline at install — lane 1 populates it on the first online open */
      }
      // The full content-hashed asset set, so a cold OFFLINE launch can actually
      // boot (not just render a blank shell). Per-asset so one failure (e.g. a
      // transient 404) doesn't abort the whole install.
      const assets = await caches.open(ASSET_CACHE);
      await Promise.all(PRECACHE.map((u) => assets.add(new Request(u, { cache: "reload" })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep only the current shell + current-build asset cache; drop everything
      // else (older builds, older SW versions) so storage stays bounded.
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isDocumentRequest(req, url) {
  // Network-first the HTML however it's requested — not just req.mode==='navigate'
  // (some standalone re-entry / prefetch paths don't set navigate mode), so the
  // document is never served stale from a cache lane.
  return (
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname === "/" ||
    url.pathname === SHELL_URL
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // A Range request (Safari may issue one for the wasm/media) must reach the
  // network so it gets a correct 206 — never replay a cached full 200 for it.
  if (req.headers.has("range")) return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Never intercept cross-origin requests (preserves no-egress: the SW can only
  // ever serve same-origin app shell, never proxy anything outward).
  if (url.origin !== self.location.origin) return;
  // Don't cache the worker script itself — the browser revalidates it out-of-band
  // for updates; caching it is pollution and a slow-update foot-gun.
  if (url.pathname === "/sw.js") return;

  // Lane 1 — navigation document: network-first, cached shell as offline fallback.
  if (isDocumentRequest(req, url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(SHELL_URL, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(SHELL_URL);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Lane 2 — content-hashed build assets: cache-first (immutable, precached).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && res.ok && res.type === "basic") await cache.put(req, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Lane 3 — other same-origin static files: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit ?? (await network) ?? Response.error();
    })(),
  );
});
