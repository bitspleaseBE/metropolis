/**
 * Pavement runs from the kerb to the doorstep, and the house sits on that pavement.
 *
 * Baked city GLBs (before the frontage rebuild) lay a fixed 2 m sidewalk and
 * extrude buildings from z = 0, 12 cm under the pavement, so a strip of bare
 * ground shows between the tiles and the wall. This fills that strip and lifts
 * the building meshes by the pavement height. A GLB that already contains
 * `sidewalk_frontage_*` (see cityview/kerbs.py) is left alone.
 *
 * Keep the constants in lockstep with cityview/kerbs.py.
 */

import { fetchJsonCached } from "./json-cache.js";

export const PAVEMENT_Y = 0.12;
const NOMINAL = 2.0;
const MAX_FROM_EDGE = 8.0;
const TUCK = 0.22;
const MIN_W = 0.75;
const SAMPLE = 1.35;
const SPAWN_M = 320;
const CELL = 40;
const FOOT_CELL = 30;
const MIN_CROSS = Math.sin((35 * Math.PI) / 180);
const SKIP_KIND = new Set(["footway", "path", "cycleway", "steps"]);

const BUILDING_NAME = /^(bldg_|rooftop_|lmhold_|landmark_)/;

function hypot(x, y) {
  return Math.hypot(x, y);
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i][0];
    const y1 = ring[i][1];
    const x2 = ring[j][0];
    const y2 = ring[j][1];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1 || 1e-12) + x1) inside = !inside;
  }
  return inside;
}

function gridKey(x, y, cell) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

export class Carriageways {
  constructor(roads) {
    this.segments = [];
    this.grid = new Map();
    roads.forEach((road, ri) => {
      const kind = road.kind || "residential";
      if (SKIP_KIND.has(kind) || kind === "pedestrian" || kind === "track") return;
      const pts = road.points || [];
      const half = (Number(road.width) || 6) * 0.5;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = +pts[i][0];
        const ay = +pts[i][1];
        const bx = +pts[i + 1][0];
        const by = +pts[i + 1][1];
        if (hypot(bx - ax, by - ay) < 0.05) continue;
        const idx = this.segments.length;
        this.segments.push([ax, ay, bx, by, half, ri]);
        const pad = half + 1;
        const gx0 = Math.floor((Math.min(ax, bx) - pad) / CELL);
        const gx1 = Math.floor((Math.max(ax, bx) + pad) / CELL);
        const gy0 = Math.floor((Math.min(ay, by) - pad) / CELL);
        const gy1 = Math.floor((Math.max(ay, by) + pad) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gy = gy0; gy <= gy1; gy++) {
            const k = `${gx}:${gy}`;
            const bucket = this.grid.get(k);
            if (bucket) bucket.push(idx);
            else this.grid.set(k, [idx]);
          }
        }
      }
    });
  }

  blocked(x, y, tx, ty, margin, exclude) {
    const bucket = this.grid.get(gridKey(x, y, CELL));
    if (!bucket) return false;
    for (const si of bucket) {
      const [ax, ay, bx, by, half, ri] = this.segments[si];
      if (ri === exclude) continue;
      if (segDist(x, y, ax, ay, bx, by) >= half + margin) continue;
      const sl = hypot(bx - ax, by - ay);
      const cross = Math.abs((bx - ax) * ty - (by - ay) * tx) / sl;
      if (cross >= MIN_CROSS) return true;
    }
    return false;
  }

  contains(x, y, margin, exclude) {
    const bucket = this.grid.get(gridKey(x, y, CELL));
    if (!bucket) return false;
    for (const si of bucket) {
      const [ax, ay, bx, by, half, ri] = this.segments[si];
      if (ri === exclude) continue;
      if (segDist(x, y, ax, ay, bx, by) < half + margin) return true;
    }
    return false;
  }
}

