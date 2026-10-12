/**
 * Pedestrian junction graph + A* on roads.json walks.
 *
 * Nodes are walk endpoints (and mid-splits on long sidewalks). Edges carry kind
 * and length. Crossings cost more; signalised crossings add an expected wait.
 * Off-zebra jaywalking is not modelled — only exported crossing links connect
 * opposite kerbs.
 */

const JOIN_M = 5.0;
const SPLIT_M = 20.0;
const CROSS_EXTRA_M = 25.0;
const SIGNAL_WAIT_M = 12.0; // expected wait expressed as equivalent metres

const KIND_COST = {
  sidewalk: 1.0,
  footway: 0.9,
  path: 0.9,
  pedestrian: 0.95,
  steps: 1.15,
  crossing: 1.0,
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1]);
  return len;
}

function samplePolyline(pts, s) {
  let cum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = dist(pts[i], pts[i + 1]);
    if (s <= cum + seg + 1e-6) {
      const t = seg > 0 ? (s - cum) / seg : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        z: pts[i].z + (pts[i + 1].z - pts[i].z) * t,
        tx: (pts[i + 1].x - pts[i].x) / (seg || 1),
        tz: (pts[i + 1].z - pts[i].z) / (seg || 1),
        s,
      };
    }
    cum += seg;
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || last;
  const seg = dist(prev, last) || 1;
  return { x: last.x, z: last.z, tx: (last.x - prev.x) / seg, tz: (last.z - prev.z) / seg, s: cum };
}

/** Blender XY walks → Three XZ ({ x, z }). */
export function walksToRoutes(walks) {
  const routes = [];
  for (const w of walks || []) {
    const pts = (w.points || [])
      .map((p) => ({ x: p[0], z: -p[1] }))
      .filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 0.05);
    if (pts.length < 2) continue;
    const length = polylineLength(pts);
    if (w.kind !== "crossing" && length < 5) continue;
    routes.push({
      id: w.id,
      kind: w.kind || "sidewalk",
      safe: w.safe !== false,
      signal: !!w.signal,
      side: w.side || null,
      width: Number(w.width) > 0 ? Number(w.width) : 2.0,
      points: pts,
      length,
    });
  }
  return routes;
}

/**
 * Build a junction graph from walk routes.
 * @returns {{ nodes, edges, routes, nearestNode, route }}
 */
