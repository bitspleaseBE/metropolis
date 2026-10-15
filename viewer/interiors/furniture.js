/**
 * Shop furniture for the procedural interiors (interior-gen.js lays it out).
 *
 * The kit is built once: every item is a few merged Box / Cylinder primitives, grouped by
 * material, and those geometries and materials are shared by every interior. An interior gets
 * its own InstancedMesh per item group (one draw call per group, whatever the count), with
 * brand colours set per instance (`tint`), the same pattern as viewer/terraces.js.
 *
 * Items face local +Z (the side a customer stands on), with their origin on the floor at the
 * centre of the footprint. Each declares its collider footprint in that frame: boxes
 * [x, z, halfX, halfZ] and circles [x, z, r]. Placements are { item, x, z, y?, yaw?, sx?, sz?,
 * color? } in the interior frame; `sx` / `sz` stretch counters and curtains to length.
 */
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./rng.js";

const GOODS = {
  grocery: [0xd8312c, 0xf2b705, 0x2f7d32, 0x1e5aa8, 0xf47c20, 0xffffff, 0x8e2c88, 0x6b3b1f, 0xe8d9b0, 0x1aa0a8],
  pharmacy: [0xffffff, 0xf2f4f7, 0x9ccbe8, 0x6fb98f, 0xe7eef5, 0x3b82c4, 0xd9e4ec, 0xf28c8c],
  parts: [0x1b1c1e, 0x46484c, 0xb5823c, 0xf47c20, 0x8a8f96, 0xc9a66b, 0x2a62b0],
  bottles: [0x2f5d2a, 0x5a3215, 0xb87a1c, 0xd6e3e8, 0x7a1d1d, 0x1f3d5a, 0xc9b26a],
  pastry: [0xc98a4b, 0xa8642f, 0xe6c38c, 0x6b3a1e, 0xf3e3c4, 0xd94f4f],
  produce: [0xc62828, 0xff8f00, 0xfdd835, 0x7cb342, 0x2e7d32, 0x6a1b9a, 0xef6c00, 0x9e9d24],
  tools: [0xc62828, 0xfbc02d, 0x212121, 0x9e9e9e, 0x1565c0, 0xef6c00],
};

