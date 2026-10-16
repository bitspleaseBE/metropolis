/**
 * One-off landmark GLBs load only while the camera is near them.
 *
 * Paths are relative to the page (`landmarks/<id>.glb`, `landmarks.json`),
 * which is what GitHub Pages serves at /metropolis/.
 *
 * Walking (and riding) loads inside 300 m and unloads past 420 m, so a
 * boundary doesn't thrash. From Halte Gounod that covers Heilige Geestkerk,
 * Mechelsesteenweg 123, the Peter Benoitstraat houses, Vincentius, and
 * Harmoniestraat 24. Free view zoomed out far enough to see the district
 * keeps every landmark visible; zoom back in and the walk radii apply again.
 *
 * Until a GLB arrives the city keeps the ordinary building (`lmbase_<id>`)
 * or, on older city files, the knee-high plinth (`lmhold_<id>`). The stand-in
 * hides once the detailed mesh is in the scene and comes back when it unloads.
 *
 * The GLB's limestone is a buff photo. landmark-dress repaints it after load.
 */

import { dressLandmarkObject, isChurchLandmark } from "./landmark-dress.js";

export const LOAD_M = 300;
export const UNLOAD_M = 420;
export const OVERVIEW_ON = 190;
export const OVERVIEW_OFF = 130;

/** OSM id from a city-GLB stand-in. Parts are `lmbase_<id>_roof`, `lmhold_<id>`, … */
export function standinKey(name) {
  const m = /^(?:lmbase_|lmhold_)(\d+)/.exec(String(name || ""));
  return m ? m[1] : null;
}

/** Latched "show the whole district" flag for free view. Walking clears it. */
export function overviewLatched(mode, height, overview) {
  if (mode !== "free") return false;
  if (height >= OVERVIEW_ON) return true;
  if (height <= OVERVIEW_OFF) return false;
  return !!overview;
}

/** Nearest items for which `wanted(item)` is true, capped at `maxCount`. */
export function pickWithin(items, x, z, maxCount, wanted) {
  const ranked = [];
  for (const item of items) {
    if (wanted(item)) ranked.push(item);
  }
  ranked.sort((a, b) => {
    const da = (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);
    const db = (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z);
    return da - db;
  });
  const cap = Number.isFinite(maxCount) ? Math.max(0, maxCount) : ranked.length;
  return cap >= ranked.length ? ranked : ranked.slice(0, cap);
}

/** Whether this landmark should be resident, given the latched overview flag. */
export function landmarkWanted(ctx, item) {
  if (ctx.overview) return true;
  const dist = Math.hypot(ctx.x - item.x, ctx.z - item.z);
  return dist <= (ctx.loaded ? UNLOAD_M : LOAD_M);
}

function disposeObject(root) {
  const dropped = new Set();
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material == null ? [] : Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      const held = mat.userData && mat.userData._droppedMaps;
      if (held) for (const tex of held) if (tex) dropped.add(tex);
      for (const key of Object.keys(mat)) {
        const value = mat[key];
        if (value && value.isTexture) value.dispose();
      }
      mat.dispose();
    }
  });
  for (const tex of dropped) tex.dispose();
  root.removeFromParent();
}

export function createLandmarkStream({
  scene,
  loader,
  cityRoot,
  catalog,
  maxResident = Infinity,
  serial = false,
}) {
  const items = (catalog.landmarks || [])
    .filter((p) => p.file && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({
      id: String(p.id),
      file: String(p.file),
      x: Number(p.x),
      z: -Number(p.y),
      church: isChurchLandmark(p),
    }));
  const holds = new Map();
  if (cityRoot) {
    cityRoot.traverse((obj) => {
      const id = standinKey(obj.name || "");
      if (!id) return;
      const list = holds.get(id);
      if (list) list.push(obj);
      else holds.set(id, [obj]);
    });
  }
  const resident = new Map();
  let overview = false;
  let camX = 0;
  let camZ = 0;
  const queue = [];
  let busy = false;

  function setHold(id, visible) {
    const list = holds.get(String(id));
    if (!list) return;
    for (const obj of list) obj.visible = visible;
  }

  function entry(id) {
    let st = resident.get(id);
    if (!st) {
      st = { gen: 0, group: null, loading: false, failed: false, queued: false };
      resident.set(id, st);
    }
    return st;
  }

  function resolveUrl(file) {
    if (typeof window !== "undefined" && typeof window.districtUrl === "function") {
      return window.districtUrl(file);
    }
    return file.startsWith("./") ? file : "./" + file;
  }

  async function loadOne(item) {
    const st = entry(item.id);
    if (st.group || st.loading || st.failed) return;
    const gen = st.gen;
    st.loading = true;
    try {
      const gltf = await loader.loadAsync(resolveUrl(item.file));
      if (st.gen !== gen) {
        disposeObject(gltf.scene);
        st.loading = false;
        return;
      }
      const group = gltf.scene;
      group.name = `stream_${item.id}`;
      // Old landmark GLBs are baked from z = 0. Match a runtime pavement lift.
      if (typeof window !== "undefined" && window.__buildingLift) {
        group.position.y += window.__buildingLift;
      }
      group.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
          obj.frustumCulled = true;
          dressLandmarkObject(obj, { church: item.church });
        }
      });
      scene.add(group);
      st.group = group;
      st.loading = false;
      setHold(item.id, false);
    } catch (err) {
      st.loading = false;
      if (st.gen === gen) st.failed = true;
      console.warn("[cityview] landmark", item.file, err);
    }
  }

  function unloadOne(item) {
    const st = entry(item.id);
    st.gen += 1;
    st.loading = false;
    st.queued = false;
    const qi = queue.findIndex((q) => q.id === item.id);
    if (qi >= 0) queue.splice(qi, 1);
    if (st.group) {
      disposeObject(st.group);
      st.group = null;
      setHold(item.id, true);
    }
  }

  function request(item) {
    const st = entry(item.id);
    if (st.group || st.loading || st.failed) return;
    if (!serial) {
      void loadOne(item);
      return;
    }
    if (st.queued) return;
    st.queued = true;
    queue.push(item);
    void pump();
  }

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        const st = entry(item.id);
        st.queued = false;
        const loaded = !!st.group;
        if (!landmarkWanted({ x: camX, z: camZ, overview, loaded }, item)) continue;
        await loadOne(item);
      }
    } finally {
      busy = false;
      if (queue.length) void pump();
    }
  }

  function update(x, z, mode, height) {
    camX = x;
    camZ = z;
    overview = overviewLatched(mode, height, overview);
    const keep = new Set(
      pickWithin(items, x, z, maxResident, (item) => {
        const st = resident.get(item.id);
        const loaded = !!(st && st.group);
        return landmarkWanted({ x, z, overview, loaded }, item);
      }),
    );
    for (const item of items) {
      const st = resident.get(item.id);
      const loaded = !!(st && st.group);
      if (keep.has(item)) request(item);
      else if (loaded || (st && (st.loading || st.queued))) unloadOne(item);
    }
  }

  function prime(x, z, opts = {}) {
    camX = x;
    camZ = z;
    const limit = Number.isFinite(opts.limit) ? opts.limit : maxResident;
    const near = pickWithin(items, x, z, limit, (item) =>
      landmarkWanted({ x, z, overview: false, loaded: false }, item),
    );
    if (!serial) return Promise.all(near.map((item) => loadOne(item)));
    return near.reduce((p, item) => p.then(() => loadOne(item)), Promise.resolve());
  }

  return { update, prime, items };
}
