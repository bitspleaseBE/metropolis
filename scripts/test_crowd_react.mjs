/**
 * A gunshot sends the street away from the muzzle, except a stable few who close with a knife.
 *   node scripts/test_crowd_react.mjs
 */
import assert from "node:assert/strict";
import {
  KNIFE_DAMAGE,
  KNIFE_RADIUS,
  approach,
  classifyShot,
  fleeVector,
  reactRoll,
} from "../viewer/crowd-react.js";

{
  const a = reactRoll(7);
  assert.equal(reactRoll(7), a);
  assert.ok(a >= 0 && a < 1);
}

{
  const people = [];
  for (let i = 0; i < 80; i++) {
    const ang = (i / 80) * Math.PI * 2;
    const far = i % 2 === 0;
    people.push({
      id: i,
      x: Math.cos(ang) * (far ? 30 : 8),
      z: Math.sin(ang) * (far ? 30 : 8),
    });
  }
  people.push({ id: 1000, x: 200, z: 0 });
  people.push({ id: 1001, x: 2, z: 0, down: true });
  const shot = classifyShot(people, { x: 0, z: 0 });
  assert.equal(shot.flee.includes(1000), false);
  assert.equal(shot.knife.includes(1001), false);
  assert.equal(shot.flee.includes(1001), false);
  assert.ok(shot.knife.length >= 1, "someone close draws a knife");
  assert.ok(shot.flee.length > shot.knife.length);
  for (const id of shot.knife) {
    const p = people.find((q) => q.id === id);
    assert.ok(Math.hypot(p.x, p.z) <= KNIFE_RADIUS);
    assert.equal(shot.flee.includes(id), false);
  }
  const again = classifyShot(people, { x: 0, z: 0 });
  assert.deepEqual(again, shot);
}

{
  const away = fleeVector({ x: 10, z: 0 }, { x: 0, z: 0 });
  assert.ok(away.x > 0.99 && Math.abs(away.z) < 1e-6);
  const onTop = fleeVector({ x: 3, z: 4 }, { x: 3, z: 4 });
  assert.equal(onTop.x, 1);
}

{
  const step = approach({ x: 0, z: 0 }, { x: 10, z: 0 }, 1, 2);
  assert.ok(step.x > 1.9 && step.x < 2.1);
  assert.equal(step.strike, false);
  const hit = approach({ x: 0, z: 0 }, { x: 1, z: 0 }, 1, 2);
  assert.equal(hit.strike, true);
  assert.ok(hit.x < 1);
  assert.equal(KNIFE_DAMAGE > 0, true);
}

console.log("crowd-react ok");
