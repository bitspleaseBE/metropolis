/**
 * Overlapping street strips must not share a depth, and the bias must not
 * grow with slope (that is the grazing-angle flicker).
 *   node scripts/test_ground_order.mjs
 */
import assert from "node:assert/strict";
import {
  LIFT_MAX,
  LIFT_STEP,
  applySurfaceOrder,
  assignCoplanarLifts,
  auditSurfaceFlicker,
  coplanarLift,
  surfaceBias,
  wouldFlicker,
} from "../viewer/ground-order.js";

const stack = [
  "zebra_rail_1",
  "rail_l_1",
  "tram_1",
  "curb_1",
  "sidewalk_1",
  "zebra_1",
  "road_1",
  "park_1",
  "water_pond",
  "ground",
  "water_bed",
];

for (const name of stack) {
  const bias = surfaceBias(name);
  assert.ok(bias, name);
  assert.equal(bias.factor, 0, `${name} must not use a slope factor`);
}

for (let i = 0; i < stack.length - 1; i++) {
  const a = surfaceBias(stack[i]).units;
  const b = surfaceBias(stack[i + 1]).units;
  assert.ok(a < b, `${stack[i]} (${a}) should draw in front of ${stack[i + 1]} (${b})`);
}

assert.deepEqual(surfaceBias("merged_road_44"), surfaceBias("road_44"));
assert.deepEqual(surfaceBias("merged_sidewalk_frontage_1"), surfaceBias("sidewalk_frontage_1"));
assert.ok(LIFT_MAX <= 0.006);
// Blender stack: road 0.04, park path 0.05, dash bottom 0.06, water 0.02.
assert.ok(0.04 + LIFT_MAX < 0.05 + LIFT_STEP, "a high road stays under a low path");
assert.ok(0.05 + LIFT_MAX < 0.06, "a high path stays under the dashes");
assert.ok(LIFT_MAX < 0.02, "a lifted park stays under the water sheet");
assert.equal(surfaceBias("bldg_facade0_1").factor, 0);
assert.equal(surfaceBias("bldg_facade0_1").units, -3);
assert.equal(surfaceBias("park_path_3").units, surfaceBias("road_9").units);
assert.ok(surfaceBias("park_path_3").units < surfaceBias("park_12").units);

{
  const lifts = new Set(["road_a", "road_b", "road_c", "road_d", "road_e", "road_f", "road_g"].map(coplanarLift));
  assert.ok(lifts.size >= 4, "crossing roads should not all share one height");
  for (const lift of lifts) assert.ok(lift > 0 && lift <= 0.006);
  assert.equal(coplanarLift("zebra_1"), 0);
  assert.equal(coplanarLift("merged_road_44"), coplanarLift("road_44"));
}

{
  const a = { name: "road_1", y: 0.04, minX: 0, maxX: 10, minZ: 0, maxZ: 4 };
  const dup = { name: "road_1", y: 0.04, minX: 6, maxX: 14, minZ: 1, maxZ: 5 };
  const other = { name: "road_2", y: 0.04, minX: 6, maxX: 14, minZ: 1, maxZ: 5 };
  const clear = { name: "road_2", y: 0.04, minX: 40, maxX: 50, minZ: 0, maxZ: 4 };
  assert.equal(wouldFlicker(a, dup), true, "the same strip drawn twice still flickers");
  assert.equal(wouldFlicker(a, clear), false);
  if (coplanarLift("road_1") !== coplanarLift("road_2")) {
    assert.equal(wouldFlicker(a, other), false);
  }
}

{
  const road = {
    name: "road_12",
    isMesh: true,
    position: { y: 0 },
    userData: {},
    material: { userData: {}, polygonOffset: false, polygonOffsetFactor: 4, polygonOffsetUnits: 4 },
    updateMatrix() {},
  };
  const root = {
    traverse(fn) {
      fn(road);
    },
    updateMatrixWorld() {},
  };
  const once = applySurfaceOrder(root);
  const twice = applySurfaceOrder(root);
  assert.equal(once.lifted, 1);
  assert.equal(twice.lifted, 0, "a strip is lifted once");
  assert.equal(road.material.polygonOffsetFactor, 0);
  assert.equal(road.material.polygonOffsetUnits, 1);
  assert.ok(road.position.y > 0 && road.position.y <= 0.006);
}

{
  const box = (name, y) => ({
    name,
    isMesh: true,
    geometry: { boundingBox: { min: { x: 0, y, z: 0 }, max: { x: 8, y, z: 3 } } },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    userData: { _surfaceLift: coplanarLift(name) },
  });
  const dup = box("road_same", 0.04);
  const again = box("road_same", 0.04);
  const root = {
    traverse(fn) {
      fn(dup);
      fn(again);
    },
  };
  const report = auditSurfaceFlicker(root);
  assert.equal(report.checked, 2);
  assert.equal(report.pairs >= 1, true, "a duplicated strip is reported");
}

{
  // The cathedral–Grote Markt case: two cobble strips, one shared hash slot.
  const overlap = [
    { name: "road_535539372", y: 0.04, minX: -39, maxX: 8, minZ: -113, maxZ: -101 },
    { name: "road_1358635380", y: 0.04, minX: 7, maxX: 15, minZ: -114, maxZ: -105 },
  ];
  const lifts = assignCoplanarLifts(overlap);
  assert.ok(Math.abs(lifts[0] - lifts[1]) >= LIFT_STEP * 0.5, "crossing cobbles take different steps");
  assert.ok(lifts.every((lift) => lift > 0 && lift <= LIFT_MAX));
  assert.equal(
    wouldFlicker({ ...overlap[0], lift: lifts[0] }, { ...overlap[1], lift: lifts[1] }),
    false,
  );
}

{
  const pile = [0, 1, 2, 3].map(() => ({
    name: "road_same",
    y: 0.04,
    minX: 0,
    maxX: 8,
    minZ: 0,
    maxZ: 4,
  }));
  const lifts = assignCoplanarLifts(pile);
  assert.equal(new Set(lifts.map((lift) => lift.toFixed(6))).size, 4, "a stack of cobble patches all separate");
  assert.ok(lifts.every((lift) => lift <= LIFT_MAX));
}

{
  function strip(name, x0, x1) {
    return {
      name,
      isMesh: true,
      position: { y: 0 },
      userData: {},
      material: { userData: {}, polygonOffset: false, polygonOffsetFactor: 4, polygonOffsetUnits: 4 },
      geometry: { boundingBox: { min: { x: x0, y: 0.04, z: 0 }, max: { x: x1, y: 0.04, z: 4 } } },
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      updateMatrix() {
        this.matrixWorld.elements[13] = this.position.y;
      },
    };
  }
  const strips = [strip("road_a", 0, 10), strip("road_a", 6, 14)];
  const root = {
    traverse(fn) {
      for (const mesh of strips) fn(mesh);
    },
    updateMatrixWorld() {
      for (const mesh of strips) mesh.updateMatrix();
    },
  };
  applySurfaceOrder(root);
  assert.ok(Math.abs(strips[0].position.y - strips[1].position.y) >= LIFT_STEP * 0.5);
  const report = auditSurfaceFlicker(root);
  assert.equal(report.pairs, 0, "applied lifts leave no shared depth");
  assert.equal(strips[0].material.polygonOffsetFactor, 0);
}

console.log("ground-order ok");
