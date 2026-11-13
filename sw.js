/* Bad Ragaz — service worker. Keeps the app usable without a connection:
   - the page: fresh copy when online, saved copy when not
   - fonts, icons, photos: saved on first use, then served from the phone
   Everything is served from this site; there are no outside libraries.
   Bump SHELL_VERSION when a change must replace the saved copy at once. */
const SHELL_VERSION = "2026-11-13.2";
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
async function pageResponse(request) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);   // weak signal: don't hang, use the saved copy
    const fresh = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (fresh.ok) shell.put("./index.html", fresh.clone());
    return fresh;
  } catch (e) {
    return (await shell.match("./index.html")) || (await shell.match("./")) || Response.error();
  }
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
  if (request.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname)) { event.respondWith(pageResponse(request)); return; }
  if (/\/sw\.js$/.test(url.pathname)) return;
  event.respondWith(cacheFirst(request).catch(() => caches.match(request, { ignoreVary: true }).then((r) => r || Response.error())));
});
