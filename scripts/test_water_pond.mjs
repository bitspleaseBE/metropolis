/**
 * A sunk pond keeps its silt bed under the surface. The bake leaves the bed
 * higher (−0.28) than the dropped surface (−0.38), which hides the water.
 *   node scripts/test_water_pond.mjs
 */
import assert from "node:assert/strict";
import { pondStack, siltBedName } from "../viewer/water.js";

const stack = pondStack(0);
assert.ok(stack.surface < 0, "the surface sits below the lawn");
assert.ok(stack.bed < stack.surface, "silt stays under the water");
assert.ok(stack.surface - stack.bed > 0.2, "the water has a visible depth");

const raised = pondStack(0.4);
assert.equal(raised.surface - stack.surface, 0.4);
assert.ok(raised.bed < raised.surface);

assert.equal(siltBedName("water_791984113"), "water_bed_791984113");
assert.equal(siltBedName("Water_12"), "water_bed_12");
assert.equal(siltBedName("water_bed_12"), "");
assert.equal(siltBedName("water_kerb_12_0"), "");
assert.equal(siltBedName("water_deep"), "");

console.log(`water pond ok — surface ${stack.surface}, bed ${stack.bed}`);
