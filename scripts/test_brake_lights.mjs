/**
 * Brake lights come on when a driver is stopped or shedding speed, and stay dull otherwise.
 *   node scripts/test_brake_lights.mjs
 */
import assert from "node:assert/strict";
import { isBraking, tailRGB } from "../viewer/brake-lights.js";

assert.equal(isBraking(0, 0, "red"), true);
assert.equal(isBraking(0.2, 8, "queue"), true);
assert.equal(isBraking(8, 8, ""), false);
assert.equal(isBraking(7, 2, ""), true);
assert.equal(isBraking(8, 7.9, ""), false);

const day = tailRGB(0, false);
const night = tailRGB(1, false);
const brake = tailRGB(0.2, true);
assert.ok(day[0] < 0.2, "day tails are dim");
assert.ok(night[0] > day[0] && night[0] < 0.6, "night running lights glow, but stay under a brake light");
assert.ok(brake[0] > 0.9 && brake[0] > night[0], "braking is a hard red");
assert.ok(brake[0] > brake[1] * 4, "a brake light reads red");

console.log("brake lights ok");
