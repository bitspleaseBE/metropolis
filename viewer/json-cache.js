/**
 * One network fetch + one JSON.parse per URL, shared by every module that needs
 * `roads.json` / `buildings.json` / `map.json` (traffic, micromobility, scooters, pedestrians,
 * outdoors, minimap, street locator). Returns a Response-like `{ ok, status, json() }` so call
 * sites only swap `fetch(url)` for `fetchJsonCached(url)`. The parsed object is shared — treat it
 * as read-only. Failures are not cached, so a later caller can retry.
 *
 * Only fixed package filenames are served, either for the current district or under an explicit
 * `./districts/<id>/` directory (never caller-controlled hosts or paths).
 */
const cache = new Map();

const PACKAGE_FILES = new Set([
  "roads.json",
  "buildings.json",
  "map.json",
  "landmarks.json",
  "shops.json",
  "transit.json",
  "chunks.json",
  "district.json",
  "water.json",
]);
const DISTRICT_DIR = /^\.\/districts\/[0-9a-z][0-9a-z-]{0,40}\/$/;

function resolveDistrictPath(name) {
  if (typeof window !== "undefined" && typeof window.districtUrl === "function") {
    return window.districtUrl(name);
  }
  return "./" + name;
}

/** Same-origin only: anything resolving to another host is refused. */
function sameOrigin(path) {
  if (typeof location === "undefined") return path;
  const u = new URL(path, location.href);
  return u.origin === location.origin ? u.href : null;
}

const resolveUrl = (url) => {
  const s = String(url);
  const slash = s.lastIndexOf("/");
  const bare = s.slice(slash + 1);
  if (!PACKAGE_FILES.has(bare)) return null;
  const dir = s.slice(0, slash + 1);
  if (DISTRICT_DIR.test(dir)) return sameOrigin(dir + bare);
  return sameOrigin(resolveDistrictPath(bare));
};

export function fetchJsonCached(url) {
  const key = resolveUrl(url);
  if (!key) return Promise.resolve({ ok: false, status: 400, json: async () => null });
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(key);
      if (!res.ok) return { ok: false, status: res.status, data: null };
      return { ok: true, status: res.status, data: await res.json() };
    })();
    cache.set(key, p);
    p.then(
      (r) => {
        if (!r.ok) cache.delete(key);
      },
      () => cache.delete(key),
    );
  }
  return p.then((r) => ({ ok: r.ok, status: r.status, json: async () => r.data }));
}
