/**
 * Centre dashes and zebra bars are baked a sandy beige, so they read as wear
 * instead of paint. Lift those materials to a cool white. No extra meshes.
 */

export const MARKING = [0.953, 0.957, 0.945];

export function isRoadMarking(name) {
  const n = String(name || "").toLowerCase();
  if (n === "road_dash" || n.startsWith("road_dash_") || n.startsWith("road_dash.")) return true;
  if (n === "zebra" || n.startsWith("zebra_") || n.startsWith("zebra.")) return true;
  return false;
}

/** Recolour every dash and zebra material under root. Returns how many changed. */
export function paintRoadMarkings(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  const seen = new Set();
  let n = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat || seen.has(mat) || !isRoadMarking(mat.name) || !mat.color || !mat.color.setRGB) continue;
      seen.add(mat);
      mat.color.setRGB(MARKING[0], MARKING[1], MARKING[2]);
      n += 1;
    }
  });
  return n;
}
