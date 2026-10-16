/**
 * Aggregate and slab joints for street materials. The runtime asphalt tile is
 * kept quiet so its 4 m repeat does not streak; this tints the existing
 * material from world position. No extra meshes, no texture samples.
 */

/** @returns {"slab"|"grit"|""} */
export function streetKind(name) {
  const n = String(name || "").toLowerCase();
  if (n === "sidewalk" || n.startsWith("sidewalk_") || n.startsWith("sidewalk ")) return "slab";
  if (n === "asphalt" || n.startsWith("asphalt_") || n.startsWith("asphalt ")) return "grit";
  if (n === "tram_bed" || n.startsWith("tram_bed")) return "grit";
  return "";
}

/** Pull blown-out pavement slabs down so the joints can read. */
export const SIDEWALK_SEAT = 0.86;

// Fine aggregate only. A 2.6 m "repair" tile (warm rgb 0.58) turned streets and
// pavements into a brown patchwork, so it is gone.
const GRIT = /* glsl */ `
{
  vec2 hp = vStreetWorld.xz;
  vec2 gcell = floor(hp * 18.0);
  vec2 hg = fract(gcell * vec2(0.1031, 0.1030));
  hg += dot(hg, hg.yx + 33.33);
  float grain = fract((hg.x + hg.y) * hg.x);
  diffuseColor.rgb *= mix(0.94, 1.04, grain);
`;

const JOINT = /* glsl */ `
  vec2 g = fract(hp / 0.30);
  float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 0.04, seam));
`;

function applyBody(kind) {
  return `${GRIT}${kind === "slab" ? JOINT : ""}\n}\n`;
}

/** Patch one material. Returns true the first time it is shaded. */
export function shadeStreet(mat) {
  const kind = streetKind(mat && mat.name);
  if (!kind || !mat || mat.userData?._streetGrit) return false;
  mat.userData = mat.userData || {};
  mat.userData._streetGrit = kind;
  if (
    kind === "slab" &&
    mat.color &&
    typeof mat.color.r === "number" &&
    mat.color.r > 0.92 &&
    typeof mat.color.multiplyScalar === "function"
  ) {
    mat.color.multiplyScalar(SIDEWALK_SEAT);
  }
  const body = applyBody(kind);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStreetWorld;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvStreetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStreetWorld;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${body}`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|street-grit-v3|${kind}`;
  };
  if (typeof mat.needsUpdate === "boolean" || mat.needsUpdate === undefined) mat.needsUpdate = true;
  return true;
}

/** Shade every street material under root. Returns how many materials were newly patched. */
export function shadeStreets(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  let n = 0;
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (shadeStreet(m)) n += 1;
    }
  });
  return n;
}
