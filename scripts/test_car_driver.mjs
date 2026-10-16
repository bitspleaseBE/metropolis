/**
 * The driver sits in the left front window, inside the glass, and not in the right window.
 *   node scripts/test_car_driver.mjs
 */
import assert from "node:assert/strict";
import { driverBlob, isCabinGlass, shadeDriver } from "../viewer/car-driver.js";

assert.equal(isCabinGlass("car_glass"), true);
assert.equal(isCabinGlass("Car_Glass"), true);
assert.equal(isCabinGlass("car_paint"), false);
assert.equal(isCabinGlass("glass"), false);

const min = [-1, 0.42, -2.02];
const max = [1, 1.43, 2.07];
const blob = driverBlob(min, max);
const [x, y, z] = blob.seat;
assert.ok(x > 0.3, "driver is on the left");
assert.ok(x + blob.rad[0] >= max[0] * 0.9, "the patch reaches the left window");
assert.ok(x - blob.rad[0] > 0, "it does not cross into the right window");
assert.ok(y > min[1] + 0.4 && y < max[1] - 0.15, "head is in the upper glass");
assert.ok(z > (min[2] + max[2]) * 0.5, "seat is forward of centre");
assert.ok(blob.rad.every((r) => r > 0.05));

const mat = {
  name: "car_glass",
  userData: {},
  customProgramCacheKey() {
    return "base";
  },
};
assert.equal(shadeDriver(mat, blob), true);
assert.equal(shadeDriver(mat, blob), false);
assert.ok(mat.customProgramCacheKey().includes("|driver-v1|"));
const shader = {
  uniforms: {},
  vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}\n",
  fragmentShader: "#include <common>\nvoid main() {\n#include <color_fragment>\n}\n",
};
mat.onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes("vDriverLocal = position"));
assert.ok(shader.fragmentShader.includes("uSeat"));
assert.equal(shader.uniforms.uSeat.value.x, x);

console.log("car driver ok");
