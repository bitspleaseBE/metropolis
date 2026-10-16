/**
 * Seat a Velo dock on the pavement, parallel to the street beside it.
 *
 * Published stations can sit at a yaw that cuts across the carriageway. The
 * rider then hits the rail and has to turn around. Coordinates are Three.js XZ
 * (Blender y becomes −z). The rack is a straight run, so a bend in the
 * sidewalk ends the dock instead of letting it enter the road.
 */

export const BIKE_REACH = 1.14;
const KERB_CLEAR = 0.4;
const MIN_RAIL = 3.2;
const ALIGN = 0.992;

const PAVEMENT = new Set(["sidewalk", "footway", "pedestrian"]);

export function railAxis(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function streetAxis(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Yaw whose street axis (where the bikes point) is `dir`. */
export function yawFacing(dir) {
  const len = Math.hypot(dir.x, dir.z) || 1;
  return Math.atan2(-dir.x / len, -dir.z / len);
}

function unit(dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function closest(seg, x, z) {
  const dx = seg.bx - seg.ax;
  const dz = seg.bz - seg.az;
  const len2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - seg.ax) * dx + (z - seg.az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = seg.ax + dx * t;
  const pz = seg.az + dz * t;
  return { x: px, z: pz, t, d: Math.hypot(x - px, z - pz), len: seg.len || Math.sqrt(len2) };
}

function distToSeg(seg, x, z) {
  return closest(seg, x, z).d;
}

/** One pavement polyline. `points` are Three.js {x, z}. */
export function makeWalk(kind, half, points, id) {
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.15) continue;
    segs.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      len,
      dir: { x: dx / len, z: dz / len },
    });
  }
  return { id: id || kind, kind, half: Math.max(0.6, half || 1), segs };
}

function walkFromRaw(raw, points) {
  return makeWalk(raw.kind || "", Math.max(0.6, (Number(raw.width) || 2) / 2), points, raw.id);
}

/** roads.json walks and carriageways, converted Blender XY → Three XZ. */
export function fromRoadsDoc(doc) {
  const walks = [];
  const crossings = [];
  for (const raw of doc?.walks || []) {
    const points = [];
    for (const p of raw.points || []) {
      if (Array.isArray(p) && p.length >= 2) points.push({ x: +p[0], z: -p[1] });
    }
    if (points.length < 2) continue;
    const walk = walkFromRaw(raw, points);
    if (!walk.segs.length) continue;
    if (walk.kind === "crossing") crossings.push(walk);
    else if (PAVEMENT.has(walk.kind)) walks.push(walk);
  }
  const roads = [];
  for (const raw of doc?.roads || []) {
    const pts = raw.points || [];
    const half = Math.max(1.2, (Number(raw.width) || 6) / 2);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!Array.isArray(a) || !Array.isArray(b)) continue;
      const dx = b[0] - a[0];
      const dz = -b[1] + a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.15) continue;
      roads.push({
        ax: +a[0],
        az: -a[1],
        bx: +b[0],
        bz: -b[1],
        len,
        half,
      });
    }
  }
  return { walks, roads, crossings };
}

function nearestSeg(walk, x, z) {
  let best = null;
  for (let i = 0; i < walk.segs.length; i++) {
    const hit = closest(walk.segs[i], x, z);
    if (!best || hit.d < best.d) best = { ...hit, i };
  }
  return best;
}

/** Grow a straight run around one segment. A bend stays out of the dock. */
function straightRun(walk, index) {
  const segs = walk.segs;
  const seed = segs[index].dir;
  let lo = index;
  let hi = index;
  while (lo > 0 && segs[lo - 1].dir.x * seed.x + segs[lo - 1].dir.z * seed.z >= ALIGN) lo -= 1;
  while (hi < segs.length - 1 && segs[hi + 1].dir.x * seed.x + segs[hi + 1].dir.z * seed.z >= ALIGN) hi += 1;
  return {
    ax: segs[lo].ax,
    az: segs[lo].az,
    bx: segs[hi].bx,
    bz: segs[hi].bz,
    half: walk.half,
    kind: walk.kind,
    walk,
  };
}

function runLen(run) {
  return Math.hypot(run.bx - run.ax, run.bz - run.az);
}

/**
 * @param {{ x: number, z: number, yaw: number, railLength?: number }} st
 * @param {{ walks: object[], roads: object[], crossings: object[] }} ctx
 * @returns {{ x: number, z: number, yaw: number, railLength: number } | null}
 */
