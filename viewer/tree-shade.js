/**
 * Leaf break-up for the shared tree material. Crowns and trunks share
 * `tree_vc` and are told apart by vertex colour. The shader only mottles
 * the green, so a crown is not one flat blob. No extra meshes.
 */

export function isTreeMaterial(name) {
  const n = String(name || "").toLowerCase();
  return n === "tree_vc" || n.startsWith("tree_vc_") || n.startsWith("tree_vc.");
}

const APPLY = /* glsl */ `
{
  float leaf = step(diffuseColor.r + 0.04, diffuseColor.g);
  vec3 w = vTreeWorld;
  float row = floor(w.y * 2.2);
  vec2 cell = floor(w.xz * 3.4 + vec2(row * 0.37, 0.0));
  float speck = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float clump = fract(sin(dot(floor(w * 0.7), vec3(269.5, 183.3, 91.7))) * 43758.5453);
  vec3 crown = diffuseColor.rgb * mix(0.78, 1.1, speck);
  crown = mix(crown, crown * vec3(0.72, 1.12, 0.58), clump * 0.45);
  float up = clamp(normalize(vTreeN).y * 0.5 + 0.5, 0.0, 1.0);
  crown *= mix(0.8, 1.02, up);
  float bark = fract(sin(dot(floor(vec2(w.x * 9.0, w.y * 14.0)), vec2(41.3, 289.1))) * 43758.5453);
  vec3 trunk = diffuseColor.rgb * mix(0.82, 1.06, bark);
  diffuseColor.rgb = mix(trunk, crown, leaf);
}
`;

/** Patch one material. Returns true the first time a tree material is shaded. */
export function shadeTree(mat) {
  if (!mat || mat.userData?._treeShade) return false;
  if (!isTreeMaterial(mat.name)) return false;
  mat.userData = mat.userData || {};
  mat.userData._treeShade = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTreeWorld;\nvarying vec3 vTreeN;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vTreeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTreeN = normalize(mat3(modelMatrix) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTreeWorld;\nvarying vec3 vTreeN;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${APPLY}`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|tree-leaf-v1`;
  };
  if (typeof mat.needsUpdate === "boolean" || mat.needsUpdate === undefined) mat.needsUpdate = true;
  return true;
}

/** Shade every tree material under root. Returns how many materials were newly patched. */
export function shadeTrees(root) {
  if (!root || typeof root.traverse !== "function") return 0;
  let n = 0;
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (shadeTree(m)) n += 1;
    }
  });
  return n;
}
