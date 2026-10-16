/**
 * Turn indicators. Fleet bodies keep both tail lenses on one material, so a
 * flashing side is chosen from the lens's own X: +X is the car's left
 * (wheel-*-left nodes sit on +X, nose on +Z).
 */

const STRAIGHT = 0.94;
const BLINK_S = 0.7;
export const AMBER = [1, 0.46, 0.06];

/**
 * "" | "left" | "right". `out` is the way the car is heading, `inn` the road it
 * will take. A negative cross turns the nose toward +X, which is left.
 */
export function indicatorSide(outX, outZ, inX, inZ) {
  const dot = outX * inX + outZ * inZ;
  if (dot >= STRAIGHT) return "";
  const cross = outX * inZ - outZ * inX;
  if (Math.abs(cross) < 0.08 && dot > 0.5) return "";
  return cross < 0 ? "left" : "right";
}

/** The side that is lit this instant, or "". */
export function indicatorLit(timeSec, side) {
  if (side !== "left" && side !== "right") return "";
  const t = Number(timeSec) || 0;
  const phase = ((t % BLINK_S) + BLINK_S) % BLINK_S;
  return phase < BLINK_S * 0.5 ? side : "";
}

/** One uniform for the whole fleet. Each car writes it in onBeforeRender, because the program is shared. */
export const indicatorUniform = { value: 0 };

const VERT = /* glsl */ `
varying float vLampX;
`;
const VERT_BODY = /* glsl */ `#include <begin_vertex>
vLampX = position.x;
`;
const FRAG = /* glsl */ `
varying float vLampX;
uniform float uInd;
`;
const FRAG_BODY = /* glsl */ `#include <color_fragment>
if (uInd * vLampX > 0.15) {
  diffuseColor.rgb = vec3(1.0, 0.46, 0.06);
}
`;

/** Patch one tail material so uInd 1 flashes +X and -1 flashes -X. */
export function shadeIndicator(mat) {
  if (!mat || mat.userData._ind) return mat?.userData?.uInd || null;
  mat.userData._ind = true;
  mat.userData.uInd = indicatorUniform;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uInd = indicatorUniform;
    shader.vertexShader = VERT + shader.vertexShader.replace("#include <begin_vertex>", VERT_BODY);
    shader.fragmentShader = FRAG + shader.fragmentShader.replace("#include <color_fragment>", FRAG_BODY);
  };
  const prev = mat.customProgramCacheKey && mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prev ? prev() : ""}|ind-v1`;
  return indicatorUniform;
}
