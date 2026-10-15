/**
 * Bus body stays a flat panel so the livery is not smeared into a white rim.
 *   node scripts/test_bus_body.mjs
 */
import assert from "node:assert/strict";
import { BUS_BODY } from "../viewer/transit.js";

assert.equal(BUS_BODY.widthSegments, 1);
assert.equal(BUS_BODY.heightSegments, 1);
assert.equal(BUS_BODY.depthSegments, 1);
assert.ok(BUS_BODY.uvInset >= 0.01 && BUS_BODY.uvInset <= 0.04, "inset clears the jpeg fringe without cropping the stripe");
assert.ok(BUS_BODY.colorLift <= 1, "a lift past 1 clips white paint into bloom");

const span = 1 - BUS_BODY.uvInset * 2;
assert.ok(span > 0.9 && span < 1);

console.log("bus-body ok");
