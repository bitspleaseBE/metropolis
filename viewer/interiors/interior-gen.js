/**
 * Seeded shop-interior layouts (records from interiors.json, cityview/interiors.py).
 *
 * Pure data, no THREE: generateInterior(rec) returns the room size, the furniture placements
 * (furniture.js item names), extra models (cars), wall colliders, customer spots, staff spots,
 * a navigation grid and the player spawn. The same record always yields the same room, so a
 * revisit after the LRU cache dropped it still looks the same.
 *
 * Interior frame: x along the street wall (the façade tangent, room centred on the shop sign),
 * z along the façade normal; the street wall is z = 0 and the room spans z ∈ [−d, 0]. The door
 * gap is centred on x = doorA. Yaw rotates about +Y: a yaw of a faces (sin a, cos a).
 */
import { mulberry32 } from "./rng.js";

/** Half footprints [x, z] per item in its own frame, for overlap checks. null = decor. */
const SIZE = {
  gondola: [1.0, 0.45],
  wallShelf: [0.9, 0.23],
  pharmacyShelf: [0.9, 0.23],
  partsShelf: [0.9, 0.23],
  fridge: [1.0, 0.41],
  checkout: [0.95, 0.36],
  crateStand: [0.7, 0.45],
  counter: [1.05, 0.35],
  displayCase: [0.9, 0.4],
  barCounter: [1.55, 0.42],
  backBar: [1.3, 0.18],
  stool: [0.2, 0.2],
  table: [0.4, 0.4],
  tableRound: [0.37, 0.37],
  chair: [0.21, 0.21],
  bankCounter: [1.25, 0.4],
  atm: [0.41, 0.34],
  queuePost: [0.16, 0.16],
  queueBelt: [0.5, 0.04],
  bench: [0.9, 0.23],
  reception: [1.35, 0.43],
  waitChairs: [0.8, 0.28],
  bed: [0.5, 1.0],
  curtain: [0.5, 0.03],
  carLift: [1.85, 0.3],
  toolWall: [1.22, 0.4],
  tyreStack: [0.34, 0.34],
  plant: [0.26, 0.26],
  kitchenLine: [1.2, 0.4],
  desk: [0.7, 0.36],
  till: null,
  espresso: null,
  menuBoard: null,
  lightPanel: null,
  doorMat: null,
};

const STYLE = {
  supermarket: { h: 4.2, floor: "tile", wall: 0xeeeeea, front: 0x2f3134 },
  grocery: { h: 3.2, floor: "tile", wall: 0xf1ede4, front: 0x3a3c40 },
  restaurant: { h: 3.3, floor: "wood", wall: 0xe8dccb, front: 0x3b2f27 },
  bar_coffee: { h: 3.3, floor: "wood", wall: 0xe9dfcf, front: 0x3b2f27 },
  bank: { h: 3.6, floor: "terrazzo", wall: 0xf3f2ef, front: 0x2c3036 },
  care: { h: 3.2, floor: "vinyl", wall: 0xf4f7f6, front: 0x40464c },
  garage: { h: 5.0, floor: "concrete", wall: 0xd9dcdf, front: 0x34383c },
};
const VARIANT_STYLE = {
  fastfood: { floor: "tile", wall: 0xf4efe6 },
  frituur: { floor: "checker", wall: 0xf6f1e3 },
  brown: { floor: "wood", wall: 0x6b4a33, ceiling: 0x4a3324 },
  cocktail: { floor: "terrazzo", wall: 0x2a2433, ceiling: 0x1f1b26 },
  coffee: { floor: "checker", wall: 0xefe8dc },
  showroom: { floor: "terrazzo", h: 4.2, wall: 0xf2f2f0 },
  pharmacy: { floor: "tile" },
};

