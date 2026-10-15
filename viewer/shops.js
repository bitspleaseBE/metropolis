/**
 * Shopfronts from OpenStreetMap (shops.json, written by cityview.shops): a named fascia
 * lightbox over the ground floor, a ground-floor front in the place's archetype (boutique
 * glazing, varnished bar front, bakery with a canvas awning, …), a hanging blade sign with
 * the category icon, and a warm light pool on the pavement. Signs and shop windows light
 * up while the place is open (opening_hours, or a typical schedule for the category).
 *
 * Fascias and blades are extruded boxes (front lettering + coloured sides/top/back) so they
 * read from the pavement and along the street — not paper-thin double-sided quads.
 *
 * Positions are Blender XY on the façade line → Three XZ with z = −y. Everything is baked
 * into four meshes; fascia names live in one canvas atlas whose slots follow the player
 * (the nearest ~180 boards get lettering, the rest show their board colour).
 */

/** Resolve at fetch time — import runs before district-boot's ready() may upgrade base. */
function shopsUrl() {
  return (
    (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("shops.json")) ||
    "./shops.json"
  );
}
const ATLAS_W = 2048;
const ATLAS_H = 3072;
const SLOT_W = 512;
const SLOT_H = 64;
const COLS = ATLAS_W / SLOT_W;
const ICON = 128;
const ICON_Y = ATLAS_H - ICON;
const SLOTS = COLS * Math.floor(ICON_Y / SLOT_H); // slot 0 is the blank board
const REASSIGN_M = 35; // re-letter boards after the camera moved this far
const FASCIA_Y = 3.22; // centre height above the pavement (between shop window and 1st floor)
const FASCIA_H = 0.52;
// Photo elevations sit 0.26 m proud of the footprint line (blender add_photo_facade).
const FASCIA_OUT = 0.42; // front face of the lightbox, clear of the photo façade
const FASCIA_DEPTH = 0.2; // solid board thickness — readable from the side like a real sign
const FASCIA_EDGE = 0.035; // brass / accent rim proud of the lettered face
const FRONT_OUT = 0.38; // ground-floor shopfront frame depth off the photo
const FRONT_DEPTH = 0.1; // pilaster / head returns (side faces)
const GLASS_OUT = 0.28; // glazing set back inside the frame
const FRONT_H = 2.85; // kerb to fascia underside
const BLADE = 0.62;
const BLADE_THICK = 0.08; // hanging blade thickness along the street axis
const POOL_DEPTH = 3.2;
const REACH = 7; // m: "what's this shop" prompt range
// Full glass / awning / light-pool detail only near spawn (or opts.near). Farther
// shops keep a coloured fascia + blade — enough to read the street without ~7× geometry.
const FRONT_DETAIL_M = 200;
const DAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const STYLE = {
  food: { bg: ["#1f4d36", "#5a2e1a", "#24323f"], fg: "#f3e6c4", serif: true },
  // Hipster Antwerp: oxblood, forest, charcoal, teal — cream / brass lettering
  horeca: { bg: ["#5b1a26", "#1d2a24", "#2a221c", "#1a3a3e"], fg: "#f0c66b", serif: true },
  retail: { bg: ["#1b2844", "#2c2c30", "#41213b"], fg: "#ffffff", serif: false },
  service: { bg: ["#24292e", "#13443f", "#3a3f46"], fg: "#7fe0d3", serif: false },
  pharmacy: { bg: ["#f6f7f5"], fg: "#0c8a3e", serif: false },
  care: { bg: ["#f4f6f9"], fg: "#1d5fae", serif: false },
};
const SERIF_FRONTS = new Set(["bar", "cafe", "restaurant", "bakery", "chocolatier", "heritage", "pizza"]);

/**
 * Ground-floor archetypes (cityview.shop_brands.front_for). Metres: plinth under the
 * glass, pilaster width, head band over it; panes = window lights; transom = a bar of
 * small upper lights; door = "glass" | "wood".
 */
