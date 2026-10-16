/**
 * Lawns go green. Paths, asphalt and kerbs stay as they are.
 *   node scripts/test_lawn.mjs
 */
import assert from "node:assert/strict";
import { LAWN, isLawn, paintLawns } from "../viewer/lawn.js";

assert.equal(isLawn("park"), true);
assert.equal(isLawn("park.001"), true);
assert.equal(isLawn("yard_grass"), true);
assert.equal(isLawn("park_path"), false);
assert.equal(isLawn("park_path_4"), false);
assert.equal(isLawn("asphalt"), false);
assert.equal(isLawn("hedge"), false);

function color() {
  return {
    r: 0.42,
    g: 0.36,
    b: 0.46,
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    },
  };
}
const lawn = { name: "park", color: color() };
const path = { name: "park_path", color: color() };
const root = {
  traverse(fn) {
    fn({ isMesh: true, material: [lawn, path] });
  },
};
assert.equal(paintLawns(root), 1);
assert.equal(lawn.color.g, LAWN[1]);
assert.ok(lawn.color.g > lawn.color.r && lawn.color.g > lawn.color.b, "green leads");
assert.equal(path.color.b, 0.46, "a path is left alone");

console.log("lawn ok");
