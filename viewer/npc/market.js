/**
 * Open-air markets. Street crowds keep a fast purposeful pace. Inside an open
 * market they stroll, and some stop at a stall: one buyer at the counter,
 * two or three waiting behind.
 *
 * Rings are Blender XY. Crowd positions are Three.js (z = −y).
 */

export const STREET_MPS = 1.55;
export const STROLL_MPS = 0.62;
export const QUEUE_MAX = 3;
export const DEAL_S = [7, 12];
const SLOT_GAP = 0.8;
const ARRIVE_M = 0.4;
const PITCH = 3.35;
const MAX_STALLS = 14;
const AISLE = 2.4;
const COUNTER = 1.2;

export const STALL_LOOK = {
  vegetables: { cloth: 0x2f7d32, goods: 0x7cb342 },
  arab: { cloth: 0xc45c26, goods: 0xd4a017 },
  oysters: { cloth: 0x1f4e79, goods: 0xe7eef2 },
  antique: { cloth: 0x6b3e2e, goods: 0xc4a574 },
  food: { cloth: 0xf2c14e, goods: 0xd32f2f },
};

const WEEKDAY = {
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
};

/** "8.00" / "11.30" → hours. */
export function parseClock(raw) {
  if (raw == null || raw === "") return null;
  const [h, m] = String(raw).replace(",", ".").split(".");
  const hh = Number(h);
  const mm = Number(m || 0);
  if (!Number.isFinite(hh)) return null;
  return hh + (mm > 0 && mm < 60 ? mm : 0) / 60;
}

export function weekdayIndex(name) {
  return WEEKDAY[String(name || "").trim().toLowerCase()];
}

/** Stall mix from the city's `soort`. Parking rows are not a market. */
export function stallRecipes(kind) {
  const s = String(kind || "").toLowerCase();
  if (!s || s.includes("parkeer")) return [];
  if (s.includes("antiek")) return ["antique", "antique", "food", "oysters"];
  if (s.includes("exot")) return ["arab", "arab", "vegetables", "food"];
  if (s.includes("bio")) return ["vegetables", "vegetables", "oysters", "food"];
  if (s.includes("vogel")) return ["food", "vegetables", "arab"];
  return ["vegetables", "food", "arab", "oysters", "antique"];
}

export function marketIsOpen(market, hour, day) {
  if (!market || !stallRecipes(market.kind).length) return false;
  const days = (market.days || []).map(weekdayIndex).filter((d) => d != null);
  if (days.length && !days.includes(((day % 7) + 7) % 7)) return false;
  const open = parseClock(market.from);
  const close = parseClock(market.until);
  if (open == null || close == null) return true;
  const h = ((hour % 24) + 24) % 24;
  return h >= open && h < close;
}

export function pointInRing(x, y, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function centroid(ring) {
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}

function principalAxis(ring) {
  const [cx, cy] = centroid(ring);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of ring) {
    const x = p[0] - cx;
    const y = p[1] - cy;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  const tr = xx + yy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (xx * yy - xy * xy)));
  const l = tr / 2 + disc;
  let vx = xy;
  let vy = l - xx;
  if (Math.abs(vx) + Math.abs(vy) < 1e-6) {
    vx = 1;
    vy = 0;
  }
  const n = Math.hypot(vx, vy) || 1;
  return { cx, cy, ux: vx / n, uy: vy / n, px: -vy / n, py: vx / n };
}

function spanOn(ring, ox, oy, dx, dy) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of ring) {
    const t = (p[0] - ox) * dx + (p[1] - oy) * dy;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return max - min;
}

/**
 * A street-market aisle, not a stall on every square metre of the city polygon.
 * The long axis of the ring is the aisle. Stalls sit in one row, or two rows
 * facing each other when the square is wide enough. Pitch is 3.35 m. The run
 * is capped so a 250 m ground polygon does not become a hundred tables.
 */
export function layoutStalls(market) {
  const recipes = stallRecipes(market.kind);
  const ring = market.ring || [];
  if (!recipes.length || ring.length < 3) return [];
  const axis = principalAxis(ring);
  const length = Math.min(46, Math.max(8, spanOn(ring, axis.cx, axis.cy, axis.ux, axis.uy) - 4));
  const width = spanOn(ring, axis.cx, axis.cy, axis.px, axis.py);
  const rows = width > 14 ? 2 : 1;
  const along = Math.max(1, Math.floor(length / PITCH));
  const n = Math.min(MAX_STALLS, Math.max(recipes.length, along * rows));
  const stalls = [];
  const side = [-AISLE * 0.5, AISLE * 0.5];
  for (let i = 0; i < n; i++) {
    const col = Math.floor(i / rows);
    const row = rows === 1 ? 0 : i % 2;
    const t = (col - (Math.ceil(n / rows) - 1) / 2) * PITCH;
    const o = rows === 1 ? 0 : side[row];
    const x = axis.cx + axis.ux * t + axis.px * o;
    const y = axis.cy + axis.uy * t + axis.py * o;
    if (!pointInRing(x, y, ring)) continue;
    const faceB = rows === 1 ? 1 : row === 0 ? 1 : -1;
    const fx = axis.px * faceB;
    const fy = axis.py * faceB;
    const fl = Math.hypot(fx, fy) || 1;
    stalls.push({
      id: `${market.name || "markt"}:${stalls.length}`,
      kind: recipes[stalls.length % recipes.length],
      x,
      y,
      tx: x,
      tz: -y,
      faceX: fx / fl,
      faceZ: -(fy / fl),
      buyer: null,
      queue: [],
      dealing: false,
      phase: "",
    });
  }
  return stalls;
}

