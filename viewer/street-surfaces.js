/**
 * The baked asphalt tile is ~10% grey, and ACES crushes that to black in both
 * day and night. Lift it so the carriageway reads as asphalt, and swap stone
 * streets (OSM sett / cobble / paving stones) onto a cobble tile.
 *
 * Road UVs are world-metres / 4 m, so the cobble canvas is one 4 m repeat.
 */

/** Mean texel the lifted asphalt should sit near (0–255). Dark grey, not black. */
export const ASPHALT_MEAN = 96;

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

/** Scale a near-black albedo up in place so every material sharing the image lifts together. */
export function liftDarkTexture(tex, targetMean = ASPHALT_MEAN) {
  const img = tex && tex.image;
  if (!img || !img.width || !img.height) return false;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let sum = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += data[i] + data[i + 1] + data[i + 2];
    samples++;
  }
  const mean = sum / (samples * 3) || 1;
  if (mean >= targetMean * 0.85) return false;
  const scale = Math.min(5, targetMean / mean);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.round(data[i] * scale));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * scale));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * scale));
  }
  ctx.putImageData(image, 0, 0);
  tex.image = canvas;
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
    lifted = liftDarkTexture(asphaltMat.map);
    asphaltMat.needsUpdate = true;
  }
  if (!asphaltMat) return { cobble: 0, lifted };
  const cobbleMat = asphaltMat.clone();
  cobbleMat.name = "cobble";
  cobbleMat.map = cobbleTexture(THREE);
  cobbleMat.color.set(0xffffff);
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
