/**
 * Centre dashes and zebra bars are baked a sandy beige, so they read as wear
 * instead of paint. Lift those materials to a cool white. Survey markings and
 * lined parking bays from roads.json are extra decals (not a GLB rebuild).
 */

import { fetchJsonCached } from "./json-cache.js";

export const MARKING = [0.953, 0.957, 0.945];

const KIND_COLOR = {
  zebra: MARKING,
  stop: MARKING,
  give_way: MARKING,
  arrow: MARKING,
  dash: MARKING,
  bike: [0.82, 0.55, 0.18],
  bus: [0.9, 0.78, 0.18],
  box: [0.92, 0.82, 0.22],
  other: [0.9, 0.9, 0.86],
};

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

function ringMesh(THREE, ring, rgb, y = 0.028) {
  if (!ring || ring.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.name = "survey_marking";
  return mesh;
}

/** Draw city survey markings + lined parking bays from roads.json. */
export async function paintSurveyMarkings(scene, THREE) {
  if (!scene || !THREE) return 0;
  let doc = {};
  try {
    const res = await fetchJsonCached("./roads.json");
    if (res.ok) doc = await res.json();
  } catch {
    return 0;
  }
  const group = new THREE.Group();
  group.name = "SurveyPaint";
  let n = 0;
  for (const rec of doc.markings || []) {
    const mesh = ringMesh(THREE, rec.ring, KIND_COLOR[rec.k] || KIND_COLOR.other);
    if (!mesh) continue;
    group.add(mesh);
    n += 1;
  }
  for (const bay of doc.parkingBays || []) {
    if (!bay.lined) continue;
    const mesh = ringMesh(THREE, bay.ring, MARKING, 0.026);
    if (!mesh) continue;
    mesh.name = "survey_bay";
    group.add(mesh);
    n += 1;
  }
  if (n) scene.add(group);
  return n;
}
