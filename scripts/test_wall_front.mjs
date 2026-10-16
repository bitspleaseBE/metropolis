/**
 * Bare building masses get a windowed wall; facade quads and roofs do not.
 *   node scripts/test_wall_front.mjs
 */
import assert from "node:assert/strict";
import { isBareWall } from "../viewer/wall-front.js";

assert.equal(isBareWall("bldg_6006380596", "wall_eclectic__v1"), true);
assert.equal(isBareWall("lmbase_26495164", "wall_red-brick__v0"), true);
assert.equal(isBareWall("bldg_6006380596_facade0", "wall_eclectic__v1"), false);
assert.equal(isBareWall("bldg_6006380596_roof", "wall_eclectic__v1"), false);
assert.equal(isBareWall("bldg_6006380596_facade3_1", "wall_restaurant__v1"), false);
assert.equal(isBareWall("bldg_6006380596", "facade_photo_atlas"), false);
assert.equal(isBareWall("bldg_6006380596", "roof_slate_1"), false);
assert.equal(isBareWall("barrier_render", "wall_render"), false);
assert.equal(isBareWall("lmbase_26495164_front", "church_brick_red"), false);

console.log("wall front ok");
