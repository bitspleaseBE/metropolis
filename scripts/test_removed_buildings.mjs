/**
 * Baked meshes of buildings dropped after the GLB export are hidden by id.
 *   node scripts/test_removed_buildings.mjs
 */
import assert from "node:assert/strict";
import { buildingIdOf, createRemovedBuildings } from "../viewer/removed-buildings.js";

assert.equal(buildingIdOf("bldg_6004024665"), "6004024665");
assert.equal(buildingIdOf("bldg_6004024665_roof"), "6004024665");
assert.equal(buildingIdOf("bldg_6004024665.001"), "6004024665");
assert.equal(buildingIdOf("bldg_60040246650_roof"), "60040246650");
assert.equal(buildingIdOf("stree_c_12"), null);

const node = (name, children = []) => ({
  name,
  visible: true,
  children,
  traverse(fn) {
    fn(this);
    for (const c of this.children) c.traverse(fn);
  },
});
const doomed = node("bldg_7");
const roof = node("bldg_7_roof");
const neighbour = node("bldg_70");
const scene = node("scene", [node("chunk_c_0_0", [doomed, roof, neighbour])]);
const removed = createRemovedBuildings(scene);
assert.equal(removed.add({ removed: [7] }), 2);
assert.equal(doomed.visible, false);
assert.equal(roof.visible, false);
assert.equal(neighbour.visible, true);
const late = node("chunk_c_1_0", [node("bldg_7_facade0")]);
assert.equal(removed.apply(late), 1);
assert.equal(removed.add({ removed: [7] }), 0);

console.log("removed buildings ok");
