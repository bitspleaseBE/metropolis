/**
 * A soft blob under the car. Low quality has no shadow map, so without this
 * a car reads as floating. One shared texture, one quad per car.
 */

/** Centre and size of the blob inside a car's local bounds. */
export function shadowPose(min, max) {
  const w = max[0] - min[0];
  const l = max[2] - min[2];
  return {
    x: (min[0] + max[0]) * 0.5,
    y: min[1] + 0.06,
    z: (min[2] + max[2]) * 0.5,
    width: Math.min(Math.max(w * 1.15, 1.1), 2.8),
    length: Math.min(Math.max(l * 0.85, 1.6), 6.2),
  };
}

/**
 * Dark across the body and still dark in the band that sticks out past the sills.
 * `d` is 0 at the centre and 1 at the edge.
 */
export function shadowAlpha(d) {
  if (d >= 1) return 0;
  const edge = Math.min(1, Math.max(0, (d - 0.72) / 0.28));
  return 0.58 * (1 - edge * edge);
}

let shared = null;

function shadowParts(THREE) {
  if (shared) return shared;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.round(255 * shadowAlpha(d));
      const i = (y * size + x) * 4;
      data[i + 3] = a;
    }
  }
  const map = new THREE.DataTexture(data, size, size);
  map.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  mat.name = "car_shadow";
  shared = { geo: new THREE.PlaneGeometry(1, 1), mat };
  return shared;
}

/** Lay a contact shadow on `parent` from a local bounding box. Returns 1, or 0 if it does not fit. */
export function addContactShadow(THREE, parent, box) {
  if (!THREE || !parent || !box || box.isEmpty()) return 0;
  const min = [box.min.x, box.min.y, box.min.z];
  const max = [box.max.x, box.max.y, box.max.z];
  if (max[0] - min[0] < 0.6 || max[2] - min[2] < 1.2) return 0;
  const pose = shadowPose(min, max);
  const parts = shadowParts(THREE);
  const mesh = new THREE.Mesh(parts.geo, parts.mat);
  mesh.name = "contact_shadow";
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(pose.width, pose.length, 1);
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  parent.add(mesh);
  return 1;
}
