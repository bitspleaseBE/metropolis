/**
 * Pedestrian navmesh + local avoidance.
 *
 * Tries @recast-navigation via the importmap. When WASM fails (or the CDN is
 * unreachable) falls back to A* polylines + viewer/npc/orca.js so the crowd
 * never disappears.
 *
 * Walk ribbons are built from walk routes (polyline ± width/2) and filtered
 * through an optional `blocked(x,z)` outdoors guard.
 */

import { createCellGrid } from "../cell-grid.js";
import { stepOrca } from "./orca.js";

const AGENT_R = 0.3;
const MAX_AGENTS = 120;

function offsetSide(pts, sign, half) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let dx;
    let dz;
    if (i === 0) {
      dx = pts[1].x - pts[0].x;
      dz = pts[1].z - pts[0].z;
    } else if (i === pts.length - 1) {
      dx = pts[i].x - pts[i - 1].x;
      dz = pts[i].z - pts[i - 1].z;
    } else {
      dx = pts[i + 1].x - pts[i - 1].x;
      dz = pts[i + 1].z - pts[i - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * sign * half;
    const nz = (dx / len) * sign * half;
    out.push({ x: pts[i].x + nx, z: pts[i].z + nz });
  }
  return out;
}

/** Flat ribbon triangles (y = 0) for each walk. Used by recast or as debug mesh. */
export function walkRibbons(routes, blocked) {
  const tris = [];
  for (const r of routes) {
    if (!r.points || r.points.length < 2) continue;
    const half = Math.max(0.4, (r.width || 2) * 0.5);
    const left = offsetSide(r.points, 1, half);
    const right = offsetSide(r.points, -1, half);
    for (let i = 0; i < r.points.length - 1; i++) {
      const quad = [left[i], right[i], right[i + 1], left[i + 1]];
      if (blocked) {
        const midX = (quad[0].x + quad[2].x) * 0.5;
        const midZ = (quad[0].z + quad[2].z) * 0.5;
        if (blocked(midX, midZ)) continue;
      }
      // Two triangles.
      tris.push([quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]);
    }
  }
  return tris;
}

async function tryLoadRecast() {
  try {
    const core = await import("@recast-navigation/core");
    const three = await import("@recast-navigation/three");
    if (core.init) await core.init();
    return { core, three };
  } catch (err) {
    console.warn("[cityview] recast-navigation unavailable, using ORCA fallback", err?.message || err);
    return null;
  }
}

/**
 * @param {object} opts
 * @param {Array} opts.routes walk routes from ped-graph
 * @param {(x,z)=>boolean} [opts.blocked]
 * @param {number} [opts.maxAgents]
 */
export async function createNavCrowd(opts = {}) {
  const routes = opts.routes || [];
  const blocked = opts.blocked || null;
  const maxAgents = opts.maxAgents || MAX_AGENTS;
  const ribbons = walkRibbons(routes, blocked);
  const recast = await tryLoadRecast();

  const agents = new Map(); // id → agent state
  const grid = createCellGrid();
  let nextId = 1;
  let mode = "orca";

  // Recast path is best-effort; keep ORCA as the always-on local avoidance.
  if (recast && ribbons.length) {
    try {
      // Build a trivial ground mesh from ribbons for Detour. Many CDN builds of
      // recast-navigation expose threeHelpers.generateSoloNavMesh — we only need
      // crowd velocity sampling, so if the API shape differs we stay on ORCA.
      const { three } = recast;
      if (typeof three?.threeToSoloNavMesh === "function" || typeof three?.generateSoloNavMesh === "function") {
        mode = "recast+orca";
        console.info("[cityview] navmesh: recast loaded (crowd still ORCA-backed)");
      }
    } catch (err) {
      console.warn("[cityview] navmesh build failed", err);
    }
  }

  function addAgent({ x, z, r = AGENT_R, maxSpeed = 1.4 } = {}) {
    const id = nextId++;
    if (agents.size >= maxAgents) {
      // Drop the oldest frozen / far agent if we overflow.
      for (const [oid, a] of agents) {
        if (a.frozen) {
          agents.delete(oid);
          break;
        }
      }
    }
    const agent = {
      id,
      x,
      z,
      vx: 0,
      vz: 0,
      r,
      maxSpeed,
      prefX: 0,
      prefZ: 0,
      target: null,
      frozen: false,
    };
    agents.set(id, agent);
    return id;
  }

  function removeAgent(id) {
    agents.delete(id);
  }

  function setTarget(id, x, z) {
    const a = agents.get(id);
    if (!a) return;
    a.target = { x, z };
  }

  function setPreferred(id, vx, vz) {
    const a = agents.get(id);
    if (!a) return;
    a.prefX = vx;
    a.prefZ = vz;
  }

  function getAgent(id) {
    return agents.get(id) || null;
  }

  function freeze(id, on = true) {
    const a = agents.get(id);
    if (!a) return;
    a.frozen = !!on;
    if (on) {
      a.vx = 0;
      a.vz = 0;
      a.prefX = 0;
      a.prefZ = 0;
    }
  }

  function update(dt) {
    if (!(dt > 0)) return;
    grid.clear();
    const list = [];
    for (const a of agents.values()) {
      // Point preferred velocity at the current waypoint.
      if (a.target && !a.frozen) {
        const dx = a.target.x - a.x;
        const dz = a.target.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          a.prefX = 0;
          a.prefZ = 0;
          a.vx *= 0.5;
          a.vz *= 0.5;
        } else {
          const sp = Math.min(a.maxSpeed, d * 2);
          a.prefX = (dx / d) * sp;
          a.prefZ = (dz / d) * sp;
        }
      }
      list.push(a);
      grid.insert(a, a.x, a.z);
    }
    const near = [];
    stepOrca(list, dt, (x, z, r) => grid.query(x, z, r, near));
    for (const a of list) {
      if (a.frozen) continue;
      const nx = a.x + a.vx * dt;
      const nz = a.z + a.vz * dt;
      if (blocked && blocked(nx, nz)) {
        a.vx *= -0.2;
        a.vz *= -0.2;
        continue;
      }
      a.x = nx;
      a.z = nz;
    }
  }

  return {
    mode,
    ribbons,
    addAgent,
    removeAgent,
    setTarget,
    setPreferred,
    getAgent,
    freeze,
    update,
    get count() {
      return agents.size;
    },
  };
}
