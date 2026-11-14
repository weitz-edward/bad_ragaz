/* Bad Ragaz — service worker. Keeps the app usable without a connection:
   - the page: the saved copy opens at once; a fresh copy is fetched in the background,
     and the page offers to refresh when that copy is newer
   - fonts, icons, photos: saved on first use, then served from the phone
   Everything is served from this site; there are no outside libraries.
   Bump SHELL_VERSION when a change must replace the saved copy at once. */
const SHELL_VERSION = "2026-11-14.1";
const SHELL_CACHE = "ragaz-shell-" + SHELL_VERSION;
const ASSET_CACHE = "ragaz-assets-v1";
const SHELL_URLS = ["./", "./index.html", "./manifest.webmanifest", "./icon-v3-192.png", "./icon-v3-512.png",
  "./fonts/Bellefair-Regular.ttf", "./fonts/Assistant-wght.ttf"];
const LIVE_DATA_HOSTS = ["api.open-meteo.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("ragaz-shell-") && n !== SHELL_CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});
async function pageResponse(event) {
  const shell = await caches.open(SHELL_CACHE);
  const cached = (await shell.match("./index.html")) || (await shell.match("./"));
  const refresh = (async () => {
    const fresh = await fetch("./index.html", { cache: "no-store" });
    if (!fresh.ok) throw new Error("status " + fresh.status);     // an error page never replaces the saved app
    await shell.put("./index.html", fresh.clone());              // the page itself notices and offers to refresh
    return fresh;
  })();
  if (cached) { event.waitUntil(refresh.catch(() => {})); return cached; }
  try { return await refresh; } catch (e) { return Response.error(); }
}
async function cacheFirst(request) {
  const hit = await caches.match(request, { ignoreVary: true, ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) { const cache = await caches.open(ASSET_CACHE); cache.put(request, response.clone()).catch(() => {}); }
  return response;
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (LIVE_DATA_HOSTS.includes(url.hostname)) return;   // weather: always live (the app keeps its own last copy)
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname)) { event.respondWith(pageResponse(event)); return; }
  if (/\/sw\.js$/.test(url.pathname)) return;
  event.respondWith(cacheFirst(request).catch(() => caches.match(request, { ignoreVary: true }).then((r) => r || Response.error())));
});
