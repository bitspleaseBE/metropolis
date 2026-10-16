/**
 * Street layers are stacked a couple of centimetres apart in the city build.
 * A slope-scaled polygon offset undoes that stack when you look along a road:
 * the bias grows with the depth slope and the pieces swap every frame.
 *
 * Offset units stay constant (no slope factor). Strips that share a height
 * (crossing roads, sidewalk ribbons, park paths) take a 0.25 mm step, and
 * strips whose footprints overlap are given different steps. A name hash
 * still collides, and those collisions are the patches that flicker. The
 * whole range stays under 6 mm, inside the 1 cm gap between a road and the
 * path above it.
 */

const STEP_M = 0.00025;
const SLOTS = 24;
export const LIFT_STEP = STEP_M;
export const LIFT_MAX = SLOTS * STEP_M;

/** Drop the runtime merge prefix so a tile keeps the source mesh's layer. */
export function surfaceKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^merged_/, "");
}

/**
 * Constant depth bias. Positive units push the surface away.
 * `factor` is always 0: a slope factor flickers at grazing angles.
 * @returns {{ factor: number, units: number } | null}
 */
export function surfaceBias(name) {
  const n = surfaceKey(name);
  if (n.startsWith("zebra_rail")) return { factor: 0, units: -5 };
  if (n.startsWith("rail_")) return { factor: 0, units: -4 };
  if (n.startsWith("tram_")) return { factor: 0, units: -3 };
  if (n.startsWith("curb")) return { factor: 0, units: -2 };
  if (n.startsWith("sidewalk")) return { factor: 0, units: -1 };
  if (n.startsWith("zebra") || n.startsWith("dash")) return { factor: 0, units: 0 };
  if (n.startsWith("road_") || n.startsWith("park_path")) return { factor: 0, units: 1 };
  if (n.startsWith("park_")) return { factor: 0, units: 2 };
  if (n.startsWith("water_bed")) return { factor: 0, units: 5 };
  if (n.startsWith("water")) return { factor: 0, units: 3 };
  if (n === "ground") return { factor: 0, units: 4 };
  // Photo façades sit on the extruded wall. A constant pull-forward, not a
  // slope factor: the slope term checkerboards when the wall is edge-on.
  if (n.includes("facade") || n.includes("_landmark")) return { factor: 0, units: -3 };
  return null;
}

function slotOf(name) {
  let h = 2166136261;
  const s = surfaceKey(name);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SLOTS;
}

/** Carriageway, pavement, or park ribbon. These are the strips that tile over each other. */
export function stackClass(name) {
  const n = surfaceKey(name);
  if (n.startsWith("road_") || n.startsWith("park_path")) return "carriage";
  if (n.startsWith("sidewalk")) return "walk";
  if (n.startsWith("park_")) return "park";
  return "";
}

/**
 * One lift per strip. Overlapping strips in the same layer get different
 * steps, so a crossing never shares a depth. Isolated strips still move one
 * step off the baked height. Lifts stay inside LIFT_MAX.
 * @param {{ name: string, y: number, minX: number, maxX: number, minZ: number, maxZ: number }[]} entries
 * @returns {number[]}
 */