const FRONTS = {
  boutique: { plinth: 0.1, pil: 0.08, head: 0.14, panes: 1, transom: false, door: "glass" },
  bar: { plinth: 0.62, pil: 0.24, head: 0.24, panes: 3, transom: true, door: "wood" },
  cafe: { plinth: 0.5, pil: 0.2, head: 0.2, panes: 2, transom: true, door: "glass" },
  restaurant: { plinth: 0.5, pil: 0.18, head: 0.2, panes: 2, transom: false, door: "glass" },
  bakery: { plinth: 0.45, pil: 0.16, head: 0.18, panes: 2, transom: true, door: "glass" },
  chocolatier: { plinth: 0.55, pil: 0.2, head: 0.22, panes: 2, transom: true, door: "glass" },
  heritage: { plinth: 0.55, pil: 0.22, head: 0.22, panes: 3, transom: true, door: "wood" },
  market: { plinth: 0.22, pil: 0.12, head: 0.16, panes: 1, transom: false, door: "glass" },
  // Flemish fritkot: chunky yellow/red board over a single deep window.
  frituur: { plinth: 0.38, pil: 0.14, head: 0.22, panes: 1, transom: false, door: "glass" },
  // Astridplein kebab / pita: lit box fascia, low plinth, open glass front.
  kebab: { plinth: 0.2, pil: 0.12, head: 0.24, panes: 1, transom: false, door: "glass" },
  // Pizzeria: warmer sit-down proportions (two lights + transom on many Keyserlei fronts).
  pizza: { plinth: 0.42, pil: 0.16, head: 0.2, panes: 2, transom: true, door: "glass" },
  // METRO PRESS / dagbladhandel: tall white fascia, dense display window, side door.
  newsstand: { plinth: 0.26, pil: 0.1, head: 0.28, panes: 1, transom: false, door: "glass" },
  fastfood: { plinth: 0.18, pil: 0.12, head: 0.16, panes: 1, transom: false, door: "glass" },
  bank: { plinth: 0.35, pil: 0.22, head: 0.18, panes: 2, transom: false, door: "glass" },
  pharmacy: { plinth: 0.3, pil: 0.14, head: 0.16, panes: 1, transom: false, door: "glass" },
  office: { plinth: 0.3, pil: 0.14, head: 0.16, panes: 2, transom: false, door: "glass" },
  plain: { plinth: 0.45, pil: 0.16, head: 0.18, panes: 2, transom: false, door: "glass" },
};
const AWNING_DEPTH = 1.2;
const AWNING_DROP = 0.5;
const VALANCE = 0.22;

