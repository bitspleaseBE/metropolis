/**
 * Dashes and zebras become white paint. Asphalt and kerbs stay as they are.
 *   node scripts/test_road_paint.mjs
 */
import assert from "node:assert/strict";
import { MARKING, isRoadMarking, paintRoadMarkings } from "../viewer/road-paint.js";

assert.equal(isRoadMarking("road_dash"), true);
assert.equal(isRoadMarking("road_dash_1"), true);
assert.equal(isRoadMarking("zebra"), true);
assert.equal(isRoadMarking("zebra_rail_3"), true);
assert.equal(isRoadMarking("Zebra"), true);
assert.equal(isRoadMarking("road_iron"), false);
assert.equal(isRoadMarking("asphalt"), false);
assert.equal(isRoadMarking("curb"), false);
assert.equal(isRoadMarking("hedge"), false);

function color() {
  return {
    r: 0.82,
    g: 0.78,
    b: 0.55,
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    },
  };
}
const dash = { name: "road_dash", color: color() };
const zebra = { name: "zebra_4", color: color() };
const iron = { name: "road_iron", color: color() };
const root = {
  traverse(fn) {
    fn({ isMesh: true, material: [dash, iron] });
    fn({ isMesh: true, material: zebra });
  },
};
assert.equal(paintRoadMarkings(root), 2);
assert.equal(dash.color.r, MARKING[0]);
assert.ok(dash.color.b > 0.9, "a dash is no longer sand");
assert.equal(zebra.color.g, MARKING[1]);
assert.equal(iron.color.r, 0.82, "worn asphalt is left alone");
assert.equal(paintRoadMarkings(root), 2);

console.log("road paint ok");