const DOOR_W = 1.0;
const CELL = 0.3; // navigation grid, metres
const NPC_R = 0.22;
const PI = Math.PI;
const HALF = PI / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Room width (along the street) and door offset for a record, as the layout uses them. */
export function roomFrame(rec) {
  const w = clamp(Number(rec.w) || 6, 3.6, 40);
  const d = clamp(Number(rec.d) || 8, 4.2, 32);
  return { w, d, doorX: clamp(Number(rec.doorA) || 0, -w / 2 + 0.75, w / 2 - 0.75) };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Layout {
  constructor(rec, R) {
    const style = { ...(STYLE[rec.template] || STYLE.grocery), ...(VARIANT_STYLE[rec.variant] || {}) };
    this.rec = rec;
    this.R = R;
    this.size = rec.size || "M";
    Object.assign(this, roomFrame(rec));
    this.h = style.h;
    this.style = style;
    // Door side (+1 right, −1 left of centre when facing in from the street); `far` is the other.
    this.side = this.doorX >= 0 ? 1 : -1;
    this.far = -this.side;
    this.placements = [];
    this.props = [];
    this.solids = []; // AABBs [x0, z0, x1, z1] of everything placed
    this.spots = [];
    this.staffSpots = [];
    this.keepClear = [[this.doorX - 0.9, -2.0, this.doorX + 0.9, 0.5]];
  }

  aabb(item, x, z, yaw, sx = 1, sz = 1) {
    const s = SIZE[item];
    if (!s) return null;
    const hx = s[0] * sx;
    const hz = s[1] * sz;
    const c = Math.abs(Math.cos(yaw));
    const n = Math.abs(Math.sin(yaw));
    const ex = c * hx + n * hz;
    const ez = n * hx + c * hz;
    return [x - ex, z - ez, x + ex, z + ez];
  }

  free(box, ignoreSolids = false) {
    const { w, d } = this;
    if (box[0] < -w / 2 - 1e-3 || box[2] > w / 2 + 1e-3 || box[1] < -d - 1e-3 || box[3] > 1e-3) return false;
    const hit = (o) => box[0] < o[2] - 1e-3 && box[2] > o[0] + 1e-3 && box[1] < o[3] - 1e-3 && box[3] > o[1] + 1e-3;
    if (this.keepClear.some(hit)) return false;
    return ignoreSolids || !this.solids.some(hit);
  }

  /** Place an item if it fits (inside the room, clear of the door and earlier solids). */
  put(item, x, z, yaw = 0, opts = {}) {
    const box = this.aabb(item, x, z, yaw, opts.sx, opts.sz);
    if (box && !this.free(box, opts.overlap)) return false;
    const p = { item, x: +x.toFixed(3), z: +z.toFixed(3), yaw };
    for (const k of ["y", "sx", "sz", "color"]) if (opts[k] != null) p[k] = opts[k];
    this.placements.push(p);
    if (box && !opts.overlap) this.solids.push(box);
    return true;
  }

  /** Customer spot: stand at (x, z) facing `face`; kind is browse / sit / queue / counter. */
  spot(x, z, face, kind = "browse", extra) {
    this.spots.push({ x, z, face, kind, ...extra });
  }

  staff(role, x, z, face) {
    this.staffSpots.push({ role, x, z, face });
  }

  /** Browse spot in front of a placed item (front = its local +Z), `gap` metres out. */
  front(item, x, z, yaw, gap = 0.5, kind = "browse") {
    const s = SIZE[item] || [0, 0];
    this.spot(x + Math.sin(yaw) * (s[1] + gap), z + Math.cos(yaw) * (s[1] + gap), yaw + PI, kind);
  }

  /** Wall frame: centre of an item of half depth hz flush to `wall` at offset t along it. */
  wallPose(wall, t, hz) {
    const { w, d } = this;
    if (wall === "back") return [t, -d + hz, 0];
    if (wall === "left") return [-w / 2 + hz, t, HALF];
    return [w / 2 - hz, t, -HALF];
  }

  /**
   * Run of `item` (length 2·halfX) along a wall between t0 and t1 (x for the back wall, z for
   * the side walls). Each one that fits gets a browse spot in front.
   */
  wallRun(wall, item, t0, t1, opts = {}) {
    const [hx, hz] = SIZE[item];
    const len = 2 * hx + (opts.gap || 0);
    const lo = Math.min(t0, t1);
    const n = Math.floor((Math.max(t0, t1) - lo + (opts.gap || 0)) / len);
    if (n < 1) return 0;
    const start = lo + (Math.max(t0, t1) - lo - n * len + (opts.gap || 0)) / 2 + hx;
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const [x, z, yaw] = this.wallPose(wall, start + i * len, hz);
      if (this.put(item, x, z, yaw)) {
        placed++;
        if (opts.spots !== false) this.front(item, x, z, yaw, opts.spotGap ?? 0.5);
      }
    }
    return placed;
  }

  /** First candidate [x, z, yaw] that fits; returns it or null. */
  putFirst(item, candidates, opts) {
    for (const [x, z, yaw] of candidates) if (this.put(item, x, z, yaw, opts)) return [x, z, yaw];
    return null;
  }

  /**
   * Tables with chairs on a grid inside a rectangle. A walkway from the door to the back stays
   * clear, and the grid is wider across the chairs than along the rows so people get between.
   */
  tables(x0, x1, z0, z1, { kind = "table", chairs = 2 } = {}) {
    const px = chairs ? 2.5 : 1.6;
    const pz = chairs === 4 ? 2.5 : 1.8;
    const zs = [];
    const xs = [];
    const nx = Math.floor((x1 - x0) / px);
    const nz = Math.floor((z1 - z0) / pz);
    for (let i = 0; i < nx; i++) xs.push(x0 + (x1 - x0 - nx * px) / 2 + px * (i + 0.5));
    for (let j = 0; j < nz; j++) zs.push(z0 + (z1 - z0 - nz * pz) / 2 + pz * (j + 0.5));
    const spine = [this.doorX - 0.65, -this.d, this.doorX + 0.65, 0];
    let n = 0;
    for (const x of xs) {
      for (const z of zs) {
        // Check the table with its chairs, but only block the furniture itself.
        const reach = chairs ? 0.82 : 0.45;
        const box = [x - reach, z - (chairs > 2 ? reach : 0.45), x + reach, z + (chairs > 2 ? reach : 0.45)];
        if (!this.free(box)) continue;
        if (box[0] < spine[2] && box[2] > spine[0]) continue;
        this.put(kind, x, z, this.R() * 0.3, { overlap: true });
        this.solids.push([x - 0.45, z - 0.45, x + 0.45, z + 0.45]);
        n++;
        const seats = chairs === 4 ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : chairs === 2 ? [[-1, 0], [1, 0]] : [];
        for (const [sx, sz] of seats) {
          const cx = x + sx * 0.6;
          const cz = z + sz * 0.6;
          const face = Math.atan2(-sx, -sz); // the sitter faces the table
          if (kind === "tableRound" && this.rec.variant === "cocktail") this.put("stool", cx, cz, 0, { overlap: true });
          else this.put("chair", cx, cz, face, { overlap: true });
          this.solids.push([cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2]);
          // The stand point stays in the aisle (pathfinding). seatX/seatZ is the chair.
          this.spot(x + sx * 0.95, z + sz * 0.95, face, "sit", { seatX: cx, seatZ: cz });
        }
        if (!chairs) this.spot(x, z + 0.75, PI, "sit");
      }
    }
    return n;
  }

  /** Free a strip (e.g. staff space behind a counter) so later items stay out of it. */
  reserve(x0, z0, x1, z1) {
    this.solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }

  finish() {
    const { w, d, h, doorX } = this;
    this.put("doorMat", doorX, -0.55, 0);
    // Ceiling light panels on a grid.
    const cols = Math.max(1, Math.round(w / 3.2));
    const rows = Math.max(1, Math.round(d / 2.8));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.placements.push({
          item: "lightPanel",
          x: +(-w / 2 + (w / cols) * (i + 0.5)).toFixed(3),
          z: +(-d + (d / rows) * (j + 0.5)).toFixed(3),
          y: h - 0.03,
          yaw: 0,
        });
      }
    }
    // Navigation grid: 1 = blocked. Walls, door strip and every solid, grown by an NPC radius.
    const nx = Math.ceil(w / CELL);
    const nz = Math.ceil(d / CELL);
    const grid = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = -w / 2 + (i + 0.5) * CELL;
        const z = -d + (j + 0.5) * CELL;
        let b = x < -w / 2 + NPC_R || x > w / 2 - NPC_R || z < -d + NPC_R || z > -0.9;
        if (!b) {
          for (const o of this.solids) {
            if (x > o[0] - NPC_R && x < o[2] + NPC_R && z > o[1] - NPC_R && z < o[3] + NPC_R) {
              b = true;
              break;
            }
          }
        }
        grid[j * nx + i] = b ? 1 : 0;
      }
    }
    const nav = { cell: CELL, nx, nz, x0: -w / 2, z0: -d, grid };
    // Customer spots must stand on a free cell (snap to the nearest one within 1 m).
    const spots = [];
    for (const s of this.spots) {
      const c = nearestFree(nav, s.x, s.z, 3);
      if (c) spots.push({ ...s, x: c[0], z: c[1] });
    }
    const T = 0.12;
    const segments = [
      [-w / 2, -d, w / 2, -d, T],
      [-w / 2, -d, -w / 2, 0, T],
      [w / 2, -d, w / 2, 0, T],
      [-w / 2, 0, doorX - DOOR_W / 2, 0, T],
      [doorX + DOOR_W / 2, 0, w / 2, 0, T],
      // The doorway itself: leaving goes through the walk-out, never by pushing through.
      [doorX - DOOR_W / 2, 0.12, doorX + DOOR_W / 2, 0.12, T],
    ];
    return {
      id: this.rec.id,
      template: this.rec.template,
      variant: this.rec.variant,
      size: this.size,
      w,
      d,
      h,
      floor: this.style.floor,
      wall: this.style.wall,
      front: this.style.front,
      ceiling: this.style.ceiling,
      door: { x: doorX, w: DOOR_W },
      sign: { x: this.signX ?? 0 },
      placements: this.placements,
      props: this.props,
      solids: this.solids.filter((o) => o.solid).map((o) => o.slice(0, 4)),
      segments,
      spots,
      staffSpots: this.staffSpots,
      nav,
      spawn: { x: doorX, z: -1.5, face: PI },
    };
  }
}

