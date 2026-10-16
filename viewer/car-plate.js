/**
 * Belgian plates on the bumper. One small mesh each end, sharing a geometry.
 * The blue band sits on the left as you read the plate. Parked cars that were
 * merged into a tile are left alone; fleet cars and wrapped kerbside cars get one.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 5×7 glyphs, each row five bits, top to bottom. */
const FONT = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 16, 30, 1, 1, 30],
  6: [14, 16, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
  "-": [0, 0, 0, 14, 0, 0, 0],
};

/** `1-ABC-234`, stable for a seed. */
export function plateText(seed) {
  let n = (seed >>> 0) || 1;
  const next = () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n;
  };
  const d1 = 1 + (next() % 8);
  let abc = "";
  for (let i = 0; i < 3; i++) abc += LETTERS[next() % 26];
  const num = String(100 + (next() % 900));
  return `${d1}-${abc}-${num}`;
}

/**
 * Colour at a normalised plate coordinate.
 * @returns {"blue"|"white"|"ink"|"edge"}
 */
export function plateInk(u, v, text) {
  if (u < 0.03 || u > 0.97 || v < 0.08 || v > 0.92) return "edge";
  if (u < 0.14) return "blue";
  const label = String(text || "");
  const u0 = 0.18;
  const u1 = 0.96;
  const cell = (u1 - u0) / Math.max(1, label.length);
  const i = Math.floor((u - u0) / cell);
  if (i < 0 || i >= label.length) return "white";
  const glyph = FONT[label[i]];
  if (!glyph) return "white";
  const cu = (u - u0 - i * cell) / cell;
  const col = Math.floor((cu - 0.18) / 0.64 * 5);
  const row = Math.floor((v - 0.2) / 0.6 * 7);
  if (col < 0 || col > 4 || row < 0 || row > 6) return "white";
  const bit = (glyph[row] >> (4 - col)) & 1;
  return bit ? "ink" : "white";
}

/** Bumper height and a plate just proud of each end. `min`/`max` are local bounds. */
export function platePose(min, max) {
  const h = max[1] - min[1];
  const w = max[0] - min[0];
  const y = Math.min(Math.max(min[1] + h * 0.3, min[1] + 0.34), min[1] + 0.58);
  const width = Math.min(0.52, Math.max(0.36, w * 0.34));
  return {
    y,
    width,
    height: width * (110 / 520),
    rearZ: min[2] - 0.014,
    frontZ: max[2] + 0.014,
  };
}

const INK = {
  blue: [12, 48, 148, 255],
  white: [236, 238, 234, 255],
  ink: [18, 18, 20, 255],
  edge: [28, 30, 32, 255],
};

let sharedGeo = null;

function fillPlate(ctx, canvas, text) {
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const ink = plateInk((x + 0.5) / canvas.width, (y + 0.5) / canvas.height, text);
      const c = INK[ink];
      const i = (y * canvas.width + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}

function plateMaterial(THREE, text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 56;
  fillPlate(canvas.getContext("2d"), canvas, text);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    toneMapped: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.name = "car_plate";
  return mat;
}

/**
 * Front and rear plates on `parent`, in that object's local space.
 * @returns {number} meshes added
 */
export function addPlates(THREE, parent, box, seed) {
  if (!THREE || !parent || !box || box.isEmpty()) return 0;
  const min = [box.min.x, box.min.y, box.min.z];
  const max = [box.max.x, box.max.y, box.max.z];
  if (max[0] - min[0] < 0.8 || max[2] - min[2] < 1.5) return 0;
  const pose = platePose(min, max);
  if (!sharedGeo) sharedGeo = new THREE.BoxGeometry(1, 1, 0.012);
  const text = plateText(seed);
  const mat = plateMaterial(THREE, text);
  const rear = new THREE.Mesh(sharedGeo, mat);
  rear.name = "plate_rear";
  rear.scale.set(pose.width, pose.height, 1);
  rear.position.set(0, pose.y, pose.rearZ);
  rear.castShadow = false;
  rear.receiveShadow = false;
  const front = new THREE.Mesh(sharedGeo, mat);
  front.name = "plate_front";
  front.scale.set(pose.width, pose.height, 1);
  front.position.set(0, pose.y, pose.frontZ);
  front.castShadow = false;
  front.receiveShadow = false;
  parent.add(rear, front);
  return 2;
}
