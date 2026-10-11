/**
 * GitHub Pages sends Cache-Control: max-age=600 on every file and ignores
 * anything we set. Keep images ourselves so the next visit doesn't fetch them again.
 *
 * The city GLB is left on the network: a cached copy would keep yesterday's streets
 * after a deploy, and the progress bar needs the live stream.
 */
const CACHE = "metropolis-images-v1";
const IMAGE = /\.(?:png|jpe?g|webp|gif|svg|avif)$/i;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !IMAGE.test(url.pathname)) return;
  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const url = new URL(req.url);
  // Same-origin image path only. Never follow a URL from outside this site.
  if (url.origin !== self.location.origin || !IMAGE.test(url.pathname)) {
    return Response.error();
  }
  const path = url.pathname + url.search;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(path);
  const fresh = fetch(path, { redirect: "error" })
    .then((res) => {
      if (res.ok) cache.put(path, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}
