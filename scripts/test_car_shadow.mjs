/**
 * The contact shadow sits under the body and does not stick out past the bumpers.
 *   node scripts/test_car_shadow.mjs
 */
import assert from "node:assert/strict";
import { shadowAlpha, shadowPose } from "../viewer/car-shadow.js";

const pose = shadowPose([-0.9, 0, -2.1], [0.9, 1.48, 2.1]);
assert.ok(Math.abs(pose.x) < 0.01, "centred across the car");
assert.ok(Math.abs(pose.z) < 0.01, "centred along the car");
assert.ok(pose.y > 0 && pose.y < 0.12, "just above the road");
assert.ok(pose.width > 1.8, "wider than the body so it shows beside the sills");
assert.ok(pose.width < 2.6);
assert.ok(pose.length < 4.2, "stays inside the bumpers");
assert.ok(pose.length > 3, "long enough to show around the wheels");

assert.ok(shadowAlpha(0) > 0.5);
assert.equal(shadowAlpha(1), 0);
assert.ok(shadowAlpha(0.8) > 0.3, "the band beside the sills stays dark");
assert.ok(shadowAlpha(0.97) < shadowAlpha(0.8));

const tall = shadowPose([0, 0.2, 0], [2.2, 2.4, 5.5]);
assert.ok(tall.y > 0.2 && tall.y < 0.35);
assert.ok(tall.width <= 2.6);
assert.ok(tall.length <= 6);

console.log("car shadow ok");
