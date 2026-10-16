/**
 * Hedge boxes pick up a leaf tint without extra geometry.
 *   node scripts/test_hedge_shade.mjs
 */
import assert from "node:assert/strict";
import { isHedgeMaterial, shadeHedge, shadeHedges } from "../viewer/hedge-shade.js";

assert.equal(isHedgeMaterial("hedge"), true);
assert.equal(isHedgeMaterial("hedge_12"), true);
assert.equal(isHedgeMaterial("barrier_hedge"), true);
assert.equal(isHedgeMaterial("road_asphalt"), false);
assert.equal(isHedgeMaterial("Hedge"), true);

{
  const mat = { name: "hedge", userData: {}, needsUpdate: false };
  assert.equal(shadeHedge(mat), true);
  assert.equal(shadeHedge(mat), false, "a material is patched once");
  const shader = {
    vertexShader: "#include <common>\n#include <begin_vertex>\n",
    fragmentShader: "#include <common>\n#include <color_fragment>\n",
  };
  mat.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /vHedgeWorld/);
  assert.match(shader.fragmentShader, /diffuseColor/);
  assert.doesNotMatch(shader.fragmentShader, /texture2D|texture\(/, "no extra texture samples");
  assert.equal(mat.customProgramCacheKey(), "|hedge-leaf-v1");
}

{
  const hedge = { name: "hedge", userData: {} };
  const road = { name: "road_asphalt", userData: {} };
  const root = {
    traverse(fn) {
      fn({ isMesh: true, material: hedge });
      fn({ isMesh: true, material: [hedge, road] });
      fn({ isMesh: true, material: { name: "hedge_3", userData: {} } });
    },
  };
  assert.equal(shadeHedges(root), 2);
  assert.equal(shadeHedges(null), 0);
}

console.log("hedge-shade ok");
