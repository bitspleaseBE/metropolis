/**
 * A car flashes the indicator on the side it will turn, and only while the blink is on.
 *   node scripts/test_indicators.mjs
 */
import assert from "node:assert/strict";
import { AMBER, indicatorLit, indicatorSide, indicatorUniform, shadeIndicator } from "../viewer/indicators.js";

assert.equal(indicatorSide(0, 1, 0, 1), "");
assert.equal(indicatorSide(0, 1, 0.1, 0.995), "");
assert.equal(indicatorSide(0, 1, 0.707, 0.707), "left");
assert.equal(indicatorSide(0, 1, -0.707, 0.707), "right");
assert.equal(indicatorSide(1, 0, 0, -1), "left");

assert.equal(indicatorLit(0, "left"), "left");
assert.equal(indicatorLit(0.2, "right"), "right");
assert.equal(indicatorLit(0.4, "left"), "");
assert.equal(indicatorLit(0.7, "left"), "left");
assert.equal(indicatorLit(0.1, ""), "");
assert.equal(indicatorLit(Number.NaN, "left"), "left");

assert.ok(AMBER[0] > 0.9 && AMBER[1] > AMBER[2]);

const mat = {
  userData: {},
  customProgramCacheKey() {
    return "base";
  },
};
shadeIndicator(mat);
shadeIndicator(mat);
assert.equal(mat.userData.uInd, indicatorUniform);
assert.equal(mat.customProgramCacheKey(), "base|ind-v1");
const shader = {
  uniforms: {},
  vertexShader: "void main() {\n#include <begin_vertex>\n}\n",
  fragmentShader: "void main() {\n#include <color_fragment>\n}\n",
};
mat.onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes("vLampX = position.x"));
assert.ok(shader.fragmentShader.includes("uInd * vLampX > 0.15"));
assert.equal(shader.uniforms.uInd, mat.userData.uInd);

console.log("indicators ok");
