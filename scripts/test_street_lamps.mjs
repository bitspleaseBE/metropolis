/**
 * Lamp posts stand on the pavement, beside the carriageway, and not on top of each other.
 *   node scripts/test_street_lamps.mjs
 */
import assert from "node:assert/strict";
import { lampSites } from "../viewer/street-lamps.js";

const road = {
  width: 8,
  points: [
    [0, 0],
    [120, 0],
  ],
};
const sites = lampSites([road], { spawn: { x: 60, y: 0 }, reach: 200, max: 20 });
assert.ok(sites.length >= 2, "a long street gets more than one post");
for (const s of sites) {
  assert.ok(s.x > 8 && s.x < 112, "posts stay off the junctions");
  assert.ok(Math.abs(s.z) > 4, "the post is off the carriageway");
  assert.ok(Math.abs(s.z) < 7, "the post is still on the pavement");
  assert.ok(s.y > 4, "the head is up on the pole");
}
for (let i = 0; i < sites.length; i++) {
  for (let j = i + 1; j < sites.length; j++) {
    const d = Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z);
    assert.ok(d >= 14, "posts do not stack");
  }
}

const far = lampSites([road], { spawn: { x: 800, y: 0 }, reach: 40 });
assert.equal(far.length, 0);

const capped = lampSites(
  [
    road,
    { width: 6, points: [[0, 40], [200, 40]] },
    { width: 6, points: [[0, -40], [200, -40]] },
  ],
  { spawn: { x: 20, y: 0 }, reach: 400, max: 5 },
);
assert.equal(capped.length, 5);

console.log("street lamps ok", sites.length);
