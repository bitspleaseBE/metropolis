/**
 * Trip planning for NPCs: spawn → goal sized for ~2 real minutes (90–150 s).
 *
 * Goals: supermarket / convenience, other open shops, tram/bus stop, district
 * edge, or a random sidewalk node. Walkers cover ~110–190 m; cyclists 450 m+.
 */

const WALK_LIFE_S = [90, 150];
const WALK_DIST_M = [60, 160]; // district graphs are ~280 m radius
const BIKE_DIST_M = [200, 600];
const BIKE_LIFE_S = [90, 150];

const GROCERY = new Set(["supermarket", "convenience", "bakery", "butcher", "greengrocer"]);

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function randRange(a, b) {
  return lerp(a, b, Math.random());
}
function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** Shop open right now? hours is [[], Mon, Tue, ...] each [[open, close], ...]. */
export function shopOpen(shop, hour, day = 5) {
  const hours = shop.hours;
  if (!hours || !Array.isArray(hours)) return true;
  const dayHours = hours[day] || hours[(day % 7) + 1] || [];
  if (!dayHours.length) return shop.hoursKnown === false; // unknown → treat as open
  const h = ((hour % 24) + 24) % 24;
  return dayHours.some(([a, b]) => h >= a && h < b);
}

/**
 * Build POI lists from shops.json + transit.json (Blender XY → Three XZ).
 */
export function collectPois({ shops = [], stops = [], edges = [], pedGraph = null } = {}) {
  const list = [];
  for (const s of shops) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    list.push({
      type: GROCERY.has(s.kind) ? "grocery" : "shop",
      kind: s.kind,
      name: s.name,
      x: s.x,
      z: -s.y,
      hours: s.hours,
      hoursKnown: s.hoursKnown,
      shop: s,
    });
  }
  for (const st of stops) {
    if (!Number.isFinite(st.x) || !Number.isFinite(st.y)) continue;
    list.push({
      type: "stop",
      kind: st.mode || "tram",
      name: st.name,
      x: st.x,
      z: -st.y,
      stop: st,
    });
  }
  for (const e of edges) {
    list.push({
      type: "edge",
      kind: e.side || "edge",
      name: e.label || "edge",
      x: e.x,
      z: e.z,
    });
  }
  // Snap each POI to nearest ped-graph node when available.
  if (pedGraph) {
    for (const p of list) {
      const n = pedGraph.nearestNode(p.x, p.z);
      if (n.nodeIdx >= 0) {
        p.nodeIdx = n.nodeIdx;
        p.snapDist = n.dist;
        p.sx = pedGraph.nodes[n.nodeIdx].x;
        p.sz = pedGraph.nodes[n.nodeIdx].z;
      }
    }
  }
  return list;
}

function goalWeights(hour) {
  const h = ((hour % 24) + 24) % 24;
  const day = h >= 7 && h < 19;
  return {
    grocery: day ? 28 : 8,
    shop: day ? 18 : 6,
    stop: 22,
    edge: 14,
    random: 18,
  };
}

/**
 * @param {object} opts
 * @param {object} opts.pedGraph
 * @param {Array} opts.pois
 * @param {number} opts.hour
 * @param {number} opts.day
 * @param {'walk'|'bike'|'bakfiets'|'step'} opts.mode
 * @param {{x,z}} [opts.from] preferred spawn; otherwise random sidewalk node
 * @param {{x,z}} [opts.camera] avoid spawning near camera
 */
