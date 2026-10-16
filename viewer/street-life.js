/**
 * People at open café chairs and on surveyed benches, plus Antwerp wall plates
 * at the beginning of a named street. Built after play, not during the city download.
 */

import { fetchJsonCached } from "./json-cache.js";

const PLATE_KINDS = new Set([
  "residential",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "living_street",
]);
const NEAR_M = 48;
const PLATE_NEAR_M = 120;
const SIGN_NEAR_M = 70;
const STOP_NEAR_M = 90;
const MAX_PLATES = 8;
const MAX_TRAFFIC = 6;
/** One-way and no-entry discs sit on the carriageway. Off until they can stand on the kerb. */
const TRAFFIC_SIGNS = false;
const MAX_STOPS = 4;
/** Real Antwerp enamel is a short board, not a two-metre fascia. */
export const PLATE_WIDTH_M = 0.88;
export const PLATE_HEIGHT_M = 0.25;
/** Near edge of the plate, along the first-house wall from the street corner. */
export const PLATE_CORNER_M = 0.45;
/** Centre of the enamel, above the plinth. */
export const PLATE_Y_M = 2.8;
/**
 * Procedural wall skin is centred 12 cm outside the footprint and is 10 cm thick,
 * so the brick face is at 17 cm. The plate origin is its face; 19 cm puts the
 * enamel on that brick instead of out in the street.
 */
export const PLATE_PROUD_M = 0.19;