/** Nearest walkable cell centre to (x, z) within `rings` cells, as [x, z], or null. */
export function nearestFree(nav, x, z, rings = 4) {
  const ci = Math.floor((x - nav.x0) / nav.cell);
  const cj = Math.floor((z - nav.z0) / nav.cell);
  let best = null;
  let bestD = Infinity;
  for (let dj = -rings; dj <= rings; dj++) {
    for (let di = -rings; di <= rings; di++) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= nav.nx || j >= nav.nz || nav.grid[j * nav.nx + i]) continue;
      const cx = nav.x0 + (i + 0.5) * nav.cell;
      const cz = nav.z0 + (j + 0.5) * nav.cell;
      const dd = (cx - x) ** 2 + (cz - z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = [cx, cz];
      }
    }
  }
  return best;
}

/** Breadth-first path on the nav grid, smoothed to straight runs. Returns [[x, z], …] or null. */
export function findPath(nav, from, to) {
  const a = nearestFree(nav, from[0], from[1], 3);
  const b = nearestFree(nav, to[0], to[1], 3);
  if (!a || !b) return null;
  const idx = (p) => Math.floor((p[1] - nav.z0) / nav.cell) * nav.nx + Math.floor((p[0] - nav.x0) / nav.cell);
  const start = idx(a);
  const goal = idx(b);
  const prev = new Int32Array(nav.nx * nav.nz).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length && prev[goal] < 0; qi++) {
    const c = queue[qi];
    const ci = c % nav.nx;
    const cj = (c / nav.nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= nav.nx || j >= nav.nz) continue;
      const n = j * nav.nx + i;
      if (prev[n] >= 0 || nav.grid[n]) continue;
      // No corner cutting past a blocked cell.
      if (di && dj && (nav.grid[cj * nav.nx + i] || nav.grid[j * nav.nx + ci])) continue;
      prev[n] = c;
      queue.push(n);
    }
  }
  if (prev[goal] < 0) return null;
  const cells = [];
  for (let c = goal; c !== start; c = prev[c]) cells.push(c);
  cells.push(start);
  cells.reverse();
  const pt = (c) => [nav.x0 + ((c % nav.nx) + 0.5) * nav.cell, nav.z0 + (((c / nav.nx) | 0) + 0.5) * nav.cell];
  const clearLine = (p, q) => {
    const steps = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (nav.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const x = p[0] + ((q[0] - p[0]) * s) / steps;
      const z = p[1] + ((q[1] - p[1]) * s) / steps;
      const i = Math.floor((x - nav.x0) / nav.cell);
      const j = Math.floor((z - nav.z0) / nav.cell);
      if (nav.grid[j * nav.nx + i]) return false;
    }
    return true;
  };
  const out = [pt(cells[0])];
  let anchor = 0;
  for (let k = 2; k < cells.length; k++) {
    if (!clearLine(pt(cells[anchor]), pt(cells[k]))) {
      anchor = k - 1;
      out.push(pt(cells[anchor]));
    }
  }
  out.push(to && nearestFree(nav, to[0], to[1], 0) ? [to[0], to[1]] : pt(goal));
  return out;
}

