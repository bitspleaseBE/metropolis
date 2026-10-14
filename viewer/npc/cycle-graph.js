/**
 * Cycling / step network: driveable roads (kerb-side bike offset) plus exported
 * cycleways. Respects one-way except where a contraflow lane exists. Never uses
 * pedestrian walks or crossings — that is the walking-versus-cycling split.
 */

const SNAP_M = 14;
const BIKE_LANE_EXTRA = 1.45;
const KEEP_RIGHT = 0.22; // share of a two-way cycleway's width between its centre and a rider's line
const JOIN_M = 8;

const DRIVEABLE = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
]);

function blenderToThree(x, y) {
  return { x, z: -y };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function buildPath(id, kind, pointsBlender, { oneway = 0, width = 6, bikeOffset, contraflow = false } = {}) {
  const cleaned = [];
  for (const p of pointsBlender) {
    const q = Array.isArray(p) ? blenderToThree(p[0], p[1]) : p;
    if (!cleaned.length || dist(cleaned[cleaned.length - 1], q) > 0.05) cleaned.push(q);
  }
  if (cleaned.length < 2) return null;
  const cumulative = [0];
  let len = 0;
  for (let i = 1; i < cleaned.length; i++) {
    len += dist(cleaned[i - 1], cleaned[i]);
    cumulative.push(len);
  }
  if (len < 8) return null;
  return {
    id,
    kind,
    dir: oneway === 1 || oneway === -1 ? oneway : 0,
    contraflow: !!contraflow,
    width,
    bikeOffset: bikeOffset ?? Math.min(width * 0.48, 1.15 + BIKE_LANE_EXTRA),
    points: cleaned,
    cumulative,
    length: len,
    start: cleaned[0],
    end: cleaned[cleaned.length - 1],
  };
}

export function buildCyclePaths(roads, cycleways = []) {
  const paths = [];
  for (const road of roads || []) {
    const kind = String(road.kind || "residential").toLowerCase();
    if (!DRIVEABLE.has(kind)) continue;
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const carLane = Number.isFinite(road.laneOffset) ? road.laneOffset : 1.15;
    const width = road.width || 6;
    const bikeOffset = Math.min(width * 0.48, carLane + BIKE_LANE_EXTRA);
    const oneway = Number(road.oneway) || 0;
    if ((kind === "residential" || kind === "living_street" || kind === "unclassified") && pts.length) {
      // Length check after build.
    }
    const path = buildPath(String(road.id), kind, pts, { oneway, width, bikeOffset });
    if (!path) continue;
    if ((kind === "residential" || kind === "living_street" || kind === "unclassified") && path.length < 35) {
      continue;
    }
    paths.push(path);
  }
  for (const cw of cycleways || []) {
    const oneway = Number(cw.oneway) || 0;
    const width = cw.width || 2.4;
    const path = buildPath(String(cw.id), cw.kind || "cycleway", cw.points || [], {
      oneway,
      width,
      // One-way: ride the centreline. Ridden both ways: keep to the right half.
      bikeOffset: oneway && !cw.contraflow ? 0 : width * KEEP_RIGHT,
      contraflow: !!cw.contraflow,
    });
    if (path) paths.push(path);
  }
  return paths;
}

export function sampleCyclePath(path, s, outPos, outTan) {
  const distClamped = Math.max(0, Math.min(path.length, s));
  const cum = path.cumulative;
  let i = 1;
  while (i < cum.length && cum[i] < distClamped) i++;
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(path.points.length - 1, i);
  const segStart = cum[i0];
  const segLen = Math.max(1e-6, cum[i1] - segStart);
  const t = (distClamped - segStart) / segLen;
  const a = path.points[i0];
  const b = path.points[i1];
  outPos.x = a.x + (b.x - a.x) * t;
  outPos.z = a.z + (b.z - a.z) * t;
  outPos.y = 0;
  outTan.x = b.x - a.x;
  outTan.z = b.z - a.z;
  outTan.y = 0;
  const tl = Math.hypot(outTan.x, outTan.z);
  if (tl < 1e-8) {
    outTan.x = 1;
    outTan.z = 0;
  } else {
    outTan.x /= tl;
    outTan.z /= tl;
  }
}

export function applyBikeLane(path, travelTan, outPos) {
  if (!path.bikeOffset) return;
  outPos.x += -travelTan.z * path.bikeOffset;
  outPos.z += travelTan.x * path.bikeOffset;
}

export function buildCycleHandoffs(paths) {
  const tips = [];
  for (const path of paths) {
    tips.push({ path, atEnd: false, pos: path.start });
    tips.push({ path, atEnd: true, pos: path.end });
  }
  const links = new Map();
  for (let i = 0; i < tips.length; i++) {
    const a = tips[i];
    const cands = [];
    for (let j = 0; j < tips.length; j++) {
      if (i === j) continue;
      const b = tips[j];
      if (a.path === b.path) continue;
      if (dist(a.pos, b.pos) > SNAP_M) continue;
      const reverse = b.atEnd;
      // Respect one-way unless this path is a marked contraflow lane.
      if (b.path.dir === 1 && reverse && !b.path.contraflow) continue;
      if (b.path.dir === -1 && !reverse && !b.path.contraflow) continue;
      cands.push({ path: b.path, reverse, s: reverse ? b.path.length - 0.5 : 0.5 });
    }
    links.set(`${a.path.id}:${a.atEnd ? "e" : "s"}`, cands);
  }
  return links;
}

/**
 * A* over path tips. Nodes are "pathId:dir" (dir 0 = forward, 1 = reverse).
 * Cost is path length. Returns [{ path, reverse, s0, s1 }] or null.
 */
export function planCycleRoute(paths, handoffs, from, goal, { maxExpand = 400 } = {}) {
  // from / goal: { path, reverse, s }
  if (!from?.path || !goal?.path) return null;

  const keyOf = (path, reverse) => `${path.id}:${reverse ? 1 : 0}`;
  const startKey = keyOf(from.path, from.reverse);
  const goalKey = keyOf(goal.path, goal.reverse);

  // Same path: just ride along (possibly reverse).
  if (from.path === goal.path && from.reverse === goal.reverse) {
    return [{ path: from.path, reverse: from.reverse, s0: from.s, s1: goal.s }];
  }

  const open = new Map([[startKey, 0]]);
  const came = new Map();
  const gScore = new Map([[startKey, Math.abs(from.path.length - from.s)]]); // remaining on current
  let expands = 0;

  const tipKey = (path, atEnd) => `${path.id}:${atEnd ? "e" : "s"}`;

  while (open.size && expands++ < maxExpand) {
    let cur = null;
    let bestF = Infinity;
    for (const [k, f] of open) {
      if (f < bestF) {
        bestF = f;
        cur = k;
      }
    }
    open.delete(cur);
    if (cur === goalKey) break;

    const [pid, revStr] = cur.split(":");
    const reverse = revStr === "1";
    const path = paths.find((p) => String(p.id) === pid);
    if (!path) continue;
    const atEnd = !reverse; // travelling forward reaches the end tip
    const cands = handoffs.get(tipKey(path, atEnd)) || [];
    const gCur = gScore.get(cur) ?? Infinity;
    for (const c of cands) {
      const nk = keyOf(c.path, c.reverse);
      const step = c.path.length;
      const tent = gCur + step;
      if (tent >= (gScore.get(nk) ?? Infinity)) continue;
      came.set(nk, { prev: cur, hop: c });
      gScore.set(nk, tent);
      // Heuristic: crow-flies to goal tip.
      const tip = c.reverse ? c.path.start : c.path.end;
      const h = dist(tip, goal.reverse ? goal.path.start : goal.path.end);
      open.set(nk, tent + h);
    }
  }

  if (!came.has(goalKey) && startKey !== goalKey) {
    // Fallback: single hop toward goal path if handoff exists, else null.
    return null;
  }

  const hops = [];
  let k = goalKey;
  const chain = [];
  while (k !== startKey) {
    const step = came.get(k);
    if (!step) break;
    chain.push(step.hop);
    k = step.prev;
  }
  chain.reverse();

  // Compose segments.
  hops.push({
    path: from.path,
    reverse: from.reverse,
    s0: from.s,
    s1: from.reverse ? 0.5 : from.path.length - 0.5,
  });
  for (const hop of chain) {
    hops.push({
      path: hop.path,
      reverse: hop.reverse,
      s0: hop.s,
      s1: hop.reverse ? 0.5 : hop.path.length - 0.5,
    });
  }
  // Trim last hop to the goal s.
  if (hops.length) {
    const last = hops[hops.length - 1];
    if (last.path === goal.path && last.reverse === goal.reverse) last.s1 = goal.s;
    else {
      hops.push({ path: goal.path, reverse: goal.reverse, s0: goal.reverse ? goal.path.length - 0.5 : 0.5, s1: goal.s });
    }
  }
  return hops;
}

export function nearestCycleSpot(paths, x, z) {
  let best = null;
  const pos = { x: 0, y: 0, z: 0 };
  const tan = { x: 1, y: 0, z: 0 };
  for (const path of paths) {
    for (const reverse of path.dir === 0 ? [false, true] : path.dir === 1 ? [false] : [true]) {
      // Sample a few points.
      const steps = Math.max(2, Math.ceil(path.length / 25));
      for (let k = 0; k <= steps; k++) {
        const s = (path.length * k) / steps;
        sampleCyclePath(path, s, pos, tan);
        const tx = reverse ? -tan.x : tan.x;
        const tz = reverse ? -tan.z : tan.z;
        const px = pos.x;
        const pz = pos.z;
        // Apply lane offset for distance check.
        const lx = px + -tz * (path.bikeOffset || 0);
        const lz = pz + tx * (path.bikeOffset || 0);
        const d = Math.hypot(lx - x, lz - z);
        if (!best || d < best.dist) best = { path, reverse, s, dist: d, x: lx, z: lz };
      }
    }
  }
  return best;
}

export { SNAP_M, BIKE_LANE_EXTRA, DRIVEABLE, JOIN_M };
