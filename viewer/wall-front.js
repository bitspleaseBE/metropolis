/**
 * The street photo sits on the road edge only. Every other face of the mass is a
 * flat wall tile, so a block seen from the square (the cathedral close, a side
 * alley) reads as an untextured box. Dress the mass itself — not the facade
 * quads, which already have their own windows — with a masonry course and a
 * bay of glass. One shared material per wall finish, no extra meshes.
 */

const BODY = /^(?:bldg|lmbase)_\d+$/;

export function isBareWall(meshName, materialName) {
  if (!BODY.test(String(meshName || ""))) return false;
  return /^wall_/i.test(String(materialName || ""));
}

const COURSE = `{
  vec3 w = vWallWorld;
  vec3 n = normalize(vWallN);
  float along = abs(n.x) > abs(n.z) ? w.z : w.x;
  float row = floor(w.y * 2.5);
  float shift = mod(row, 2.0) * 0.5;
  vec2 g = fract(vec2(along * 1.6 + shift, w.y * 2.5));
  float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  float mortar = smoothstep(0.0, 0.07, seam);
  vec2 cell = floor(vec2(along * 1.6 + shift, row));
  float grit = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  diffuseColor.rgb *= mix(0.78, 1.0, mortar) * mix(0.93, 1.04, grit);
  float bay = fract(along / 2.7);
  float fy = fract(w.y / 3.15);
  float pane = smoothstep(0.2, 0.23, bay) * (1.0 - smoothstep(0.77, 0.8, bay));
  pane *= smoothstep(0.34, 0.37, fy) * (1.0 - smoothstep(0.76, 0.79, fy));
  if (w.y < 0.85) pane = 0.0;
  vec3 glass = vec3(0.1, 0.14, 0.18);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, pane);
}
`;

function patch(mat) {
  if (mat.userData._wallFront) return;
  mat.userData._wallFront = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWallWorld;\nvarying vec3 vWallN;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWallN = normalize(mat3(modelMatrix) * normal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWallWorld;\nvarying vec3 vWallN;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${COURSE}`);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|wall-front`;
  };
  mat.needsUpdate = true;
}

const dressed = new Map();

function frontOf(mat) {
  let copy = dressed.get(mat.uuid);
  if (copy) return copy;
  copy = mat.clone();
  copy.name = `${mat.name || "wall"}_front`;
  patch(copy);
  dressed.set(mat.uuid, copy);
  return copy;
}

/** Swap bare building masses onto a windowed wall. Facades and roofs stay. */
export function dressBareWalls(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    let changed = false;
    const next = list.map((m) => {
      if (!m || !isBareWall(obj.name, m.name)) return m;
      changed = true;
      return frontOf(m);
    });
    if (!changed) return;
    obj.material = Array.isArray(obj.material) ? next : next[0];
    n += 1;
  });
  return n;
}
