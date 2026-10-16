/**
 * Cathedral stone reads as limestone and shadow, not a buff slab.
 *   node scripts/test_landmark_dress.mjs
 */
import assert from "node:assert/strict";
import {
  dressLandmarkObject,
  isChurchLandmark,
  landmarkFinish,
  shadeLandmarkMaterial,
} from "../viewer/landmark-dress.js";

function color(r, g, b) {
  return {
    r,
    g,
    b,
    setRGB(nr, ng, nb) {
      this.r = nr;
      this.g = ng;
      this.b = nb;
      return this;
    },
    multiplyScalar(s) {
      this.r *= s;
      this.g *= s;
      this.b *= s;
      return this;
    },
  };
}

function mat(name, withMap = true) {
  const map = withMap ? { isTexture: true, disposed: false, dispose() { this.disposed = true; } } : null;
  return {
    name,
    userData: {},
    color: color(0.82, 0.78, 0.7),
    map,
    roughness: 0.82,
    metalness: 0,
    emissive: color(0, 0, 0),
    emissiveIntensity: 0,
    needsUpdate: false,
    onBeforeCompile: null,
    customProgramCacheKey: null,
  };
}

function compile(m) {
  const shader = {
    vertexShader: "#include <common>\n#include <begin_vertex>\n",
    fragmentShader: "#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>\n",
  };
  m.onBeforeCompile(shader);
  return shader;
}

assert.equal(landmarkFinish("lm_stone_white"), "limestone");
assert.equal(landmarkFinish("lm_stone_grey"), "soot");
assert.equal(landmarkFinish("lm_glass_dark"), "glass");
assert.equal(landmarkFinish("lm_glass_roof"), "");
assert.equal(landmarkFinish("lm_brick_red"), "");

assert.equal(isChurchLandmark({ kind: "church", name: "Onze-Lieve-Vrouwekathedraal" }), true);
assert.equal(isChurchLandmark({ kind: "house", name: "Peter Benoitstraat 34" }), false);

const wall = mat("lm_stone_white");
assert.equal(shadeLandmarkMaterial(wall), true);
assert.equal(wall.map, null);
assert.ok(wall.userData._droppedMaps[0].isTexture);
assert.ok(wall.color.r > 0.9 && wall.color.b > 0.8);
const wallShader = compile(wall);
assert.match(wallShader.vertexShader, /vLimeWorld/);
assert.match(wallShader.fragmentShader, /diffuseColor\.rgb = bone/);
assert.match(wall.customProgramCacheKey(), /lime-v1/);
assert.doesNotMatch(wallShader.fragmentShader, /0\.58, 0\.57, 0\.55/);
assert.equal(shadeLandmarkMaterial(wall), false);

const soot = mat("lm_stone_grey");
assert.equal(shadeLandmarkMaterial(soot), true);
assert.equal(soot.map, null);
assert.ok(soot.color.r < 0.5 && soot.color.r > 0.3);
assert.equal(soot.onBeforeCompile, null);

const blue = mat("lm_bluestone");
const before = blue.color.r;
shadeLandmarkMaterial(blue);
assert.ok(blue.color.r < before * 0.5);
assert.ok(blue.map);

const houseGlass = mat("lm_glass_dark", false);
assert.equal(shadeLandmarkMaterial(houseGlass, { church: false }), false);
assert.equal(houseGlass.emissiveIntensity, 0);

const churchGlass = mat("lm_glass_dark", false);
assert.equal(shadeLandmarkMaterial(churchGlass, { church: true }), true);
assert.ok(churchGlass.emissiveIntensity > 0.2);
const glassShader = compile(churchGlass);
assert.match(glassShader.fragmentShader, /lead/);
assert.match(glassShader.fragmentShader, /totalEmissiveRadiance/);
assert.match(churchGlass.customProgramCacheKey(), /stain-v1/);

const brick = mat("lm_brick_red");
assert.equal(shadeLandmarkMaterial(brick), false);
assert.ok(brick.map);

assert.equal(dressLandmarkObject({ isMesh: true }), 0);
const mesh = { isMesh: true, material: [mat("lm_stone_white"), mat("lm_door")] };
assert.equal(dressLandmarkObject(mesh, { church: true }), 1);
assert.equal(mesh.material[0].map, null);
assert.ok(mesh.material[1].map);

console.log("landmark dress ok");