function hash01(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const STREET_SUFFIXES = [
  "STEENWEG",
  "STRAAT",
  "PLEIN",
  "DREEF",
  "LAAN",
  "KAAI",
  "BAAN",
  "LEI",
  "WEG",
  "PAD",
  "STEEG",
  "GANG",
  "MARKT",
];

/** "Maria Pijpelinckxstraat" → MARIA PIJPELINCKX + STRAAT, as on the enamel plates. */
export function splitStreetName(name) {
  const upper = String(name || "")
    .trim()
    .toUpperCase();
  for (const suf of STREET_SUFFIXES) {
    if (upper.endsWith(suf) && upper.length > suf.length + 1) {
      return { head: upper.slice(0, -suf.length).replace(/[-–—]+$/g, "").trim(), suffix: suf };
    }
  }
  return { head: upper, suffix: "" };
}

/** Long compound heads stack like the photo: MARIA / PIJPELINCX. */
export function plateNameLines(head) {
  const parts = String(head || "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length < 2) return [head];
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  if (first.length + last.length >= 10) return [first, last];
  return [head];
}

function trackedWidth(g, text, tracking) {
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + tracking;
  return Math.max(0, w - tracking);
}

function fillTracked(g, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + tracking;
  }
}

function fitTracked(g, text, maxW, startSize, minSize, startTrack) {
  let size = startSize;
  let tracking = startTrack;
  g.font = `500 ${size}px Helvetica Neue, Arial, sans-serif`;
  while (size > minSize && trackedWidth(g, text, tracking) > maxW) {
    size -= 3;
    tracking = Math.max(2, tracking - 0.25);
    g.font = `500 ${size}px Helvetica Neue, Arial, sans-serif`;
  }
  return { size, tracking };
}

function makePlateTexture(THREE, name) {
  const { head, suffix } = splitStreetName(name);
  const stacked = plateNameLines(head);
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 400;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  // Enamel rim: white edge, inset black line, white face again.
  const rim = 14;
  const ink = 3;
  g.strokeStyle = "#111111";
  g.lineWidth = ink;
  g.strokeRect(
    rim + ink / 2,
    rim + ink / 2,
    canvas.width - rim * 2 - ink,
    canvas.height - rim * 2 - ink,
  );
  g.fillStyle = "#111111";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = "500 26px Helvetica Neue, Arial, sans-serif";
  fillTracked(g, "ANTWERPEN", 36, 64, 10);
  const maxW = canvas.width - 72;
  const one = fitTracked(g, head, maxW, 96, 40, 8);
  const stackInstead = stacked.length > 1 && one.size < 58;
  if (stackInstead) {
    const top = fitTracked(g, stacked[0], maxW, 64, 32, 7);
    fillTracked(g, stacked[0], 36, 175, top.tracking);
    const bot = fitTracked(g, stacked[1], maxW, 64, 32, 7);
    fillTracked(g, stacked[1], 36, 268, bot.tracking);
  } else {
    fillTracked(g, head, 36, 230, one.tracking);
  }
  if (suffix) {
    g.font = "500 36px Helvetica Neue, Arial, sans-serif";
    const tw = trackedWidth(g, suffix, 8);
    fillTracked(g, suffix, canvas.width - 36 - tw, 352, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A plate at each true beginning of a named street (an endpoint that is not
 * the joint of two segments of the same name). Offset onto the first house wall.
 */
export function streetStartPlates(roads) {
  const cell = 10;
  const counts = new Map();
  const candidates = [];
  for (const road of roads || []) {
    if (!PLATE_KINDS.has(road.kind)) continue;
    const name = String(road.name || "").trim();
    if (!name) continue;
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const ends = [
      { p: pts[0], q: pts[1] },
      { p: pts[pts.length - 1], q: pts[pts.length - 2] },
    ];
    for (const { p, q } of ends) {
      const side = sidewalkOf(p, q);
      const key = `${Math.round(p[0] / cell)},${Math.round(p[1] / cell)}`;
      let per = counts.get(name);
      if (!per) counts.set(name, (per = new Map()));
      per.set(key, (per.get(key) || 0) + 1);
      candidates.push({ name, key, p, side });
    }
  }
  const seen = new Set();
  const plates = [];
  for (const c of candidates) {
    if ((counts.get(c.name).get(c.key) || 0) !== 1) continue;
    const id = `${c.name}:${c.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const fx = Math.sin(c.side.yaw);
    const fz = Math.cos(c.side.yaw);
    plates.push({
      name: c.name,
      x: c.p[0] + fx * 1.2,
      z: -c.p[1] + fz * 1.2,
      ox: c.side.ox,
      oz: c.side.oz,
      tx: fx,
      tz: fz,
      yaw: Math.atan2(-c.side.ox, -c.side.oz),
    });
  }
  return plates;
}

export function cornerPlates(roads) {
  return streetStartPlates(roads);
}

function sidewalkOf(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const tz = -dy / len;
  return { ox: -tz, oz: tx, yaw: Math.atan2(tx, tz) };
}

/** One-way arrow at the legal start, no-entry at the forbidden end. */
export function trafficSigns(roads) {
  const cell = 10;
  const bins = new Map();
  for (const road of roads || []) {
    if (!PLATE_KINDS.has(road.kind) || road.oneway !== 1) continue;
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const start = sidewalkOf(pts[0], pts[1]);
    const end = sidewalkOf(pts[pts.length - 1], pts[pts.length - 2]);
    const spots = [
      { kind: "oneway", p: pts[0], off: start, yaw: start.yaw },
      { kind: "noentry", p: pts[pts.length - 1], off: end, yaw: end.yaw },
    ];
    for (const s of spots) {
      const x = s.p[0] + s.off.ox * 2.2;
      const z = -s.p[1] + s.off.oz * 2.2;
      const key = `${s.kind}:${Math.round(x / cell)},${Math.round(z / cell)}`;
      if (bins.has(key)) continue;
      bins.set(key, { kind: s.kind, x, z, yaw: s.yaw });
    }
  }
  return [...bins.values()];
}

export function stopTotems(stops) {
  const seen = new Set();
  const out = [];
  for (const stop of stops || []) {
    const name = String(stop.name || "").trim();
    if (!name) continue;
    const x = stop.x;
    const z = -stop.y;
    const key = `${Math.round(x / 18)},${Math.round(z / 18)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "stop",
      name,
      lines: (stop.lines || []).slice(0, 4),
      mode: stop.mode || "tram",
      x,
      z,
    });
  }
  return out;
}

function paintDisc(g, fill, ring) {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ring;
  g.lineWidth = 14;
  g.stroke();
}

function makeTrafficTexture(THREE, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (kind === "noentry") {
    paintDisc(g, "#d40000", "#ffffff");
    g.fillStyle = "#ffffff";
    g.fillRect(46, 112, 164, 32);
  } else {
    paintDisc(g, "#003da5", "#ffffff");
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(58, 128);
    g.lineTo(168, 70);
    g.lineTo(168, 108);
    g.lineTo(204, 108);
    g.lineTo(204, 148);
    g.lineTo(168, 148);
    g.lineTo(168, 186);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStopTexture(THREE, name, lines) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f5c400";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#111111";
  g.font = "700 28px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const label = name.replace(/^Antwerpen\s+/, "");
  let size = 28;
  while (size > 16 && g.measureText(label).width > canvas.width - 36) {
    size -= 2;
    g.font = `700 ${size}px system-ui, sans-serif`;
  }
  g.fillText(label, canvas.width / 2, 70);
  g.font = "700 22px system-ui, sans-serif";
  const chips = lines.length ? lines.join("  ·  ") : "De Lijn";
  g.fillText(chips, canvas.width / 2, 168);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTrafficSign(THREE, kind) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a8e92 }),
  );
  pole.position.y = 1.1;
  const board = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 20),
    new THREE.MeshLambertMaterial({ map: makeTrafficTexture(THREE, kind), side: THREE.DoubleSide }),
  );
  board.position.y = 2.25;
  group.add(pole, board);
  return group;
}