/** Wordmark texture: the shop name in `accent` on `fascia` (no trademark logos). */
export function wordmarkTexture(THREE, name, fascia, accent, w = 512, h = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const css = (rgb, k = 1) =>
    `rgb(${Math.round(Math.min(1, rgb[0] * k) * 255)},${Math.round(Math.min(1, rgb[1] * k) * 255)},${Math.round(Math.min(1, rgb[2] * k) * 255)})`;
  const bg = fascia && fascia.length >= 3 ? fascia : [0.18, 0.2, 0.24];
  let fg = accent && accent.length >= 3 ? accent : [1, 1, 1];
  // Same-ish colours would vanish: fall back to white or near-black lettering.
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  if (Math.abs(lum(fg) - lum(bg)) < 0.25) fg = lum(bg) > 0.5 ? [0.08, 0.08, 0.1] : [1, 1, 1];
  ctx.fillStyle = css(bg);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = css(fg);
  ctx.fillRect(0, h - h * 0.08, w, h * 0.08);
  const text = String(name || "").trim().slice(0, 28) || "Open";
  let size = h * 0.56;
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  while (ctx.measureText(text).width > w * 0.9 && size > 12) {
    size -= 2;
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.47);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tile / plank / concrete floor patterns, one 256 px canvas each, repeated per metre. */
function floorTexture(THREE, kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const fill = (col) => {
    g.fillStyle = col;
    g.fillRect(0, 0, 256, 256);
  };
  if (kind === "wood") {
    fill("#7a5233");
    const r = mulberry32(7);
    for (let y = 0; y < 256; y += 32) {
      const off = r() * 256;
      for (let x = -256; x < 256; x += 160) {
        const l = 0.85 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(122 * l)},${Math.round(82 * l)},${Math.round(51 * l)})`;
        g.fillRect(x + off, y + 1, 158, 30);
      }
    }
  } else if (kind === "concrete") {
    fill("#8d8f91");
    const r = mulberry32(11);
    for (let i = 0; i < 1400; i++) {
      const v = 120 + r() * 50;
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.fillRect(r() * 256, r() * 256, 2, 2);
    }
    g.fillStyle = "#6f7173";
    g.fillRect(0, 0, 256, 2);
    g.fillRect(0, 0, 2, 256);
  } else {
    const [a, b, grout] =
      kind === "terrazzo"
        ? ["#d8d2c6", "#cfc8bb", "#b9b2a5"]
        : kind === "vinyl"
          ? ["#cfd8d4", "#c7d1cd", "#b8c2be"]
          : kind === "checker"
            ? ["#e9e5dc", "#2b2b2e", "#9a958c"]
            : ["#d9d9d6", "#d2d2cf", "#a9a9a5"];
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? b : a;
        g.fillRect(x * 128, y * 128, 128, 128);
      }
    }
    g.strokeStyle = grout;
    g.lineWidth = 3;
    for (let k = 0; k <= 256; k += 128) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 256);
      g.moveTo(0, k);
      g.lineTo(256, k);
      g.stroke();
    }
    if (kind === "terrazzo") {
      const r = mulberry32(3);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(90,84,76,0.35)" : "rgba(255,255,255,0.4)";
        g.fillRect(r() * 256, r() * 256, 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function createFurnitureKit(THREE) {
  const std = (color, rough = 0.6, metal = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const MAT = {
    metal: std(0x9aa0a6, 0.45, 0.6),
    darkMetal: std(0x2b2d30, 0.5, 0.5),
    chrome: std(0xd8dde2, 0.2, 0.9),
    steel: std(0xb8bcc0, 0.35, 0.8),
    white: std(0xeeeeea, 0.6),
    paint: std(0xffffff, 0.55),
    fabric: std(0xffffff, 0.95),
    wood: std(0x8b5a34, 0.7),
    darkWood: std(0x4a2c1a, 0.6),
    lightWood: std(0xc9a77c, 0.65),
    leather: std(0x5b3420, 0.6),
    rubber: std(0x18191b, 0.9),
    terracotta: std(0xa0522d, 0.85),
    leaf: std(0x3f7d3a, 0.8),
    mattress: std(0xf4f6f7, 0.9),
    curtain: std(0x9cc6d6, 0.9, 0, { side: THREE.DoubleSide }),
    mirror: std(0xcfd8dc, 0.05, 1),
    goods: std(0xffffff, 0.65, 0, { vertexColors: true }),
    bottles: std(0xffffff, 0.25, 0.1, { vertexColors: true }),
    glass: std(0xbfd8e6, 0.05, 0, { transparent: true, opacity: 0.22, depthWrite: false }),
    screen: std(0x000000, 0.4, 0, { emissive: 0x7fc4ff, emissiveIntensity: 1.1 }),
    menu: std(0x111111, 0.5, 0, { emissive: 0xffe4b0, emissiveIntensity: 0.55 }),
    fridgeGlow: std(0x000000, 0.5, 0, { emissive: 0xe8f4ff, emissiveIntensity: 1.3 }),
    lightPanel: std(0x222222, 0.5, 0, { emissive: 0xfff6e8, emissiveIntensity: 2.2 }),
  };

  // ---- primitive helpers: dimensions in metres, y is the bottom of the part ----
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const cyl = (r, h, x = 0, y = 0, z = 0, seg = 12, r2 = r) =>
    new THREE.CylinderGeometry(r, r2, h, seg).translate(x, y + h / 2, z);
  /** Horizontal cylinder along X, centred at (x, y, z). */
  const rod = (r, len, x, y, z, seg = 8) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);
  const tilt = (geo, rx, x, y, z) => geo.rotateX(rx).translate(x, y, z);
  const _c = new THREE.Color();
  const colored = (geo, hex) => {
    _c.setHex(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([_c.r, _c.g, _c.b], i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  /** Product rows on one shelf: random widths and heights packed from x0 to x1. */
  function goodsRow(out, rnd, palette, x0, x1, y, z, depth, maxH) {
    let x = x0 + 0.02;
    while (x < x1 - 0.06) {
      const w = Math.min(x1 - x - 0.01, 0.07 + rnd() * 0.14);
      const h = Math.min(maxH, 0.1 + rnd() * (maxH - 0.1));
      const col = palette[Math.floor(rnd() * palette.length)];
      // A run of the same product, like a facing on a real shelf.
      const run = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < run && x < x1 - 0.06; k++) {
        out.push(colored(box(w - 0.01, h, depth, x + w / 2, y, z), col));
        x += w;
      }
    }
  }
  function bottlesRow(out, rnd, palette, x0, x1, y, z) {
    for (let x = x0 + 0.05; x < x1 - 0.04; x += 0.075 + rnd() * 0.04) {
      const h = 0.22 + rnd() * 0.12;
      const col = palette[Math.floor(rnd() * palette.length)];
      out.push(colored(cyl(0.032, h * 0.7, x, y, z, 6), col));
      out.push(colored(cyl(0.012, h * 0.3, x, y + h * 0.7, z, 5, 0.03), col));
    }
  }

  /**
   * Item builders return { parts: { matKey or "matKey:tint": [geometries] }, boxes, circles }.
   * A tint is "brand" (shop fascia), "accent", or a fixed hex picked per placement.
   */
  const shelfItem = (palette, seed, header = true) => () => {
    const r = mulberry32(seed);
    const metal = [box(1.8, 2.0, 0.04, 0, 0, -0.2), box(0.04, 2.0, 0.44, -0.88, 0, 0), box(0.04, 2.0, 0.44, 0.88, 0, 0)];
    const goods = [];
    for (const y of [0.1, 0.5, 0.9, 1.3, 1.7]) {
      metal.push(box(1.76, 0.025, 0.42, 0, y, 0.01));
      goodsRow(goods, r, GOODS[palette], -0.86, 0.86, y + 0.025, 0.0, 0.3, 0.34);
    }
    const parts = { metal, goods };
    if (header) parts["paint:brand"] = [box(1.8, 0.16, 0.05, 0, 2.0, -0.18)];
    return { parts, boxes: [[0, 0, 0.9, 0.23]] };
  };

  const DEFS = {
    gondola: () => {
      const r = mulberry32(21);
      const metal = [
        box(2.0, 0.1, 0.86),
        box(2.0, 1.45, 0.05, 0, 0.1, 0),
        box(0.04, 1.5, 0.86, -0.98, 0.05, 0),
        box(0.04, 1.5, 0.86, 0.98, 0.05, 0),
      ];
      const goods = [];
      for (const y of [0.1, 0.5, 0.9, 1.3]) {
        for (const s of [-1, 1]) {
          metal.push(box(1.92, 0.025, 0.38, 0, y, s * 0.23));
          goodsRow(goods, r, GOODS.grocery, -0.95, 0.95, y + 0.025, s * 0.24, 0.28, 0.32);
        }
      }
      return { parts: { metal, goods, "paint:brand": [box(2.0, 0.16, 0.06, 0, 1.6, 0)] }, boxes: [[0, 0, 1.0, 0.45]] };
    },
    wallShelf: shelfItem("grocery", 31),
    pharmacyShelf: shelfItem("pharmacy", 41),
    partsShelf: shelfItem("parts", 51, false),
    fridge: () => {
      const r = mulberry32(61);
      const white = [
        box(2.0, 2.1, 0.05, 0, 0, -0.38),
        box(2.0, 0.25, 0.8, 0, 1.85, 0),
        box(2.0, 0.22, 0.8, 0, 0, 0),
        box(0.05, 2.1, 0.8, -0.98, 0, 0),
        box(0.05, 2.1, 0.8, 0.98, 0, 0),
      ];
      const metal = [];
      const goods = [];
      for (const y of [0.22, 0.62, 1.02, 1.42]) {
        metal.push(box(1.9, 0.02, 0.6, 0, y, -0.05));
        goodsRow(goods, r, GOODS.grocery, -0.93, 0.93, y + 0.02, -0.05, 0.4, 0.3);
      }
      return {
        parts: {
          white,
          metal,
          goods,
          fridgeGlow: [box(1.9, 1.6, 0.02, 0, 0.22, -0.35)],
          glass: [box(1.96, 1.62, 0.02, 0, 0.22, 0.39)],
          "paint:brand": [box(2.0, 0.22, 0.02, 0, 1.86, 0.41)],
        },
        boxes: [[0, 0, 1.0, 0.41]],
      };
    },
    checkout: () => ({
      parts: {
        "paint:brand": [box(1.9, 0.85, 0.7)],
        rubber: [box(1.3, 0.04, 0.45, -0.25, 0.85, 0.05)],
        steel: [box(0.6, 0.04, 0.7, 0.65, 0.85, 0)],
        darkMetal: [box(0.3, 0.18, 0.26, 0.5, 0.89, -0.18)],
        screen: [tilt(new THREE.BoxGeometry(0.28, 0.2, 0.02), -0.35, 0.5, 1.2, -0.22)],
        chrome: [cyl(0.02, 1.25, 0.88, 0.85, -0.28)],
        "paint:accent": [box(0.22, 0.22, 0.05, 0.88, 2.1, -0.28)],
      },
      boxes: [[0, 0, 0.95, 0.36]],
    }),
    crateStand: () => {
      const r = mulberry32(71);
      const wood = [box(1.4, 0.62, 0.9), box(1.44, 0.04, 0.94, 0, 0.62, 0)];
      const lightWood = [];
      const goods = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const cx = -0.46 + i * 0.46;
          const cz = -0.21 + j * 0.42;
          lightWood.push(box(0.42, 0.13, 0.38, cx, 0.66, cz));
          const col = GOODS.produce[Math.floor(r() * GOODS.produce.length)];
          for (let k = 0; k < 9; k++) {
            const s = 0.05 + r() * 0.025;
            goods.push(colored(new THREE.IcosahedronGeometry(s, 0).translate(cx + (r() - 0.5) * 0.3, 0.8 + r() * 0.05, cz + (r() - 0.5) * 0.26), col));
          }
        }
      }
      return { parts: { wood, lightWood, goods }, boxes: [[0, 0, 0.7, 0.45]] };
    },
    counter: () => ({
      parts: {
        "paint:brand": [box(2.0, 0.95, 0.6)],
        lightWood: [box(2.1, 0.05, 0.7, 0, 0.95, 0)],
        rubber: [box(2.0, 0.08, 0.5, 0, 0, -0.02)],
      },
      boxes: [[0, 0, 1.05, 0.35]],
    }),
    till: () => ({
      parts: {
        darkMetal: [box(0.36, 0.12, 0.3)],
        screen: [tilt(new THREE.BoxGeometry(0.3, 0.22, 0.03), -0.3, 0, 0.26, -0.08)],
      },
    }),
    displayCase: () => {
      const r = mulberry32(81);
      const goods = [];
      for (let x = -0.8; x < 0.8; x += 0.16) {
        const col = GOODS.pastry[Math.floor(r() * GOODS.pastry.length)];
        goods.push(colored(box(0.12, 0.06 + r() * 0.05, 0.14, x + 0.08, 0.84, -0.06), col));
        goods.push(colored(box(0.12, 0.05 + r() * 0.04, 0.14, x + 0.08, 0.84, 0.14), col));
      }
      return {
        parts: {
          "paint:brand": [box(1.8, 0.8, 0.75)],
          fridgeGlow: [box(1.74, 0.02, 0.6, 0, 0.8, 0.04)],
          glass: [box(1.8, 0.42, 0.62, 0, 0.82, 0.05)],
          chrome: [box(1.82, 0.02, 0.64, 0, 1.24, 0.05)],
          goods,
        },
        boxes: [[0, 0, 0.9, 0.4]],
      };
    },
    barCounter: () => ({
      parts: {
        darkWood: [box(3.0, 1.05, 0.6)],
        wood: [box(3.1, 0.05, 0.78, 0, 1.05, 0.06)],
        chrome: [
          rod(0.025, 3.0, 0, 0.2, 0.42),
          ...[-0.6, -0.3, 0, 0.3].map((x) => cyl(0.02, 0.32, x, 1.1, -0.18, 8)),
        ],
        "paint:accent": [box(3.0, 0.03, 0.01, 0, 0.98, 0.305)],
      },
      boxes: [[0, 0.03, 1.55, 0.4]],
    }),
    backBar: () => {
      const r = mulberry32(91);
      const bottles = [];
      bottlesRow(bottles, r, GOODS.bottles, -1.25, 1.25, 0.9, -0.08);
      bottlesRow(bottles, r, GOODS.bottles, -1.25, 1.25, 1.28, -0.08);
      bottlesRow(bottles, r, GOODS.bottles, -1.25, 1.25, 1.63, -0.08);
      return {
        parts: {
          darkWood: [box(2.6, 0.9, 0.35), box(2.6, 0.03, 0.26, 0, 1.25, -0.04), box(2.6, 0.03, 0.26, 0, 1.6, -0.04), box(2.6, 0.12, 0.35, 0, 2.08, 0)],
          mirror: [box(2.6, 1.15, 0.02, 0, 0.93, -0.16)],
          bottles,
        },
        boxes: [[0, 0, 1.3, 0.18]],
      };
    },
    stool: () => ({
      parts: {
        chrome: [cyl(0.03, 0.72, 0, 0, 0, 8), cyl(0.2, 0.03, 0, 0, 0, 14)],
        leather: [cyl(0.19, 0.06, 0, 0.72, 0, 14)],
      },
      circles: [[0, 0, 0.2]],
    }),
    table: () => ({
      parts: {
        wood: [box(0.8, 0.04, 0.8, 0, 0.73, 0)],
        darkMetal: [cyl(0.04, 0.73, 0, 0, 0, 8), cyl(0.25, 0.03, 0, 0, 0, 14)],
      },
      circles: [[0, 0, 0.45]],
    }),
    tableRound: () => ({
      parts: {
        white: [cyl(0.37, 0.04, 0, 0.73, 0, 18)],
        darkMetal: [cyl(0.035, 0.73, 0, 0, 0, 8), cyl(0.22, 0.03, 0, 0, 0, 14)],
      },
      circles: [[0, 0, 0.4]],
    }),
    chair: () => ({
      parts: {
        wood: [box(0.42, 0.04, 0.42, 0, 0.45, 0), box(0.42, 0.4, 0.04, 0, 0.5, -0.19)],
        darkMetal: [
          cyl(0.015, 0.45, -0.18, 0, -0.18, 5),
          cyl(0.015, 0.45, 0.18, 0, -0.18, 5),
          cyl(0.015, 0.45, -0.18, 0, 0.18, 5),
          cyl(0.015, 0.45, 0.18, 0, 0.18, 5),
        ],
      },
    }),
    espresso: () => ({
      parts: {
        steel: [box(0.6, 0.42, 0.45), box(0.5, 0.02, 0.2, 0, 0.08, 0.28)],
        chrome: [cyl(0.035, 0.1, -0.15, 0.2, 0.26, 8), cyl(0.035, 0.1, 0.15, 0.2, 0.26, 8)],
        "paint:accent": [box(0.62, 0.3, 0.02, 0, 0.06, 0.23)],
      },
    }),
    bankCounter: () => ({
      parts: {
        "paint:brand": [box(2.4, 1.05, 0.7)],
        lightWood: [box(2.5, 0.05, 0.8, 0, 1.05, 0)],
        glass: [box(2.4, 0.95, 0.02, 0, 1.1, 0.02)],
        chrome: [-1.2, 0, 1.2].map((x) => cyl(0.02, 0.95, x, 1.1, 0.02, 8)),
      },
      boxes: [[0, 0, 1.25, 0.4]],
    }),
    atm: () => ({
      parts: {
        "paint:brand": [box(0.8, 1.5, 0.6)],
        darkMetal: [box(0.82, 0.28, 0.62, 0, 1.5, 0.01), box(0.3, 0.04, 0.18, 0, 0.95, 0.36)],
        screen: [tilt(new THREE.BoxGeometry(0.4, 0.3, 0.02), -0.25, 0, 1.22, 0.31)],
        "paint:accent": [box(0.8, 0.06, 0.02, 0, 1.68, 0.33)],
      },
      boxes: [[0, 0, 0.41, 0.34]],
    }),
    queuePost: () => ({
      parts: {
        chrome: [cyl(0.028, 0.95, 0, 0, 0, 8), cyl(0.045, 0.05, 0, 0.93, 0, 8)],
        darkMetal: [cyl(0.16, 0.03, 0, 0, 0, 14)],
      },
      circles: [[0, 0, 0.15]],
    }),
    queueBelt: () => ({ parts: { "paint:accent": [box(1.0, 0.05, 0.01, 0, 0.86, 0)] }, boxes: [[0, 0, 0.5, 0.04]] }),
    bench: () => ({
      parts: {
        lightWood: [box(1.8, 0.06, 0.45, 0, 0.44, 0)],
        darkMetal: [box(0.05, 0.44, 0.4, -0.8, 0, 0), box(0.05, 0.44, 0.4, 0.8, 0, 0)],
      },
      boxes: [[0, 0, 0.9, 0.23]],
    }),
    reception: () => ({
      parts: {
        white: [box(2.6, 1.05, 0.75)],
        "paint:brand": [box(2.6, 0.5, 0.02, 0, 0.3, 0.38)],
        lightWood: [box(2.7, 0.05, 0.85, 0, 1.05, 0)],
        darkMetal: [box(0.5, 0.32, 0.04, 0.5, 1.1, -0.2), box(0.08, 0.06, 0.12, 0.5, 1.1, -0.2)],
        screen: [box(0.46, 0.28, 0.005, 0.5, 1.12, -0.177)],
      },
      boxes: [[0, 0, 1.3, 0.4]],
    }),
    waitChairs: () => {
      const seats = [];
      for (const x of [-0.52, 0, 0.52]) {
        seats.push(box(0.48, 0.06, 0.46, x, 0.42, 0), box(0.48, 0.42, 0.05, x, 0.48, -0.22));
      }
      return {
        parts: {
          darkMetal: [box(1.6, 0.05, 0.06, 0, 0.36, 0), box(0.05, 0.38, 0.5, -0.72, 0, 0), box(0.05, 0.38, 0.5, 0.72, 0, 0)],
          "fabric:accent": seats,
        },
        boxes: [[0, 0, 0.8, 0.28]],
      };
    },
    bed: () => ({
      parts: {
        metal: [box(0.9, 0.08, 1.95, 0, 0.45, 0), ...[-0.4, 0.4].flatMap((x) => [box(0.04, 0.45, 0.04, x, 0, -0.9), box(0.04, 0.45, 0.04, x, 0, 0.9)])],
        mattress: [box(0.86, 0.14, 1.9, 0, 0.53, 0), box(0.6, 0.1, 0.35, 0, 0.67, -0.7)],
        chrome: [box(0.03, 0.2, 1.0, -0.46, 0.6, 0.1), box(0.03, 0.2, 1.0, 0.46, 0.6, 0.1)],
        "paint:accent": [box(0.95, 0.55, 0.05, 0, 0.45, -1.0)],
      },
      boxes: [[0, 0, 0.5, 1.0]],
    }),
    curtain: () => ({
      parts: {
        curtain: [box(1.0, 1.95, 0.02, 0, 0.2, 0)],
        chrome: [box(1.0, 0.03, 0.03, 0, 2.2, 0)],
      },
      boxes: [[0, 0, 0.5, 0.04]],
    }),
    carLift: () => ({
      parts: {
        "paint:accent": [box(0.35, 3.0, 0.35, -1.65, 0, 0), box(0.35, 3.0, 0.35, 1.65, 0, 0), box(3.65, 0.2, 0.25, 0, 3.0, 0)],
        metal: [
          box(0.6, 0.03, 0.6, -1.65, 0, 0),
          box(0.6, 0.03, 0.6, 1.65, 0, 0),
          box(1.2, 0.08, 0.12, -1.0, 0.42, -0.6),
          box(1.2, 0.08, 0.12, -1.0, 0.42, 0.6),
          box(1.2, 0.08, 0.12, 1.0, 0.42, -0.6),
          box(1.2, 0.08, 0.12, 1.0, 0.42, 0.6),
        ],
      },
      boxes: [
        [-1.65, 0, 0.22, 0.22],
        [1.65, 0, 0.22, 0.22],
      ],
    }),
    toolWall: () => {
      const r = mulberry32(101);
      const goods = [];
      for (let i = 0; i < 26; i++) {
        const col = GOODS.tools[Math.floor(r() * GOODS.tools.length)];
        const tall = r() < 0.5;
        goods.push(colored(box(tall ? 0.04 : 0.22, tall ? 0.28 : 0.05, 0.03, -1.05 + r() * 2.1, 1.25 + r() * 0.9, -0.27), col));
      }
      return {
        parts: {
          "paint:accent": [box(2.4, 0.85, 0.62, 0, 0.05, 0.04)],
          wood: [box(2.44, 0.05, 0.7, 0, 0.9, 0.05)],
          metal: [box(2.4, 1.25, 0.03, 0, 1.15, -0.31), box(2.4, 0.05, 0.6, 0, 0, 0.04)],
          goods,
        },
        boxes: [[0, 0.02, 1.22, 0.37]],
      };
    },
    tyreStack: () => ({
      parts: { rubber: [0, 1, 2, 3].map((k) => cyl(0.32, 0.21, 0, k * 0.22, 0, 14)), metal: [0, 1, 2, 3].map((k) => cyl(0.18, 0.215, 0, k * 0.22, 0, 10)) },
      circles: [[0, 0, 0.34]],
    }),
    plant: () => ({
      parts: {
        terracotta: [cyl(0.2, 0.42, 0, 0, 0, 12, 0.15)],
        leaf: [new THREE.IcosahedronGeometry(0.38, 1).scale(1, 1.25, 1).translate(0, 0.92, 0)],
      },
      circles: [[0, 0, 0.26]],
    }),
    lightPanel: () => ({ parts: { lightPanel: [box(1.2, 0.03, 0.3)] } }),
    menuBoard: () => ({ parts: { darkMetal: [box(1.6, 0.8, 0.03)], menu: [box(1.5, 0.7, 0.01, 0, 0.05, 0.02)] } }),
    kitchenLine: () => ({
      parts: {
        steel: [box(2.4, 0.9, 0.7), box(2.4, 0.5, 0.8, 0, 2.0, -0.05), box(0.6, 0.05, 0.4, -0.7, 0.9, 0), box(0.6, 0.05, 0.4, 0.3, 0.9, 0)],
        darkMetal: [box(0.5, 0.12, 0.35, -0.7, 0.95, 0), box(0.5, 0.12, 0.35, 0.3, 0.95, 0)],
      },
      boxes: [[0, 0, 1.2, 0.36]],
    }),
    desk: () => ({
      parts: {
        lightWood: [box(1.4, 0.04, 0.7, 0, 0.73, 0)],
        metal: [box(0.04, 0.73, 0.6, -0.65, 0, 0), box(0.04, 0.73, 0.6, 0.65, 0, 0)],
        darkMetal: [box(0.5, 0.32, 0.04, 0, 0.8, -0.2)],
        screen: [box(0.46, 0.28, 0.005, 0, 0.82, -0.177)],
      },
      boxes: [[0, 0, 0.7, 0.36]],
    }),
    doorMat: () => ({ parts: { rubber: [box(1.4, 0.012, 0.9)] } }),
  };

  // Build each item once: merge its parts per material (+ tint) into shared geometries.
  const ITEMS = {};
  for (const [name, make] of Object.entries(DEFS)) {
    const def = make();
    const groups = [];
    for (const [key, geos] of Object.entries(def.parts)) {
      if (!geos.length) continue;
      const [mat, tint] = key.split(":");
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) for (const g of geos) g.dispose();
      groups.push({ geo, mat: MAT[mat], tint: tint || null });
    }
    ITEMS[name] = { groups, boxes: def.boxes || [], circles: def.circles || [] };
  }

  const FLOORS = {};
  const floorMat = (kind) => {
    if (!FLOORS[kind]) FLOORS[kind] = std(0xffffff, kind === "terrazzo" ? 0.25 : 0.7, 0, { map: floorTexture(THREE, kind) });
    return FLOORS[kind];
  };
  const colourMats = new Map();
  /** Plain wall / ceiling paint, shared by colour so interiors never leak materials. */
  const paintMat = (hex, rough = 0.85) => {
    const k = `${hex}:${rough}`;
    if (!colourMats.has(k)) colourMats.set(k, std(hex, rough));
    return colourMats.get(k);
  };
  const windowMat = std(0x000000, 0.2, 0, { emissive: 0xcfe6ff, emissiveIntensity: 0.9 });
  const WIN_DAY = new THREE.Color(0xcfe6ff);
  const WIN_NIGHT = new THREE.Color(0x1c2638);

  const tmpColor = new THREE.Color();
  const toColor = (c, fallback) => {
    if (Array.isArray(c) && c.length >= 3) return tmpColor.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    if (typeof c === "number") return tmpColor.setHex(c);
    return tmpColor.setHex(fallback);
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /**
   * Instance `placements` under a new group. `palette` is { brand, accent } (sRGB arrays).
   * Returns colliders in the interior frame: boxes [cx, cz, axisX, axisZ, halfLong, halfShort]
   * and circles [x, z, r].
   */
  function build(placements, palette = {}) {
    const group = new THREE.Group();
    group.name = "interior_furniture";
    const byItem = new Map();
    for (const p of placements) {
      if (!ITEMS[p.item]) continue;
      if (!byItem.has(p.item)) byItem.set(p.item, []);
      byItem.get(p.item).push(p);
    }
    const meshes = [];
    const boxes = [];
    const circles = [];
    for (const [name, list] of byItem) {
      const item = ITEMS[name];
      for (const g of item.groups) {
        const mesh = new THREE.InstancedMesh(g.geo, g.mat, list.length);
        mesh.name = `interior_${name}`;
        list.forEach((p, i) => {
          q.setFromAxisAngle(UP, p.yaw || 0);
          pos.set(p.x, p.y || 0, p.z);
          scl.set(p.sx || 1, p.sy || 1, p.sz || 1);
          mesh.setMatrixAt(i, m4.compose(pos, q, scl));
          if (g.tint) {
            const want = p.color ?? (g.tint === "brand" ? palette.brand : palette.accent);
            mesh.setColorAt(i, toColor(want, g.tint === "brand" ? 0x355c7d : 0xd9a441));
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        meshes.push(mesh);
      }
      for (const p of list) {
        const c = Math.cos(p.yaw || 0);
        const s = Math.sin(p.yaw || 0);
        const sx = p.sx || 1;
        const sz = p.sz || 1;
        // Local (x, z) → interior: rotation.y by yaw maps +X to (cos, −sin) and +Z to (sin, cos).
        for (const [bx, bz, hx, hz] of item.boxes) {
          const lx = bx * sx;
          const lz = bz * sz;
          boxes.push([p.x + lx * c + lz * s, p.z - lx * s + lz * c, c, -s, hx * sx, hz * sz]);
        }
        for (const [cx, cz, r] of item.circles) {
          circles.push([p.x + cx * c + cz * s, p.z - cx * s + cz * c, r * Math.max(sx, sz)]);
        }
      }
    }
    return {
      group,
      boxes,
      circles,
      dispose() {
        for (const m of meshes) m.dispose();
      },
    };
  }

  /**
   * Room shell for an interior-gen layout: floor, walls with the door gap and shop windows,
   * ceiling, a brand band and the wordmark sign. All geometry is per interior (disposed with
   * it); materials are shared.
   */
  function buildShell(layout, palette = {}, name = "") {
    const { w, d, h, door } = layout;
    const group = new THREE.Group();
    group.name = "interior_shell";
    const geos = [];
    const add = (geo, mat, opts = {}) => {
      const m = new THREE.Mesh(geo, mat);
      if (opts.order) m.renderOrder = opts.order;
      group.add(m);
      geos.push(geo);
      return m;
    };
    // Floor: UVs in metres so the shared tile texture repeats at a fixed size.
    const floor = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, 0, -d / 2);
    const uv = floor.attributes.uv;
    const tile = layout.floor === "wood" ? 1.6 : layout.floor === "concrete" ? 3 : 1.2;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    add(floor, floorMat(layout.floor || "tile"));
    const wall = paintMat(layout.wall ?? 0xe9e6df);
    const T = 0.2;
    add(new THREE.BoxGeometry(w + 2 * T, h, T).translate(0, h / 2, -d - T / 2), wall);
    add(new THREE.BoxGeometry(T, h, d).translate(-w / 2 - T / 2, h / 2, -d / 2), wall);
    add(new THREE.BoxGeometry(T, h, d).translate(w / 2 + T / 2, h / 2, -d / 2), wall);
    add(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(0, h, -d / 2), paintMat(layout.ceiling ?? 0xf2f1ee, 0.95));
    // Street wall: solid piers, a glazed band (daylight / night sky) and the door opening.
    const d0 = door.x - door.w / 2;
    const d1 = door.x + door.w / 2;
    const frontWall = paintMat(layout.front ?? 0x3a3c40, 0.7);
    const segs = [
      [-w / 2 - T, d0 - 0.08],
      [d1 + 0.08, w / 2 + T],
    ];
    for (const [a0, a1] of segs) {
      if (a1 - a0 < 0.02) continue;
      const mid = (a0 + a1) / 2;
      const len = a1 - a0;
      add(new THREE.BoxGeometry(len, 0.55, T).translate(mid, 0.275, T / 2), frontWall);
      add(new THREE.BoxGeometry(len, h - 2.75, T).translate(mid, 2.75 + (h - 2.75) / 2, T / 2), frontWall);
      const glass = len - 0.3;
      if (glass > 0.3) {
        add(new THREE.PlaneGeometry(glass, 2.15).rotateY(Math.PI).translate(mid, 0.55 + 2.15 / 2, 0.06), windowMat);
        for (let x = mid - glass / 2; x <= mid + glass / 2 + 1e-3; x += Math.max(1.2, glass / Math.ceil(glass / 1.6))) {
          add(new THREE.BoxGeometry(0.06, 2.15, 0.08).translate(x, 0.55 + 2.15 / 2, 0.02), MAT.darkMetal);
        }
      } else {
        add(new THREE.BoxGeometry(len, 2.2, T).translate(mid, 0.55 + 1.1, T / 2), frontWall);
      }
    }
    // Door frame and transom over the opening.
    add(new THREE.BoxGeometry(0.08, 2.25, T + 0.04).translate(d0 - 0.04, 1.125, T / 2), MAT.darkMetal);
    add(new THREE.BoxGeometry(0.08, 2.25, T + 0.04).translate(d1 + 0.04, 1.125, T / 2), MAT.darkMetal);
    add(new THREE.BoxGeometry(door.w + 0.16, h - 2.25, T).translate(door.x, 2.25 + (h - 2.25) / 2, T / 2), frontWall);
    // The street is hidden while inside: the doorway shows the same daylight as the windows.
    add(new THREE.PlaneGeometry(door.w + 0.2, 2.35).rotateY(Math.PI).translate(door.x, 1.175, 0.42), windowMat);
    // Brand band and the wordmark on the back wall, above the shelving.
    const band = Math.min(w, 40);
    const brandMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    toColor(palette.brand, 0x355c7d);
    brandMat.color.copy(tmpColor);
    add(new THREE.BoxGeometry(band, 0.22, 0.03).translate(0, h - 0.45, -d + 0.02), brandMat);
    const signW = Math.min(w * 0.6, 4.2);
    const tex = wordmarkTexture(THREE, name, palette.brand, palette.accent);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
    const signY = Math.max(2.35, h - 1.0);
    add(new THREE.PlaneGeometry(signW, signW / 4).translate(layout.sign?.x ?? 0, signY, -d + 0.05), signMat);
    for (const m of group.children) m.receiveShadow = false;
    return {
      group,
      dispose() {
        for (const g of geos) g.dispose();
        brandMat.dispose();
        signMat.dispose();
        tex.dispose();
      },
    };
  }

  return {
    items: Object.keys(ITEMS),
    build,
    buildShell,
    /** Shop windows: daylight by day, a dark night sky after dusk (glow 0 → 1). */
    setNight(glow) {
      const g = Math.max(0, Math.min(1, Number(glow) || 0));
      windowMat.emissive.copy(WIN_DAY).lerp(WIN_NIGHT, g);
      windowMat.emissiveIntensity = 0.9 - 0.5 * g;
    },
  };
}
