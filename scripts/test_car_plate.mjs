/**
 * Bumper plates read as Belgian plates and sit just outside each end of the car.
 *   node scripts/test_car_plate.mjs
 */
import assert from "node:assert/strict";
import { plateInk, platePose, plateText } from "../viewer/car-plate.js";

const a = plateText(42);
const b = plateText(42);
assert.equal(a, b);
assert.match(a, /^[1-8]-[A-Z]{3}-\d{3}$/);
assert.notEqual(plateText(42), plateText(99));

assert.equal(plateInk(0.06, 0.5, a), "blue");
assert.equal(plateInk(0.01, 0.5, a), "edge");
let ink = 0;
let white = 0;
for (let i = 0; i < 40; i++) {
  const u = 0.2 + (i / 40) * 0.7;
  const c = plateInk(u, 0.5, a);
  if (c === "ink") ink++;
  if (c === "white") white++;
}
assert.ok(ink > 4, "the registration is drawn, not a blank rectangle");
assert.ok(white > 4, "the plate face stays white around the characters");

const pose = platePose([-0.9, 0, -2.1], [0.9, 1.48, 2.1]);
assert.ok(pose.rearZ < -2.1, "rear plate sits behind the bumper");
assert.ok(pose.frontZ > 2.1, "front plate sits ahead of the nose");
assert.ok(pose.y > 0.34 && pose.y < 0.7, "plate is on the bumper, not the roof");
assert.ok(pose.width <= 0.52 && pose.width < 1.8);
assert.ok(pose.height < pose.width * 0.3);

console.log("car plate ok", a);