function makeStopSign(THREE, name, lines) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 3.1, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a8e92 }),
  );
  pole.position.y = 1.55;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    new THREE.MeshLambertMaterial({ map: makeStopTexture(THREE, name, lines), side: THREE.DoubleSide }),
  );
  board.position.y = 3.05;
  group.add(pole, board);
  return group;
}

function disposeSlot(slot) {
  slot.mesh?.removeFromParent();
  slot.mesh?.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.map) o.material.map.dispose();
    if (o.material) o.material.dispose();
  });
  slot.mesh = null;
  slot.key = "";
}

/** Closest façade point within reach, nudged 40 cm toward the street. */
export function nearestFacade(x, z, buildings, maxReach = 18, side = null) {
  let best = null;
  let bestD = maxReach;
  let sideBest = null;
  let sideD = maxReach;
  for (const b of buildings || []) {
    const ring = b.ring || [];
    const n = ring.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const c = ring[(i + 1) % n];
      const ax = a[0];
      const az = -a[1];
      const bx = c[0];
      const bz = -c[1];
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz || 1e-6;
      let t = ((x - ax) * abx + (z - az) * abz) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = ax + abx * t;
      const pz = az + abz * t;
      const dx = x - px;
      const dz = z - pz;
      const d = Math.hypot(dx, dz);
      if (d >= maxReach) continue;
      const nl = d || 1;
      const hit = {
        x: px + (dx / nl) * PLATE_PROUD_M,
        z: pz + (dz / nl) * PLATE_PROUD_M,
        yaw: Math.atan2(dx, dz),
      };
      if (d < bestD) {
        bestD = d;
        best = hit;
      }
      const onSide = !side || (px - x) * side.ox + (pz - z) * side.oz >= -0.05;
      if (onSide && d < sideD) {
        sideD = d;
        sideBest = hit;
      }
    }
  }
  return sideBest || best;
}

/** First-house corner on the sidewalk side, plus the two walls that meet there. */
export function nearestStreetCorner(x, z, buildings, maxReach = 18, side = null) {
  let best = null;
  let bestD = maxReach;
  let sideBest = null;
  let sideD = maxReach;
  for (const b of buildings || []) {
    const ring = b.ring || [];
    const n = ring.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const vx = ring[i][0];
      const vz = -ring[i][1];
      const d = Math.hypot(x - vx, z - vz);
      if (d >= maxReach) continue;
      const prev = ring[(i + n - 1) % n];
      const next = ring[(i + 1) % n];
      const hit = {
        x: vx,
        z: vz,
        segs: [
          { ax: vx, az: vz, bx: prev[0], bz: -prev[1] },
          { ax: vx, az: vz, bx: next[0], bz: -next[1] },
        ],
      };
      if (d < bestD) {
        bestD = d;
        best = hit;
      }
      const onSide = !side || (vx - x) * side.ox + (vz - z) * side.oz >= -0.05;
      if (onSide && d < sideD) {
        sideD = d;
        sideBest = hit;
      }
    }
  }
  return sideBest || best;
}

