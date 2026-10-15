/**
 * Street layers are stacked a couple of centimetres apart in the city build.
 * A slope-scaled polygon offset undoes that stack when you look along a road:
 * the bias grows with the depth slope and the pieces swap every frame.
 *
 * Offset units stay constant (no slope factor). Strips that share a height
 * (crossing roads, sidewalk ribbons, park paths) each take a stable 0.25 mm
 * step so they no longer share a depth. The whole range stays under 6 mm,
 * inside the 1 cm gap between a road and the path above it.
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

/** Metres to lift a coplanar strip. 0 for layers that do not tile over each other. */
export function coplanarLift(name) {
  const n = surfaceKey(name);
  const stacked =
    n.startsWith("road_") ||
    n.startsWith("park_path") ||
    n.startsWith("sidewalk") ||
    n.startsWith("park_");
  if (!stacked) return 0;
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
  const ya = a.y + coplanarLift(a.name);
  const yb = b.y + coplanarLift(b.name);
  return Math.abs(ya - yb) < STEP_M;
}

/**
 * Bias materials and lift coplanar strips once. Call before mesh merge so the
 * lift is baked into the tile.
 * @returns {{ biased: number, lifted: number }}
 */
export function applySurfaceOrder(root) {
  if (!root || typeof root.traverse !== "function") return { biased: 0, lifted: 0 };
  let biased = 0;
  let lifted = 0;
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
    const lift = coplanarLift(obj.name);
    if (lift && !obj.userData?._surfaceLift) {
      obj.userData = obj.userData || {};
      obj.position.y += lift;
      obj.userData._surfaceLift = lift;
      if (typeof obj.updateMatrix === "function") obj.updateMatrix();
      lifted += 1;
    }
  });
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
  return { name: obj.name || "", y: minY - lifted, minX, maxX, minZ, maxZ };
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