// ---- templates ---------------------------------------------------------------------------

/**
 * Till counter along the far wall by the entrance with the cashier behind it (convenience
 * stores, garages, supermarkets too small for a checkout lane). Returns [x, z, yaw] or null.
 */
function tillCounter(L, kind = "queue") {
  const { w, far } = L;
  const yaw = far > 0 ? -HALF : HALF;
  const x = far * (w / 2 - 1.15);
  const at = L.putFirst("counter", [-2.6, -3.2, -3.8, -4.6].map((z) => [x, z, yaw]));
  if (!at) return null;
  L.reserve(far * (w / 2), at[1] - 1.05, far * (w / 2 - 0.8), at[1] + 1.05);
  L.put("till", at[0], at[1] + 0.4, yaw, { y: 1.0, overlap: true });
  L.staff("cashier", far * (w / 2 - 0.42), at[1], yaw);
  L.front("counter", at[0], at[1], yaw, 0.45, kind);
  return at;
}

/** Desk-like item with a person behind it: staff and customer spots from its yaw. */
function staffBehind(L, at, role, back = 0.85, ahead = 0.8, kind = "counter") {
  const [x, z, yaw] = at;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  L.staff(role, x - fx * back, z - fz * back, yaw);
  L.spot(x + fx * ahead, z + fz * ahead, yaw + PI, kind);
  L.reserve(x - fx * 0.45 - fz * 1.2, z - fz * 0.45 + fx * 1.2, x - fx * 1.3 + fz * 1.2, z - fz * 1.3 - fx * 1.2);
}

