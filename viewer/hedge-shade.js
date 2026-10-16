/**
 * Leaf variation for hedge materials. The city bakes hedges as boxes; this
 * tints the existing material from world position so a run reads as clipped
 * foliage. No extra meshes, no texture samples.
 */

export function isHedgeMaterial(name) {
  const n = String(name || "").toLowerCase();
  return n === "hedge" || n.startsWith("hedge_") || n.startsWith("hedge ") || n.includes("barrier_hedge");
}

const APPLY = /* glsl */ `
{
  vec3 hp = vHedgeWorld;
  float speck = fract(sin(dot(floor(hp.xz * 7.0), vec2(127.1, 311.7))) * 43758.5453);
  float clump = fract(sin(dot(floor(hp.xz * 1.6 + hp.y * 2.4), vec2(269.5, 183.3))) * 43758.5453);
  diffuseColor.rgb *= mix(0.74, 1.06, speck);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 1.08, 0.62), clump * 0.4);
  float up = clamp(hp.y * 0.85, 0.0, 1.0);
  diffuseColor.rgb *= mix(0.8, 1.0, up);
}
`;

/** Patch one material. Returns true the first time a hedge material is shaded. */
export function shadeHedge(mat) {
  if (!mat || mat.userData?._hedgeShade) return false;
  if (!isHedgeMaterial(mat.name)) return false;
  mat.userData = mat.userData || {};
  mat.userData._hedgeShade = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHedgeWorld;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvHedgeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHedgeWorld;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${APPLY}`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|hedge-leaf-v1`;
  };
  if (typeof mat.needsUpdate === "boolean" || mat.needsUpdate === undefined) mat.needsUpdate = true;
  return true;
}

/** Shade every hedge material under root. Returns how many materials were newly patched. */
export function shadeHedges(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  let n = 0;
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (shadeHedge(m)) n += 1;
    }
  });
  return n;
}
