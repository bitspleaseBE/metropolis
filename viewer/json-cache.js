/**
 * One network fetch + one JSON.parse per URL, shared by every module that needs
 * `roads.json` / `buildings.json` (traffic, micromobility, scooters, pedestrians, outdoors,
 * minimap, street locator). Returns a Response-like `{ ok, status, json() }` so call sites only
 * swap `fetch(url)` for `fetchJsonCached(url)`. The parsed object is shared — treat it as
 * read-only. Failures are not cached, so a later caller can retry.
 *
 * Only the fixed same-directory files below are served (never caller-controlled hosts).
 */
const cache = new Map();

/** Literal-URL fetchers: the request target is never derived from caller input. */
function resolveDistrictPath(name) {
  if (typeof window !== "undefined" && typeof window.districtUrl === "function") {
    return window.districtUrl(name);
  }
  return "./" + name;
}

function rawFetch(key) {
  // Accept legacy "./roads.json" or district-resolved paths.
  const bare = String(key).replace(/^\.\//, "").split("/").pop();
  if (bare === "roads.json" || bare === "buildings.json") {
    return fetch(key.startsWith("./districts/") ? key : resolveDistrictPath(bare));
  }
  return null;
}
const resolveUrl = (url) => {
  const s = String(url);
  const bare = s.replace(/^\.\//, "").split("/").pop();
  if (bare === "roads.json" || bare === "buildings.json") {
    return s.startsWith("./districts/") ? s : resolveDistrictPath(bare);
  }
  return null;
};

export function fetchJsonCached(url) {
  const key = resolveUrl(url);
  if (!key) return Promise.resolve({ ok: false, status: 400, json: async () => null });
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const res = await rawFetch(key);
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
