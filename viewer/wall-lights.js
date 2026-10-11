/**
 * Second-floor lights on the façade, only where a street lamp is not already
 * nearby. Antwerp does not put a lantern on every corner; a wall light at
 * the second storey covers the gap. These are positions for the pooled
 * point lights, not extra lantern meshes.
 */

/** Window height of a Belgian second storey (floor ~3.2 m, sill above that). */
export const WALL_LIGHT_Y = 6.4;
export const LAMP_CLEAR_M = 18;
export const WALL_SPACING_M = 26;
export const WALL_REACH_M = 12;

function near(list, x, z, radius) {
  const r2 = radius * radius;
  for (let i = 0; i < list.length; i++) {
    const dx = list[i].x - x;
    const dz = list[i].z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

function buildingSegments(buildings) {
  const segs = [];
  for (const b of buildings || []) {
    const ring = b.ring || b.points || [];
    if (ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const c = ring[(i + 1) % ring.length];
      segs.push({ ax: a[0], az: -a[1], bx: c[0], bz: -c[1] });
    }
  }
  return segs;
}

/** Closest façade point within reach, nudged 35 cm toward the street so it sits on the wall. */
function nearestWall(segs, x, z, maxReach) {
  let best = null;
  let bestD = maxReach;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const abx = s.bx - s.ax;
    const abz = s.bz - s.az;
    const len2 = abx * abx + abz * abz || 1e-6;
    let t = ((x - s.ax) * abx + (z - s.az) * abz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = s.ax + abx * t;
    const pz = s.az + abz * t;
    const dx = x - px;
    const dz = z - pz;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      const n = d || 1;
      best = { x: px + (dx / n) * 0.35, z: pz + (dz / n) * 0.35 };
    }
  }
  return best;
}

/**
 * @param {object} opts
 * @param {{x:number,z:number}[]} opts.lamps existing street-lamp heads, Three.js XZ
 * @param {{points:number[][]}[]} opts.roads Blender XY centrelines
 * @param {{ring:number[][]}[]} opts.buildings Blender XY footprints
 * @returns {{x:number,y:number,z:number}[]}
 */
export function wallLightAnchors({
  lamps = [],
  roads = [],
  buildings = [],
  spacing = WALL_SPACING_M,
  lampClear = LAMP_CLEAR_M,
  reach = WALL_REACH_M,
  limit = 80,
} = {}) {
  const lampPts = lamps.map((l) => ({ x: l.x, z: l.z }));
  const segs = buildingSegments(buildings);
  const anchors = [];
  if (!segs.length) return anchors;
  for (const road of roads) {
    const pts = road.points || [];
    let carry = spacing;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0];
      const az = -pts[i][1];
      const bx = pts[i + 1][0];
      const bz = -pts[i + 1][1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      let d = spacing - carry;
      if (d < 0) d = 0;
      while (d <= len) {
        const t = d / len;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        d += spacing;
        if (!near(lampPts, x, z, lampClear) && !near(anchors, x, z, spacing * 0.75)) {
          const wall = nearestWall(segs, x, z, reach);
          if (wall) {
            anchors.push({ x: wall.x, y: WALL_LIGHT_Y, z: wall.z });
            if (anchors.length >= limit) return anchors;
          }
        }
      }
      carry = (carry + len) % spacing;
    }
  }
  return anchors;
}