export function buildMarkets(rows) {
  const out = [];
  for (const row of rows || []) {
    if (!stallRecipes(row.kind).length) continue;
    if (!row.ring || row.ring.length < 3) continue;
    out.push({
      name: row.name || "Markt",
      kind: row.kind || "",
      days: row.days || [],
      from: row.from || "",
      until: row.until || "",
      ring: row.ring,
      stalls: layoutStalls(row),
    });
  }
  return out;
}

/** Three.js (x, z) inside an open market, or null. */
export function marketAt(markets, x, z, hour, day) {
  const bx = x;
  const by = -z;
  for (const market of markets || []) {
    if (!marketIsOpen(market, hour, day)) continue;
    if (pointInRing(bx, by, market.ring)) return market;
  }
  return null;
}

/** One buyer, then up to QUEUE_MAX waiting. Returns the stall or null. */
export function claimStall(market, personId) {
  let already = null;
  let best = null;
  let bestN = Infinity;
  for (const stall of market.stalls || []) {
    if (stall.buyer === personId || stall.queue.includes(personId)) already = stall;
    const n = (stall.buyer ? 1 : 0) + stall.queue.length;
    if (n >= 1 + QUEUE_MAX) continue;
    if (n < bestN) {
      best = stall;
      bestN = n;
    }
  }
  if (already) return already;
  if (!best) return null;
  if (!best.buyer) best.buyer = personId;
  else best.queue.push(personId);
  return best;
}

export function releasePerson(market, personId) {
  for (const stall of market.stalls || []) {
    if (stall.buyer === personId) stall.buyer = stall.queue.shift() || null;
    else {
      const i = stall.queue.indexOf(personId);
      if (i >= 0) stall.queue.splice(i, 1);
    }
  }
}

export function queueSlot(stall, personId) {
  let index = -1;
  if (stall.buyer === personId) index = 0;
  else {
    const q = stall.queue.indexOf(personId);
    if (q >= 0) index = q + 1;
  }
  if (index < 0) return null;
  const front = COUNTER + index * SLOT_GAP;
  return {
    x: stall.tx + stall.faceX * front,
    z: stall.tz + stall.faceZ * front,
    dealing: index === 0,
  };
}

/**
 * Walk a visitor to their slot. The buyer stands for a deal, then leaves;
 * the next person in the queue becomes the buyer.
 * `visitor` is `{ id, x, z, dealLeft }`.
 */
export function stepVisitor(visitor, stall, dt, stroll = STROLL_MPS) {
  const slot = queueSlot(stall, visitor.id);
  if (!slot) return { moving: false, done: true, dealing: false };
  const dx = slot.x - visitor.x;
  const dz = slot.z - visitor.z;
  const dist = Math.hypot(dx, dz);
  if (dist > ARRIVE_M) {
    const step = Math.min(dist, stroll * dt);
    visitor.x += (dx / dist) * step;
    visitor.z += (dz / dist) * step;
    visitor.hx = dx;
    visitor.hz = dz;
    if (stall.buyer === visitor.id) {
      stall.dealing = false;
      stall.phase = "";
    }
    return { moving: true, done: false, dealing: false };
  }
  visitor.x = slot.x;
  visitor.z = slot.z;
  if (!slot.dealing) {
    if (stall.buyer !== visitor.id) stall.dealing = false;
    return { moving: false, done: false, dealing: false };
  }
  if (visitor.dealLeft == null) {
    visitor.dealLeft = DEAL_S[0] + Math.random() * (DEAL_S[1] - DEAL_S[0]);
  }
  visitor.dealLeft -= dt;
  const span = Math.max(0.1, visitor.dealLeft);
  stall.dealing = true;
  stall.phase = span > 6 ? "talk" : span > 2.5 ? "pay" : "bag";
  if (visitor.dealLeft > 0) return { moving: false, done: false, dealing: true };
  if (stall.buyer === visitor.id) stall.buyer = stall.queue.shift() || null;
  visitor.dealLeft = null;
  stall.dealing = false;
  stall.phase = "";
  return { moving: false, done: true, dealing: false };
}
