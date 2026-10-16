/**
 * Spatial city chunks load while the camera is near their centres.
 *
 * Same hysteresis as landmark-stream (220 m load / 310 m unload). Free-view
 * overview keeps every chunk resident; walking clears the latch.
 *
 * Loads are queued (one at a time) with a frame yield between attaches so
 * Meshopt scene build cannot stack with the walk loop. Pair with
 * MeshoptDecoder.useWorkers() so WASM decode itself leaves the main thread.
 */

import {
  LOAD_M,
  UNLOAD_M,
  overviewLatched,
  pickWithin,
} from "./landmark-stream.js";

export { LOAD_M, UNLOAD_M, overviewLatched, pickWithin };

/** Whether this chunk should be resident. */
export function chunkWanted(ctx, item) {
  if (ctx.overview && !item.neighbour) return true;
  const dist = Math.hypot(ctx.x - item.x, ctx.z - item.z);
  return dist <= (ctx.loaded ? UNLOAD_M : LOAD_M) + (item.reach || 0);
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material == null ? [] : Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of Object.keys(mat)) {
        const value = mat[key];
        if (value && value.isTexture) value.dispose();
      }
      mat.dispose();
    }
  });
  root.removeFromParent();
}

function resolveUrl(file, baseUrl) {
  if (baseUrl) return baseUrl + file.replace(/^\.\//, "");
  if (typeof window !== "undefined" && typeof window.districtUrl === "function") {
    return window.districtUrl(file);
  }
  return file.startsWith("./") ? file : "./" + file;
}

const yieldFrame = () => new Promise((r) => requestAnimationFrame(r));

/**
 * @param {object} opts
 * @param {*} opts.THREE
 * @param {import("three").Scene} opts.scene
 * @param {*} opts.loader — GLTFLoader
 * @param {object} opts.catalog — chunks.json body
 * @param {(root: object) => void} [opts.onChunkLoaded]
 * @param {(root: object) => void} [opts.onChunkUnloaded]
 * @param {string} [opts.baseUrl] — package dir ("./districts/<id>/") for a neighbour district
 * @param {{ x: number, z: number, sx?: number, y?: number }} [opts.transform] — neighbour frame
 *   → ours: x' = x·sx + x, z' = z + z (the east scale absorbs the cos(lat) difference)
 * @param {{ id: string, file: string, cx: number, cy: number, reach?: number }[]} [opts.extraItems]
 * @param {number} [opts.maxResident] — cap on chunks kept in memory (nearest first)
 */
export function createChunkStream({
  THREE,
  scene,
  loader,
  catalog,
  onChunkLoaded,
  onChunkUnloaded,
  baseUrl = "",
  transform = null,
  extraItems = [],
  name = "DistrictChunks",
  maxResident = Infinity,
}) {
  const cellM = Number(catalog?.cell_m) || 256;
  const sx = transform ? Number(transform.sx) || 1 : 1;
  const tx = transform ? Number(transform.x) || 0 : 0;
  const tz = transform ? Number(transform.z) || 0 : 0;
  const items = [...(catalog?.chunks || []), ...extraItems]
    .filter((p) => p.file && Number.isFinite(Number(p.cx)) && Number.isFinite(Number(p.cy)))
    .map((p) => ({
      id: String(p.id),
      file: String(p.file),
      // Blender XY → Three XZ (z = −y), same as landmarks.
      x: Number(p.cx) * sx + tx,
      z: -Number(p.cy) + tz,
      cell_m: cellM,
      reach: Number(p.reach) || 0,
      neighbour: !!transform,
    }));

  const root = new THREE.Group();
  root.name = name;
  if (transform) {
    root.position.set(tx, Number(transform.y) || 0, tz);
    root.scale.x = sx;
    root.updateMatrixWorld(true);
  }
  scene.add(root);

  const resident = new Map();
  /** @type {typeof items} */
  const queue = [];
  let busy = false;
  let overview = false;
  let camX = 0;
  let camZ = 0;

  function entry(id) {
    let st = resident.get(id);
    if (!st) {
      st = { gen: 0, group: null, loading: false, failed: false, queued: false };
      resident.set(id, st);
    }
    return st;
  }

  function enqueue(item) {
    const st = entry(item.id);
    if (st.group || st.loading || st.failed || st.queued) return;
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
        if (!chunkWanted({ x: camX, z: camZ, overview, loaded }, item)) continue;
        await loadOne(item);
        // Let the walk loop paint before the next GLB parse/attach.
        await yieldFrame();
      }
    } finally {
      busy = false;
      if (queue.length) void pump();
    }
  }

  async function loadOne(item) {
    const st = entry(item.id);
    if (st.group || st.loading || st.failed) return;
    const gen = st.gen;
    st.loading = true;
    try {
      const url = resolveUrl(item.file, baseUrl);
      const gltf = await loader.loadAsync(url);
      if (st.gen !== gen) {
        disposeObject(gltf.scene);
        st.loading = false;
        return;
      }
      const g = gltf.scene;
      g.name = `chunk_${item.id}`;
      root.add(g);
      g.updateMatrixWorld(true);
      // Hooks may still move nodes (pavement lift); freeze world matrices afterwards.
      onChunkLoaded?.(g);
      g.updateMatrixWorld(true);
      g.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
          obj.frustumCulled = true;
          obj.matrixAutoUpdate = false;
        }
        obj.matrixWorldAutoUpdate = false;
      });
      st.group = g;
      st.loading = false;
    } catch (err) {
      st.loading = false;
      if (st.gen === gen) st.failed = true;
      console.warn("[cityview] chunk", item.file, err);
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
      onChunkUnloaded?.(st.group);
      disposeObject(st.group);
      st.group = null;
    }
  }

  function update(x, z, mode, height) {
    if (!items.length) return;
    camX = x;
    camZ = z;
    overview = overviewLatched(mode, height, overview);
    const keep = new Set(
      pickWithin(items, x, z, maxResident, (item) => {
        const st = resident.get(item.id);
        const loaded = !!(st && st.group);
        return chunkWanted({ x, z, overview, loaded }, item);
      }),
    );
    for (const item of items) {
      const st = resident.get(item.id);
      const loaded = !!(st && st.group);
      if (keep.has(item)) enqueue(item);
      else if (loaded || (st && (st.loading || st.queued))) unloadOne(item);
    }
  }

  async function prime(x, z, opts = {}) {
    camX = x;
    camZ = z;
    const limit = Number.isFinite(opts.limit) ? opts.limit : maxResident;
    const near = pickWithin(items, x, z, limit, (item) =>
      chunkWanted({ x, z, overview: false, loaded: false }, item),
    );
    for (const item of near) enqueue(item);
    // Drain the queue (and any walk-triggered enqueues that arrive meanwhile).
    while (busy || queue.length) {
      await yieldFrame();
    }
  }

  /** Expand play bounds from chunk centres (Three XZ). */
  function expandBounds(bounds) {
    if (!bounds || !items.length || transform) return bounds;
    const pad = (cellM / Math.SQRT2) * 0.85;
    let { minX, maxX, minZ, maxZ } = bounds;
    for (const item of items) {
      minX = Math.min(minX, item.x - pad);
      maxX = Math.max(maxX, item.x + pad);
      minZ = Math.min(minZ, item.z - pad);
      maxZ = Math.max(maxZ, item.z + pad);
    }
    return { minX, maxX, minZ, maxZ };
  }

  /** Whether chunk `id` is attached (its detailed meshes are on screen). */
  function isResident(id) {
    const st = resident.get(id);
    return !!(st && st.group);
  }

  return { update, prime, expandBounds, isResident, items, root };
}
