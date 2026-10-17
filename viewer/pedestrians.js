/**
 * Pedestrian simulation: households of Rocketbox people (./people.js) on real sidewalk /
 * footway routes. Out-of-sight groups are re-dressed now and then, so people streaming in
 * show up on the street. Falls back to capsule stand-ins if the people fail to load.
 *
 * Routes come from ``roads.json`` → ``walks`` (kerb-side sidewalk ribbons, OSM
 * footways, and short crossing links at zebras). People follow a path, continue
 * onto a connected walk at junctions, and only reverse on a dead end. They spawn
 * on safe walks and only use ``crossing`` links when the graph offers no other
 * forward option. At signalised crossings they wait on the kerb until
 * ``setCrossingGate`` says the ped light is green. Lateral offset stays on the pavement.
 *
 * Walk playback changes also update viewer/movement.html.
 * See .cursor/rules/movement-gallery.mdc.
 */
import { createPeoplePool } from "./people.js";
import { createIphone, disposeIphone, gripIphone } from "./iphone.js";
import { ADULT_M } from "./person-scale.js";
import { fetchJsonCached } from "./json-cache.js";
import { walksToRoutes, buildPedGraph } from "./npc/ped-graph.js";
import { collectPois, planTrip } from "./npc/trips.js";
import {
  STREET_MPS,
  STROLL_MPS,
  buildMarkets,
  claimStall,
  marketAt,
  releasePerson,
  stepVisitor,
} from "./npc/market.js";
import { assignTrip, advanceTrip } from "./npc/ped-trip.js";
import { createPopulation } from "./npc/population.js";
import {
  KNIFE_COOLDOWN,
  KNIFE_DAMAGE,
  approach,
  classifyShot,
  fleeVector,
} from "./crowd-react.js";

/** Resolve at fetch time — import runs before district-boot's ready() may upgrade base. */
function roadsUrl() {
  return (
    (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("roads.json")) ||
    "./roads.json"
  );
}
const JOIN_M = 5.0; // endpoints this close are the same junction
const LATERAL_M = 0.22; // stay inside a 2 m sidewalk, prefer the building half
const SAFE_KINDS = new Set(["sidewalk", "footway", "path", "pedestrian", "steps"]);
const MIN_SPAWN_M = 28; // short stubs only produce U-turn ping-pong
const KNOCK_SPEED = 1.8;
const SLIDE_DECEL = 5.5;
const GET_UP_S = 1.4; // stand-ins without a rig just tip back up
const FALL_BLEND_S = 0.3; // walk → face-down pose while thrown
const RECOVER_S = 0.45; // end of the scramble → walking again
// Health lost per m/s of impact above KNOCK_SPEED: a full-speed scooter hit (7.6 m/s) kills,
// half speed knocks someone down and a second hit finishes them.
const HIT_DAMAGE = 22;
const FRAILTY = { child: 0.85, senior: 0.75 };
const BODY_CLEAR_S = 20; // a body may be cleared away once out of sight this long after death
const MAX_BODIES = 4; // cap visible dead bodies; oldest force-cleared for redress
const REDRESS_EVERY_S = 2.5;
const REDRESS_HIDDEN_M = 28; // out of view and at least this far from the camera
const REDRESS_FAR_M = 90; // or simply this far away
const HOT_M = 55; // full anim + height sample
const WARM_M = 110; // half-rate mixer, fixed pavement height
const COLD_M = 180; // hide mesh, kinematics only
const INDOOR_CHECK_M = 0.6; // re-test the footprint blocker after this much walking
const SPLIT_STEP_M = 1.0; // indoor sampling step along a route
const PAVEMENT_Y = 0.12; // sidewalk default when we skip groundAt raycasts
const PED_R = 0.32; // body radius for car / bus avoidance
const CAR_LOOK_M = 2.8; // steer around a vehicle this far ahead on the path
// Prefer sidewalks near arrival / camera so border handoffs still show a crowd.
const NEAR_SPAWN_M = 95;
const NEAR_SPAWN_FALLBACK_M = 165;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Push `pos` out of an oriented vehicle box (same math as props-collide). */
function pushBox(pos, cx, cz, ax, az, hl, hw, r) {
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const a = dx * ax + dz * az;
  const b = dx * -az + dz * ax;
  const pa = hl + r - Math.abs(a);
  const pb = hw + r - Math.abs(b);
  if (pa <= 0 || pb <= 0) return false;
  // Prefer the shallow axis so walkers slide around the long side of a car.
  if (pa < pb) {
    const s = Math.sign(a) || 1;
    pos.x += ax * pa * s;
    pos.z += az * pa * s;
  } else {
    const s = Math.sign(b) || 1;
    pos.x += -az * pb * s;
    pos.z += ax * pb * s;
  }
  return true;
}

function vehicleOverlaps(x, z, v, r) {
  const dx = x - v.pos.x;
  const dz = z - v.pos.z;
  const reach = (v.hl || 2) + r;
  if (dx * dx + dz * dz > reach * reach) return false;
  const len = Math.hypot(v.tan.x, v.tan.z) || 1;
  const ax = v.tan.x / len;
  const az = v.tan.z / len;
  const a = dx * ax + dz * az;
  const b = dx * -az + dz * ax;
  return Math.abs(a) < (v.hl || 2) + r && Math.abs(b) < (v.hw || 0.9) + r;
}