export class Footprints {
  constructor(rings) {
    this.rings = [];
    this.grid = new Map();
    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      const idx = this.rings.length;
      const pts = ring.map((p) => [+p[0], +p[1]]);
      this.rings.push(pts);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      const gx0 = Math.floor(minX / FOOT_CELL);
      const gx1 = Math.floor(maxX / FOOT_CELL);
      const gy0 = Math.floor(minY / FOOT_CELL);
      const gy1 = Math.floor(maxY / FOOT_CELL);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const k = `${gx}:${gy}`;
          const bucket = this.grid.get(k);
          if (bucket) bucket.push(idx);
          else this.grid.set(k, [idx]);
        }
      }
    }
  }

  ray(x, y, dx, dy, maxT) {
    const ex = x + dx * maxT;
    const ey = y + dy * maxT;
    const gx0 = Math.floor(Math.min(x, ex) / FOOT_CELL);
    const gx1 = Math.floor(Math.max(x, ex) / FOOT_CELL);
    const gy0 = Math.floor(Math.min(y, ey) / FOOT_CELL);
    const gy1 = Math.floor(Math.max(y, ey) / FOOT_CELL);
    let best = Infinity;
    const seen = new Set();
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const bucket = this.grid.get(`${gx}:${gy}`);
        if (!bucket) continue;
        for (const i of bucket) {
          if (seen.has(i)) continue;
          seen.add(i);
          const ring = this.rings[i];
          if (pointInRing(x, y, ring)) return 0;
          const n = ring.length;
          for (let k = 0; k < n; k++) {
            const ax = ring[k][0];
            const ay = ring[k][1];
            const sx = ring[(k + 1) % n][0] - ax;
            const sy = ring[(k + 1) % n][1] - ay;
            const den = -(dx * sy - dy * sx);
            if (Math.abs(den) < 1e-9) continue;
            const qx = ax - x;
            const qy = ay - y;
            const t = (-qx * sy + sx * qy) / den;
            const u = (dx * qy - dy * qx) / den;
            if (u >= 0 && u <= 1 && t >= 0 && t <= maxT && t < best) best = t;
          }
        }
      }
    }
    return best;
  }
}

function frames(points, step) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const ax = +points[i][0];
    const ay = +points[i][1];
    const bx = +points[i + 1][0];
    const by = +points[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const seg = hypot(dx, dy);
    if (seg < 1e-6) continue;
    const tx = dx / seg;
    const ty = dy / seg;
    const n = Math.max(1, Math.ceil(seg / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([ax + dx * t, ay + dy * t, tx, ty]);
    }
  }
  const lx = +points[points.length - 1][0];
  const ly = +points[points.length - 1][1];
  const px = +points[points.length - 2][0];
  const py = +points[points.length - 2][1];
  const dx = lx - px;
  const dy = ly - py;
  const seg = hypot(dx, dy) || 1;
  out.push([lx, ly, dx / seg, dy / seg]);
  return out;
}

function foreignDistance(x, y, ox, oy, start, end, index, own) {
  if (!index || !index.segments.length || end <= start) return Infinity;
  let d = start;
  while (d <= end + 1e-6) {
    if (index.contains(x + ox * d, y + oy * d, 0.05, own)) return d;
    d += 0.5;
  }
  return Infinity;
}

function splitPair(inner, outer, maxLen) {
  if (inner.length < 2) return [];
  const out = [];
  let curI = [inner[0]];
  let curO = [outer[0]];
  let acc = 0;
  for (let i = 1; i < inner.length; i++) {
    acc += hypot(inner[i][0] - inner[i - 1][0], inner[i][1] - inner[i - 1][1]);
    curI.push(inner[i]);
    curO.push(outer[i]);
    if (acc >= maxLen && i < inner.length - 1) {
      out.push([curI, curO]);
      curI = [inner[i]];
      curO = [outer[i]];
      acc = 0;
    }
  }
  if (curI.length >= 2) out.push([curI, curO]);
  return out;
}

/** @returns {[number[][], number[][]][]} runs of [kerbEdge, wallEdge] in Blender XY. */
export function frontageSidewalkRuns(points, halfWidth, sign, footprints, carriageways, ownRoad) {
  if (!points || points.length < 2 || halfWidth <= 0) return [];
  const maxD = halfWidth + MAX_FROM_EDGE;
  const nomD = halfWidth + NOMINAL;
  const runs = [];
  let inner = [];
  let outer = [];
  const flush = () => {
    if (inner.length >= 2) runs.push(...splitPair(inner, outer, 80));
    inner = [];
    outer = [];
  };
  for (const [x, y, tx, ty] of frames(points, SAMPLE)) {
    const lx = -ty;
    const ly = tx;
    const ox = lx * sign;
    const oy = ly * sign;
    const reach = maxD + TUCK + 0.4;
    const hit = footprints ? footprints.ray(x, y, ox, oy, reach) : Infinity;
    const foreign = foreignDistance(x, y, ox, oy, halfWidth + 0.25, reach, carriageways, ownRoad);
    let outerD;
    if (footprints && hit > 0.4 && hit <= maxD && hit + TUCK < foreign - 0.15) {
      outerD = Math.min(maxD, hit + TUCK);
    } else {
      outerD = foreign > nomD + 0.15 ? nomD : Math.max(halfWidth + 0.2, foreign - 0.25);
    }
    const width = outerD - halfWidth;
    const cx = x + ox * (halfWidth + NOMINAL * 0.5);
    const cy = y + oy * (halfWidth + NOMINAL * 0.5);
    let bad = width < MIN_W;
    if (!bad && carriageways && carriageways.segments.length && carriageways.blocked(cx, cy, tx, ty, 0, ownRoad)) {
      bad = true;
    }
    if (bad) {
      flush();
      continue;
    }
    inner.push([x + ox * halfWidth, y + oy * halfWidth]);
    outer.push([x + ox * outerD, y + oy * outerD]);
  }
  flush();
  return runs;
}

