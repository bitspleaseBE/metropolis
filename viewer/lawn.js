/**
 * Park grass is multiplied by an aerial tint whose blue channel beats the green,
 * so a lawn reads as mauve from the street. Put green back in front. Paths stay.
 */

export const LAWN = [0.62, 0.92, 0.46];

export function isLawn(name) {
  const n = String(name || "").toLowerCase();
  if (n.startsWith("park_path")) return false;
  if (n === "park" || n.startsWith("park.") || n.startsWith("park_")) return true;
  if (n === "yard_grass" || n.startsWith("yard_grass_") || n.startsWith("yard_grass.")) return true;
  return false;
}

/** Recolour lawn materials under root. Returns how many changed. */
export function paintLawns(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  const seen = new Set();
  let n = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat || seen.has(mat) || !isLawn(mat.name) || !mat.color || !mat.color.setRGB) continue;
      seen.add(mat);
      mat.color.setRGB(LAWN[0], LAWN[1], LAWN[2]);
      n += 1;
    }
  });
  return n;
}
