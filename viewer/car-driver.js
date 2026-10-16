/**
 * Someone in the driver's seat. Cabin glass is opaque, so the occupant is a
 * dark patch on the existing glass: left side (+X), forward of centre (+Z).
 * No extra meshes.
 */

export function isCabinGlass(name) {
  const n = String(name || "").toLowerCase();
  return n === "car_glass" || n.startsWith("car_glass_") || n.startsWith("car_glass.");
}

/** Head-and-shoulders centre and radii inside a glass bounding box. */
export function driverBlob(min, max) {
  const dx = max[0] - min[0];
  const dy = max[1] - min[1];
  const dz = max[2] - min[2];
  return {
    seat: [max[0] - dx * 0.22, min[1] + dy * 0.62, min[2] + dz * 0.72],
    rad: [Math.max(0.05, dx * 0.2), Math.max(0.05, dy * 0.14), Math.max(0.05, dz * 0.07)],
  };
}

/** Glass bounds for one material group. `start/count` follow Three.js groups (index entries). */
export function glassSpan(geometry, materialIndex) {
  const pos = geometry && geometry.attributes && geometry.attributes.position;
  if (!pos || typeof pos.getX !== "function") return null;
  const groups = geometry.groups || [];
  const whole = !groups.length || groups.every((g) => g.materialIndex === materialIndex);
  if (whole && geometry.boundingBox) {
    const b = geometry.boundingBox;
    return {
      min: [b.min.x, b.min.y, b.min.z],
      max: [b.max.x, b.max.y, b.max.z],
      n: pos.count,
    };
  }
  const spans = [];
  if (!groups.length) spans.push([0, pos.count]);
  else {
    for (const g of groups) {
      if (g.materialIndex === materialIndex) spans.push([g.start, g.count]);
    }
  }
  if (!spans.length) return null;
  const index = geometry.index;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (const [start, count] of spans) {
    for (let i = start; i < start + count; i++) {
      const vi = index ? index.getX(i) : i;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
      n++;
    }
  }
  return n ? { min, max, n } : null;
}

const APPLY = /* glsl */ `
{
  vec3 q = (vDriverLocal - uSeat) / uRad;
  float head = 1.0 - smoothstep(0.2, 1.0, dot(q, q));
  vec3 s = (vDriverLocal - (uSeat - vec3(0.0, uRad.y, 0.0))) / (uRad * vec3(1.25, 0.85, 1.15));
  float shoulders = 1.0 - smoothstep(0.25, 1.05, dot(s, s));
  float occ = max(head, shoulders * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.19, 0.17), occ);
}
`;

/** Patch one glass material. The seat is local to that model's glass. */
export function shadeDriver(mat, blob) {
  if (!mat || mat.userData?._driver || !blob) return false;
  if (!isCabinGlass(mat.name)) return false;
  mat.userData = mat.userData || {};
  mat.userData._driver = true;
  mat.userData.driverSeat = blob.seat;
  const seat = blob.seat;
  const rad = blob.rad;
  const vec3 = (x, y, z) => ({ x, y, z, isVector3: true });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.uniforms.uSeat = { value: vec3(seat[0], seat[1], seat[2]) };
    shader.uniforms.uRad = { value: vec3(rad[0], rad[1], rad[2]) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDriverLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDriverLocal = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDriverLocal;\nuniform vec3 uSeat;\nuniform vec3 uRad;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${APPLY}`);
  };
  const prevKey = mat.customProgramCacheKey;
  const stamp = seat.map((v) => v.toFixed(2)).join(",");
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|driver-v1|${stamp}`;
  };
  if (typeof mat.needsUpdate === "boolean" || mat.needsUpdate === undefined) mat.needsUpdate = true;
  return true;
}

/** Shade every cabin-glass material under root. Returns how many were newly patched. */
function unionSpan(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
    n: a.n + b.n,
  };
}

export function shadeDrivers(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  const parts = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (let i = 0; i < list.length; i++) {
      const mat = list[i];
      if (!mat || !isCabinGlass(mat.name)) continue;
      if (!obj.geometry.boundingBox && obj.geometry.computeBoundingBox) obj.geometry.computeBoundingBox();
      const span = glassSpan(obj.geometry, Array.isArray(obj.material) ? i : 0);
      if (!span) continue;
      parts.set(mat, unionSpan(parts.get(mat), span));
    }
  });
  let n = 0;
  for (const [mat, span] of parts) {
    if (shadeDriver(mat, driverBlob(span.min, span.max))) {
      mat.userData.glassMin = span.min;
      mat.userData.glassMax = span.max;
      n += 1;
    }
  }
  return n;
}