function worldMinY(obj) {
  const geo = obj.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  obj.updateWorldMatrix(true, false);
  const e = obj.matrixWorld.elements;
  const bb = geo.boundingBox;
  let minY = Infinity;
  for (const lx of [bb.min.x, bb.max.x]) {
    for (const ly of [bb.min.y, bb.max.y]) {
      for (const lz of [bb.min.z, bb.max.z]) {
        const wy = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        if (wy < minY) minY = wy;
      }
    }
  }
  return minY;
}

/**
 * How far to drop a façade so its base sits on the building.
 * A photo skin baked above the extruded wall leaves a band of bare wall
 * between the pavement and the stone. Returns 0 when the façade already
 * meets the wall, or the gap is too large to be that bake offset.
 */
export function facadeSeatDrop(facadeMinY, bodyMinY, maxGap = 3) {
  if (!Number.isFinite(facadeMinY) || !Number.isFinite(bodyMinY)) return 0;
  const gap = facadeMinY - bodyMinY;
  if (gap <= 0.04 || gap > maxGap) return 0;
  return gap;
}

const FACADE_GROUP = /^(bldg_\d+)_facade\d+$/;

/** Drop each street façade onto its building so the stone meets the pavement. */
export function seatStreetFacades(root) {
  if (!root) return 0;
  const bodyMin = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || !/^bldg_\d+$/.test(obj.name || "")) return;
    bodyMin.set(obj.name, worldMinY(obj));
  });
  let seated = 0;
  root.traverse((obj) => {
    const match = FACADE_GROUP.exec(obj.name || "");
    if (!match) return;
    const base = bodyMin.get(match[1]);
    if (base == null) return;
    let minY = Infinity;
    obj.traverse((child) => {
      if (!child.isMesh) return;
      minY = Math.min(minY, worldMinY(child));
    });
    const drop = facadeSeatDrop(minY, base);
    if (!(drop > 0)) return;
    obj.position.y -= drop;
    obj.updateMatrix();
    seated++;
  });
  return seated;
}

/** Lift street buildings onto the pavement. Returns the lift applied, or 0. */
export function raiseStreetBuildings(root, lift = PAVEMENT_Y) {
  if (!root || !(lift > 0)) return 0;
  let base = null;
  root.traverse((obj) => {
    if (base !== null || !obj.isMesh) return;
    if (!/^bldg_\d+$/.test(obj.name || "")) return;
    base = worldMinY(obj);
  });
  if (base === null || base >= lift * 0.5) return 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!BUILDING_NAME.test(obj.name || "")) return;
    obj.position.y += lift;
    obj.updateMatrix();
  });
  return lift;
}

function hasFrontage(root) {
  let yes = false;
  root.traverse((obj) => {
    if ((obj.name || "").includes("sidewalk_frontage")) yes = true;
  });
  return yes;
}

function dropLegacySidewalks(root) {
  const drop = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const n = obj.name || "";
    if (/^sidewalk_/i.test(n) && !n.includes("frontage")) drop.push(obj);
  });
  for (const mesh of drop) {
    mesh.removeFromParent();
    if (mesh.geometry) mesh.geometry.dispose();
  }
  return drop.length;
}

function takeSidewalkMaterial(root) {
  let mat = null;
  root.traverse((obj) => {
    if (mat || !obj.isMesh) return;
    if (/^sidewalk_/i.test(obj.name || "")) mat = obj.material;
  });
  return mat ? mat.clone() : null;
}