export async function createPedestrians(scene, THREE, opts = {}) {
  const COUNT = opts.count || 40;
  const FIRST = Math.min(COUNT, opts.firstCount ?? COUNT);
  const SPAWN_CENTER = opts.spawnCenter || { x: -218.5, z: -432.1 };
  // Hoisted: crowdFocus / spawnGroup run before the redress block further down.
  const camera = opts.camera || null;
  const WALK_SPEED = STREET_MPS; // purposeful street pace; markets stroll slower
  const BOBBLE_AMP = 0.02;
  const BOBBLE_FREQ = 9.0;
  const population = createPopulation(opts.district || (typeof window !== "undefined" && window.__DISTRICT) || {});
  let gameHour = Number.isFinite(opts.hour) ? opts.hour : 12;
  let gameDay = Number.isFinite(opts.day) ? opts.day : 5;
  // Same raycast helper as scooters/shops: pavement ~0.12 m, road ~0.
  // Prefer a cheap constant for far people — full-scene raycasts were ~2× per ped per frame.
  const groundAt = typeof opts.groundAt === "function" ? opts.groundAt : () => 0;
  // Nearby people sample the mesh (pavement ~0.12, road ~0.04). A miss on a
  // sidewalk still stands on the pavement; crossings stay at street level.
  const footY = (x, z, baseY = 0, precise = true, kind = "sidewalk") => {
    const onStreet = kind === "crossing";
    let h;
    if (!precise) h = onStreet ? 0 : PAVEMENT_Y;
    else {
      const sampled = groundAt(x, z);
      h = sampled > 0.02 ? sampled : onStreet ? 0 : PAVEMENT_Y;
    }
    return h + baseY;
  };
  let _lodParity = 0;

  const walks = opts.walks || (await loadWalks());
  const markets = buildMarkets(opts.markets || (await loadMarkets()));
  const walkRoutes = buildWalkRoutes(walks, SPAWN_CENTER);
  const graph = buildGraph(walkRoutes);
  // A* trip graph (npc/ped-graph) — same walks, richer routing + POI goals.
  let pedGraph = buildPedGraph(walksToRoutes(walks));
  let shopList = [];
  let stopList = [];
  let pois = [];
  try {
    const [shopsRes, transitRes] = await Promise.all([
      fetchJsonCached(
        (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("shops.json")) ||
          "./shops.json",
      ),
      fetchJsonCached(
        (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("transit.json")) ||
          "./transit.json",
      ),
    ]);
    const shopsDoc = shopsRes.ok ? await shopsRes.json() : { shops: [] };
    const transitDoc = transitRes.ok ? await transitRes.json() : { stops: [] };
    shopList = shopsDoc.shops || [];
    stopList = transitDoc.stops || [];
    pois = collectPois({ shops: shopList, stops: stopList, pedGraph });
  } catch (err) {
    console.warn("[cityview] pedestrians: POI load failed", err);
  }
  let pool = null;
  try {
    pool = await createPeoplePool(THREE, {
      ...(opts.people || {}),
      districtId: opts.district?.id || opts.people?.districtId || "",
    });
  } catch (err) {
    console.warn("[cityview] people unavailable, using stand-ins", err);
  }
  /** `(routeId) => boolean` — false means wait at the kerb (red ped light). */
  let crossingOk = () => true;
  /** `() => [{ pos:{x,z}, tan:{x,z}, hl, hw }]` — parked + moving cars / buses / trams. */
  let vehicleProvider = () => [];
  const _avoidPos = { x: 0, z: 0 };

  function pushOutOfVehicles(pos, r = PED_R) {
    const vehicles = vehicleProvider();
    if (!vehicles?.length) return false;
    let hit = false;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v?.pos || !v.tan) continue;
      const dx = pos.x - v.pos.x;
      const dz = pos.z - v.pos.z;
      const reach = (v.hl || 2) + r;
      if (dx * dx + dz * dz > reach * reach) continue;
      const len = Math.hypot(v.tan.x, v.tan.z) || 1;
      hit = pushBox(pos, v.pos.x, v.pos.z, v.tan.x / len, v.tan.z / len, v.hl || 2, v.hw || 0.9, r) || hit;
    }
    return hit;
  }

  /**
   * If a car sits on the path ahead, ease a lateral steer so the walker goes around
   * instead of pressing into the bumper until the OBB push slides them.
   */
  function steerAroundVehicles(m, hx, hz) {
    const vehicles = vehicleProvider();
    if (!vehicles?.length) {
      m.carSteerX = (m.carSteerX || 0) * 0.85;
      m.carSteerZ = (m.carSteerZ || 0) * 0.85;
      return;
    }
    const fl = Math.hypot(hx, hz) || 1;
    const fx = hx / fl;
    const fz = hz / fl;
    const lx = -fz;
    const lz = fx;
    const ax = (m.routeX || m.mesh.position.x) + fx * CAR_LOOK_M;
    const az = (m.routeZ || m.mesh.position.z) + fz * CAR_LOOK_M;
    let wantX = 0;
    let wantZ = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (!v?.pos || !v.tan) continue;
      const here = vehicleOverlaps(m.routeX || m.mesh.position.x, m.routeZ || m.mesh.position.z, v, PED_R);
      const ahead = vehicleOverlaps(ax, az, v, PED_R + 0.2);
      if (!here && !ahead) continue;
      // Walk to the clearer flank of the car (relative to travel).
      const dx = (m.routeX || m.mesh.position.x) - v.pos.x;
      const dz = (m.routeZ || m.mesh.position.z) - v.pos.z;
      const side = dx * lx + dz * lz;
      const sign = side >= 0 ? 1 : -1;
      const clear = (v.hw || 0.9) + PED_R + 0.35;
      wantX += lx * sign * clear;
      wantZ += lz * sign * clear;
    }
    if (wantX || wantZ) {
      // Cap steer so they stay near the pavement ribbon.
      const w = Math.hypot(wantX, wantZ) || 1;
      const cap = 1.6;
      if (w > cap) {
        wantX = (wantX / w) * cap;
        wantZ = (wantZ / w) * cap;
      }
      m.carSteerX = (m.carSteerX || 0) * 0.7 + wantX * 0.3;
      m.carSteerZ = (m.carSteerZ || 0) * 0.7 + wantZ * 0.3;
    } else {
      m.carSteerX = (m.carSteerX || 0) * 0.85;
      m.carSteerZ = (m.carSteerZ || 0) * 0.85;
      if (Math.abs(m.carSteerX) < 0.02) m.carSteerX = 0;
      if (Math.abs(m.carSteerZ) < 0.02) m.carSteerZ = 0;
    }
  }

  /** Apply steer + hard OBB push so the mesh never sits inside a car. */
  function applyVehicleAvoidance(m, hx, hz) {
    steerAroundVehicles(m, hx, hz);
    _avoidPos.x = m.mesh.position.x + (m.carSteerX || 0);
    _avoidPos.z = m.mesh.position.z + (m.carSteerZ || 0);
    pushOutOfVehicles(_avoidPos, PED_R);
    m.mesh.position.x = _avoidPos.x;
    m.mesh.position.z = _avoidPos.z;
    // Face along the path, with a nudge toward the bypass when steering hard.
    const sx = m.carSteerX || 0;
    const sz = m.carSteerZ || 0;
    if (sx * sx + sz * sz > 0.04) {
      const fx = hx + sx * 0.35;
      const fz = hz + sz * 0.35;
      if (fx * fx + fz * fz > 1e-4) m.mesh.rotation.y = Math.atan2(fx, fz);
    }
  }

  const PROFILES = [
    {
      label: "family",
      spread: 2.2,
      members: [
        { bodyColor: 0x3a5068, legColor: 0x2a3040, topColor: 0x5a7a9a, scale: 1.05, hairColor: 0x3a2a1a },
        { bodyColor: 0x6a5a78, legColor: 0x3a4050, topColor: 0x9a7a8a, scale: 0.95, hairColor: 0x5a3a2a },
        { bodyColor: 0x4a6a8a, legColor: 0x304060, topColor: 0x7aaa6a, scale: 0.65, hairColor: 0xc4a040 },
        { bodyColor: 0x5a5a6a, legColor: 0x3a3a4a, topColor: 0xaa8a6a, scale: 0.55, hairColor: 0xc4a040 },
      ],
    },
    {
      label: "couple",
      spread: 1.4,
      members: [
        { bodyColor: 0x5a4a6a, legColor: 0x303848, topColor: 0x8a6a9a, scale: 1.0, hairColor: 0x1a0a0a },
        { bodyColor: 0x4a6a5a, legColor: 0x384048, topColor: 0x6a9a7a, scale: 0.95, hairColor: 0x8a6a3a },
      ],
    },
    {
      label: "single",
      spread: 0,
      members: [{ bodyColor: 0x6a5a4a, legColor: 0x3a4048, topColor: 0x9a7a5a, scale: 1.0, hairColor: 0x4a3a2a }],
    },
    {
      label: "group",
      spread: 2.8,
      members: [
        { bodyColor: 0x4a5a7a, legColor: 0x2a3848, topColor: 0x6a8aaa, scale: 1.05, hairColor: 0x2a1a0a },
        { bodyColor: 0x6a4a5a, legColor: 0x384050, topColor: 0x9a6a8a, scale: 0.95, hairColor: 0x8a5a3a },
        { bodyColor: 0x5a6a4a, legColor: 0x384840, topColor: 0x8a9a6a, scale: 1.0, hairColor: 0xc4a040 },
      ],
    },
    {
      label: "elderly",
      spread: 0.8,
      members: [
        { bodyColor: 0x6a6a78, legColor: 0x3a4048, topColor: 0x9a9aa8, scale: 0.9, hairColor: 0x8a8a8a },
        { bodyColor: 0x7a6a6a, legColor: 0x404848, topColor: 0xaa8a8a, scale: 0.9, hairColor: 0x9a8a7a },
      ],
    },
  ];

  function makeProceduralHumanoid(profile, groupId, memberIdx) {
    const group = new THREE.Group();
    group.userData = { groupId, memberIdx, baseY: 0, mixamo: false };
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), mat(profile.bodyColor));
    torso.position.y = 0.75;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat(0xd4a882));
    head.position.y = 1.15;
    group.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 4),
      new THREE.MeshLambertMaterial({ color: profile.hairColor || 0x3a2a1a })
    );
    hair.position.y = 1.28;
    group.add(hair);

    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 4, 6), mat(profile.legColor));
      leg.position.set(sx, 0.32, 0);
      group.add(leg);
    }
    for (const sx of [-0.25, 0.25]) {
      const arm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.04, 0.45, 4, 6),
        mat(profile.armColor || profile.topColor)
      );
      arm.position.set(sx, 0.74, 0);
      group.add(arm);
    }
    const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.1, 4, 6), mat(profile.topColor));
    top.position.set(0, 0.85, 0.05);
    group.add(top);

    group.scale.setScalar(profile.scale);
    return group;
  }

  function makePerson(template, groupId, memberIdx) {
    const inst = pool.instance(template);
    inst.root.userData = {
      groupId,
      memberIdx,
      baseY: inst.root.position.y,
      mixamo: true,
      mixer: inst.mixer,
      action: inst.action,
      person: inst,
    };
    return inst.root;
  }

  function routePosition(route, s) {
    const pts = route.points;
    let cum = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dz = pts[i + 1].z - pts[i].z;
      const segLen = Math.hypot(dx, dz);
      if (s <= cum + segLen + 0.01) {
        const t = segLen > 0 ? (s - cum) / segLen : 0;
        const tx = dx / (segLen || 1);
        const tz = dz / (segLen || 1);
        return { x: pts[i].x + dx * t, z: pts[i].z + dz * t, idx: i, t, tx, tz };
      }
      cum += segLen;
    }
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2] || last;
    const dx = last.x - prev.x;
    const dz = last.z - prev.z;
    const segLen = Math.hypot(dx, dz) || 1;
    return { x: last.x, z: last.z, idx: pts.length - 2, t: 1, tx: dx / segLen, tz: dz / segLen };
  }

  function routeLength(route) {
    let len = 0;
    for (let i = 0; i < route.points.length - 1; i++) {
      len += Math.hypot(route.points[i + 1].x - route.points[i].x, route.points[i + 1].z - route.points[i].z);
    }
    return len;
  }

  function outboundHeading(c) {
    const r = walkRoutes[c.routeIdx];
    const a = r.points[c.reverse ? r.points.length - 1 : 0];
    const b = r.points[c.reverse ? r.points.length - 2 : 1] || a;
    const hx = b.x - a.x;
    const hz = b.z - a.z;
    const hl = Math.hypot(hx, hz) || 1;
    return { x: hx / hl, z: hz / hl };
  }

  /** Pick the next route at an endpoint; prefer continuing forward over U-turns. */
  function pickNext(routeIdx, atEnd, heading, recent) {
    const key = `${routeIdx}:${atEnd ? "e" : "s"}`;
    const cands = graph.get(key) || [];
    if (!cands.length) return null;

    const scored = cands.map((c) => {
      const h = outboundHeading(c);
      const align = h.x * heading.x + h.z * heading.z;
      const dest = walkRoutes[c.routeIdx];
      const isCross = dest.kind === "crossing";
      const isSafe = dest.safe !== false && SAFE_KINDS.has(dest.kind);
      const pingPong = recent.has(c.routeIdx) ? 1 : 0;
      // Prefer forward, safe, long paths; crossings only when needed / when green.
      const redCross = isCross && !crossingOk(dest.id);
      const score =
        align * 3.5 +
        (isSafe ? 1.5 : 0) -
        (isCross ? 2.2 : 0) -
        (redCross ? 4 : 0) -
        pingPong * 3 +
        Math.min(2.5, dest.length / 35);
      return { c, align, score, isCross, redCross, isSafe };
    });
    scored.sort((a, b) => b.score - a.score);

    // Stay on pavement: forward safe → forward green crossing → forward only.
    // Never fall back to a reverse/U-turn edge here (that is advanceEnd's job).
    const forwardSafe = scored.filter((s) => s.align > 0.25 && !s.isCross && s.isSafe);
    const forwardGreen = scored.filter((s) => s.align > 0.2 && !s.redCross && (s.isSafe || s.isCross));
    const forward = scored.filter((s) => s.align > 0.2 && !s.isCross);
    const pool = forwardSafe.length
      ? forwardSafe
      : forwardGreen.length
        ? forwardGreen
        : forward;
    if (!pool.length) return null;
    return pool[(Math.random() * Math.min(3, pool.length)) | 0].c;
  }

  /** Shortest distance from (x,z) to any sample on a walk route. */
  function routeNearness(route, x, z) {
    let best = Infinity;
    const pts = route.points || [];
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - x, pts[i].z - z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Focus point for fresh spawns: live camera when available, else district arrival. */
  function crowdFocus() {
    if (camera?.position) return { x: camera.position.x, z: camera.position.z };
    return { x: SPAWN_CENTER.x, z: SPAWN_CENTER.z };
  }

  /**
   * Pick a sidewalk near the walker. Border handoffs set SPAWN_CENTER to the seam;
   * without this bias everyone lands on plaza walks a kilometre away and stays COLD-hidden.
   */
  function pickSpawnRoute(routes, near = null) {
    const pool = routes?.length ? routes : spawnPool;
    if (!pool.length) return null;
    const focus = near || crowdFocus();
    const bands = [NEAR_SPAWN_M, NEAR_SPAWN_FALLBACK_M];
    for (const lim of bands) {
      const hit = [];
      for (const r of pool) {
        if (routeNearness(r, focus.x, focus.z) <= lim) hit.push(r);
      }
      if (hit.length) return hit[(Math.random() * hit.length) | 0];
    }
    const scored = pool.map((r) => ({ r, d: routeNearness(r, focus.x, focus.z) }));
    scored.sort((a, b) => a.d - b.d);
    const closest = scored.slice(0, Math.min(12, scored.length));
    return closest[(Math.random() * closest.length) | 0].r;
  }

  /** Hop onto another long sidewalk instead of pacing a stub forever. */
  function relocateMember(m) {
    const pool = spawnPool.length ? spawnPool : walkRoutes.filter((r) => r.kind !== "crossing");
    if (!pool.length) return false;
    const dest = pickSpawnRoute(pool) || pool[(Math.random() * pool.length) | 0];
    const idx = walkRoutes.indexOf(dest);
    if (idx < 0) return false;
    const rLen = routeLength(dest);
    m.routeIdx = idx;
    m.dir = Math.random() < 0.5 ? 1 : -1;
    m.s = 2 + Math.random() * Math.max(1, rLen - 4);
    m.recent = new Set();
    m.turns = 0;
    return true;
  }

  function advanceEnd(m) {
    const route = walkRoutes[m.routeIdx];
    const atEnd = m.dir > 0;
    const pos = routePosition(route, atEnd ? routeLength(route) : 0);
    const heading = { x: pos.tx * m.dir, z: pos.tz * m.dir };
    const next = pickNext(m.routeIdx, atEnd, heading, m.recent);
    if (next) {
      m.recent.add(m.routeIdx);
      if (m.recent.size > 5) {
        m.recent = new Set([...m.recent].slice(-4));
      }
      m.turns = 0;
      m.routeIdx = next.routeIdx;
      m.dir = next.reverse ? -1 : 1;
      m.s = next.reverse ? routeLength(walkRoutes[next.routeIdx]) - 0.05 : 0.05;
      return;
    }
    m.turns = (m.turns || 0) + 1;
    // Cul-de-sac: one U-turn is fine on a long sidewalk; short stubs / repeat
    // reversals → relocate onto the connected network.
    if (route.length < MIN_SPAWN_M || m.turns >= 2) {
      if (relocateMember(m)) return;
    }
    m.dir = -m.dir;
    m.s = Math.max(0.05, Math.min(routeLength(route) - 0.05, m.s));
  }

  function spawnRoutes() {
    const safe = walkRoutes.filter(
      (r) => r.safe !== false && SAFE_KINDS.has(r.kind) && r.length >= MIN_SPAWN_M
    );
    return safe.length ? safe : walkRoutes.filter((r) => r.kind !== "crossing" && r.length >= 16);
  }

  /** `at` keeps an existing group's place ({ routeIdx, s, dir, side0 }) when re-dressing it. */
  function spawnGroup(profiles, routes, groupId, at) {
    const route = at
      ? walkRoutes[at.routeIdx]
      : pickSpawnRoute(routes) || routes[(Math.random() * routes.length) | 0];
    const routeIdx = walkRoutes.indexOf(route);
    const rLen = routeLength(route);
    const startS = at ? at.s : Math.random() * Math.max(1, rLen - 4);
    const dir = at ? at.dir : Math.random() < 0.5 ? 1 : -1;
    // Pavement lane: group centre, then fan members slightly so they don't stack.
    const side0 = at ? at.side0 : (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * LATERAL_M);
    const member = (mesh, s, side, speed, prof) => ({
      mesh,
      routeIdx,
      s: ((s % rLen) + rLen) % rLen,
      dir,
      side: Math.max(-0.55, Math.min(0.55, side)),
      phase: Math.random() * Math.PI * 2,
      speed,
      streetSpeed: speed,
      animRate: speed / WALK_SPEED,
      prof,
      recent: new Set(),
      turns: 0,
      offX: 0,
      offZ: 0,
      down: null,
      routeX: 0,
      routeZ: 0,
    });

    const members = [];
    let kind = "stand-ins";
    if (pool) {
      const look = population.pickLook(SPAWN_CENTER.x, SPAWN_CENTER.z);
      const hh = pool.household({
        look,
        weights: population.householdWeights(look, gameHour),
      });
      kind = hh.kind;
      const meshes = hh.members.map((t, mi) => makePerson(t, groupId, mi));
      // One pace for the household; each walk cycle is retimed so feet match the ground.
      const natural = meshes.map((m) => m.userData.person.naturalSpeed);
      const speed = (natural.reduce((a, b) => a + b, 0) / natural.length) * (0.94 + Math.random() * 0.1);
      meshes.forEach((mesh, mi) => {
        const p = mesh.userData.person;
        // Side by side in rows of two, the second row a step behind.
        const row = mi >> 1;
        const lateral = Math.min(2, meshes.length - row * 2) === 2 ? ((mi & 1) - 0.5) * 0.5 : 0;
        const m = member(mesh, startS - row * 0.95 * dir, side0 + lateral, speed, { scale: p.height / ADULT_M });
        m.animRate = speed / p.naturalSpeed;
        p.action?.setEffectiveTimeScale(m.animRate);
        // Some of the phone-capable residents are on a handset: texting, a call,
        // or Mixamo's plain walk (they still text when they stop).
        const person = p.template?.person;
        if (
          person &&
          pool.hasPhone(person.id) &&
          person.age !== "child" &&
          Math.random() < 0.72
        ) {
          const roll = Math.random();
          m.phone = roll < 0.4 ? "textWalk" : roll < 0.75 ? "call" : "walk";
          pool.loadPhone(p.template);
        }
        members.push(m);
      });
    } else {
      const prof = profiles[(Math.random() * profiles.length) | 0];
      const nMem = prof.members.length;
      for (let mi = 0; mi < nMem; mi++) {
        const mProf = prof.members[mi];
        // ``spread`` is metres of path separation (was wrongly scaled by 0.12 → ghost stacks).
        const along = nMem > 1 ? (mi * prof.spread) / (nMem - 1) - prof.spread * 0.5 : 0;
        const side = side0 + (nMem > 1 ? (mi - (nMem - 1) * 0.5) * 0.22 : 0);
        const speed = WALK_SPEED * (0.85 + Math.random() * 0.3);
        members.push(member(makeProceduralHumanoid(mProf, groupId, mi), startS + along, side, speed, mProf));
      }
    }
    const g = { members, routeIdx, route, kind, side0, trip: null, tripS: 0, tripGraph: null };
    for (let mi = 0; mi < members.length; mi++) members[mi].reactId = groupId * 8 + mi;
    // Prefer a ~2 min POI trip when the graph can route it; else keep junction wandering.
    // Always start the trip from this sidewalk seat — assignTrip teleports to path[0],
    // so a random far POI would yank the whole group away from the arrival seam.
    if (pedGraph?.nodes?.length) {
      const seat = routePosition(route, startS);
      const trip = planTrip({
        pedGraph,
        pois,
        hour: gameHour,
        day: gameDay,
        mode: "walk",
        from: { x: seat.x, z: seat.z },
        camera: crowdFocus(),
      });
      if (trip) assignTrip(g, trip, pedGraph);
    }
    return g;
  }

  function releaseGroup(g) {
    for (const m of g.members) {
      disposeIphone(m.iphone);
      m.iphone = null;
      root.remove(m.mesh);
      if (m.mesh.userData.person) pool.release(m.mesh.userData.person);
    }
  }

  const root = new THREE.Group();
  root.name = "Pedestrians";
  scene.add(root);

  const groups = [];
  const spawnPool = spawnRoutes();
  if (!spawnPool.length) {
    console.warn("[cityview] pedestrians: no walk routes — crowd disabled");
    return {
      update() {},
      dispose() {},
      groups,
      mixamo: false,
      hitTest() {
        return 0;
      },
      setBlocker() {},
      filterRoutes() {
        return { before: 0, after: 0, dropped: 0 };
      },
      setOnKilled() {},
      setCrossingGate() {},
    };
  }
  // Declared before placeMember / spawn: placeMember reads these during init.
  let blocked = () => false;
  let blockerOn = false;
  let onKilled = () => {};
  let onAssault = () => {};
  let playerAt = () => null;

  for (let i = 0; i < FIRST; i++) {
    const g = spawnGroup(PROFILES, spawnPool, i);
    for (const m of g.members) root.add(m.mesh);
    groups.push(g);
  }

  let varietyStarted = false;
  function streamVariety() {
    if (varietyStarted) return;
    varietyStarted = true;
    let left = COUNT - groups.length;
    const step = () => {
      if (left <= 0) return;
      const g = spawnGroup(PROFILES, spawnPool, groups.length);
      for (const m of g.members) {
        root.add(m.mesh);
        if (!m.down) placeMember(m);
      }
      groups.push(g);
      left--;
      if (left > 0) setTimeout(step, 180);
    };
    if (left > 0) setTimeout(step, 180);
  }

  for (const g of groups) {
    for (const m of g.members) {
      const route = walkRoutes[m.routeIdx];
      const rLen = routeLength(route);
      m.s = ((m.s % rLen) + rLen) % rLen;
      placeMember(m);
    }
  }

  /** `dt` (walking updates only) lets someone back on their feet turn to the route, not snap. */
  function placeMember(m, dt = 0, precise = true) {
    let route = walkRoutes[m.routeIdx];
    let pos = routePosition(route, m.s);
    const baseY = m.mesh.userData.baseY || 0;
    let nx = -pos.tz;
    let nz = pos.tx;
    m.routeX = pos.x + nx * m.side;
    m.routeZ = pos.z + nz * m.side;
    // Runtime alley backstop: never accept an advance that steps indoors. Checked every
    // INDOOR_CHECK_M of travel (insideBuilding scans footprints) and on every route change.
    if (blockerOn && (m.okRoute !== m.routeIdx || Math.abs(m.s - m.okS) >= INDOOR_CHECK_M)) {
      if (blocked(m.routeX, m.routeZ)) {
        if (m.okRoute === m.routeIdx && Number.isFinite(m.okS)) {
          m.s = m.okS; // reject the step, turn round
          m.dir = -m.dir;
        } else {
          relocateMember(m);
        }
        route = walkRoutes[m.routeIdx];
        pos = routePosition(route, m.s);
        nx = -pos.tz;
        nz = pos.tx;
        m.routeX = pos.x + nx * m.side;
        m.routeZ = pos.z + nz * m.side;
      }
      m.okRoute = m.routeIdx;
      m.okS = m.s;
    }
    const x = m.routeX + (m.offX || 0);
    const z = m.routeZ + (m.offZ || 0);
    m.mesh.position.set(x, footY(x, z, baseY, precise, route.kind), z);
    const aheadS = Math.min(routeLength(route), Math.max(0, m.s + m.dir * 0.6));
    const ahead = routePosition(route, aheadS);
    const dx = ahead.x - pos.x;
    const dz = ahead.z - pos.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      const yaw = Math.atan2(dx, dz);
      if (dt > 0 && (m.recover > 0 || m.turning)) {
        m.mesh.rotation.y += wrapAngle(yaw - m.mesh.rotation.y) * Math.min(1, dt * 4);
        m.turning = Math.abs(wrapAngle(yaw - m.mesh.rotation.y)) > 0.05;
      } else {
        m.mesh.rotation.y = yaw;
      }
    }
  }

  /** Far LOD: update route xz without raycasts or yaw blending. */
  function placeMemberCheap(m) {
    const route = walkRoutes[m.routeIdx];
    const pos = routePosition(route, m.s);
    const nx = -pos.tz;
    const nz = pos.tx;
    m.routeX = pos.x + nx * m.side;
    m.routeZ = pos.z + nz * m.side;
    m.mesh.position.x = m.routeX;
    m.mesh.position.z = m.routeZ;
  }

  /**
   * Runtime alley backstop: strip / split the indoor stretches out of `walkRoutes`
   * (`blocked(x, z)` = inside a building footprint), rebuild the junction graph and the spawn
   * pool, then re-seat every walker on the nearest surviving piece. Safe to call repeatedly;
   * a no-op when nothing is indoors. Keeps `walkRoutes` identity (also exposed as `routes`).
   */
  function filterRoutes(blockedFn) {
    const test = typeof blockedFn === "function" ? blockedFn : blocked;
    const before = walkRoutes.length;
    if (!blockerOn && typeof blockedFn !== "function") return { before, after: before, dropped: 0 };
    const old = walkRoutes.slice();
    const next = [];
    let cutRoutes = 0;
    for (let i = 0; i < old.length; i++) {
      const r = old[i];
      const parts = splitRouteOutdoors(r, test);
      if (parts.length === 1 && parts[0].whole) {
        next.push({ ...r, src: i, s0: 0 });
        continue;
      }
      cutRoutes++;
      for (const pc of parts) {
        let len = pc.length;
        if (len === undefined) {
          len = 0;
          for (let k = 0; k < pc.points.length - 1; k++) {
            len += Math.hypot(pc.points[k + 1].x - pc.points[k].x, pc.points[k + 1].z - pc.points[k].z);
          }
        }
        next.push({ ...r, points: pc.points, length: len, src: i, s0: pc.s0 });
      }
    }
    if (!cutRoutes) return { before, after: before, dropped: 0 };
    if (!next.length) return { before, after: before, dropped: 0 }; // never leave the town empty
    walkRoutes.length = 0;
    for (const r of next) walkRoutes.push(r);
    const sp = spawnRoutes();
    if (!sp.length) {
      // Too little survives to spawn on: restore the original network.
      walkRoutes.length = 0;
      for (const r of old) walkRoutes.push(r);
      return { before, after: before, dropped: 0 };
    }
    spawnPool.length = 0;
    for (const r of sp) spawnPool.push(r);
    graph.clear();
    for (const [k, v] of buildGraph(walkRoutes)) graph.set(k, v);
    // Trip graph follows the outdoor-trimmed walks.
    pedGraph = buildPedGraph(walkRoutes);
    pois = collectPois({ shops: shopList, stops: stopList, pedGraph });

    // Re-seat walkers: same source route and arc position if a piece still covers it.
    const seat = (m) => {
      const oldIdx = m.routeIdx;
      for (let i = 0; i < walkRoutes.length; i++) {
        const r = walkRoutes[i];
        if (r.src !== oldIdx) continue;
        const len = r.length;
        if (m.s >= r.s0 - 0.01 && m.s <= r.s0 + len + 0.01) {
          m.routeIdx = i;
          m.s = Math.max(0.05, Math.min(len - 0.05, m.s - r.s0));
          return true;
        }
      }
      return false;
    };
    for (const g of groups) {
      const lead = g.members[0];
      const seated = g.members.map((m) => ({ m, ok: seat(m) }));
      if (seated.every((e) => e.ok)) {
        for (const { m } of seated) {
          m.recent = new Set();
          m.okRoute = -1;
        }
      } else {
        // Whole household hops to a new route together so they do not scatter.
        const hops = relocateMember(lead);
        if (hops) {
          g.members.forEach((m, mi) => {
            if (m === lead) return;
            m.routeIdx = lead.routeIdx;
            m.dir = lead.dir;
            const len = walkRoutes[m.routeIdx].length;
            m.s = Math.max(0.05, Math.min(len - 0.05, lead.s - lead.dir * (mi >> 1) * 0.95));
            m.recent = new Set();
            m.turns = 0;
          });
        }
        for (const m of g.members) m.okRoute = -1;
      }
      g.routeIdx = lead.routeIdx;
      g.route = walkRoutes[lead.routeIdx];
      for (const m of g.members) {
        if (!m.down) placeMember(m);
      }
    }
    const info = { before, after: walkRoutes.length, dropped: before - walkRoutes.length, cut: cutRoutes };
    console.info(
      `[cityview] pedestrians: alley backstop — ${cutRoutes} walk(s) trimmed of indoor stretches ` +
        `(${before} → ${walkRoutes.length} walks, ${spawnPool.length} safe spawn)`
    );
    return info;
  }

  const _frustum = new THREE.Frustum();
  const _pv = new THREE.Matrix4();
  const _sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  let redressIn = REDRESS_EVERY_S;

  /** Swap one out-of-sight group for a fresh household from the pool. */
  function redressOne() {
    if (!pool || !camera) return;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cam = camera.getWorldPosition(new THREE.Vector3());
    const start = (Math.random() * groups.length) | 0;
    const order = groups.map((_, k) => (start + k) % groups.length);
    const wearsRetiring = (gi) => groups[gi].members.some((m) => m.mesh.userData.person?.template === pool.retiring);
    order.sort((a, b) => wearsRetiring(b) - wearsRetiring(a));
    for (const gi of order) {
      const g = groups[gi];
      let far = false;
      const hidden = g.members.every((m) => {
        if (m.down && !(m.down.dead && m.down.deadFor > BODY_CLEAR_S)) return false;
        const d = m.mesh.position.distanceTo(cam);
        if (d > REDRESS_FAR_M) {
          far = true;
          return true;
        }
        _sphere.center.copy(m.mesh.position).y += 0.9;
        return d > REDRESS_HIDDEN_M && !_frustum.intersectsSphere(_sphere);
      });
      if (!hidden) continue;
      const lead = g.members[0];
      releaseGroup(g);
      // Cold / far groups re-seat near the camera; nearby hidden ones keep their sidewalk.
      const at = far ? null : { routeIdx: lead.routeIdx, s: lead.s, dir: lead.dir, side0: g.side0 };
      const fresh = spawnGroup(PROFILES, spawnPool, gi, at);
      for (const m of fresh.members) {
        root.add(m.mesh);
        placeMember(m);
      }
      groups[gi] = fresh;
      return;
    }
  }

  console.info(
    `[cityview] pedestrians: ${groups.reduce((n, g) => n + g.members.length, 0)} people` +
      ` on ${walkRoutes.length} walks` +
      ` (${spawnPool.length} safe spawn)` +
      (pool ? ` (${pool.residentCount} of ${pool.total} Rocketbox people loaded)` : " (procedural fallback)")
  );

  const UP = new THREE.Vector3(0, 1, 0);
  const _axis = new THREE.Vector3();
  const _qFall = new THREE.Quaternion();
  const _qYaw = new THREE.Quaternion();

  /**
   * Something (the player's scooter) moving at vx/vz m/s sweeps a circle of radius `r` at x/z.
   * Anyone inside is shoved, or above a walking pace knocked off their feet and thrown along
   * with the impact; hard enough hits kill. Returns the number of people hit.
   */
  function hitTest(x, z, vx, vz, r) {
    const speed = Math.hypot(vx, vz);
    let hits = 0;
    for (const g of groups) {
      for (const m of g.members) {
        if (m.down) continue;
        const p = m.mesh.position;
        const dx = p.x - x;
        const dz = p.z - z;
        const reach = r + 0.28 * (m.prof.scale || 1);
        if (dx * dx + dz * dz > reach * reach) continue;
        hits++;
        if (speed < KNOCK_SPEED) {
          const d = Math.hypot(dx, dz) || 1;
          m.offX = (m.offX || 0) + (dx / d) * 0.35;
          m.offZ = (m.offZ || 0) + (dz / d) * 0.35;
          continue;
        }
        const d = Math.hypot(dx, dz) || 1;
        const k = 0.75 + Math.random() * 0.15;
        const tvx = vx * k + (dx / d) * speed * 0.2;
        const tvz = vz * k + (dz / d) * speed * 0.2;
        const age = m.mesh.userData.person?.template.person.age;
        m.health ??= 100 * (FRAILTY[age] || 1);
        m.health -= (speed - KNOCK_SPEED) * HIT_DAMAGE * (0.8 + Math.random() * 0.4);
        const dead = m.health <= 0;
        const getUp = m.mesh.userData.person?.getUp;
        if (getUp) {
          // Held on the clip's first frame (lying face down) until it is time to scramble up.
          const w0 = m.recover ? getUp.getEffectiveWeight() : 0;
          m.recover = 0;
          getUp.reset().play();
          getUp.paused = true;
          getUp.setEffectiveWeight(w0);
        }
        m.down = {
          rigged: !!getUp,
          dead,
          deadFor: 0,
          t: 0,
          w0: getUp ? getUp.getEffectiveWeight() : 0,
          yaw0: m.mesh.rotation.y,
          throwYaw: Math.atan2(tvx, tvz),
          vx: tvx,
          vz: tvz,
          vy: 0.6 + speed * 0.12,
          y: 0,
          angle: 0,
          spin: 4.5 + speed * 0.5,
          lie: dead ? Infinity : 3.5 + Math.random() * 3,
          getUp: 0,
          yaw: m.mesh.rotation.y,
          axis: _axis.crossVectors(UP, new THREE.Vector3(tvx, 0, tvz).normalize()).clone(),
        };
        m.offX = p.x - (m.routeX ?? p.x);
        m.offZ = p.z - (m.routeZ ?? p.z);
      }
    }
    return hits;
  }

  /**
   * A punch or a kick in front of the player. `dx/dz` is the facing direction.
   * Returns the people who took the blow, with `dead` once health is gone.
   */
  function strike(x, z, dx, dz, range, damage, single = false) {
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const found = [];
    for (const g of groups) {
      for (const m of g.members) {
        if (m.down?.dead) continue;
        const p = m.mesh.position;
        const px = p.x - x;
        const pz = p.z - z;
        const along = px * ux + pz * uz;
        if (along < 0.2 || along > range) continue;
        const side = Math.abs(px * uz - pz * ux);
        if (side > (single ? 0.45 : 0.75)) continue;
        found.push({ m, along, p });
      }
    }
    if (single) found.sort((a, b) => a.along - b.along);
    const take = single ? found.slice(0, 1) : found;
    return take.map(({ m }) => knockDown(m, damage, ux, uz));
  }

  /** Take `damage` and go down along (ux, uz). Returns { x, z, dead }. */
  function knockDown(m, damage, ux, uz) {
    const p = m.mesh.position;
    {
        const age = m.mesh.userData.person?.template.person.age;
        m.health ??= 100 * (FRAILTY[age] || 1);
        m.health -= damage;
        const dead = m.health <= 0;
        const getUp = m.mesh.userData.person?.getUp;
        if (getUp) {
          const w0 = m.recover ? getUp.getEffectiveWeight() : 0;
          m.recover = 0;
          getUp.reset().play();
          getUp.paused = true;
          getUp.setEffectiveWeight(w0);
        }
        m.down = {
          rigged: !!getUp,
          dead,
          deadFor: 0,
          t: 0,
          w0: getUp ? getUp.getEffectiveWeight() : 0,
          yaw0: m.mesh.rotation.y,
          throwYaw: Math.atan2(ux, uz),
          vx: ux * 1.4,
          vz: uz * 1.4,
          vy: dead ? 0.4 : 0.15,
          y: 0,
          angle: 0,
          spin: 2.2,
          lie: dead ? Infinity : 2.4 + Math.random() * 1.6,
          getUp: 0,
          yaw: m.mesh.rotation.y,
          axis: _axis.crossVectors(UP, new THREE.Vector3(ux, 0, uz)).clone(),
        };
        m.offX = p.x - (m.routeX ?? p.x);
        m.offZ = p.z - (m.routeZ ?? p.z);
        return { x: p.x, z: p.z, dead };
    }
  }

  /**
   * Standing people as hitscan targets: { x, y, z, r, h, kind, ref }, feet at y.
   * Only those within `range` of (x, z) so a shot doesn't test the whole city.
   */
  function shootables(x, z, range, out = []) {
    out.length = 0;
    const r2 = range * range;
    for (const g of groups) {
      for (const m of g.members) {
        if (m.down?.dead || !m.mesh.visible) continue;
        const p = m.mesh.position;
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz > r2) continue;
        const scale = m.prof.scale || 1;
        const t = (m._shot ??= { kind: "pedestrian", ref: m, dead: false, r: 0.26, h: ADULT_M });
        t.x = p.x;
        t.y = p.y - (m.mesh.userData.baseY || 0);
        t.z = p.z;
        // Knocked over but alive: a low, wide body you can still finish off.
        t.r = (m.down ? 0.5 : 0.26) * scale;
        t.h = (m.down ? 0.45 : ADULT_M) * scale;
        t.headR = m.down ? 0 : undefined;
        out.push(t);
      }
    }
    return out;
  }

  /** A bullet hit: knock the person down along (dx, dz). */
  function shoot(m, damage, dx, dz) {
    if (m.down?.dead) return null;
    const len = Math.hypot(dx, dz) || 1;
    return knockDown(m, damage, dx / len, dz / len);
  }

  const PANIC_S = 9;
  /** Gunfire nearby: most people run away; a stable few close in with a knife. */
  function panic(x, z, radius) {
    const flat = [];
    for (const g of groups) {
      for (const m of g.members) {
        const p = m.mesh.position;
        flat.push({ id: m.reactId ?? 0, x: p.x, z: p.z, down: !!m.down, ref: m });
      }
    }
    const shot = { x, z };
    const split = classifyShot(flat, shot, radius);
    const knives = new Set(split.knife);
    const runners = new Set(split.flee);
    for (const person of flat) {
      if (!knives.has(person.id) && !runners.has(person.id)) continue;
      const m = person.ref;
      if (!m.panic) m.calmSpeed = m.speed;
      m.panic = PANIC_S;
      m.threat = shot;
      if (knives.has(person.id)) {
        m.knife = true;
        m.fleeX = 0;
        m.fleeZ = 0;
        m.speed = (m.calmSpeed || WALK_SPEED) * 1.7;
      } else {
        m.knife = false;
        const away = fleeVector(person, shot);
        m.fleeX = away.x;
        m.fleeZ = away.z;
        m.speed = (m.calmSpeed || WALK_SPEED) * 2.3;
      }
      if (m.mesh.userData.mixer) m.mesh.userData.mixer.timeScale = 1.9;
    }
  }

  /** Run from the last shot, or step in and cut when this person drew a knife. */
  function applyReaction(m, dt) {
    if (!m.panic || m.down) return;
    if (m.knife) {
      const at = playerAt() || m.threat;
      if (!at) return;
      const from = m.mesh.position;
      const step = approach(from, at, dt, m.speed || WALK_SPEED);
      if (!blocked(step.x, step.z)) {
        m.offX = (m.offX || 0) + (step.x - from.x);
        m.offZ = (m.offZ || 0) + (step.z - from.z);
      }
      m.headingX = step.dirX;
      m.headingZ = step.dirZ;
      m.knifeCd = Math.max(0, (m.knifeCd || 0) - dt);
      if (step.strike && m.knifeCd <= 0) {
        m.knifeCd = KNIFE_COOLDOWN;
        onAssault({ damage: KNIFE_DAMAGE, x: from.x, z: from.z });
      }
      return;
    }
    if (!m.fleeX && !m.fleeZ) return;
    const step = (m.speed || WALK_SPEED) * dt;
    const nx = m.mesh.position.x + m.fleeX * step;
    const nz = m.mesh.position.z + m.fleeZ * step;
    if (!blocked(nx, nz)) {
      m.offX = (m.offX || 0) + m.fleeX * step;
      m.offZ = (m.offZ || 0) + m.fleeZ * step;
    }
    m.headingX = m.fleeX;
    m.headingZ = m.fleeZ;
  }

  function calm(m, dt) {
    if (!m.panic) return;
    m.panic = Math.max(0, m.panic - dt);
    if (m.panic) return;
    m.speed = m.calmSpeed || m.speed;
    m.knife = false;
    m.fleeX = 0;
    m.fleeZ = 0;
    if (m.mesh.userData.mixer) m.mesh.userData.mixer.timeScale = 1;
  }

  function updateDown(m, dt) {
    const f = m.down;
    const p = m.mesh.position;
    const airborne = f.y > 0 || f.vy > 0;
    const hs = Math.hypot(f.vx, f.vz);
    if (hs > 0) {
      const nx = p.x + f.vx * dt;
      const nz = p.z + f.vz * dt;
      if (blocked(nx, nz)) {
        f.vx *= -0.2;
        f.vz *= -0.2;
      } else {
        p.x = nx;
        p.z = nz;
      }
      if (!airborne) {
        const slow = Math.max(0, hs - SLIDE_DECEL * dt) / hs;
        f.vx *= slow;
        f.vz *= slow;
      }
    }
    if (airborne) {
      f.vy -= 9.81 * dt;
      f.y = Math.max(0, f.y + f.vy * dt);
      if (f.y === 0) f.vy = 0;
    }
    if (f.dead && hs < 0.05 && !airborne) {
      if (!f.deadFor) onKilled({ x: p.x, y: p.y - (m.mesh.userData.baseY || 0), z: p.z, yaw: m.mesh.rotation.y });
      f.deadFor += dt;
    }
    if (f.rigged) return updateDownRigged(m, f, dt, hs, airborne);
    let up = false;
    if (f.getUp > 0) {
      f.getUp -= dt;
      f.angle = (Math.PI / 2) * Math.max(0, f.getUp / GET_UP_S);
      up = f.getUp <= 0;
    } else if (f.angle < Math.PI / 2) {
      f.angle = Math.min(Math.PI / 2, f.angle + f.spin * dt);
    } else if (hs < 0.05 && !airborne) {
      f.lie -= dt;
      if (f.lie <= 0) f.getUp = GET_UP_S;
    }
    _qYaw.setFromAxisAngle(UP, f.yaw);
    _qFall.setFromAxisAngle(f.axis, f.angle);
    m.mesh.quaternion.multiplyQuaternions(_qFall, _qYaw);
    p.y =
      footY(p.x, p.z, m.mesh.userData.baseY || 0) +
      f.y +
      0.13 * (m.prof.scale || 1) * Math.sin(f.angle);
    if (up) {
      m.down = null;
      m.mesh.rotation.set(0, f.yaw, 0);
      m.offX = p.x - m.routeX;
      m.offZ = p.z - m.routeZ;
      return false;
    }
    return true;
  }

  /** Rigged people: dive into the face-down pose, lie still, then play the scramble back up. */
  function updateDownRigged(m, f, dt, hs, airborne) {
    const { mixer, action: walk, getUp } = m.mesh.userData.person;
    f.t += dt;
    // Pitched along the throw, so they land face first in the direction they were hit.
    const w = Math.min(1, f.w0 + (f.t / FALL_BLEND_S) * (1 - f.w0));
    getUp.setEffectiveWeight(w);
    walk?.setEffectiveWeight(1 - w);
    const turn = Math.min(1, f.t / FALL_BLEND_S);
    m.mesh.rotation.set(0, f.yaw0 + wrapAngle(f.throwYaw - f.yaw0) * turn, 0);
    if (!f.scrambling && hs < 0.05 && !airborne && (f.lie -= dt) <= 0) {
      f.scrambling = true;
      getUp.paused = false;
    }
    mixer.update(dt);
    const p = m.mesh.position;
    p.y = footY(p.x, p.z, m.mesh.userData.baseY || 0) + f.y;
    if (f.scrambling && getUp.time >= getUp.getClip().duration - 1e-3) {
      m.down = null;
      m.recover = RECOVER_S;
      m.offX = p.x - m.routeX;
      m.offZ = p.z - m.routeZ;
      return false;
    }
    return true;
  }

  /** Ease from the end of the scramble back into the walk cycle. */
  function recoverStep(m, dt) {
    m.recover = Math.max(0, m.recover - dt);
    const { action: walk, getUp } = m.mesh.userData.person;
    const w = m.recover / RECOVER_S;
    getUp.setEffectiveWeight(w);
    walk?.setEffectiveWeight(1 - w);
    if (!m.recover) getUp.stop();
  }

  function playBody(m, action, fade) {
    const prev = m.mesh.userData.action;
    if (!action || prev === action) return;
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (!action.isRunning()) action.play();
    if (prev && fade > 0) action.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    m.mesh.userData.action = action;
    const person = m.mesh.userData.person;
    if (person) person.action = action;
  }

  const PHONE_SPEED = { walk: "walkMps", textWalk: "textWalkMps", callWalk: "callMps" };
  const PHONE_GRIP = { text: "text", textWalk: "textWalk", call: "call", callWalk: "call" };

  function phoneClipKey(m, moving) {
    if (m.phone === "call") return moving ? "callWalk" : "call";
    if (!moving) return "text";
    return m.phone === "walk" ? "walk" : "textWalk";
  }

  function holdHandset(m, key) {
    const grip = PHONE_GRIP[key] || null;
    if (!grip) {
      if (m.iphone) gripIphone(m.iphone, null);
      return;
    }
    if (!m.iphone) {
      const hand = m.mesh.getObjectByName("Bip01 R Hand");
      if (!hand) return;
      const id = m.mesh.userData.person?.template?.person?.id || "";
      m.iphone = createIphone(id);
      hand.add(m.iphone);
    }
    gripIphone(m.iphone, grip);
  }

  function setWalkAnim(m, moving) {
    const person = m.mesh.userData.person;
    const clips = person?.template?.phone;
    const onPhone = m.phone && clips && !m.panic && !(m.dealLeft > 0);
    if (onPhone) {
      const key = phoneClipKey(m, moving);
      const clip = clips[key];
      if (clip) {
        if (!m.phoneActions) m.phoneActions = {};
        if (!m.phoneActions[key]) {
          const action = person.mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.time = Math.random() * clip.duration;
          m.phoneActions[key] = action;
        }
        playBody(m, m.phoneActions[key], 0.28);
        holdHandset(m, key);
        const authored = clips[PHONE_SPEED[key]] || 0;
        const height = person.template.person.height || person.height;
        const mps = authored > 0 ? authored * (person.height / height) : 0;
        const rate = !moving ? 1 : mps > 0.2 ? m.speed / mps : m.animRate;
        m.mesh.userData.action.setEffectiveTimeScale(Math.min(1.75, Math.max(0.55, rate)));
        return;
      }
    }
    holdHandset(m, null);
    if (person?.walk && m.mesh.userData.action !== person.walk) playBody(m, person.walk, 0.2);
    const action = m.mesh.userData.action;
    if (action) action.setEffectiveTimeScale(moving ? m.animRate : 0);
  }

  /** Still on the kerb of a crossing (not committed mid-road). */
  function waitingAtCrossing(m, route, rLen) {
    if (route.kind !== "crossing") return false;
    if (crossingOk(route.id)) return false;
    return m.dir > 0 ? m.s < 1.4 : m.s > rLen - 1.4;
  }

  function placeMemberFromTrip(m, dt = 0, precise = true) {
    const baseY = m.mesh.userData.baseY || 0;
    const x = (m.routeX || 0) + (m.offX || 0);
    const z = (m.routeZ || 0) + (m.offZ || 0);
    const kind = m.onCrossing ? "crossing" : "sidewalk";
    m.mesh.position.set(x, footY(x, z, baseY, precise, kind), z);
    if (m.headingX != null && m.headingZ != null) {
      const yaw = Math.atan2(m.headingX, m.headingZ);
      if (dt > 0 && (m.recover > 0 || m.turning)) {
        m.mesh.rotation.y += wrapAngle(yaw - m.mesh.rotation.y) * Math.min(1, dt * 4);
        m.turning = Math.abs(wrapAngle(yaw - m.mesh.rotation.y)) > 0.05;
      } else {
        m.mesh.rotation.y = yaw;
      }
    }
  }

  function paceMember(m, mps, moving) {
    m.speed = mps;
    const natural = m.mesh.userData.person?.naturalSpeed || WALK_SPEED;
    m.animRate = mps / natural;
    const action = m.mesh.userData.person?.action || m.mesh.userData.action;
    if (action) action.setEffectiveTimeScale(moving ? m.animRate : 0);
  }

  /** Stroll inside an open market. Shoppers hold the trip at a stall. */
  function holdForMarket(g, dt) {
    const lead = g.members[0];
    if (!lead || !markets.length) return false;
    const market = marketAt(
      markets,
      lead.routeX || lead.mesh.position.x,
      lead.routeZ || lead.mesh.position.z,
      gameHour,
      gameDay,
    );
    if (!market) {
      if (g.wasMarket && g.marketRef) {
        for (const m of g.members) {
          releasePerson(g.marketRef, m.reactId);
          m.marketStall = null;
          m.dealLeft = null;
          m.marketDone = false;
          m.strolling = false;
        }
      }
      g.wasMarket = false;
      g.marketVisit = null;
      g.marketSkip = null;
      g.marketRef = null;
      return false;
    }
    g.wasMarket = true;
    g.marketRef = market;
    if (g.marketSkip === market.name) {
      for (const m of g.members) paceMember(m, STROLL_MPS, true);
      return false;
    }
    if (g.marketVisit == null) g.marketVisit = Math.random() < 0.72;
    if (!g.marketVisit) {
      for (const m of g.members) paceMember(m, STROLL_MPS, true);
      return false;
    }
    let hold = false;
    for (const m of g.members) {
      if (m.down || m.marketDone) {
        m.strolling = false;
        continue;
      }
      if (!m.marketStall) m.marketStall = claimStall(market, m.reactId);
      if (!m.marketStall) {
        paceMember(m, STROLL_MPS, true);
        m.strolling = true;
        continue;
      }
      const visitor = { id: m.reactId, x: m.routeX || 0, z: m.routeZ || 0, dealLeft: m.dealLeft };
      const step = stepVisitor(visitor, m.marketStall, dt);
      m.routeX = visitor.x;
      m.routeZ = visitor.z;
      m.dealLeft = visitor.dealLeft;
      if (visitor.hx != null) {
        m.headingX = visitor.hx;
        m.headingZ = visitor.hz;
      }
      m.strolling = step.moving;
      paceMember(m, STROLL_MPS, step.moving);
      if (step.done) {
        m.marketStall = null;
        m.marketDone = true;
        m.dealLeft = null;
      } else {
        hold = true;
      }
    }
    if (!hold) g.marketSkip = market.name;
    return hold;
  }

  function replanGroup(g) {
    if (!pedGraph?.nodes?.length) {
      g.trip = null;
      return;
    }
    const lead = g.members[0];
    const from = lead ? { x: lead.routeX || lead.mesh.position.x, z: lead.routeZ || lead.mesh.position.z } : null;
    const cam = camera?.position
      ? { x: camera.position.x, z: camera.position.z }
      : { x: SPAWN_CENTER.x, z: SPAWN_CENTER.z };
    const trip = planTrip({
      pedGraph,
      pois,
      hour: gameHour,
      day: gameDay,
      mode: "walk",
      from,
      camera: cam,
    });
    if (trip) assignTrip(g, trip, pedGraph);
    else g.trip = null;
  }

  function updateMemberLod(m, dt, cx, cz, hot2, warm2, cold2, useTrip) {
    const dx = (m.routeX ?? m.mesh.position.x) - cx;
    const dz = (m.routeZ ?? m.mesh.position.z) - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > cold2) {
      m.mesh.visible = false;
      if (!useTrip) placeMemberCheap(m);
      return;
    }
    m.mesh.visible = true;
    const precise = d2 <= hot2;
    if (useTrip) placeMemberFromTrip(m, dt, precise);
    else placeMember(m, dt, precise);

    if ((m.offX || m.offZ) && !m.panic) {
      const keep = Math.max(0, 1 - dt * 0.8);
      m.offX = Math.abs(m.offX * keep) < 0.01 ? 0 : m.offX * keep;
      m.offZ = Math.abs(m.offZ * keep) < 0.01 ? 0 : m.offZ * keep;
      m.mesh.position.x = m.routeX + (m.offX || 0);
      m.mesh.position.z = m.routeZ + (m.offZ || 0);
    }
    if (m.panic && (m.fleeX || m.fleeZ || m.knife)) {
      const hx = m.knife ? m.headingX : m.fleeX;
      const hz = m.knife ? m.headingZ : m.fleeZ;
      if (hx != null && hz != null) m.mesh.rotation.y = Math.atan2(hx, hz);
    }

    // Go around parked / moving cars instead of walking through them.
    if (!m.down) {
      // placeMember yaw is atan2(dx, dz) → travel is (sin y, cos y).
      const hx = m.headingX != null ? m.headingX : Math.sin(m.mesh.rotation.y);
      const hz = m.headingZ != null ? m.headingZ : Math.cos(m.mesh.rotation.y);
      applyVehicleAvoidance(m, hx, hz);
    }

    if (m.mesh.userData.mixer) {
      m.animHold = (m.animHold || 0) + dt;
      const cadence = precise ? 1 : d2 <= warm2 ? 2 : 3;
      m.animSkip = (m.animSkip || 0) + 1;
      if (m.animSkip >= cadence) {
        m.mesh.userData.mixer.update(m.animHold);
        m.animHold = 0;
        m.animSkip = 0;
      }
    } else if (precise) {
      m.phase += dt * m.speed * BOBBLE_FREQ;
      m.mesh.position.y += BOBBLE_AMP * Math.abs(Math.sin(m.phase));
      const swingAmt = 0.2 * Math.sin(m.phase);
      for (let ci = 0; ci < m.mesh.children.length; ci++) {
        const child = m.mesh.children[ci];
        if (Math.abs(child.position.x) > 0.2 && child.position.y > 0.6) {
          child.rotation.z = child.position.x > 0 ? -swingAmt : swingAmt;
        }
      }
    }
  }

  function update(dt) {
    if (!(dt > 0)) return;
    if ((redressIn -= dt) <= 0) {
      redressIn = REDRESS_EVERY_S;
      redressOne();
    }
    _lodParity ^= 1;
    const cam = camera;
    const cx = cam ? cam.position.x : SPAWN_CENTER.x;
    const cz = cam ? cam.position.z : SPAWN_CENTER.z;
    const hot2 = HOT_M * HOT_M;
    const warm2 = WARM_M * WARM_M;
    const cold2 = COLD_M * COLD_M;
    for (const g of groups) {
      const onTrip = !!(g.trip?.path && g.tripGraph);
      if (onTrip) {
        const lead = g.members[0];
        const held = holdForMarket(g, dt);
        const speed = held ? STROLL_MPS : g.wasMarket ? STROLL_MPS : lead?.streetSpeed || lead?.speed || WALK_SPEED;
        const result = held ? "wait" : advanceTrip(g, dt, { crossingOk, speed });
        if (result === "done") replanGroup(g);
        for (const m of g.members) {
          calm(m, dt);
          if (m.down && updateDown(m, dt)) continue;
          if (m.recover > 0) recoverStep(m, dt);
          applyReaction(m, dt);
          setWalkAnim(m, held ? !!m.strolling : !m.waiting && result !== "wait");
          updateMemberLod(m, dt, cx, cz, hot2, warm2, cold2, true);
        }
        continue;
      }
      for (const m of g.members) {
        calm(m, dt);
        if (m.down && updateDown(m, dt)) continue;
        if (m.recover > 0) recoverStep(m, dt);
        applyReaction(m, dt);

        const route = walkRoutes[m.routeIdx];
        const rLen = routeLength(route);
        // Advance along the path even when far (cheap); only near people get skinned anim + raycasts.
        if (!waitingAtCrossing(m, route, rLen)) {
          const inside = marketAt(
            markets,
            m.routeX || m.mesh.position.x,
            m.routeZ || m.mesh.position.z,
            gameHour,
            gameDay,
          );
          const pace = inside ? STROLL_MPS : m.streetSpeed || m.speed;
          m.speed = pace;
          setWalkAnim(m, true);
          m.s += pace * m.dir * dt;
          if (m.s >= rLen || m.s < 0) advanceEnd(m);
        } else {
          setWalkAnim(m, false);
        }
        updateMemberLod(m, dt, cx, cz, hot2, warm2, cold2, false);
      }
    }
    cullExcessBodies();
  }

  /** Keep at most MAX_BODIES dead people on the ground; oldest become redress-eligible. */
  function cullExcessBodies() {
    const bodies = [];
    for (const g of groups) {
      for (const m of g.members) {
        if (m.down?.dead) bodies.push(m);
      }
    }
    if (bodies.length <= MAX_BODIES) return;
    bodies.sort((a, b) => (a.down.deadFor || 0) - (b.down.deadFor || 0));
    for (let i = MAX_BODIES; i < bodies.length; i++) {
      const m = bodies[i];
      m.down.deadFor = Math.max(m.down.deadFor || 0, BODY_CLEAR_S + 1);
      m.mesh.visible = false;
    }
  }

  function dispose() {
    scene.remove(root);
    if (pool) for (const g of groups) releaseGroup(g);
  }

  /** People cars / buses / trams should brake for — including those lying in the lane (reuses one array). */
  const _roadPeople = [];
  function roadPeople() {
    _roadPeople.length = 0;
    for (const g of groups) {
      for (const m of g.members) {
        const p = m.mesh.position;
        // A body on the paving is longer than a standing person — give traffic a bit more room.
        const scale = m.prof.scale || 1;
        const r = m.down ? 0.55 * scale : 0.32 * scale;
        _roadPeople.push({ x: p.x, z: p.z, r });
      }
    }
    return _roadPeople;
  }

  return {
    update,
    dispose,
    groups,
    mixamo: !!pool,
    people: pool,
    markets,
    routes: walkRoutes,
    hitTest,
    strike,
    shootables,
    shoot,
    panic,
    roadPeople,
    setBlocker(fn) {
      blocked = typeof fn === "function" ? fn : () => false;
      blockerOn = typeof fn === "function";
      for (const g of groups) for (const m of g.members) m.okRoute = -1;
    },
    filterRoutes,
    /** fn({ x, y, z, yaw }) once a killed pedestrian's body comes to rest (y = ground). */
    setOnKilled(fn) {
      onKilled = fn;
    },
    /** Feet of the player a knife fighter closes on. */
    setPlayer(fn) {
      playerAt = typeof fn === "function" ? fn : () => null;
    },
    /** `{ damage, x, z }` when a knife connects. */
    setOnAssault(fn) {
      onAssault = typeof fn === "function" ? fn : () => {};
    },
    setCrossingGate(fn) {
      crossingOk = typeof fn === "function" ? fn : () => true;
    },
    setClock(h, d) {
      if (Number.isFinite(h)) gameHour = h;
      if (Number.isFinite(d)) gameDay = d;
    },
    /** `() => [{ pos, tan, hl, hw }]` — cars / buses / trams walkers must go around. */
    setVehicles(fn) {
      vehicleProvider = typeof fn === "function" ? fn : () => [];
    },
    streamVariety,
  };
}