export function seatStation(st, ctx) {
  const walks = ctx?.walks || [];
  if (!walks.length || !Number.isFinite(st.x) || !Number.isFinite(st.z)) return null;
  let best = null;
  for (const walk of walks) {
    const hit = nearestSeg(walk, st.x, st.z);
    if (!hit || hit.d > 6) continue;
    const rank = walk.kind === "sidewalk" || walk.kind === "footway" ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && hit.d < best.hit.d)) {
      best = { walk, hit, rank };
    }
  }
  if (!best) return null;

  const run = straightRun(best.walk, best.hit.i);
  const len = runLen(run);
  if (len < 2) return null;
  const tan = unit(run.bx - run.ax, run.bz - run.az);
  const on = closest({ ...run, len }, st.x, st.z);
  const left = { x: -tan.z, z: tan.x };
  const right = { x: tan.z, z: -tan.x };

  let street = null;
  let bestOpp = 1e9;
  for (const other of walks) {
    if (other === best.walk) continue;
    const o = nearestSeg(other, on.x, on.z);
    if (!o || o.d < 3.2 || o.d > 16) continue;
    const dir = unit(o.x - on.x, o.z - on.z);
    const side = dir.x * left.x + dir.z * left.z;
    if (Math.abs(side) < 0.55) continue;
    if (o.d < bestOpp) {
      bestOpp = o.d;
      street = side > 0 ? left : right;
    }
  }
  if (!street) {
    let bestRoad = 1e9;
    for (const road of ctx.roads || []) {
      const o = closest(road, on.x, on.z);
      if (o.d > 20 || o.d >= bestRoad) continue;
      bestRoad = o.d;
      const dir = unit(o.x - on.x, o.z - on.z);
      street = dir.x * left.x + dir.z * left.z >= 0 ? left : right;
    }
  }

  const half = run.half;
  let along = 0;
  if (street) {
    along = half - KERB_CLEAR - BIKE_REACH;
    along = Math.max(-(half - 0.25), Math.min(half - 0.25, along));
    if (run.kind === "pedestrian" && bestOpp > 16) along = 0;
  } else {
    street = left;
  }

  const mid = on.t * len;
  const want = st.railLength || 8;
  const margin = 0.35;
  const roomBefore = Math.max(0, mid - margin);
  const roomAfter = Math.max(0, len - mid - margin);
  // Stay at the published spot. A rail that would hang into the junction gets shorter.
  let rail = Math.min(want, 2 * Math.min(roomBefore, roomAfter));
  if (rail < MIN_RAIL) rail = Math.min(want, Math.max(2.4, len - margin * 2));

  const crosses = (halfLen, at) => {
    for (const s of [-1, 1]) {
      const x = run.ax + tan.x * (at + s * halfLen) + street.x * along;
      const z = run.az + tan.z * (at + s * halfLen) + street.z * along;
      if (closest({ ...run, len }, x, z).d > half + 0.35) return true;
      for (const road of ctx.roads || []) {
        if (distToSeg(road, x, z) < road.half + 0.35) return true;
      }
      for (const crossing of ctx.crossings || []) {
        const c = nearestSeg(crossing, x, z);
        if (c && c.d < 1.15) return true;
      }
      for (const other of walks) {
        if (other === best.walk) continue;
        const o = nearestSeg(other, x, z);
        if (o && o.d < 14 && o.d + 0.5 < closest({ ...run, len }, x, z).d) return true;
      }
    }
    return false;
  };

  const fit = (length) => {
    const lo = length * 0.5 + 0.2;
    const hi = len - length * 0.5 - 0.2;
    return hi >= lo ? Math.max(lo, Math.min(hi, mid)) : len * 0.5;
  };
  let at = fit(rail);
  while (rail > MIN_RAIL && crosses(rail * 0.5, at)) {
    rail -= 0.4;
    at = fit(rail);
  }

  const x = run.ax + tan.x * at + street.x * along;
  const z = run.az + tan.z * at + street.z * along;
  if (Math.hypot(x - st.x, z - st.z) > 8) return null;
  return {
    x,
    z,
    yaw: yawFacing(street),
    railLength: Math.round(rail * 100) / 100,
  };
}

/** Move every station that has a pavement to sit on. Returns how many moved. */
export function applyVeloSeats(stations, doc) {
  const ctx = fromRoadsDoc(doc);
  let n = 0;
  for (const st of stations || []) {
    const seat = seatStation(st, ctx);
    if (!seat) continue;
    const spacing = (Number(st.railLength) || 8) / Math.max(1, Number(st.capacity) || 20);
    st.x = seat.x;
    st.z = seat.z;
    st.yaw = seat.yaw;
    st.railLength = seat.railLength;
    if (st.capacity) {
      st.capacity = Math.max(2, Math.round(seat.railLength / Math.max(0.7, spacing)));
      if (st.bikesAvailable != null) st.bikesAvailable = Math.min(st.bikesAvailable, st.capacity);
    }
    n += 1;
  }
  return n;
}

/** Boxes for the rack a rider can see. Shared by the viewer and the seat test. */
export function rackPieces(st) {
  const yaw = st.yaw || 0;
  const tan = railAxis(yaw);
  const street = streetAxis(yaw);
  const length = st.railLength || 8;
  const half = length * 0.5;
  const posts = [];
  for (let d = -half + 0.5; d <= half - 0.3; d += 2.4) {
    posts.push({
      x: st.x + tan.x * d - street.x * 0.16,
      y: 0.48,
      z: st.z + tan.z * d - street.z * 0.16,
      sx: 0.07,
      sy: 0.96,
      sz: 0.07,
    });
  }
  return {
    yaw,
    beam: { x: st.x, y: 0.2, z: st.z, sx: length, sy: 0.22, sz: 0.5 },
    bar: {
      x: st.x - street.x * 0.16,
      y: 0.78,
      z: st.z - street.z * 0.16,
      sx: length,
      sy: 0.06,
      sz: 0.06,
    },
    totem: {
      x: st.x - tan.x * (half + 0.26),
      y: 0.95,
      z: st.z - tan.z * (half + 0.26),
      sx: 0.42,
      sy: 1.9,
      sz: 0.34,
    },
    posts,
  };
}

/** Collision box covering the rail and the bikes, centred between them. */
export function dockSolid(st) {
  const tan = railAxis(st.yaw);
  const street = streetAxis(st.yaw);
  const reach = BIKE_REACH * 0.5;
  return {
    pos: { x: st.x + street.x * reach, z: st.z + street.z * reach },
    tan,
    hl: (st.railLength || 8) * 0.5 + 0.55,
    hw: reach + 0.2,
  };
}
