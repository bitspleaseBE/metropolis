/**
 * Second-floor lights only fill gaps between street lamps.
 *   node scripts/test_wall_lights.mjs
 */
import assert from "node:assert/strict";
import { wallLightAnchors, WALL_LIGHT_Y } from "../viewer/wall-lights.js";

const buildings = [
  { ring: [[2, -2], [8, -2], [8, 90], [2, 90]] },
];
const roads = [{ points: [[0, 0], [0, 80]] }];

const gaps = wallLightAnchors({ lamps: [], roads, buildings, spacing: 26, limit: 10 });
assert.ok(gaps.length >= 2, `expected several wall lights, got ${gaps.length}`);
for (const p of gaps) {
  assert.equal(p.y, WALL_LIGHT_Y);
  assert.ok(p.x > 1 && p.x < 3, `light should sit on the façade, x=${p.x}`);
}

const lampAtStart = [{ x: 0, z: 0 }];
const withLamp = wallLightAnchors({
  lamps: lampAtStart,
  roads,
  buildings,
  spacing: 26,
  lampClear: 18,
});
assert.ok(
  withLamp.every((p) => Math.hypot(p.x - 0, p.z - 0) > 16),
  "wall lights stay clear of an existing lamp",
);
assert.ok(withLamp.length < gaps.length, "a lamp removes the nearby wall light");

console.log("wall lights ok", gaps.length, withLamp.length);