function plateOnCornerWall(p, corner) {
  const tx = p.tx ?? p.oz ?? 0;
  const tz = p.tz ?? -(p.ox ?? 0);
  const half = PLATE_WIDTH_M * 0.5;
  const need = PLATE_CORNER_M + PLATE_WIDTH_M + 0.15;
  let seg = null;
  let bestDot = -1;
  let longest = corner.segs[0];
  let longestLen = 0;
  for (const s of corner.segs) {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const len = Math.hypot(dx, dz) || 1;
    if (len > longestLen) {
      longestLen = len;
      longest = s;
    }
    const dot = Math.abs((dx / len) * tx + (dz / len) * tz);
    if (dot >= bestDot) {
      bestDot = dot;
      seg = s;
    }
  }
  const alignedLen = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
  // A short corner return (chamfer, step) cannot hold the plate; use the long wall.
  if (alignedLen < need && longestLen > alignedLen) seg = longest;
  const dx = seg.bx - seg.ax;
  const dz = seg.bz - seg.az;
  const len = Math.hypot(dx, dz) || 1;
  const slide = Math.min(PLATE_CORNER_M + half, Math.max(half + 0.04, len - half - 0.04));
  const wx = seg.ax + (dx / len) * slide;
  const wz = seg.az + (dz / len) * slide;
  let nx = -dz / len;
  let nz = dx / len;
  if ((p.x - wx) * nx + (p.z - wz) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return {
    x: wx + nx * PLATE_PROUD_M,
    z: wz + nz * PLATE_PROUD_M,
    yaw: Math.atan2(nx, nz),
  };
}

/** Sit each street-start plate on the first-house wall, inset from the corner. */
export function attachPlatesToFacades(plates, buildings) {
  return (plates || []).map((p) => {
    const corner = nearestStreetCorner(p.x, p.z, buildings, 18, { ox: p.ox || 0, oz: p.oz || 0 });
    if (corner) return { ...p, ...plateOnCornerWall(p, corner) };
    const w = nearestFacade(p.x, p.z, buildings, 18, { ox: p.ox || 0, oz: p.oz || 0 });
    if (w) return { ...p, x: w.x, z: w.z, yaw: w.yaw };
    return {
      ...p,
      x: p.x + (p.ox || 0) * 5.2,
      z: p.z + (p.oz || 0) * 5.2,
    };
  });
}

function makeSign(THREE, name) {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(PLATE_WIDTH_M + 0.02, PLATE_HEIGHT_M + 0.01, 0.022),
    new THREE.MeshLambertMaterial({ color: 0xf7f7f5 }),
  );
  back.position.set(0, PLATE_Y_M, -0.012);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE_WIDTH_M, PLATE_HEIGHT_M),
    new THREE.MeshLambertMaterial({ map: makePlateTexture(THREE, name), side: THREE.DoubleSide }),
  );
  board.position.y = PLATE_Y_M;
  group.add(back, board);
  return group;
}

/**
 * @param {object} opts
 * @param {*} opts.THREE
 * @param {*} opts.scene
 * @param {object} [opts.people] people pool
 * @param {{ seats?: () => object[] }} [opts.terraces]
 * @param {(x: number, z: number) => number} [opts.groundAt]
 * @param {(x: number, z: number) => boolean} [opts.inside]
 * @param {boolean} [opts.tight]
 */