function rgbCss(rgb, fallback = "#222") {
  if (!rgb || rgb.length < 3) return fallback;
  const h = (c) => Math.max(0, Math.min(255, Math.round(c * 255))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}
function cssRgb(css) {
  const n = parseInt(css.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const ICONS = ["food", "horeca", "retail", "service", "pharmacy", "care"];

function hash(n) {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function prettyKind(kind) {
  const EN = {
    bakery: "Bakery", butcher: "Butcher", greengrocer: "Greengrocer", pharmacy: "Pharmacy",
    hairdresser: "Hairdresser", cafe: "Café", pub: "Pub", bar: "Bar", restaurant: "Restaurant",
    fast_food: "Fast food", supermarket: "Supermarket", convenience: "Convenience", bank: "Bank",
    florist: "Florist", bicycle: "Bike shop", dentist: "Dentist", doctors: "Doctor",
    veterinary: "Vet", beauty: "Beauty", clothes: "Clothes", furniture: "Furniture",
    copyshop: "Copy shop", optician: "Optician", laundry: "Laundry", books: "Books",
    chocolate: "Chocolatier", jewelry: "Jeweller", shoes: "Shoes", nightclub: "Club",
    ice_cream: "Ice cream", deli: "Deli", wine: "Wine shop", gift: "Gifts", art: "Gallery",
    newsagent: "Newsagent", lottery: "Lottery", kiosk: "Kiosk",
  };
  return EN[kind] || kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Board colour (0..1 RGB) — the brand / palette fascia, else the category default. */
function boardRgb(shop) {
  if (shop.fascia && shop.fascia.length >= 3) return shop.fascia;
  const st = STYLE[shop.cat] || STYLE.retail;
  return cssRgb(st.bg[Math.floor(hash(shop.id) * st.bg.length)]);
}

function drawIcon(ctx, cat, x, y, s, st) {
  const c = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = st.bg[0];
  ctx.beginPath();
  ctx.roundRect(4, 4, s - 8, s - 8, 18);
  ctx.fill();
  ctx.strokeStyle = st.fg;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = st.fg;
  ctx.strokeStyle = st.fg;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  if (cat === "pharmacy" || cat === "care") {
    const a = s * 0.13;
    const b = s * 0.34;
    ctx.fillRect(c - a, c - b, a * 2, b * 2);
    ctx.fillRect(c - b, c - a, b * 2, a * 2);
  } else if (cat === "horeca") {
    // Beer / coffee cup with steam.
    ctx.fillRect(c - 24, c - 8, 38, 36);
    ctx.beginPath();
    ctx.arc(c + 18, c + 9, 11, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    for (const dx of [-14, 0]) {
      ctx.beginPath();
      ctx.moveTo(c - 5 + dx, c - 16);
      ctx.quadraticCurveTo(c + 3 + dx, c - 26, c - 5 + dx, c - 36);
      ctx.stroke();
    }
  } else if (cat === "food") {
    // Basket.
    ctx.beginPath();
    ctx.moveTo(c - 34, c - 2);
    ctx.lineTo(c + 34, c - 2);
    ctx.lineTo(c + 24, c + 32);
    ctx.lineTo(c - 24, c + 32);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c - 2, 24, Math.PI, 0);
    ctx.stroke();
  } else if (cat === "service") {
    // Scissors.
    ctx.lineWidth = 6;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(c + sx * 16, c + 22, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + sx * 11, c + 12);
      ctx.lineTo(c - sx * 18, c - 34);
      ctx.stroke();
    }
  } else {
    // Shopping bag.
    ctx.fillRect(c - 26, c - 10, 52, 44);
    ctx.beginPath();
    ctx.arc(c, c - 10, 16, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFascia(ctx, shop, sx, sy, aspect) {
  const st = STYLE[shop.cat] || STYLE.retail;
  const branded = shop.fascia && shop.fascia.length >= 3;
  const bg = rgbCss(boardRgb(shop));
  const fg = branded ? rgbCss(shop.accent, st.fg) : st.fg;
  ctx.clearRect(sx, sy, SLOT_W, SLOT_H);
  ctx.fillStyle = bg;
  ctx.fillRect(sx, sy, SLOT_W, SLOT_H);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = shop.mood === "bank" || shop.front === "boutique" ? 0.3 : 0.55;
  ctx.lineWidth = 2;
  if (shop.front !== "boutique") ctx.strokeRect(sx + 3, sy + 3, SLOT_W - 6, SLOT_H - 6);
  ctx.globalAlpha = 1;
  // Metal edge strip along the top of the board (matches the 3D accent rim).
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(sx, sy, SLOT_W, 5);
  ctx.globalAlpha = 1;
  // The slot is stretched to the board's real aspect; pre-squash so letters stay upright.
  const squash = (SLOT_W / SLOT_H) / aspect;
  const label = (shop.name || prettyKind(shop.kind)).toUpperCase();
  const serif = st.serif || shop.mood === "cafe" || SERIF_FRONTS.has(shop.front);
  const font = serif ? "Georgia, 'Times New Roman', serif" : "'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
  const weight = shop.front === "boutique" ? 500 : 700;
  ctx.save();
  ctx.translate(sx + SLOT_W / 2, sy + SLOT_H / 2 + 2);
  ctx.scale(squash, 1);
  let size = shop.mood === "bank" || shop.front === "boutique" ? 34 : 38;
  ctx.font = `${weight} ${size}px ${font}`;
  const maxW = (SLOT_W - 26) / squash;
  const w = ctx.measureText(label).width;
  if (w > maxW) {
    size = Math.max(18, Math.floor(size * (maxW / w)));
    ctx.font = `${weight} ${size}px ${font}`;
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Soft drop so letters sit on the lightbox, not float as flat paint.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillText(label, 0, 0, maxW);
  ctx.restore();
}

/** Open at game hour h on day d (0 = Sunday)? Spans may run past midnight (close > 24). */
export function isOpen(hours, d, h) {
  if (!hours) return false;
  for (const [o, c] of hours[d] || []) if (h >= o && h < c) return true;
  const prev = hours[(d + 6) % 7] || [];
  for (const [o, c] of prev) if (c > 24 && h < c - 24 && h + 24 >= o) return true;
  return false;
}

function fmt(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function hoursLine(hours, d, h) {
  if (isOpen(hours, d, h)) {
    for (const [o, c] of hours[d] || []) if (h >= o && h < c) return `Open · until ${fmt(c)}`;
    for (const [, c] of hours[(d + 6) % 7] || []) if (c > 24) return `Open · until ${fmt(c)}`;
    return "Open";
  }
  for (let k = 0; k < 7; k++) {
    const day = (d + k) % 7;
    for (const [o] of hours[day] || []) {
      if (k > 0 || o > h) {
        const when = k === 0 ? "" : k === 1 ? "tomorrow " : `${DAY[day]} `;
        return `Closed · opens ${when}${fmt(o)}`;
      }
    }
  }
  return "Closed";
}

function poolTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 20, 4, 64, 40, 92);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Fade the sides out too, so neighbouring pools never show a hard seam.
  const side = g.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.28, "rgba(0,0,0,1)");
  side.addColorStop(0.72, "rgba(0,0,0,1)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = side;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const mul = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
// shops.json colours are sRGB; vertex colours are read as linear.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linRgb = (rgb) => [lin(Math.min(1, rgb[0])), lin(Math.min(1, rgb[1])), lin(Math.min(1, rgb[2]))];

export async function createShops(scene, THREE, opts = {}) {
  let data;
  try {
    const res = await fetch(shopsUrl());
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (err) {
    console.warn("shops.json unavailable", err);
    return null;
  }
  const shops = data.shops || [];
  const groundAt = opts.groundAt || (() => 0);

  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d");
  ICONS.forEach((cat, i) => drawIcon(ctx, cat, i * ICON, ICON_Y, ICON, STYLE[cat]));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SLOT_W, SLOT_H); // blank board, tinted by vertex colour

  const fasciaPos = [];
  const fasciaUv = [];
  const fasciaCol = [];
  const fasciaLit = [];
  const fasciaIdx = [];
  const frontPos = [];
  const frontCol = [];
  const frontGlass = [];
  const frontLit = [];
  const frontIdx = [];
  const poolPos = [];
  const poolUv = [];
  const poolCol = [];
  const poolIdx = [];
  const records = [];

  const quad = (pos, uv, idx, lit, corners, uvRect, litVal) => {
    const base = pos.length / 3;
    for (const p of corners) pos.push(p.x, p.y, p.z);
    const [u0, v0, u1, v1] = uvRect;
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    if (lit) for (let k = 0; k < 4; k++) lit.push(litVal);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return base;
  };
  const uvOf = (px, py, w, h) => [px / ATLAS_W, 1 - (py + h) / ATLAS_H, (px + w) / ATLAS_W, 1 - py / ATLAS_H];
  const slotXY = (s) => [(s % COLS) * SLOT_W, Math.floor(s / COLS) * SLOT_H];
  const BLANK_UV = uvOf(SLOT_W * 0.25, SLOT_H * 0.25, SLOT_W * 0.5, SLOT_H * 0.5);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /** Coloured quad on the front mesh; glass quads glow while the shop is open. */
  const addFront = (corners, srgb, glass = 0) => {
    const base = frontPos.length / 3;
    const rgb = linRgb(srgb);
    for (const p of corners) {
      frontPos.push(p.x, p.y, p.z);
      frontCol.push(rgb[0], rgb[1], rgb[2]);
      frontGlass.push(glass);
      frontLit.push(0);
    }
    frontIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  /**
   * Extruded frame member: front face at depth `dOut`, back at `dIn`, with side returns.
   * Keeps shopfronts from reading as cardboard cutouts on the photo elevation.
   */
  const addFrontBox = (a0, a1, y0, y1, dIn, dOut, srgb, glass = 0) => {
    const P = addFrontBox._P;
    addFront([P(a0, y0, dOut), P(a1, y0, dOut), P(a1, y1, dOut), P(a0, y1, dOut)], srgb, glass);
    addFront([P(a1, y0, dIn), P(a0, y0, dIn), P(a0, y1, dIn), P(a1, y1, dIn)], mul(srgb, 0.55), glass);
    addFront([P(a0, y0, dIn), P(a0, y0, dOut), P(a0, y1, dOut), P(a0, y1, dIn)], mul(srgb, 0.7), glass);
    addFront([P(a1, y0, dOut), P(a1, y0, dIn), P(a1, y1, dIn), P(a1, y1, dOut)], mul(srgb, 0.7), glass);
    addFront([P(a0, y1, dOut), P(a1, y1, dOut), P(a1, y1, dIn), P(a0, y1, dIn)], mul(srgb, 0.85), glass);
    addFront([P(a0, y0, dIn), P(a1, y0, dIn), P(a1, y0, dOut), P(a0, y0, dOut)], mul(srgb, 0.5), glass);
  };

  /**
   * Fascia / blade box into the atlas mesh. First four verts are the lettered (or icon)
   * face so setBoard can re-UV them without touching the coloured hull.
   */
  const addSignBox = (faceCorners, depthDir, depth, faceUv, faceRgb, hullRgb) => {
    const [c0, c1, c2, c3] = faceCorners;
    const d = depthDir.clone().multiplyScalar(depth);
    const back = [c0.clone().sub(d), c1.clone().sub(d), c2.clone().sub(d), c3.clone().sub(d)];
    const face = linRgb(faceRgb);
    const backRgb = linRgb(mul(hullRgb, 0.45));
    const sideRgb = linRgb(mul(hullRgb, 0.68));
    const topRgb = linRgb(mul(hullRgb, 0.88));
    const botRgb = linRgb(mul(hullRgb, 0.4));
    const pushFace = (corners, uvRect, rgb) => {
      const base = fasciaPos.length / 3;
      for (const p of corners) fasciaPos.push(p.x, p.y, p.z);
      const [u0, v0, u1, v1] = uvRect;
      fasciaUv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) {
        fasciaCol.push(rgb[0], rgb[1], rgb[2]);
        fasciaLit.push(0);
      }
      fasciaIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    pushFace([c0, c1, c2, c3], faceUv, face);
    pushFace([back[1], back[0], back[3], back[2]], BLANK_UV, backRgb);
    pushFace([c0, back[0], back[3], c3], BLANK_UV, sideRgb);
    pushFace([back[1], c1, c2, back[2]], BLANK_UV, sideRgb);
    pushFace([c3, back[3], back[2], c2], BLANK_UV, topRgb);
    pushFace([back[0], c0, c1, back[1]], BLANK_UV, botRgb);
    return 24;
  };

  /** Ground-floor front + awning for one shop; returns [firstVertex, vertexCount]. */
  function buildFront(shop, fx, fz, nx, nz, tx, tz, gy, boardW) {
    const start = frontPos.length / 3;
    const spec = FRONTS[shop.front] || FRONTS.plain;
    const fw = Math.max(1.6, (shop.houseW || boardW) * 0.92);
    const h = fw / 2;
    const frame = shop.frame || shop.fascia || [0.2, 0.18, 0.16];
    const dark = mul(frame, 0.72);
    // Brand glass is a pale tint; daylight panes read dark with a cool sky sheen.
    const tint = shop.glass || [0.5, 0.48, 0.44];
    const glass = [0.07 + tint[0] * 0.22, 0.09 + tint[1] * 0.22, 0.12 + tint[2] * 0.22];
    // Point at offset a (along the façade, −h..h), height y, depth d off the wall.
    const P = (a, y, d) => V(fx + tx * a + nx * d, y, fz + tz * a + nz * d);
    addFrontBox._P = P;
    const dIn = FRONT_OUT - FRONT_DEPTH;
    const rect = (a0, a1, y0, y1, d, rgb, g = 0) => addFront([P(a0, y0, d), P(a1, y0, d), P(a1, y1, d), P(a0, y1, d)], rgb, g);
    const head = gy + FRONT_H;
    const glassTop = head - spec.head;
    const sill = gy + spec.plinth;
    const pil = Math.max(0.1, spec.pil);

    // Thick head band + pilasters with side returns — the game's shopfront signature.
    addFrontBox(-h, h, glassTop, head, dIn, FRONT_OUT, frame);
    addFrontBox(-h, -h + pil, gy, glassTop, dIn, FRONT_OUT, dark);
    addFrontBox(h - pil, h, gy, glassTop, dIn, FRONT_OUT, dark);

    // Door on one side (stable per shop) when the bay is wide enough for a window too.
    // Enterable shops carry doorA (cityview/interiors.py): the interior's door sits there.
    const doorW = fw >= 2.6 ? 1.0 : 0;
    const doorLeft = Number.isFinite(shop.doorA) && shop.doorA !== 0 ? shop.doorA < 0 : hash(shop.id * 7 + 3) < 0.5;
    const w0 = doorLeft ? -h + pil + doorW : -h + pil;
    const w1 = doorLeft ? h - pil : h - pil - doorW;
    if (doorW) {
      const d0 = doorLeft ? -h + pil : h - pil - doorW;
      const d1 = d0 + doorW;
      const mull = 0.07;
      addFrontBox(
        doorLeft ? d1 - mull : d0,
        doorLeft ? d1 : d0 + mull,
        gy,
        glassTop,
        dIn,
        FRONT_OUT,
        dark,
      );
      const dIn0 = doorLeft ? d0 + 0.05 : d0 + mull + 0.05;
      const dIn1 = doorLeft ? d1 - mull - 0.05 : d1 - 0.05;
      const doorTop = glassTop - (spec.transom ? 0.42 : 0.05);
      if (spec.door === "wood") {
        addFrontBox(dIn0, dIn1, gy + 0.02, gy + 1.0, dIn + 0.02, FRONT_OUT - 0.02, mul(frame, 0.55));
        rect(dIn0 + 0.1, dIn1 - 0.1, gy + 1.0, doorTop - 0.08, GLASS_OUT, mul(glass, 0.8), 1);
        addFrontBox(dIn0, dIn1, doorTop - 0.08, doorTop, dIn + 0.02, FRONT_OUT - 0.02, mul(frame, 0.55));
      } else {
        rect(dIn0, dIn1, gy + 0.02, doorTop, GLASS_OUT, mul(glass, 0.85), 1);
      }
      if (spec.transom) {
        addFrontBox(dIn0, dIn1, doorTop, doorTop + 0.06, dIn, FRONT_OUT, dark);
        rect(dIn0, dIn1, doorTop + 0.06, glassTop, GLASS_OUT, glass, 1);
      }
    }

    // Plinth under the window, with a projecting sill ledge.
    addFrontBox(w0, w1, gy, sill, dIn, FRONT_OUT, mul(frame, 0.62));
    addFront(
      [P(w0, sill, GLASS_OUT), P(w1, sill, GLASS_OUT), P(w1, sill, FRONT_OUT + 0.06), P(w0, sill, FRONT_OUT + 0.06)],
      mul(frame, 0.8),
    );
    // Sill returns.
    addFront(
      [P(w0, sill - 0.02, FRONT_OUT), P(w0, sill - 0.02, FRONT_OUT + 0.06), P(w0, sill, FRONT_OUT + 0.06), P(w0, sill, FRONT_OUT)],
      mul(frame, 0.65),
    );
    addFront(
      [P(w1, sill - 0.02, FRONT_OUT + 0.06), P(w1, sill - 0.02, FRONT_OUT), P(w1, sill, FRONT_OUT), P(w1, sill, FRONT_OUT + 0.06)],
      mul(frame, 0.65),
    );

    // Window: transom lights over the main panes, mullions between panes.
    const transomY = spec.transom ? glassTop - 0.42 : glassTop;
    const panes = Math.max(1, Math.min(spec.panes, Math.floor((w1 - w0) / 0.8)));
    const step = (w1 - w0) / panes;
    for (let k = 0; k < panes; k++) {
      const a0 = w0 + k * step + (k ? 0.035 : 0);
      const a1 = w0 + (k + 1) * step - (k < panes - 1 ? 0.035 : 0);
      rect(a0, a1, sill, transomY, GLASS_OUT, glass, 1);
      if (k < panes - 1) addFrontBox(a1, a1 + 0.07, sill, glassTop, dIn, FRONT_OUT, dark);
    }
    if (spec.transom) {
      addFrontBox(w0, w1, transomY, transomY + 0.06, dIn, FRONT_OUT, dark);
      const lights = Math.max(2, Math.round((w1 - w0) / 0.45));
      const ls = (w1 - w0) / lights;
      for (let k = 0; k < lights; k++) {
        rect(w0 + k * ls + 0.025, w0 + (k + 1) * ls - 0.025, transomY + 0.06, glassTop, GLASS_OUT, mul(glass, 1.1), 1);
      }
    }

    // Canvas awning: sloped blind + valance + real side panels.
    if (shop.awning) {
      const col = shop.awning.colour || shop.fascia || frame;
      const stripe = shop.awning.stripe;
      const yTop = head + 0.04;
      const yLow = yTop - AWNING_DROP;
      const d0 = FRONT_OUT + 0.02;
      const d1 = d0 + AWNING_DEPTH;
      const n = stripe ? Math.max(3, Math.round(fw / 0.32)) : 1;
      const s = fw / n;
      for (let k = 0; k < n; k++) {
        const a0 = -h + k * s;
        const a1 = a0 + s;
        const c = stripe && k % 2 ? stripe : col;
        addFront([P(a0, yTop, d0), P(a1, yTop, d0), P(a1, yLow, d1), P(a0, yLow, d1)], c);
        addFront([P(a0, yLow, d1), P(a1, yLow, d1), P(a1, yLow - VALANCE, d1), P(a0, yLow - VALANCE, d1)], mul(c, 0.9));
      }
      // Side cheeks: full triangle from wall mount down to the valance tip.
      for (const side of [-h, h]) {
        addFront(
          [P(side, yTop, d0), P(side, yLow, d1), P(side, yLow - VALANCE, d1), P(side, yTop - 0.04, d0)],
          mul(col, 0.75),
        );
      }
      // Slim rail against the wall so the canopy isn't floating cardboard.
      addFrontBox(-h, h, yTop - 0.04, yTop + 0.06, dIn, d0 + 0.04, mul(col, 0.55));
    }
    return [start, frontPos.length / 3 - start];
  }

  const nearX = Number.isFinite(opts.near?.x) ? opts.near.x : 0;
  const nearZ = Number.isFinite(opts.near?.z) ? opts.near.z : 0;
  const detailM = Number.isFinite(opts.frontDetailM) ? opts.frontDetailM : FRONT_DETAIL_M;
  const detailM2 = detailM * detailM;
  let detailed = 0;

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    const fx = shop.x;
    const fz = -shop.y;
    const nx = shop.nx;
    const nz = -shop.ny;
    // Viewer's right-hand direction when facing the façade, so text reads left→right.
    const tx = nz;
    const tz = -nx;
    const wantDetail =
      shop.shopfront && (fx - nearX) * (fx - nearX) + (fz - nearZ) * (fz - nearZ) <= detailM2;
    // Far fascias skip ground rays — pavement height defaults to 0.
    const g = wantDetail ? groundAt(fx + nx * 1.2, fz + nz * 1.2) : 0;
    const gy = Number.isFinite(g) ? g : 0;
    // One house bay wide — never spill onto the neighbour's elevation.
    const boardW = shop.houseW ? Math.min(shop.w, shop.houseW * 0.9) : shop.w;
    const half = boardW / 2;
    const y0 = gy + FASCIA_Y - FASCIA_H / 2;
    const y1 = gy + FASCIA_Y + FASCIA_H / 2;
    const boardSrgb = boardRgb(shop);
    const board = linRgb(boardSrgb);
    const accentSrgb = shop.accent && shop.accent.length >= 3 ? shop.accent : mul(boardSrgb, 1.15);
    const vBase = fasciaPos.length / 3;
    // Lightbox fascia: lettered front, coloured hull, slim accent rim on top.
    const frontFace = [
      V(fx + nx * FASCIA_OUT - tx * half, y0, fz + nz * FASCIA_OUT - tz * half),
      V(fx + nx * FASCIA_OUT + tx * half, y0, fz + nz * FASCIA_OUT + tz * half),
      V(fx + nx * FASCIA_OUT + tx * half, y1, fz + nz * FASCIA_OUT + tz * half),
      V(fx + nx * FASCIA_OUT - tx * half, y1, fz + nz * FASCIA_OUT - tz * half),
    ];
    let vCount = addSignBox(frontFace, V(nx, 0, nz), FASCIA_DEPTH, BLANK_UV, boardSrgb, boardSrgb);
    // Accent rim: thin metal strip proud of the lettered face (game signature).
    const rimY0 = y1 - 0.04;
    const rimY1 = y1 + 0.02;
    const rimOut = FASCIA_OUT + FASCIA_EDGE;
    addSignBox(
      [
        V(fx + nx * rimOut - tx * (half + 0.02), rimY0, fz + nz * rimOut - tz * (half + 0.02)),
        V(fx + nx * rimOut + tx * (half + 0.02), rimY0, fz + nz * rimOut + tz * (half + 0.02)),
        V(fx + nx * rimOut + tx * (half + 0.02), rimY1, fz + nz * rimOut + tz * (half + 0.02)),
        V(fx + nx * rimOut - tx * (half + 0.02), rimY1, fz + nz * rimOut - tz * (half + 0.02)),
      ],
      V(nx, 0, nz),
      FASCIA_EDGE + 0.02,
      BLANK_UV,
      accentSrgb,
      accentSrgb,
    );
    vCount += 24;
    const front = wantDetail ? buildFront(shop, fx, fz, nx, nz, tx, tz, gy, boardW) : [0, 0];
    if (wantDetail) detailed += 1;
    // Blade: thick hanging box with the category icon on the street-facing faces.
    const bx = fx + tx * (half - 0.15) + nx * (0.28 + BLADE / 2);
    const bz = fz + tz * (half - 0.15) + nz * (0.28 + BLADE / 2);
    const by = gy + FASCIA_Y + 0.55;
    const iu = uvOf(Math.max(0, ICONS.indexOf(shop.cat)) * ICON, ICON_Y, ICON, ICON);
    const b = BLADE / 2;
    const bladeFace = [
      V(bx - nx * b, by - b, bz - nz * b),
      V(bx + nx * b, by - b, bz + nz * b),
      V(bx + nx * b, by + b, bz + nz * b),
      V(bx - nx * b, by + b, bz + nz * b),
    ];
    vCount += addSignBox(bladeFace, V(tx, 0, tz), BLADE_THICK, iu, [1, 1, 1], boardSrgb);
    let pBase = -1;
    if (wantDetail) {
      // Light pool on the pavement in front of the shop window.
      const pw = Math.min(shop.w * 0.95, 5.5) / 2;
      // The pool must sit on the raised footway, not the façade strip in front of the door.
      let top = gy;
      for (const depth of [0.6, 1.6, 2.8]) {
        for (const side of [-0.8, 0, 0.8]) {
          const h = groundAt(fx + nx * depth + tx * pw * side, fz + nz * depth + tz * pw * side);
          if (Number.isFinite(h) && h < gy + 0.2) top = Math.max(top, h); // kerb yes, doorsteps no
        }
      }
      const py = top + 0.03;
      pBase = poolPos.length / 3;
      quad(
        poolPos, poolUv, poolIdx, null,
        [
          V(fx - tx * pw + nx * 0.1, py, fz - tz * pw + nz * 0.1),
          V(fx + tx * pw + nx * 0.1, py, fz + tz * pw + nz * 0.1),
          V(fx + tx * pw + nx * POOL_DEPTH, py, fz + tz * pw + nz * POOL_DEPTH),
          V(fx - tx * pw + nx * POOL_DEPTH, py, fz - tz * pw + nz * POOL_DEPTH),
        ],
        [0, 1, 1, 0], 0,
      );
      for (let k = 0; k < 4; k++) poolCol.push(0, 0, 0);
    }
    records.push({
      ...shop, fx, fz, nx, nz, gy, vBase, vCount, pBase, open: null,
      board, aspect: boardW / FASCIA_H, slot: 0, frontStart: front[0], frontCount: front[1],
    });
    if (opts.yieldEvery && (i + 1) % (opts.yieldEvery * 4) === 0) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  if (detailed < shops.length) {
    console.info(`[metropolis] shops: ${detailed}/${shops.length} with full fronts (≤${detailM} m)`);
  }

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = opts.anisotropy || 8;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;

  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.Float32BufferAttribute(fasciaPos, 3));
  const uvAttr = new THREE.Float32BufferAttribute(fasciaUv, 2);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  fGeo.setAttribute("uv", uvAttr);
  const fColAttr = new THREE.Float32BufferAttribute(fasciaCol, 3);
  fColAttr.setUsage(THREE.DynamicDrawUsage);
  fGeo.setAttribute("color", fColAttr);
  const litAttr = new THREE.Float32BufferAttribute(fasciaLit, 1);
  litAttr.setUsage(THREE.DynamicDrawUsage);
  fGeo.setAttribute("aLit", litAttr);
  fGeo.setIndex(fasciaIdx);
  fGeo.computeVertexNormals();
  const fMat = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.12,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  fMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aLit;\nvarying float vLit;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLit = aLit;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vLit;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLit * vColor.rgb;");
  };
  const fascias = new THREE.Mesh(fGeo, fMat);
  fascias.name = "shop_fascias";
  scene.add(fascias);

  let frLitAttr = null;
  let frMat = null;
  if (frontPos.length) {
    const frGeo = new THREE.BufferGeometry();
    frGeo.setAttribute("position", new THREE.Float32BufferAttribute(frontPos, 3));
    frGeo.setAttribute("color", new THREE.Float32BufferAttribute(frontCol, 3));
    frGeo.setAttribute("aGlass", new THREE.Float32BufferAttribute(frontGlass, 1));
    frLitAttr = new THREE.Float32BufferAttribute(frontLit, 1);
    frLitAttr.setUsage(THREE.DynamicDrawUsage);
    frGeo.setAttribute("aLit", frLitAttr);
    frGeo.setIndex(frontIdx);
    frGeo.computeVertexNormals();
    frMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.1,
      emissive: 0xffc890,
      emissiveIntensity: 0,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    // Open shop windows glow from inside after dark; frames and awnings never do.
    frMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlass;\nattribute float aLit;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlass * aLit;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow * (0.75 + 3.0 * vColor.rgb);");
    };
    const fronts = new THREE.Mesh(frGeo, frMat);
    fronts.name = "shop_fronts";
    scene.add(fronts);
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.Float32BufferAttribute(poolPos, 3));
  pGeo.setAttribute("uv", new THREE.Float32BufferAttribute(poolUv, 2));
  const colAttr = new THREE.Float32BufferAttribute(poolCol, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute("color", colAttr);
  pGeo.setIndex(poolIdx);
  const pMat = new THREE.MeshBasicMaterial({
    map: poolTexture(THREE),
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    fog: false,
  });
  const pools = new THREE.Mesh(pGeo, pMat);
  pools.name = "shop_light_pools";
  pools.renderOrder = 2;
  pools.visible = false;
  scene.add(pools);

  // ---- fascia lettering follows the camera: the nearest boards own the atlas slots
  const freeSlots = [];
  for (let s = SLOTS - 1; s >= 1; s--) freeSlots.push(s);
  let lastAssign = null;

  function setBoard(r, uvRect, rgb) {
    // Only the fascia lightbox front face (first 4 verts) carries lettering.
    const [u0, v0, u1, v1] = uvRect;
    const o = r.vBase * 2;
    uvAttr.array.set([u0, v0, u1, v0, u1, v1, u0, v1], o);
    for (let k = 0; k < 4; k++) fColAttr.array.set(rgb, (r.vBase + k) * 3);
  }

  function assignSlots(x, z) {
    lastAssign = [x, z];
    const order = records.map((r, i) => [(r.fx - x) ** 2 + (r.fz - z) ** 2, i]);
    order.sort((a, b) => a[0] - b[0]);
    const want = new Set(order.slice(0, SLOTS - 1).map((o) => o[1]));
    let changed = false;
    records.forEach((r, i) => {
      if (r.slot && !want.has(i)) {
        freeSlots.push(r.slot);
        r.slot = 0;
        setBoard(r, BLANK_UV, r.board);
        changed = true;
      }
    });
    for (const i of want) {
      const r = records[i];
      if (r.slot || !freeSlots.length) continue;
      r.slot = freeSlots.pop();
      const [sx, sy] = slotXY(r.slot);
      drawFascia(ctx, r, sx, sy, r.aspect);
      setBoard(r, uvOf(sx, sy, SLOT_W, SLOT_H), [1, 1, 1]);
      changed = true;
    }
    if (changed) {
      atlas.needsUpdate = true;
      uvAttr.needsUpdate = true;
      fColAttr.needsUpdate = true;
    }
  }
  assignSlots(opts.near?.x ?? 0, opts.near?.z ?? 0);

  let glow = 0;
  let lastKey = "";
  let captionId = null;

  /** Nearest named shopfront for GTA-style captions (no facing required). */
  function locateShop(x, z, hour, day) {
    let best = null;
    let bestD = REACH;
    for (const r of records) {
      if (!r.name) continue;
      const d = Math.hypot(r.fx - x, r.fz - z);
      if (d > bestD) continue;
      best = r;
      bestD = d;
    }
    const id = best ? best.id : null;
    const changed = id !== captionId;
    captionId = id;
    return {
      shop: best,
      changed,
      subtitle: best
        ? `${prettyKind(best.kind)} · ${hoursLine(best.hours, day, hour)}`
        : "",
    };
  }

  function refresh(day, hour) {
    let changed = false;
    let frontChanged = false;
    for (const r of records) {
      const open = isOpen(r.hours, day, hour);
      if (open === r.open) continue;
      r.open = open;
      changed = true;
      for (let k = 0; k < r.vCount; k++) litAttr.array[r.vBase + k] = open ? 1 : 0;
      if (frLitAttr && r.frontCount) {
        frLitAttr.array.fill(open ? 1 : 0, r.frontStart, r.frontStart + r.frontCount);
        frontChanged = true;
      }
    }
    if (changed) litAttr.needsUpdate = true;
    if (frontChanged) frLitAttr.needsUpdate = true;
    return changed;
  }

  function paintPools() {
    if (!colAttr) return;
    const k = glow * 0.8;
    const warm = [1.0 * k, 0.68 * k, 0.34 * k];
    for (const r of records) {
      if (r.pBase < 0) continue;
      for (let v = 0; v < 4; v++) {
        const o = (r.pBase + v) * 3;
        colAttr.array[o] = r.open ? warm[0] : 0;
        colAttr.array[o + 1] = r.open ? warm[1] : 0;
        colAttr.array[o + 2] = r.open ? warm[2] : 0;
      }
    }
    colAttr.needsUpdate = true;
    pools.visible = glow > 0.02;
  }

  return {
    count: records.length,
    records,
    /** Game clock: hour 0..24, day 0 = Sunday; camera x/z re-letters nearby boards. */
    update(hour, day, x, z) {
      if (Number.isFinite(x) && Number.isFinite(z)) {
        if (!lastAssign || Math.hypot(x - lastAssign[0], z - lastAssign[1]) > REASSIGN_M) assignSlots(x, z);
      }
      const key = `${day}:${Math.floor(hour * 60)}`;
      if (key === lastKey) return;
      lastKey = key;
      if (refresh(day, hour)) paintPools();
    },
    setNight(g) {
      glow = g;
      fMat.emissiveIntensity = 0.12 + 0.95 * g;
      if (frMat) frMat.emissiveIntensity = 0.06 + 0.9 * g;
      paintPools();
    },
    locateShop,
    /** Name + open state for the shopfront the player is facing, or null. */
    getPrompt(p, hour, day) {
      let best = null;
      let bestD = REACH;
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      for (const r of records) {
        const dx = r.fx - p.x;
        const dz = r.fz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        // In front of the shop and looking roughly at it.
        if (dx * r.nx + dz * r.nz > 0.3) continue;
        if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue;
        best = r;
        bestD = d;
      }
      if (!best) return null;
      const title = best.name || prettyKind(best.kind);
      const kind = best.name ? ` · ${prettyKind(best.kind)}` : "";
      return `${title}${kind}\n${hoursLine(best.hours, day, hour)}${best.hoursKnown ? "" : " (usual hours)"}`;
    },
  };
}
