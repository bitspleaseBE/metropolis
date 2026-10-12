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
} from "./landmark-stream.js";

export { LOAD_M, UNLOAD_M, overviewLatched };

/** Whether this chunk should be resident. */
export function chunkWanted(ctx, item) {
  if (ctx.overview) return true;
  const dist = Math.hypot(ctx.x - item.x, ctx.z - item.z);
  return dist <= (ctx.loaded ? UNLOAD_M : LOAD_M);
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

function resolveUrl(file) {
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
 */
export function createChunkStream({ THREE, scene, loader, catalog, onChunkLoaded, onChunkUnloaded }) {
  const cellM = Number(catalog?.cell_m) || 256;
  const items = (catalog?.chunks || [])
    .filter((p) => p.file && Number.isFinite(Number(p.cx)) && Number.isFinite(Number(p.cy)))
    .map((p) => ({
      id: String(p.id),
      file: String(p.file),
      // Blender XY → Three XZ (z = −y), same as landmarks.
      x: Number(p.cx),
      z: -Number(p.cy),
      cell_m: cellM,
    }));

  const root = new THREE.Group();
  root.name = "DistrictChunks";
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
      const url = resolveUrl(item.file);
      const gltf = await loader.loadAsync(url);
      if (st.gen !== gen) {
        disposeObject(gltf.scene);
        st.loading = false;
        return;
      }
      const g = gltf.scene;
      g.name = `chunk_${item.id}`;
      g.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
          obj.frustumCulled = true;
          obj.matrixAutoUpdate = false;
        }
        obj.matrixWorldAutoUpdate = false;
      });
      g.updateMatrixWorld(true);
      root.add(g);
      st.group = g;
      st.loading = false;
      onChunkLoaded?.(g);
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
    for (const item of items) {
      const st = resident.get(item.id);
      const loaded = !!(st && st.group);
      const want = chunkWanted({ x, z, overview, loaded }, item);
      if (want) enqueue(item);
      else if (loaded || (st && (st.loading || st.queued))) unloadOne(item);
    }
  }

  async function prime(x, z) {
    camX = x;
    camZ = z;
    const near = items
      .filter((item) => Math.hypot(item.x - x, item.z - z) <= LOAD_M)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const item of near) enqueue(item);
    // Drain the queue (and any walk-triggered enqueues that arrive meanwhile).
    while (busy || queue.length) {
      await yieldFrame();
    }
  }

  /** Expand play bounds from chunk centres (Three XZ). */
  function expandBounds(bounds) {
    if (!bounds || !items.length) return bounds;
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

  return { update, prime, expandBounds, items, root };
}