function supermarket(L) {
  const { w, d, side, far, size } = L;
  L.wallRun("back", "fridge", -w / 2 + 0.2, w / 2 - 0.2);
  // Checkout row by the entrance, away from the door, lanes running into the shop.
  const nCheck = { S: 1, M: 2, L: 3 }[size] || 2;
  let placedCheck = 0;
  for (let i = 0; i < 6 && placedCheck < nCheck; i++) {
    const x = far * (w / 2 - 1.6 - i * 2.4);
    if (Math.abs(x - L.doorX) < 1.8) continue;
    if (L.put("checkout", x, -3.6, HALF)) {
      L.reserve(x - 1.25, -2.4, x - 0.4, -4.7);
      L.staff(placedCheck ? "staff" : "cashier", x - 0.78, -3.85, HALF);
      L.spot(x + 0.75, -3.0, -HALF, "queue");
      placedCheck++;
    }
  }
  if (!placedCheck) tillCounter(L);
  // Produce stands along the door-side wall just inside.
  const crateX = side * (w / 2 - 0.46);
  const crateYaw = side > 0 ? -HALF : HALF;
  for (const z of [-3.0, -4.5]) if (L.put("crateStand", crateX, z, crateYaw)) L.front("crateStand", crateX, z, crateYaw);
  // Aisles of gondolas between a front and a back cross aisle.
  const zTop = -5.4;
  const zBot = -d + 2.0;
  if (zTop - zBot >= 2.0) {
    L.wallRun("left", "wallShelf", zBot + 0.2, zTop + 0.6);
    L.wallRun("right", "wallShelf", zBot + 0.2, zTop + 0.6);
    const span = w - 4.2;
    const cols = Math.max(1, Math.floor(span / 2.5) + 1);
    const nSeg = Math.floor((zTop - zBot) / 2.0);
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? 0 : -span / 2 + (span / (cols - 1)) * c;
      for (let k = 0; k < nSeg; k++) {
        if (size === "L" && nSeg >= 5 && k === Math.floor(nSeg / 2)) continue; // cross aisle
        const z = zTop - 1.0 - k * 2.0;
        if (L.put("gondola", x, z, HALF)) {
          L.front("gondola", x, z, HALF, 0.45);
          L.front("gondola", x, z, -HALF, 0.45);
        }
      }
    }
  }
  const stocker = L.spots.find((s) => s.kind === "browse" && s.z < -6);
  if (stocker) L.staff("staff", stocker.x, stocker.z, stocker.face);
}

function grocery(L) {
  const { w, d, side, far, rec } = L;
  const variant = rec.variant;
  const cz = -Math.min(Math.max(3.2, d * 0.5), d - 2.2);
  if (variant === "counter") {
    // Bakery / butcher / deli: a glass case across the shop, staff and shelves behind it.
    const n = Math.max(1, Math.min(4, Math.floor((w - 1.4) / 1.8)));
    const x0 = (-n * 1.8) / 2 + 0.9 + far * 0.45;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 1.8;
      if (L.put("displayCase", x, cz, 0)) L.front("displayCase", x, cz, 0, 0.55, "counter");
    }
    L.reserve(-w / 2, cz - 0.4, w / 2, cz - 1.4);
    L.put("till", x0, cz, 0, { y: 1.24, overlap: true });
    L.staff("cashier", x0, cz - 0.85, 0);
    if (n > 1) L.staff("staff", x0 + (n - 1) * 1.8, cz - 0.85, 0);
    L.wallRun("back", "wallShelf", -w / 2 + 0.2, w / 2 - 0.2, { spots: false });
    L.wallRun("left", "wallShelf", cz + 0.9, -2.0);
    L.wallRun("right", "wallShelf", cz + 0.9, -2.0);
    return;
  }
  // Convenience / greengrocer: till counter by the door on the far side, cashier behind it.
  const at = tillCounter(L);
  const backItem = variant === "greengrocer" ? "wallShelf" : "fridge";
  L.wallRun("back", backItem, -w / 2 + 0.2, w / 2 - 0.2);
  L.wallRun(far > 0 ? "right" : "left", "wallShelf", -d + 1.2, (at ? at[1] - 1.2 : -2.2));
  L.wallRun(side > 0 ? "right" : "left", variant === "greengrocer" ? "crateStand" : "wallShelf", -d + 1.2, -2.2);
  const zTop = -4.2;
  const zBot = -d + 1.9;
  if (w >= 6.2 && zTop - zBot >= 1.4) {
    if (variant === "greengrocer") {
      for (let z = zTop - 0.5; z > zBot + 0.4; z -= 1.3) if (L.put("crateStand", 0, z, 0)) L.front("crateStand", 0, z, 0);
    } else {
      const n = Math.floor((zTop - zBot) / 2.0);
      for (let k = 0; k < n; k++) {
        const z = zTop - 1.0 - k * 2.0;
        if (L.put("gondola", 0, z, HALF)) {
          L.front("gondola", 0, z, HALF, 0.45);
          L.front("gondola", 0, z, -HALF, 0.45);
        }
      }
    }
  }
}