function addStripMesh(THREE, material, inner, outer, name) {
  const n = Math.min(inner.length, outer.length);
  if (n < 2) return null;
  const pos = [];
  const uv = [];
  const idx = [];
  const y = PAVEMENT_Y;
  const inv = 1 / 2.4;
  for (let i = 0; i < n; i++) {
    pos.push(inner[i][0], y, -inner[i][1], outer[i][0], y, -outer[i][1]);
  }
  for (let i = 0; i < n - 1; i++) {
    const base = i * 2;
    // Blender XY → Three XZ (z = −y) mirrors the winding. Pick the order whose normal is +Y.
    const ax = inner[i][0];
    const az = -inner[i][1];
    const bx = inner[i + 1][0];
    const bz = -inner[i + 1][1];
    const cx = outer[i + 1][0];
    const cz = -outer[i + 1][1];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny > 0) idx.push(base, base + 2, base + 3, base, base + 3, base + 1);
    else idx.push(base, base + 3, base + 2, base, base + 1, base + 3);
  }
  let along = 0;
  const uAt = [0];
  for (let i = 1; i < n; i++) {
    along += hypot(inner[i][0] - inner[i - 1][0], inner[i][1] - inner[i - 1][1]);
    uAt.push(along * inv);
  }
  for (let i = 0; i < n; i++) {
    const w = hypot(outer[i][0] - inner[i][0], outer[i][1] - inner[i][1]) * inv;
    uv.push(uAt[i], 0, uAt[i], w);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return mesh;
}

async function loadLayout() {
  const [roadsRes, bldRes] = await Promise.all([
    fetchJsonCached("./roads.json"),
    fetchJsonCached("./buildings.json"),
  ]);
  if (!roadsRes.ok || !bldRes.ok) return null;
  const roadsDoc = await roadsRes.json();
  const bldDoc = await bldRes.json();
  return { roadsDoc, bldDoc };
}

/**
 * Replace fixed-width sidewalks with kerb-to-doorstep strips and lift buildings.
 * @returns {{ lift: number, strips: number, baked: boolean }}
 */
export async function applyPavementFrontage(root, THREE) {
  if (!root) return { lift: 0, strips: 0, baked: true, seated: 0 };
  // A rebuild that already baked kerb-to-doorstep strips still has façades
  // sitting above the extruded wall. Seat those even when the ribbons stay.
  if (hasFrontage(root)) {
    const lift = raiseStreetBuildings(root, PAVEMENT_Y);
    const seated = seatStreetFacades(root);
    console.info(
      `[metropolis] baked pavement kept, buildings lifted ${lift.toFixed(2)} m, ${seated} façades seated`,
    );
    return { lift, strips: 0, baked: true, seated };
  }
  const material =
    takeSidewalkMaterial(root) ||
    new THREE.MeshLambertMaterial({ color: 0x8c8a80 });
  const removed = dropLegacySidewalks(root);
  const lift = raiseStreetBuildings(root, PAVEMENT_Y);
  const seated = seatStreetFacades(root);
  const layout = await loadLayout();
  if (!layout) return { lift, strips: 0, baked: false, removed };
  const roads = layout.roadsDoc.roads || [];
  const spawn = layout.roadsDoc.spawn || layout.bldDoc.spawn || null;
  const footprints = new Footprints((layout.bldDoc.buildings || []).map((b) => b.ring));
  const carriageways = new Carriageways(roads);
  let strips = 0;
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    const kind = road.kind || "residential";
    if (SKIP_KIND.has(kind)) continue;
    const pts = road.points || [];
    if (pts.length < 2) continue;
    if (spawn) {
      const mid = pts[(pts.length / 2) | 0];
      if (hypot(mid[0] - spawn.x, mid[1] - spawn.y) > SPAWN_M) continue;
    }
    const half = (Number(road.width) || 6) * 0.5;
    for (const sign of [1, -1]) {
      const runs = frontageSidewalkRuns(pts, half, sign, footprints, carriageways, i);
      for (let ri = 0; ri < runs.length; ri++) {
        const mesh = addStripMesh(
          THREE,
          material,
          runs[ri][0],
          runs[ri][1],
          `sidewalk_frontage_${i}_${sign > 0 ? "L" : "R"}_${ri}`,
        );
        if (mesh) {
          root.add(mesh);
          strips++;
        }
      }
    }
  }
  console.info(
    `[metropolis] pavement to doorstep: ${strips} strips, buildings lifted ${lift.toFixed(2)} m, ${seated} façades seated (replaced ${removed} fixed sidewalks)`,
  );
  return { lift, strips, baked: false, removed, seated };
}
