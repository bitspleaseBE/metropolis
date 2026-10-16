/**
 * Parked cars are fleet vehicles that stand still. E at the driver's door
 * sits you in the seat; E again puts you on the pavement. The car does not move.
 *   node scripts/test_parked_cars.mjs
 */
import assert from "node:assert/strict";
import {
  carAxes,
  doorOf,
  exitOf,
  nearestParkedDoor,
  parkedInteract,
  parkedPrompt,
  seatOf,
  yawFromBakedNose,
} from "../viewer/parked-cars.js";

const car = {
  x: 10,
  y: 0.12,
  z: -4,
  yaw: 0,
  hw: 0.9,
  velocity: 0,
  parked: true,
  occupied: false,
};

{
  const yaw = yawFromBakedNose(1, 0);
  assert.ok(Math.abs(yaw - Math.PI / 2) < 1e-6, "baked nose +X is runtime yaw π/2");
  const a = carAxes(yaw);
  assert.ok(Math.abs(a.fx - 1) < 1e-6 && Math.abs(a.fz) < 1e-6, "that yaw points the fleet nose along +X");
}

{
  const door = doorOf(car);
  const seat = seatOf(car);
  assert.ok(door.x > car.x, "driver door is on the left");
  assert.ok(seat.x > car.x && seat.x < door.x, "seat is inside, left of centre");
  assert.ok(seat.z > car.z, "seat is forward of the axle");
  assert.equal(car.velocity, 0);
  assert.equal(car.parked, true);
}

assert.equal(nearestParkedDoor([car], car.x, car.z - 6), null, "behind the boot is out of reach");
assert.equal(nearestParkedDoor([car], doorOf(car).x, doorOf(car).z), car);

{
  const enter = parkedInteract([car], { x: doorOf(car).x, z: doorOf(car).z }, null);
  assert.equal(enter.action, "enter");
  assert.equal(car.occupied, true);
  assert.equal(car.x, 10, "entering does not roll the car");
  assert.equal(car.velocity, 0);
  assert.equal(parkedPrompt(car, null), "Press E to get out");
  const again = parkedInteract([car], { x: 0, z: 0 }, car);
  assert.equal(again.action, "exit");
  assert.equal(car.occupied, false);
  assert.ok(Math.hypot(again.x - exitOf(car).x, again.z - exitOf(car).z) < 1e-6);
  assert.equal(parkedPrompt(null, car), "Press E to enter");
}

{
  const far = parkedInteract([car], { x: car.x + 8, z: car.z }, null);
  assert.equal(far.action, "none");
  assert.equal(car.occupied, false);
}

console.log("parked-cars ok");