export function assignCoplanarLifts(entries) {
  const lifts = entries.map(() => 0);
  const groups = new Map();
  entries.forEach((entry, index) => {
    const cls = stackClass(entry && entry.name);
    if (!cls) return;
    const band = Math.round((entry.y || 0) / 0.005);
    const key = `${cls}:${band}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(index);
  });
  for (const idxs of groups.values()) {
    const neighbors = idxs.map(() => new Set());
    const local = new Map(idxs.map((index, k) => [index, k]));
    const cell = 48;
    const bins = new Map();
    for (const index of idxs) {
      const entry = entries[index];
      const x0 = Math.floor(entry.minX / cell);
      const x1 = Math.floor(entry.maxX / cell);
      const z0 = Math.floor(entry.minZ / cell);
      const z1 = Math.floor(entry.maxZ / cell);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = `${x}|${z}`;
          let bin = bins.get(key);
          if (!bin) bins.set(key, (bin = []));
          bin.push(index);
        }
      }
    }
    for (const bin of bins.values()) {
      for (let a = 0; a < bin.length; a++) {
        for (let b = a + 1; b < bin.length; b++) {
          const i = bin[a];
          const j = bin[b];
          if (!xzOverlap(entries[i], entries[j])) continue;
          neighbors[local.get(i)].add(local.get(j));
          neighbors[local.get(j)].add(local.get(i));
        }
      }
    }
    const order = idxs.map((_, k) => k).sort((a, b) => {
      const degree = neighbors[b].size - neighbors[a].size;
      if (degree) return degree;
      return String(entries[idxs[a]].name).localeCompare(String(entries[idxs[b]].name));
    });
    const color = new Array(idxs.length).fill(-1);
    let maxColor = 0;
    for (const k of order) {
      const used = new Set();
      for (const n of neighbors[k]) if (color[n] >= 0) used.add(color[n]);
      let c = 0;
      while (used.has(c)) c += 1;
      color[k] = c;
      if (c > maxColor) maxColor = c;
    }
    const span = maxColor + 1;
    const step = span * STEP_M <= LIFT_MAX ? STEP_M : LIFT_MAX / span;
    for (let k = 0; k < idxs.length; k++) lifts[idxs[k]] = (color[k] + 1) * step;
  }
  return lifts;
}

/** Metres to lift a coplanar strip when it is the only one in view. */
export function coplanarLift(name) {
  const n = surfaceKey(name);
  if (!stackClass(name)) return 0;
  // Slot 0 still leaves the strip on the baked height, so every name moves
  // at least one step. 6 mm stays inside the 1 cm road-to-path gap.
  return (slotOf(name) + 1) * STEP_M;
}

export function xzOverlap(a, b) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/**
 * Two surfaces will flicker when their footprints overlap and the lifted
 * heights still sit within 0.25 mm — closer than the depth buffer can keep
 * apart on a street in front of the camera.
 */
export function wouldFlicker(a, b) {
  if (!a || !b || a === b) return false;
  if (!xzOverlap(a, b)) return false;
  const la = Number.isFinite(a.lift) ? a.lift : coplanarLift(a.name);
  const lb = Number.isFinite(b.lift) ? b.lift : coplanarLift(b.name);
  // Half a step: float error must not call an exact step a collision.
  return Math.abs(a.y + la - (b.y + lb)) < STEP_M * 0.5;
}

/**
 * Bias materials and lift coplanar strips once. Call before mesh merge so the
 * lift is baked into the tile.
 * @returns {{ biased: number, lifted: number }}
 */
function raiseStrip(obj, lift) {
  if (!lift || obj.userData?._surfaceLift) return false;
  obj.userData = obj.userData || {};
  obj.position.y += lift;
  obj.userData._surfaceLift = lift;
  if (typeof obj.updateMatrix === "function") obj.updateMatrix();
  return true;
}

export function applySurfaceOrder(root) {
  if (!root || typeof root.traverse !== "function") return { biased: 0, lifted: 0 };
  let biased = 0;
  const pending = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const bias = surfaceBias(obj.name);
    if (bias && obj.material) {
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        if (!m || m.userData?.cityviewPond) continue;
        m.polygonOffset = true;
        m.polygonOffsetFactor = bias.factor;
        m.polygonOffsetUnits = bias.units;
        biased += 1;
      }
    }
    if (!stackClass(obj.name) || obj.userData?._surfaceLift) return;
    pending.push(obj);
  });
  if (typeof root.updateMatrixWorld === "function") root.updateMatrixWorld(true);
  const placed = [];
  const loose = [];
  for (const obj of pending) {
    const foot = worldFootprint(obj);
    if (foot) placed.push({ obj, foot });
    else loose.push(obj);
  }
  const assigned = assignCoplanarLifts(placed.map((item) => item.foot));
  let lifted = 0;
  for (let i = 0; i < placed.length; i++) {
    if (raiseStrip(placed[i].obj, assigned[i])) lifted += 1;
  }
  for (const obj of loose) {
    if (raiseStrip(obj, coplanarLift(obj.name))) lifted += 1;
  }
  if (typeof root.updateMatrixWorld === "function") root.updateMatrixWorld(true);
  return { biased, lifted };
}

function worldFootprint(obj) {
  const g = obj.geometry;
  if (!g) return null;
  if (!g.boundingBox && typeof g.computeBoundingBox === "function") g.computeBoundingBox();
  const bb = g.boundingBox;
  const e = obj.matrixWorld && obj.matrixWorld.elements;
  if (!bb || !e) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  for (const x of [bb.min.x, bb.max.x]) {
    for (const y of [bb.min.y, bb.max.y]) {
      for (const z of [bb.min.z, bb.max.z]) {
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        if (wy < minY) minY = wy;
      }
    }
  }
  const lifted = obj.userData?._surfaceLift || 0;
  return { name: obj.name || "", y: minY - lifted, lift: lifted, minX, maxX, minZ, maxZ };
}

/**
 * Pairs of overlapping strips whose lifted heights still match. Run before
 * the tile merge, while each road is still its own mesh. Bounding boxes
 * over-count (a long way's box covers side streets it does not touch).
 * @returns {{ checked: number, pairs: number }}
 */
export function auditSurfaceFlicker(root) {
  if (!root || typeof root.traverse !== "function") return { checked: 0, pairs: 0 };
  const items = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !coplanarLift(obj.name)) return;
    const foot = worldFootprint(obj);
    if (foot) items.push(foot);
  });
  const cell = 48;
  const bins = new Map();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const x0 = Math.floor(it.minX / cell);
    const x1 = Math.floor(it.maxX / cell);
    const z0 = Math.floor(it.minZ / cell);
    const z1 = Math.floor(it.maxZ / cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = `${x}|${z}`;
        let bin = bins.get(key);
        if (!bin) bins.set(key, (bin = []));
        bin.push(i);
      }
    }
  }
  const seen = new Set();
  let pairs = 0;
  for (const bin of bins.values()) {
    for (let a = 0; a < bin.length; a++) {
      for (let b = a + 1; b < bin.length; b++) {
        const i = bin[a];
        const j = bin[b];
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (wouldFlicker(items[i], items[j])) pairs += 1;
      }
    }
  }
  return { checked: items.length, pairs };
}
