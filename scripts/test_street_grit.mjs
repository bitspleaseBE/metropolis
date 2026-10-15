/**
 * Street materials pick up grit (and sidewalk joints) without extra geometry.
 *   node scripts/test_street_grit.mjs
 */
import assert from "node:assert/strict";
import { SIDEWALK_SEAT, shadeStreet, shadeStreets, streetKind } from "../viewer/street-grit.js";

assert.equal(streetKind("asphalt"), "grit");
assert.equal(streetKind("asphalt_wear_a"), "grit");
assert.equal(streetKind("tram_bed"), "grit");
assert.equal(streetKind("sidewalk"), "slab");
assert.equal(streetKind("sidewalk_frontage"), "slab");
assert.equal(streetKind("cobble"), "");
assert.equal(streetKind("zebra"), "");
assert.equal(streetKind("hedge"), "");

function compile(mat) {
  const shader = {
    vertexShader: "#include <common>\n#include <begin_vertex>\n",
    fragmentShader: "#include <common>\n#include <color_fragment>\n",
  };
  mat.onBeforeCompile(shader);
  return shader;
}

{
  const mat = {
    name: "asphalt",
    userData: {},
    needsUpdate: false,
    color: { r: 1, g: 1, b: 1, multiplyScalar() { throw new Error("asphalt stays at texture brightness"); } },
  };
  assert.equal(shadeStreet(mat), true);
  assert.equal(shadeStreet(mat), false, "a material is patched once");
  const shader = compile(mat);
  assert.match(shader.vertexShader, /vStreetWorld/);
  assert.match(shader.fragmentShader, /diffuseColor/);
  assert.doesNotMatch(shader.fragmentShader, /0\.30/, "carriageway has no slab grid");
  assert.match(shader.fragmentShader, /step\(0\.75/, "repairs are a hard darker patch");
  assert.match(shader.fragmentShader, /0\.1031/, "hash stays stable far from the origin");
  assert.doesNotMatch(shader.fragmentShader, /sin\(/, "sin of world metres collapses");
  assert.doesNotMatch(shader.fragmentShader, /texture2D|texture\(/, "no extra texture samples");
  assert.equal(mat.customProgramCacheKey(), "|street-grit-v2|grit");
}

{
  let seated = 1;
  const mat = {
    name: "sidewalk",
    userData: {},
    color: {
      r: 1,
      g: 1,
      b: 1,
      multiplyScalar(s) {
        this.r *= s;
        this.g *= s;
        this.b *= s;
        seated = s;
        return this;
      },
    },
  };
  assert.equal(shadeStreet(mat), true);
  assert.equal(seated, SIDEWALK_SEAT);
  assert.ok(mat.color.r < 0.92 && mat.color.r > 0.7);
  const shader = compile(mat);
  assert.match(shader.fragmentShader, /0\.30/);
  assert.equal(mat.customProgramCacheKey(), "|street-grit-v2|slab");
  assert.equal(shadeStreet(mat), false, "seating does not run twice");
}

{
  const asphalt = { name: "asphalt", userData: {} };
  const walk = { name: "sidewalk", userData: {} };
  const zebra = { name: "zebra", userData: {} };
  const root = {
    traverse(fn) {
      fn({ isMesh: true, material: asphalt });
      fn({ isMesh: true, material: [walk, zebra] });
      fn({ isMesh: true, material: { name: "tram_bed", userData: {} } });
    },
  };
  assert.equal(shadeStreets(root), 3);
  assert.equal(shadeStreets(null), 0);
  assert.equal(zebra.userData._streetGrit, undefined);
}

console.log("street-grit ok");