function restaurant(L) {
  const { w, d, far, rec } = L;
  const variant = rec.variant;
  const frituur = variant === "frituur";
  // Counter row: at the back with the kitchen behind it, or near the front for a frituur.
  const zc = frituur ? -clamp(d - 2.4, 2.6, 3.4) : -d + 2.05;
  const kitchenZ = frituur ? zc - 1.35 : -d + 0.42;
  const nCounters = variant === "fastfood" ? clamp(Math.floor((w - 1.6) / 2.4), 1, 3) : 1;
  const cx0 = variant === "dining" && w >= 8 ? far * (w / 4) : 0;
  const tills = [];
  for (let i = 0; i < nCounters; i++) {
    const x = cx0 + (i - (nCounters - 1) / 2) * 2.3;
    if (L.put("counter", x, zc, 0)) {
      tills.push(x);
      L.put("till", x - 0.5, zc, 0, { y: 1.0, overlap: true });
      L.front("counter", x, zc, 0, 0.5, "queue");
    }
  }
  if (frituur || d >= 6) {
    L.put("kitchenLine", cx0, kitchenZ, 0, { overlap: true });
    if (w > 6) L.put("kitchenLine", cx0 + (cx0 > 0 ? -2.45 : 2.45), kitchenZ, 0, { overlap: true });
  }
  L.reserve(-w / 2, zc - 0.36, w / 2, Math.max(-d, kitchenZ - 0.4));
  if (variant !== "dining") {
    const boards = Math.max(1, Math.min(3, Math.floor(w / 2.4)));
    for (let i = 0; i < boards; i++) {
      L.put("menuBoard", (i - (boards - 1) / 2) * 1.9, -d + 0.03, 0, { y: 2.25, overlap: true });
    }
  }
  tills.forEach((x, i) => L.staff(i ? "staff" : "cashier", x - 0.5, zc - 0.8, 0));
  L.staff("chef", cx0 + 0.4, kitchenZ + 0.8, PI);
  // Seating fills the room in front of the counter (a frituur just has a few standing tables).
  const z0 = zc + 0.9;
  if (frituur) {
    L.tables(-w / 2 + 0.6, w / 2 - 0.6, z0, -2.1, { kind: "tableRound", chairs: 0 });
  } else {
    const kind = variant === "fastfood" ? "tableRound" : "table";
    const chairs = variant === "dining" && L.size !== "S" ? 4 : 2;
    L.tables(-w / 2 + 0.3, w / 2 - 0.3, z0, -1.0, { kind, chairs });
  }
  for (const [x, z] of [[-w / 2 + 0.35, -0.9], [w / 2 - 0.35, -0.9], [-w / 2 + 0.35, zc + 0.8]]) L.put("plant", x, z, 0);
}

function barCoffee(L) {
  const { w, d, far, rec } = L;
  const variant = rec.variant;
  let barX = null;
  if (w >= 4.6 && d >= 6) {
    // Bar along the far wall: back bar on the wall, the bartender's strip, then the counter.
    const yaw = far > 0 ? -HALF : HALF;
    const zFrom = -2.4;
    const zTo = -d + 0.6;
    L.wallRun(far > 0 ? "right" : "left", "backBar", zTo, zFrom, { spots: false });
    barX = far * (w / 2 - 0.36 - 0.95 - 0.42);
    const n = clamp(Math.floor((zFrom - zTo) / 3.1), 1, 3);
    const zMid = (zFrom + zTo) / 2;
    for (let i = 0; i < n; i++) {
      const z = zMid + (i - (n - 1) / 2) * 3.1;
      if (!L.put("barCounter", barX, z, yaw)) continue;
      for (let k = -1.05; k <= 1.06; k += 0.7) {
        const sx = barX - far * 0.72;
        L.put("stool", sx, z + k, 0, { overlap: true });
        L.spot(barX - far * 1.0, z + k, yaw + PI, "counter");
      }
      if (i === 0) {
        L.staff("cashier", far * (w / 2 - 0.82), z, yaw);
        L.put("till", barX + far * 0.1, z - 1.1, yaw, { y: 1.1, overlap: true });
        if (variant === "coffee") L.put("espresso", barX + far * 0.12, z + 0.9, yaw, { y: 1.1, overlap: true });
      }
    }
    L.reserve(far * (w / 2), zTo, far * (w / 2 - 1.35), zFrom);
    L.reserve(barX - far * 0.95, zTo, barX - far * 0.5, zFrom);
  } else {
    // Narrow room: bar across the back.
    const z = -d + 1.75;
    L.wallRun("back", "backBar", -w / 2 + 0.2, w / 2 - 0.2, { spots: false });
    if (L.put("barCounter", 0, z, 0, { sx: clamp((w - 0.8) / 3.1, 0.6, 1.4) })) {
      L.staff("cashier", 0, -d + 0.85, 0);
      L.put("till", -0.6, z, 0, { y: 1.1, overlap: true });
      if (variant === "coffee") L.put("espresso", 0.6, z, 0, { y: 1.1, overlap: true });
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.6; x += 0.75) {
        L.put("stool", x, z + 0.72, 0, { overlap: true });
        L.spot(x, z + 1.0, PI, "counter");
      }
    }
    L.reserve(-w / 2, -d, w / 2, z + 1.0);
  }
  const x0 = barX == null ? -w / 2 + 0.3 : far > 0 ? -w / 2 + 0.3 : barX + 1.15;
  const x1 = barX == null ? w / 2 - 0.3 : far > 0 ? barX - 1.15 : w / 2 - 0.3;
  L.tables(x0, x1, -d + 0.4, -1.0, { kind: "tableRound", chairs: 2 });
  if (variant === "brown") L.put("menuBoard", -far * (w / 2 - 0.03), -d / 2, far > 0 ? HALF : -HALF, { y: 1.9, overlap: true });
  if (variant !== "cocktail") L.put("plant", -far * (w / 2 - 0.35), -0.95, 0);
  const waiter = L.spots.find((s) => s.kind === "sit");
  if (waiter) L.staff("staff", waiter.x + 0.4, waiter.z + 0.4, waiter.face);
}

