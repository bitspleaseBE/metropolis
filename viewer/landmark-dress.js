/**
 * Streamed landmarks wear a buff sandstone photo, so a white Gothic church
 * reads as one beige slab and the recessed stone is barely darker than the
 * wall. Dress the named materials in place: pale limestone with a mortar
 * course, sooty reveals, a darker bluestone plinth, and — on churches —
 * leaded glass that holds a little light. The beige map is dropped, so this
 * adds no texture samples and no meshes.
 */

/** @returns {"limestone"|"soot"|"bluestone"|"slate"|"glass"|"amber"|""} */
export function landmarkFinish(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("stone_white")) return "limestone";
  if (n.includes("stone_grey") || n.includes("stone_gray")) return "soot";
  if (n.includes("bluestone")) return "bluestone";
  if (n.includes("slate")) return "slate";
  if (n.includes("glass_roof")) return "";
  if (n.includes("glass_amber")) return "amber";
  if (n.includes("glass_dark")) return "glass";
  return "";
}

export function isChurchLandmark(item) {
  return /church|cathedral|kathedraal|kerk|basiliek|chapel|kapel/i.test(
    `${item?.kind || ""} ${item?.name || ""}`,
  );
}

const LIMESTONE = `{
  vec3 w = vLimeWorld;
  float row = floor(w.y * 2.35);
  float shift = mod(row, 2.0) * 0.5;
  vec2 g = fract(vec2((w.x + w.z) * 1.25 + shift, w.y * 2.35));
  float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  float mortar = smoothstep(0.0, 0.055, seam);
  vec2 cell = floor(vec2((w.x + w.z) * 1.25 + shift, row));
  float n = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  vec3 bone = mix(vec3(0.90, 0.88, 0.83), vec3(0.97, 0.95, 0.91), n);
  float grit = fract(sin(dot(floor(w * 14.0), vec3(12.9, 45.2, 78.1))) * 43758.5);
  bone *= mix(0.94, 1.03, grit);
  bone *= mix(0.78, 1.0, mortar);
  diffuseColor.rgb = bone;
}
`;

function leadBlock(stainMix) {
  return `{
  vec3 w = vLimeWorld;
  float ax = length(vec2(dFdx(w.x), dFdy(w.x)));
  float az = length(vec2(dFdx(w.z), dFdy(w.z)));
  float horiz = ax > az ? w.x : w.z;
  vec2 cell = vec2(horiz, w.y) * vec2(1.15, 1.35);
  vec2 g = fract(cell);
  float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  float lead = smoothstep(0.02, 0.09, seam);
  float n = fract(sin(dot(floor(cell), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 stain = ${stainMix};
  diffuseColor.rgb = mix(vec3(0.02, 0.016, 0.014), stain, lead);
}
`;
}

const STAIN = leadBlock("mix(vec3(0.27, 0.42, 0.58), vec3(0.52, 0.40, 0.50), n)");
const AMBER = leadBlock("mix(vec3(0.55, 0.28, 0.06), vec3(0.75, 0.48, 0.12), n)");

const EMIT = `{
  vec3 w = vLimeWorld;
  float ax = length(vec2(dFdx(w.x), dFdy(w.x)));
  float az = length(vec2(dFdx(w.z), dFdy(w.z)));
  float horiz = ax > az ? w.x : w.z;
  vec2 g = fract(vec2(horiz, w.y) * vec2(1.15, 1.35));
  float seam = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
  float lead = smoothstep(0.02, 0.09, seam);
  totalEmissiveRadiance *= mix(0.12, 1.0, lead);
}
`;

function dropMap(mat) {
  const map = mat.map;
  if (!map) return;
  mat.map = null;
  mat.userData._droppedMaps = mat.userData._droppedMaps || [];
  mat.userData._droppedMaps.push(map);
}

function patchWorld(mat, colorChunk, emitChunk, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLimeWorld;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLimeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLimeWorld;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${colorChunk}`);
    if (emitChunk) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${emitChunk}`,
      );
    }
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey.call(mat) : "";
    return `${base}|landmark-dress|${key}`;
  };
  mat.needsUpdate = true;
}

/** Dress one material. Returns true the first time it changes. */
export function shadeLandmarkMaterial(mat, opts = {}) {
  if (!mat || mat.userData?._landmarkDress) return false;
  const finish = landmarkFinish(mat.name);
  if (!finish) return false;
  const church = !!opts.church;
  if ((finish === "glass" || finish === "amber") && !church) return false;

  mat.userData = mat.userData || {};
  mat.userData._landmarkDress = finish;

  if (finish === "soot") {
    dropMap(mat);
    if (mat.color?.setRGB) mat.color.setRGB(0.40, 0.37, 0.34);
    if (typeof mat.roughness === "number") mat.roughness = Math.max(mat.roughness, 0.92);
    mat.needsUpdate = true;
    return true;
  }
  if (finish === "bluestone") {
    if (mat.color?.multiplyScalar) mat.color.multiplyScalar(0.42);
    mat.needsUpdate = true;
    return true;
  }
  if (finish === "slate") {
    if (mat.color?.multiplyScalar) mat.color.multiplyScalar(0.62);
    mat.needsUpdate = true;
    return true;
  }
  if (finish === "glass" || finish === "amber") {
    const amber = finish === "amber";
    if (mat.color?.setRGB) {
      mat.color.setRGB(amber ? 0.55 : 0.12, amber ? 0.28 : 0.22, amber ? 0.08 : 0.42);
    }
    if (mat.emissive?.setRGB) {
      mat.emissive.setRGB(amber ? 0.42 : 0.08, amber ? 0.20 : 0.12, amber ? 0.04 : 0.16);
    }
    mat.emissiveIntensity = amber ? 0.35 : 0.28;
    mat.roughness = 0.16;
    mat.metalness = 0.04;
    patchWorld(mat, amber ? AMBER : STAIN, EMIT, amber ? "amber-v1" : "stain-v1");
    return true;
  }

  dropMap(mat);
  if (mat.color?.setRGB) mat.color.setRGB(0.93, 0.91, 0.86);
  patchWorld(mat, LIMESTONE, "", "lime-v1");
  return true;
}

/** Dress every material on a streamed landmark mesh. */
export function dressLandmarkObject(obj, opts = {}) {
  if (!obj?.isMesh || !obj.material) return 0;
  const list = Array.isArray(obj.material) ? obj.material : [obj.material];
  let n = 0;
  for (const mat of list) {
    if (shadeLandmarkMaterial(mat, opts)) n += 1;
  }
  return n;
}
