/**
 * Tree crowns pick up a leaf break-up; hedges, walls, and water do not.
 *   node scripts/test_tree_shade.mjs
 */
import assert from "node:assert/strict";
import { isTreeMaterial } from "../viewer/tree-shade.js";

assert.equal(isTreeMaterial("tree_vc"), true);
assert.equal(isTreeMaterial("tree_vc_1"), true);
assert.equal(isTreeMaterial("Tree_VC"), true);
assert.equal(isTreeMaterial("hedge"), false);
assert.equal(isTreeMaterial("hedge_0_1"), false);
assert.equal(isTreeMaterial("trunk"), false);
assert.equal(isTreeMaterial("water_shallow"), false);
assert.equal(isTreeMaterial("wall_eclectic__v1"), false);

console.log("tree shade ok");