function bank(L) {
  const { w, d, side, far } = L;
  const zc = -clamp(d * 0.6, 3.6, d - 2.0);
  const n = clamp(Math.floor((w - 1.0) / 2.5), 1, 4);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 2.5;
    if (!L.put("bankCounter", x, zc, 0)) continue;
    L.staff(i ? "staff" : "cashier", x, zc - 0.9, 0);
    L.spot(x, zc + 0.85, PI, "counter");
  }
  L.reserve(-w / 2, zc - 0.4, w / 2, -d);
  if (-d + 0.4 < zc - 1.6) {
    for (let i = 0; i < Math.min(2, n); i++) L.put("desk", (i - (Math.min(2, n) - 1) / 2) * 2.6, -d + 0.5, 0, { overlap: true });
  }
  // ATMs on the door-side wall by the entrance (the other wall if that is taken).
  const atmYaw = (s) => (s > 0 ? -HALF : HALF);
  let atms = 0;
  for (const s of [side, far]) {
    for (const z of [-2.5, -3.5]) {
      if (atms >= (L.size === "S" ? 1 : 2)) break;
      const x = s * (w / 2 - 0.34);
      if (L.put("atm", x, z, atmYaw(s))) {
        atms++;
        L.front("atm", x, z, atmYaw(s), 0.35);
      }
    }
  }
  // Queue lane up to the middle window.
  const laneX = 0;
  const zs = [];
  for (let z = zc + 1.5; z < -2.3; z += 0.9) zs.push(z);
  if (zs.length >= 2 && w >= 5.5) {
    for (const x of [laneX - 0.55, laneX + 0.55]) {
      zs.forEach((z, i) => {
        L.put("queuePost", x, z, 0);
        if (i) L.put("queueBelt", x, z - 0.45, HALF, { sx: 0.9, overlap: true });
      });
    }
    for (const z of zs) L.spot(laneX, z, PI, "queue");
  }
  L.wallRun(far > 0 ? "right" : "left", "bench", zc + 1.2, -2.2, { spotGap: 0.35 });
  L.put("plant", far * (w / 2 - 0.35), -0.9, 0);
  L.put("plant", side * (w / 2 - 0.35), zc + 0.9, 0);
}

function care(L) {
  const { w, d, side, far, rec, size } = L;
  if (rec.variant === "pharmacy") {
    const zc = -clamp(d * 0.55, 3.0, d - 1.8);
    const n = clamp(Math.floor((w - 1.2) / 2.2), 1, 3);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 2.2;
      if (!L.put("counter", x, zc, 0)) continue;
      L.put("till", x - 0.5, zc, 0, { y: 1.0, overlap: true });
      L.staff(i ? "staff" : "cashier", x - 0.4, zc - 0.85, 0);
      L.spot(x - 0.4, zc + 0.85, PI, "counter");
    }
    L.reserve(-w / 2, zc - 0.36, w / 2, zc - 1.4);
    L.wallRun("back", "pharmacyShelf", -w / 2 + 0.2, w / 2 - 0.2, { spots: false });
    L.wallRun("left", "pharmacyShelf", zc + 0.9, -2.0);
    L.wallRun("right", "pharmacyShelf", zc + 0.9, -2.0);
    return;
  }
  // Practice / hospital: reception by the entrance, waiting chairs, bays at the back.
  // Narrow rooms turn the desk along the far wall so the hall stays open.
  const rx = far * (w / 2 - 1.6);
  const wallYaw = far > 0 ? -HALF : HALF;
  const across = [[rx, -3.0, 0], [rx, -3.6, 0], [0, -3.4, 0]];
  const along = [-3.6, -4.4].map((z) => [far * (w / 2 - 1.3), z, wallYaw]);
  const recAt = L.putFirst("reception", w < 6.5 ? along : [...across, ...along]);
  if (recAt) staffBehind(L, recAt, "cashier");
  const hospital = rec.variant === "hospital";
  const bayDepth = hospital || d >= 10 ? 3.2 : 0;
  const zBays = -d + bayDepth;
  L.wallRun(side > 0 ? "right" : "left", "waitChairs", zBays - (bayDepth ? 0.8 : -0.4), -2.4, { spotGap: 0.3 });
  if (hospital && w >= 8) {
    // Rows of chairs in the middle of the hall, facing reception.
    for (let z = -5.2; z > zBays + 2.0; z -= 1.6) {
      for (let x = -w / 2 + 2.4; x < w / 2 - 2.4; x += 1.9) if (L.put("waitChairs", x, z, 0)) L.front("waitChairs", x, z, 0, 0.25, "sit");
    }
  }
  if (bayDepth) {
    const bays = clamp(Math.floor((w - 0.4) / 2.4), 1, size === "L" ? 6 : 3);
    const x0 = (-bays * 2.4) / 2;
    for (let b = 0; b < bays; b++) {
      const x = x0 + 2.4 * (b + 0.5);
      if (L.put("bed", x, -d + 1.05, 0)) {
        if (b < 2 || size === "L") L.staff("nurse", x + 0.85, -d + 1.3, -HALF);
      }
      L.put("curtain", x0 + 2.4 * b, -d + 1.3, HALF, { sx: 2.6, overlap: true });
    }
    L.put("curtain", x0 + 2.4 * bays, -d + 1.3, HALF, { sx: 2.6, overlap: true });
  }
  for (const [x, z] of [[-w / 2 + 0.35, -0.95], [w / 2 - 0.35, -0.95]]) L.put("plant", x, z, 0);
}