async function loadMarkets() {
  try {
    const res = await fetchJsonCached(roadsUrl());
    if (!res.ok) return [];
    const data = await res.json();
    return data.markets || [];
  } catch {
    return [];
  }
}

async function loadWalks() {
  try {
    const res = await fetchJsonCached(roadsUrl());
    if (!res.ok) return [];
    const data = await res.json();
    return data.walks || [];
  } catch (err) {
    console.warn("[cityview] walks unavailable", err);
    return [];
  }
}

/** Blender XY walks → Three XZ routes (z = −y). */
function buildWalkRoutes(walks, center) {
  const routes = [];
  for (const w of walks) {
    const pts = (w.points || [])
      .map((p) => ({ x: p[0], z: -p[1] }))
      .filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.z - arr[i - 1].z) > 0.05);
    if (pts.length < 2) continue;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    // Crossings are short on purpose; other walks need a few metres.
    if (w.kind !== "crossing" && len < 5) continue;
    routes.push({
      id: w.id,
      kind: w.kind || "sidewalk",
      safe: w.safe !== false,
      side: w.side || null,
      points: pts,
      length: len,
    });
  }
  if (routes.length) return routes;
  // Last resort: sidewalk-ish stubs beside spawn, not road centre.
  const cx = center.x;
  const cz = center.z;
  return [
    { id: "fallback0", kind: "sidewalk", safe: true, points: [{ x: cx - 18, z: cz }, { x: cx - 18, z: cz + 80 }], length: 80 },
    { id: "fallback1", kind: "sidewalk", safe: true, points: [{ x: cx + 12, z: cz - 10 }, { x: cx + 90, z: cz - 10 }], length: 78 },
  ];
}

