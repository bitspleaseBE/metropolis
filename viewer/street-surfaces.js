/**
 * The baked asphalt tile is ~10% grey. Brightening that photo stretches its
 * noise into long streaks, so the carriageway gets a quiet generated tile
 * instead. Stone streets (old residential / living streets only) swap onto
 * a cobble tile.
 *
 * Road UVs are world-metres / 4 m, so each canvas is one 4 m repeat.
 */

/** Mean texel the asphalt tile should sit near (0–255). Dark grey, not black. */
export const ASPHALT_MEAN = 108;

export function cobbleTexture(THREE) {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#2e2c2a";
  ctx.fillRect(0, 0, S, S);
  const cell = 14; // ~22 cm stones across a 4 m repeat
  const rows = Math.ceil(S / cell) + 1;
  const cols = Math.ceil(S / cell) + 2;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (cell * 0.5);
    for (let col = -1; col < cols; col++) {
      const n = (row * 17 + col * 13) % 56;
      const g = 118 + n;
      ctx.fillStyle = `rgb(${g - 8},${g - 4},${g - 14})`;
      const x = Math.round(col * cell + off) + 1;
      const y = row * cell + 1;
      ctx.fillRect(x, y, cell - 2, cell - 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Even grey with fine aggregate. Low contrast, so the 4 m repeat does not streak. */
export function quietAsphaltCanvas() {
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(S, S);
  const data = image.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const grain = hash2(x, y);
      const patch = hash2(x >> 4, y >> 4);
      const shade = ASPHALT_MEAN + (grain - 0.5) * 14 + (patch - 0.5) * 8;
      const g = Math.max(0, Math.min(255, Math.round(shade)));
      const i = (y * S + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = Math.max(0, g - 2);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Replace a shared albedo in place so every material using it updates together. */
export function paintQuietAsphalt(tex) {
  if (!tex) return false;
  tex.image = quietAsphaltCanvas();
  tex.needsUpdate = true;
  return true;
}

/**
 * @param {object} root city GLB scene
 * @param {*} THREE
 * @param {Record<string, string>} surfaces way id → "cobble" (asphalt is the default)
 * @returns {{ cobble: number, lifted: boolean }}
 */
export function applyStreetSurfaces(root, THREE, surfaces) {
  const lookup = surfaces || {};
  let asphaltMat = null;
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat || seen.has(mat.uuid)) continue;
      seen.add(mat.uuid);
      if (mat.name === "asphalt") asphaltMat = mat;
      else if (mat.name === "asphalt_wear_a") mat.color.set(0x3a3c40);
      else if (mat.name === "asphalt_wear_b") mat.color.set(0x4a4844);
      else if (mat.name === "ground" && mat.color && Math.max(mat.color.r, mat.color.g, mat.color.b) < 0.2) {
        // The gravel plane was multiplied down to ~6% and reads as a black void.
        mat.color.set(0x9a9488);
      }
    }
  });
  let lifted = false;
  if (asphaltMat && asphaltMat.map) {
    lifted = paintQuietAsphalt(asphaltMat.map);
    if (asphaltMat.color) asphaltMat.color.set(0xffffff);
    asphaltMat.needsUpdate = true;
  }
  if (!asphaltMat) return { cobble: 0, lifted };
  const cobbleMat = asphaltMat.clone();
  cobbleMat.name = "cobble";
  cobbleMat.map = cobbleTexture(THREE);
  cobbleMat.color.set(0xffffff);
  // The clone copies the asphalt grit hook. Stone streets keep their own tile.
  if (cobbleMat.userData) delete cobbleMat.userData._streetGrit;
  delete cobbleMat.onBeforeCompile;
  delete cobbleMat.customProgramCacheKey;
  cobbleMat.needsUpdate = true;
  let cobble = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const id = /^road_(\d+)/.exec(obj.name || "");
    if (!id || lookup[id[1]] !== "cobble") return;
    obj.material = cobbleMat;
    cobble++;
  });
  return { cobble, lifted };
}