function garage(L) {
  const { w, d, side, far, rec, size } = L;
  if (rec.variant === "showroom") {
    const cols = clamp(Math.floor((w - 1.0) / 3.4), 1, 4);
    const rows = clamp(Math.floor((d - 4.5) / 5.4), 1, 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * 3.4;
        const z = -3.6 - 2.4 - r * 5.4;
        const box = [x - 1.3, z - 2.5, x + 1.3, z + 2.5];
        if (!L.free(box)) continue;
        L.solids.push(Object.assign(box, { solid: true }));
        const yaw = (L.R() - 0.5) * 0.8;
        L.props.push({ model: "car", x, z, yaw, y: 0, paint: Math.floor(L.R() * 1e6) });
        L.spot(x + 1.6, z, -HALF, "browse");
      }
    }
    const desks = clamp(Math.floor(w / 3.2), 1, 3);
    for (let i = 0; i < desks; i++) {
      const x = (i - (desks - 1) / 2) * 3.0;
      if (L.put("desk", x, -d + 0.9, 0)) {
        L.put("chair", x, -d + 0.35, 0, { overlap: true });
        L.put("chair", x, -d + 1.55, PI, { overlap: true });
        L.staff(i ? "staff" : "cashier", x, -d + 0.4, 0);
      }
    }
    L.put("plant", far * (w / 2 - 0.4), -1.0, 0);
    L.put("plant", side * (w / 2 - 0.4), -d + 0.5, 0);
    return;
  }
  // Workshop: office counter by the door, lifts with cars, tool benches and parts racks.
  const at = tillCounter(L, "counter");
  const lifts = clamp(Math.floor((w - 1.2) / 4.4), 1, size === "L" ? 3 : 2);
  const zl = -d + 3.4;
  for (let i = 0; i < lifts; i++) {
    const x = (i - (lifts - 1) / 2) * 4.4;
    const box = [x - 1.9, zl - 2.4, x + 1.9, zl + 2.4];
    if (!L.free(box)) continue;
    L.put("carLift", x, zl, 0, { overlap: true });
    L.solids.push(Object.assign([x - 1.1, zl - 2.3, x + 1.1, zl + 2.3], { solid: true }));
    L.solids.push([x - 1.9, zl - 0.3, x - 1.4, zl + 0.3], [x + 1.4, zl - 0.3, x + 1.9, zl + 0.3]);
    L.props.push({ model: "car", x, z: zl, yaw: i % 2 ? PI : 0, y: i === 0 ? 1.75 : 0.0, paint: Math.floor(L.R() * 1e6) });
    L.staff("mechanic", x + 1.3, zl + 1.6, -HALF - 0.4);
  }
  L.wallRun(far > 0 ? "right" : "left", "toolWall", -d + 0.4, (at ? at[1] - 1.3 : -2.2), { spots: false });
  L.wallRun(side > 0 ? "right" : "left", "partsShelf", -d + 0.4, -2.4);
  L.wallRun("back", "partsShelf", -w / 2 + 0.4, w / 2 - 0.4, { spots: false });
  for (const [x, z] of [[side * (w / 2 - 0.45), -2.5], [side * (w / 2 - 0.45), -3.3]]) L.put("tyreStack", x, z, 0);
}

const TEMPLATES = { supermarket, grocery, restaurant, bar_coffee: barCoffee, bank, care, garage };

/** Layout for one interiors.json record (see the module doc for the frame). */
export function generateInterior(rec) {
  const template = TEMPLATES[rec.template] ? rec.template : "grocery";
  const seed = ((Number(rec.seed) || 0) ^ hashStr(`${template}/${rec.variant || ""}`)) >>> 0;
  const L = new Layout({ ...rec, template }, mulberry32(seed));
  TEMPLATES[template](L);
  return L.finish();
}

export const INTERIOR_TEMPLATES = Object.keys(TEMPLATES);