/**
 * Cut `route` into its outdoor runs: samples every ~SPLIT_STEP_M, drops stretches where
 * `blocked(x, z)` says we are inside a building footprint. Original vertices are kept inside
 * a run so the geometry is untouched. Each piece carries `s0` (arc length of its start along
 * the source route) so walkers can be re-seated. Crossings are all-or-nothing (their ends
 * must stay on the kerb).
 */
function splitRouteOutdoors(route, blocked) {
  const pts = route.points;
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    seg.push(l);
    total += l;
  }
  const pieces = [];
  let cur = null;
  let indoor = 0;
  let samples = 0;
  let prev = { x: pts[0].x, z: pts[0].z, s: 0, out: !blocked(pts[0].x, pts[0].z) };
  samples++;
  if (!prev.out) indoor++;
  if (prev.out) cur = { points: [{ x: prev.x, z: prev.z }], s0: 0 };
  let cum = 0;
  const close = () => {
    if (cur) pieces.push(cur);
    cur = null;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(seg[i] / SPLIT_STEP_M));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const out = !blocked(x, z);
      samples++;
      if (!out) indoor++;
      const smp = { x, z, s: cum + seg[i] * t, out };
      const vertex = k === n; // a source vertex: keep it so curved runs stay curved
      if (prev.out && out) {
        if (vertex) cur.points.push({ x: b.x, z: b.z });
      } else if (prev.out && !out) {
        const last = cur.points[cur.points.length - 1];
        if (Math.hypot(last.x - prev.x, last.z - prev.z) > 0.05) cur.points.push({ x: prev.x, z: prev.z });
        close();
      } else if (!prev.out && out) {
        cur = { points: [{ x: smp.x, z: smp.z }], s0: smp.s };
      }
      prev = smp;
    }
    cum += seg[i];
  }
  close();
  if (route.kind === "crossing") {
    return indoor * 2 < samples ? [{ points: pts, s0: 0, length: total, whole: true }] : [];
  }
  const out = [];
  for (const pc of pieces) {
    let len = 0;
    for (let i = 0; i < pc.points.length - 1; i++) {
      len += Math.hypot(pc.points[i + 1].x - pc.points[i].x, pc.points[i + 1].z - pc.points[i].z);
    }
    if (len < 5) continue; // same floor as buildWalkRoutes
    pc.length = len;
    out.push(pc);
  }
  if (!indoor && out.length === 1) return [{ points: pts, s0: 0, length: total, whole: true }];
  return out;
}

function buildGraph(routes) {
  const ends = [];
  for (let i = 0; i < routes.length; i++) {
    const pts = routes[i].points;
    ends.push({ routeIdx: i, atEnd: false, x: pts[0].x, z: pts[0].z });
    ends.push({ routeIdx: i, atEnd: true, x: pts[pts.length - 1].x, z: pts[pts.length - 1].z });
  }
  const graph = new Map();
  for (const a of ends) {
    const key = `${a.routeIdx}:${a.atEnd ? "e" : "s"}`;
    const links = [];
    for (const b of ends) {
      if (a.routeIdx === b.routeIdx) continue;
      // Pieces of one split route must not re-join across the building gap that cut them.
      const sa = routes[a.routeIdx].src;
      if (sa !== undefined && sa === routes[b.routeIdx].src) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > JOIN_M) continue;
      links.push({ routeIdx: b.routeIdx, reverse: b.atEnd });
    }
    graph.set(key, links);
  }
  return graph;
}