export function planTrip(opts = {}) {
  const { pedGraph, pois = [], hour = 12, day = 5, mode = "walk", from = null, camera = null } = opts;
  if (!pedGraph?.nodes?.length) return null;

  const isBike = mode === "bike" || mode === "bakfiets" || mode === "step";
  const [d0, d1] = isBike ? BIKE_DIST_M : WALK_DIST_M;
  const [t0, t1] = isBike ? BIKE_LIFE_S : WALK_LIFE_S;
  const targetDist = randRange(d0, d1);
  const lifetime = randRange(t0, t1);

  const safeNodes = pedGraph.nodes.filter((_, i) => {
    // Prefer nodes that touch a non-crossing edge.
    return pedGraph.nodes[i].edges.some((eid) => pedGraph.edges[eid].kind !== "crossing");
  });
  const pool = safeNodes.length ? safeNodes : pedGraph.nodes;

  function farFromCam(n) {
    if (!camera) return true;
    return dist(n.x, n.z, camera.x, camera.z) > 40;
  }

  let startNode = null;
  if (from) {
    const n = pedGraph.nearestNode(from.x, from.z);
    if (n.nodeIdx >= 0) startNode = pedGraph.nodes[n.nodeIdx];
  }
  if (!startNode) {
    // Prefer POI doors / stops as spawn (people leaving a shop / getting off a tram).
    const spawnPois = pois.filter((p) => (p.type === "shop" || p.type === "grocery" || p.type === "stop") && p.nodeIdx != null);
    const candidates = spawnPois.length
      ? spawnPois.map((p) => pedGraph.nodes[p.nodeIdx]).filter(Boolean)
      : pool;
    const far = candidates.filter(farFromCam);
    const pick = far.length ? far : candidates;
    startNode = pick[(Math.random() * pick.length) | 0];
  }
  if (!startNode) return null;

  const weights = goalWeights(hour);
  let goalType = "random";
  {
    let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) {
        goalType = k;
        break;
      }
    }
  }

  let goalPoi = null;
  let goalNode = null;

  const match = (p) => {
    if (p.nodeIdx == null) return false;
    if (p.type === "shop" || p.type === "grocery") {
      if (!shopOpen(p, hour, day)) return false;
    }
    const d = dist(startNode.x, startNode.z, p.sx ?? p.x, p.sz ?? p.z);
    return d >= targetDist * 0.45 && d <= targetDist * 1.6;
  };

  if (goalType === "grocery") {
    const cands = pois.filter((p) => p.type === "grocery" && match(p));
    if (cands.length) goalPoi = cands[(Math.random() * cands.length) | 0];
  } else if (goalType === "shop") {
    const cands = pois.filter((p) => (p.type === "shop" || p.type === "grocery") && match(p));
    if (cands.length) goalPoi = cands[(Math.random() * cands.length) | 0];
  } else if (goalType === "stop") {
    const cands = pois.filter((p) => p.type === "stop" && match(p));
    if (cands.length) goalPoi = cands[(Math.random() * cands.length) | 0];
  } else if (goalType === "edge") {
    const cands = pois.filter((p) => p.type === "edge" && match(p));
    if (cands.length) goalPoi = cands[(Math.random() * cands.length) | 0];
  }

  if (goalPoi) {
    goalNode = pedGraph.nodes[goalPoi.nodeIdx];
  }

  if (!goalNode) {
    // Random node at roughly the target distance.
    let best = null;
    for (let k = 0; k < 24; k++) {
      const n = pool[(Math.random() * pool.length) | 0];
      if (n === startNode) continue;
      const d = dist(startNode.x, startNode.z, n.x, n.z);
      const err = Math.abs(d - targetDist);
      if (!best || err < best.err) best = { n, err, d };
    }
    goalNode = best?.n || pool[(Math.random() * pool.length) | 0];
    goalType = "random";
  }

  const path = pedGraph.route(startNode.id, goalNode.id);
  if (!path || path.length < 5) {
    // Unreachable: try a nearby random node (district graphs are small — accept ≥8 m).
    for (let k = 0; k < 16; k++) {
      const n = pool[(Math.random() * pool.length) | 0];
      const alt = pedGraph.route(startNode.id, n.id);
      if (alt && alt.length >= 8) {
        return {
          mode,
          start: { x: startNode.x, z: startNode.z, nodeIdx: startNode.id },
          goal: { x: n.x, z: n.z, nodeIdx: n.id, type: "random" },
          path: alt,
          lifetime,
          age: 0,
        };
      }
    }
    return null;
  }

  return {
    mode,
    start: { x: startNode.x, z: startNode.z, nodeIdx: startNode.id },
    goal: {
      x: goalNode.x,
      z: goalNode.z,
      nodeIdx: goalNode.id,
      type: goalPoi?.type || goalType,
      poi: goalPoi || null,
    },
    path,
    lifetime,
    age: 0,
  };
}

export { WALK_LIFE_S, WALK_DIST_M, BIKE_DIST_M, BIKE_LIFE_S };