export function createStreetLife(opts) {
  const { THREE, scene } = opts;
  const cap = opts.tight ? 2 : 4;
  const seated = [];
  const signs = [];
  const trafficSlots = [];
  const stopSlots = [];
  let plates = [];
  let benches = [];
  let traffic = [];
  let stops = [];
  let started = false;
  let refreshing = false;
  let acc = 0;

  async function loadPlates() {
    const url =
      (typeof window.districtUrl === "function" && window.districtUrl("map.json")) || "./map.json";
    try {
      const res = await fetchJsonCached(url);
      if (!res.ok) return;
      const doc = await res.json();
      let next = streetStartPlates(doc.roads);
      const burl =
        (typeof window.districtUrl === "function" && window.districtUrl("buildings.json")) ||
        "./buildings.json";
      try {
        const bres = await fetchJsonCached(burl);
        if (bres.ok) {
          const bdoc = await bres.json();
          next = attachPlatesToFacades(next, bdoc.buildings);
        }
      } catch (err) {
        console.warn("[metropolis] plate façades skipped", err);
      }
      plates = next;
      console.info(`[metropolis] street plates: ${plates.length}`);
    } catch (err) {
      console.warn("[metropolis] street plates skipped", err);
    }
  }

  async function loadTraffic() {
    const url =
      (typeof window.districtUrl === "function" && window.districtUrl("roads.json")) || "./roads.json";
    try {
      const res = await fetchJsonCached(url);
      if (!res.ok) return;
      const doc = await res.json();
      traffic = trafficSigns(doc.roads);
    } catch (err) {
      console.warn("[metropolis] traffic signs skipped", err);
    }
  }

  async function loadStops() {
    const url =
      (typeof window.districtUrl === "function" && window.districtUrl("transit.json")) || "./transit.json";
    try {
      const res = await fetchJsonCached(url);
      if (!res.ok) return;
      const doc = await res.json();
      stops = stopTotems(doc.stops);
    } catch (err) {
      console.warn("[metropolis] stop totems skipped", err);
    }
  }

  async function loadBenches() {
    const url =
      (typeof window.districtUrl === "function" && window.districtUrl("props.json")) || "./props.json";
    try {
      const res = await fetchJsonCached(url);
      if (!res.ok) return;
      const doc = await res.json();
      const out = [];
      for (const box of doc.boxes || []) {
        // Benches are the only boxes exported with a 0.3 m half-depth.
        if (Math.abs(box[4] - 0.3) > 0.001) continue;
        const yaw = box[2];
        if (hash01(`bench:${box[0]}:${box[1]}`) > 0.28) continue;
        out.push({
          id: `bench:${box[0]}:${box[1]}`,
          x: box[0] + Math.sin(yaw) * 0.35,
          z: -box[1] + Math.cos(yaw) * 0.35,
          y: NaN,
          yaw,
        });
      }
      benches = out;
    } catch (err) {
      console.warn("[metropolis] bench sitters skipped", err);
    }
  }

  function placeSign(slot, plate) {
    const key = `${plate.name}:${plate.x.toFixed(1)}:${plate.z.toFixed(1)}`;
    if (!slot.mesh || slot.key !== key) {
      disposeSlot(slot);
      slot.mesh = makeSign(THREE, plate.name);
      slot.key = key;
      scene.add(slot.mesh);
    }
    const gy = opts.groundAt ? opts.groundAt(plate.x, plate.z) : 0;
    slot.mesh.position.set(plate.x, Number.isFinite(gy) ? gy : 0, plate.z);
    slot.mesh.rotation.y = plate.yaw ?? 0;
    slot.mesh.visible = true;
  }

  function placeFacing(slot, item, make) {
    const key = `${item.kind}:${item.x.toFixed(1)}:${item.z.toFixed(1)}`;
    if (!slot.mesh || slot.key !== key) {
      disposeSlot(slot);
      slot.mesh = make();
      slot.key = key;
      scene.add(slot.mesh);
    }
    const gy = opts.groundAt ? opts.groundAt(item.x, item.z) : 0;
    slot.mesh.position.set(item.x, Number.isFinite(gy) ? gy : 0, item.z);
    slot.mesh.rotation.y = item.yaw ?? 0;
    slot.mesh.visible = true;
  }

  function syncPool(list, slots, radius, cap, place) {
    const r2 = radius * radius;
    const near = list
      .map((p) => ({ p, d: (p.x - pxNow) * (p.x - pxNow) + (p.z - pzNow) * (p.z - pzNow) }))
      .filter((r) => r.d < r2)
      .sort((a, b) => a.d - b.d)
      .slice(0, cap);
    for (let i = 0; i < near.length; i++) {
      if (!slots[i]) slots[i] = { mesh: null, key: "" };
      place(slots[i], near[i].p);
    }
    for (let i = near.length; i < slots.length; i++) {
      if (slots[i].mesh) slots[i].mesh.visible = false;
    }
  }

  let pxNow = 0;
  let pzNow = 0;

  function syncPlates(px, pz) {
    pxNow = px;
    pzNow = pz;
    syncPool(plates, signs, PLATE_NEAR_M, MAX_PLATES, (slot, p) => placeSign(slot, p));
    if (TRAFFIC_SIGNS) {
      syncPool(traffic, trafficSlots, SIGN_NEAR_M, MAX_TRAFFIC, (slot, p) =>
        placeFacing(slot, p, () => makeTrafficSign(THREE, p.kind)),
      );
    }
    syncPool(stops, stopSlots, STOP_NEAR_M, MAX_STOPS, (slot, p) =>
      placeFacing(slot, { ...p, yaw: Math.atan2(px - p.x, pz - p.z) }, () =>
        makeStopSign(THREE, p.name, p.lines),
      ),
    );
  }

  async function syncPeople(px, pz) {
    if (refreshing || !opts.people) return;
    refreshing = true;
    try {
      const spots = [];
      for (const s of opts.terraces?.seats?.() || []) {
        if (hash01(s.id) > 0.4) continue;
        spots.push(s);
      }
      for (const s of benches) spots.push(s);
      const want = spots
        .map((s) => ({ s, d: (s.x - px) ** 2 + (s.z - pz) ** 2 }))
        .filter((r) => r.d < NEAR_M * NEAR_M && r.d > 1.4)
        .sort((a, b) => a.d - b.d)
        .slice(0, cap)
        .map((r) => r.s);
      const keep = new Set(want.map((s) => s.id));
      for (let i = seated.length - 1; i >= 0; i--) {
        if (keep.has(seated[i].id)) continue;
        seated[i].inst.root.removeFromParent();
        opts.people.release(seated[i].inst);
        seated.splice(i, 1);
      }
      const have = new Set(seated.map((s) => s.id));
      for (const spot of want) {
        if (have.has(spot.id) || seated.length >= cap) continue;
        if (opts.inside?.(spot.x, spot.z)) continue;
        const t = opts.people.pickTemplate((p) => p.age !== "child");
        if (!t) break;
        const inst = opts.people.instance(t);
        await opts.people.loadIdle(t);
        opts.people.setIdle(inst, true, 0);
        const gy = Number.isFinite(spot.y) ? spot.y : opts.groundAt?.(spot.x, spot.z);
        inst.root.position.set(spot.x, Number.isFinite(gy) ? gy : 0, spot.z);
        inst.root.rotation.y = spot.yaw;
        scene.add(inst.root);
        seated.push({ id: spot.id, inst });
      }
    } finally {
      refreshing = false;
    }
  }

  function start() {
    if (started) return;
    started = true;
    void loadPlates();
    void loadBenches();
    if (TRAFFIC_SIGNS) void loadTraffic();
    void loadStops();
  }

  function update(dt, x, z) {
    if (!started) return;
    for (const s of seated) s.inst.mixer.update(dt);
    acc += dt;
    const first = plates.length && signs.length === 0;
    if (!first && acc < 1.2) return;
    acc = 0;
    syncPlates(x, z);
    void syncPeople(x, z);
  }

  return { start, update };
}
