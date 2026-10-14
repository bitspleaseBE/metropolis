/**
 * Resolve the nearest named OSM street for a world (x, z) position.
 * map.json (district-wide) / roads.json points are Blender XY; Three.js uses z = -y.
 */

import { fetchJsonCached } from "./json-cache.js";

const SIDEWALK_M = 7;
const HOLD_FRAMES = 4;
const MIN_ANNOUNCE_MS = 400;

function distToSegment2(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

export async function createStreetLocator(opts = {}) {
  const roadsUrl = opts.roadsUrl || "./roads.json";
  const sidewalkM = opts.sidewalkM ?? SIDEWALK_M;
  // Segments bucketed on a coarse grid: map.json names every street of the postcode.
  const CELL = 48;
  /** @type {Map<string, { name: string, half: number, seg: Float32Array }[]>} */
  const grid = new Map();

  function addRoads(roads, t = null) {
    const sx = t ? Number(t.sx) || 1 : 1;
    const dx = t ? Number(t.x) || 0 : 0;
    const dz = t ? Number(t.z) || 0 : 0;
    for (const road of roads || []) {
      const name = String(road.name || "").trim();
      if (!name) continue;
      const pts = road.points || [];
      if (pts.length < 2) continue;
      const half = (Number(road.width) || 6) * 0.5 + sidewalkM;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const seg = new Float32Array([
          (Array.isArray(a) ? a[0] : a.x || 0) * sx + dx,
          -(Array.isArray(a) ? a[1] : a.y || 0) + dz,
          (Array.isArray(b) ? b[0] : b.x || 0) * sx + dx,
          -(Array.isArray(b) ? b[1] : b.y || 0) + dz,
        ]);
        const ix0 = Math.floor((Math.min(seg[0], seg[2]) - half) / CELL);
        const ix1 = Math.floor((Math.max(seg[0], seg[2]) + half) / CELL);
        const iz0 = Math.floor((Math.min(seg[1], seg[3]) - half) / CELL);
        const iz1 = Math.floor((Math.max(seg[1], seg[3]) + half) / CELL);
        const entry = { name, half, seg };
        for (let ix = ix0; ix <= ix1; ix++) {
          for (let iz = iz0; iz <= iz1; iz++) {
            const k = ix + "," + iz;
            let list = grid.get(k);
            if (!list) grid.set(k, (list = []));
            list.push(entry);
          }
        }
      }
    }
  }

  async function load(url) {
    try {
      const res = await fetchJsonCached(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  const map = await load(opts.mapUrl || "./map.json");
  if (map) addRoads(map.roads);
  else {
    const data = await load(roadsUrl);
    if (data) addRoads(data.roads);
    else console.warn("StreetLocator: could not load roads");
  }

  /** Merge a neighbour district's named streets, shifted by `t` = { x, z, sx }. */
  async function addSource(base, t) {
    const doc = await load(base + "map.json");
    if (doc) addRoads(doc.roads, t);
  }

  let current = "";
  let pending = "";
  let pendingCount = 0;
  let lastAnnounce = -Infinity;

  function locate(x, z) {
    let bestName = "";
    let bestD2 = Infinity;
    const list = grid.get(Math.floor(x / CELL) + "," + Math.floor(z / CELL));
    if (!list) return null;
    for (const { name, half, seg } of list) {
      const d2 = distToSegment2(x, z, seg[0], seg[1], seg[2], seg[3]);
      if (d2 <= half * half && d2 < bestD2) {
        bestD2 = d2;
        bestName = name;
      }
    }
    return bestName || null;
  }

  /**
   * @returns {{ street: string|null, changed: boolean }}
   */
  function update(x, z) {
    const hit = locate(x, z);
    if (!hit) {
      pending = "";
      pendingCount = 0;
      return { street: current || null, changed: false };
    }
    if (hit === current) {
      pending = "";
      pendingCount = 0;
      return { street: current, changed: false };
    }
    if (hit === pending) {
      pendingCount += 1;
    } else {
      pending = hit;
      pendingCount = 1;
    }
    const now = performance.now();
    if (pendingCount >= HOLD_FRAMES && now - lastAnnounce >= MIN_ANNOUNCE_MS) {
      current = hit;
      pending = "";
      pendingCount = 0;
      lastAnnounce = now;
      return { street: current, changed: true };
    }
    return { street: current || null, changed: false };
  }

  return { locate, update, addSource, get current() { return current || null; } };
}