export function buildPedGraph(routes, { joinM = JOIN_M, splitM = SPLIT_M } = {}) {
  const nodes = [];
  const nodeAt = []; // per-route: [{ s, nodeIdx }, ...] along the polyline

  function findOrAdd(x, z) {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - x, nodes[i].z - z) <= joinM) return i;
    }
    const idx = nodes.length;
    nodes.push({ id: idx, x, z, edges: [] });
    return idx;
  }

  for (let ri = 0; ri < routes.length; ri++) {
    const r = routes[ri];
    const stamps = [{ s: 0 }];
    if (r.kind !== "crossing" && r.length > splitM * 1.5) {
      const n = Math.max(1, Math.floor(r.length / splitM));
      for (let k = 1; k < n; k++) stamps.push({ s: (r.length * k) / n });
    }
    stamps.push({ s: r.length });
    const along = [];
    for (const st of stamps) {
      const p = samplePolyline(r.points, st.s);
      const ni = findOrAdd(p.x, p.z);
      along.push({ s: st.s, nodeIdx: ni });
    }
    nodeAt[ri] = along;
  }

  const edges = [];
  function link(a, b, meta) {
    const e = {
      id: edges.length,
      a,
      b,
      ...meta,
      cost: edgeCost(meta),
    };
    edges.push(e);
    nodes[a].edges.push(e.id);
    nodes[b].edges.push(e.id);
  }

  for (let ri = 0; ri < routes.length; ri++) {
    const r = routes[ri];
    const along = nodeAt[ri];
    for (let i = 0; i < along.length - 1; i++) {
      const a = along[i];
      const b = along[i + 1];
      if (a.nodeIdx === b.nodeIdx) continue;
      const len = Math.max(0.05, b.s - a.s);
      link(a.nodeIdx, b.nodeIdx, {
        routeIdx: ri,
        routeId: r.id,
        kind: r.kind,
        signal: r.signal,
        length: len,
        s0: a.s,
        s1: b.s,
      });
    }
  }

  function nearestNode(x, z, filter) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (filter && !filter(nodes[i], i)) continue;
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { nodeIdx: best, dist: bestD };
  }

  function nearestOnRoute(x, z) {
    let best = null;
    for (let ri = 0; ri < routes.length; ri++) {
      const r = routes[ri];
      if (r.kind === "crossing") continue;
      let cum = 0;
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i];
        const b = r.points[i + 1];
        const seg = dist(a, b) || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (seg * seg)));
        const px = a.x + (b.x - a.x) * t;
        const pz = a.z + (b.z - a.z) * t;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.dist) {
          best = { routeIdx: ri, s: cum + seg * t, x: px, z: pz, dist: d, kind: r.kind };
        }
        cum += seg;
      }
    }
    return best;
  }

  /**
   * A* from node `start` to node `goal`. Returns { nodes, edges, length, cost }
   * or null when unreachable.
   */
  function route(start, goal) {
    if (start < 0 || goal < 0 || start >= nodes.length || goal >= nodes.length) return null;
    if (start === goal) return { nodes: [start], edges: [], length: 0, cost: 0 };

    const open = new Map([[start, 0]]);
    const came = new Map(); // node → { prev, edgeId }
    const gScore = new Map([[start, 0]]);
    const fScore = new Map([[start, dist(nodes[start], nodes[goal])]]);

    while (open.size) {
      let cur = -1;
      let bestF = Infinity;
      for (const [n, f] of open) {
        if (f < bestF) {
          bestF = f;
          cur = n;
        }
      }
      open.delete(cur);
      if (cur === goal) break;
      const gCur = gScore.get(cur) ?? Infinity;
      for (const eid of nodes[cur].edges) {
        const e = edges[eid];
        const next = e.a === cur ? e.b : e.a;
        const tent = gCur + e.cost;
        if (tent >= (gScore.get(next) ?? Infinity)) continue;
        came.set(next, { prev: cur, edgeId: eid });
        gScore.set(next, tent);
        const f = tent + dist(nodes[next], nodes[goal]);
        fScore.set(next, f);
        open.set(next, f);
      }
    }
    if (!came.has(goal) && start !== goal) return null;

    const pathNodes = [goal];
    const pathEdges = [];
    let n = goal;
    while (n !== start) {
      const step = came.get(n);
      if (!step) return null;
      pathEdges.push(step.edgeId);
      n = step.prev;
      pathNodes.push(n);
    }
    pathNodes.reverse();
    pathEdges.reverse();
    let length = 0;
    let cost = 0;
    for (const eid of pathEdges) {
      length += edges[eid].length;
      cost += edges[eid].cost;
    }
    return { nodes: pathNodes, edges: pathEdges, length, cost };
  }

  /** Waypoints along an A* result, usable as DetourCrowd / ORCA targets. */
  function waypoints(path) {
    if (!path?.nodes?.length) return [];
    return path.nodes.map((ni) => ({ x: nodes[ni].x, z: nodes[ni].z, nodeIdx: ni }));
  }

  /** Follow path: position at arc distance `s` along the edge chain. */
  function samplePath(path, s) {
    if (!path?.edges?.length) {
      const n = nodes[path?.nodes?.[0] ?? 0];
      return { x: n.x, z: n.z, tx: 1, tz: 0, edgeIdx: 0, done: true };
    }
    let rem = Math.max(0, s);
    for (let i = 0; i < path.edges.length; i++) {
      const e = edges[path.edges[i]];
      if (rem <= e.length + 1e-4) {
        const t = e.length > 0 ? rem / e.length : 0;
        const a = nodes[e.a];
        const b = nodes[e.b];
        // Orient along travel (from path.nodes[i] toward path.nodes[i+1]).
        const from = path.nodes[i];
        const forward = from === e.a;
        const ax = forward ? a.x : b.x;
        const az = forward ? a.z : b.z;
        const bx = forward ? b.x : a.x;
        const bz = forward ? b.z : a.z;
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        return {
          x: ax + dx * t,
          z: az + dz * t,
          tx: dx / len,
          tz: dz / len,
          edgeIdx: i,
          edge: e,
          done: false,
          kind: e.kind,
          signal: e.signal,
          routeId: e.routeId,
        };
      }
      rem -= e.length;
    }
    const last = nodes[path.nodes[path.nodes.length - 1]];
    return { x: last.x, z: last.z, tx: 1, tz: 0, edgeIdx: path.edges.length - 1, done: true };
  }

  return {
    nodes,
    edges,
    routes,
    nearestNode,
    nearestOnRoute,
    route,
    waypoints,
    samplePath,
    joinM,
  };
}

function edgeCost(meta) {
  const mult = KIND_COST[meta.kind] ?? 1.0;
  let c = meta.length * mult;
  if (meta.kind === "crossing") {
    c += CROSS_EXTRA_M;
    if (meta.signal) c += SIGNAL_WAIT_M;
  }
  return c;
}

export { JOIN_M, SPLIT_M, samplePolyline, polylineLength, dist as pedDist };
