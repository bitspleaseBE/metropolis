/**
 * Crowd riders get by each other instead of jamming: walkers standing in the lane, head-on
 * riders, a bakfiets, overtakes with and without oncoming traffic. Rides each scene on a
 * straight path with viewer/npc/ride-line.js and checks nobody overlaps or stalls.
 *   node scripts/test_ride_line.mjs
 */
import assert from "node:assert/strict";
import { buildCyclePaths } from "../viewer/npc/cycle-graph.js";
import { HALF_W, chooseLine, lineRoom, stepLine } from "../viewer/npc/ride-line.js";

// Mirrors KINDS in viewer/micromobility.js.
const KINDS = {
  bicycle: { halfLen: 0.85, nose: 0, accel: 1.6, kmh: 18 },
  scooter: { halfLen: 0.55, nose: 0, accel: 1.6, kmh: 20 },
  cargo: { halfLen: 1.35, nose: 0.21, accel: 2.8, kmh: 35 },
};
const BODY_W = 0.3; // m: physical half width for the overlap check

const straight = [[0, 0], [0, 200]];
const [ONE_WAY, TWO_WAY] = buildCyclePaths([], [
  { id: "one", points: straight, width: 2.4, oneway: 1 },
  { id: "two", points: straight, width: 2.4, oneway: 0 },
]);
const [ROAD] = buildCyclePaths([{ id: "road", kind: "residential", points: straight, width: 6 }], []);
const CENTRELINE = { width: 2.4, bikeOffset: 0 }; // two-way traffic, nobody keeping right
assert.equal(ONE_WAY.bikeOffset, 0, "one-way cycleway: centreline");
assert.ok(TWO_WAY.bikeOffset > 0.4 && TWO_WAY.bikeOffset < 0.6, "two-way cycleway: right half");

/**
 * Riders run along z on a path centred on x = 0. dir +1 heads +z, -1 heads -z.
 * Walkers: { x, z, r } standing still. Returns per-rider finish times and overlap count.
 */
function overlapsBox(c, rider, box) {
  const dx = c.x - box.x;
  const dz = c.z - box.z;
  const len = Math.hypot(box.tx, box.tz) || 1;
  const ax = box.tx / len;
  const az = box.tz / len;
  const along = Math.abs(dx * ax + dz * az);
  const side = Math.abs(dx * -az + dz * ax);
  return along < box.hl + rider.halfLen && side < box.hw + BODY_W;
}

function ride(path, riders, { walkers = [], boxes = [], seconds = 40, dt = 1 / 30, watch = null } = {}) {
  const room = lineRoom(path);
  const rs = riders.map((r) => {
    const k = KINDS[r.kind];
    const speed = r.speed ?? k.kmh / 3.6;
    return { ...r, ...k, speed, cur: r.cur ?? speed, line: r.line ?? 0, aim: r.line ?? 0, done: null, still: 0, maxStill: 0, maxLine: 0 };
  });
  const centre = (r) => ({
    x: -r.dir * (path.bikeOffset + r.line),
    z: r.z + r.dir * r.nose,
  });
  const out = { aim: 0, speed: 0 };
  let overlaps = 0;
  for (let t = 0; t < seconds; t += dt) {
    const plans = rs.map((r) => {
      if (r.done != null) return null;
      const c = centre(r);
      const things = [];
      for (const o of rs) {
        if (o === r || o.done != null) continue;
        const oc = centre(o);
        things.push({ x: oc.x, z: oc.z, tx: 0, tz: o.dir, hl: o.halfLen, hw: HALF_W, v: o.cur, line: o.line });
      }
      for (const w of walkers) things.push({ x: w.x, z: w.z, tx: 0, tz: 0, hl: w.r, hw: w.r, v: 0 });
      for (const b of boxes) things.push({ x: b.x, z: b.z, tx: b.tx, tz: b.tz, hl: b.hl, hw: b.hw, v: 0 });
      const front = r.kind === "cargo" ? r.nose + r.halfLen - 0.5 : 0;
      const me = {
        x: c.x, z: c.z, tx: 0, tz: r.dir, line: r.line, aim: r.aim,
        speed: r.speed, cur: r.cur, hl: r.halfLen,
        look: Math.max(9, front + 1.6 + (r.speed * r.speed) / 10),
      };
      const p = chooseLine(me, things, room, out);
      return { aim: p.aim, speed: p.speed };
    });
    rs.forEach((r, i) => {
      const p = plans[i];
      if (!p) return;
      r.aim = p.aim;
      const rate = p.speed < r.cur ? 6 : r.accel;
      r.cur += Math.max(-rate * dt, Math.min(rate * dt, p.speed - r.cur));
      r.line = stepLine(r.line, r.aim, r.cur, dt);
      r.z += r.dir * r.cur * dt;
      r.still = r.cur < 0.3 ? r.still + dt : 0;
      r.maxStill = Math.max(r.maxStill, r.still);
      r.maxLine = Math.max(r.maxLine, r.line < 0 ? -r.line / room.left : r.line / room.right);
      if (r.dir * (r.z - r.finish) > 0) r.done = t;
    });
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.done != null) continue;
      const ca = centre(a);
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.done != null) continue;
        const cb = centre(b);
        if (Math.abs(ca.z - cb.z) < a.halfLen + b.halfLen - 0.05 && Math.abs(ca.x - cb.x) < 2 * BODY_W) overlaps++;
      }
      for (const w of walkers) {
        if (Math.abs(ca.z - w.z) < a.halfLen + w.r - 0.05 && Math.abs(ca.x - w.x) < BODY_W + w.r) overlaps++;
      }
      for (const b of boxes) {
        if (overlapsBox(ca, a, b)) overlaps++;
      }
    }
    watch?.(rs, t);
    if (rs.every((r) => r.done != null)) break;
  }
  return { riders: rs, overlaps };
}

function check(name, res, { within, still = 3 } = {}) {
  assert.equal(res.overlaps, 0, `${name}: riders overlapped for ${res.overlaps} frames`);
  for (const r of res.riders) {
    assert.ok(r.done != null, `${name}: ${r.kind} #${r.id} never got through (z=${r.z.toFixed(1)}, line=${r.line.toFixed(2)})`);
    if (within) assert.ok(r.done <= within, `${name}: ${r.kind} #${r.id} took ${r.done.toFixed(1)} s`);
    assert.ok(r.maxStill <= still, `${name}: ${r.kind} #${r.id} stood still ${r.maxStill.toFixed(1)} s`);
    assert.ok(r.maxLine <= 1 + 1e-6, `${name}: ${r.kind} #${r.id} left the room`);
  }
  console.log(`  ${name}: ${res.riders.map((r) => `${r.kind}#${r.id} ${r.done.toFixed(1)}s`).join(", ")}`);
}

// Nothing around: hold the line at cruising speed.
{
  const p = chooseLine(
    { x: 0, z: 0, tx: 0, tz: 1, line: 0.4, aim: 0.4, speed: 5, cur: 5, hl: 0.85, look: 9 },
    [],
    lineRoom(ONE_WAY),
  );
  assert.equal(p.aim, 0);
  assert.equal(p.speed, 5);
}

// Room: a little past the edge of a cycleway, kerb side tight on a road, out to the left to pass.
{
  const one = lineRoom(ONE_WAY);
  assert.ok(one.left > 1 && one.right > 1 && one.left < 1.2, "one-way cycleway: either side, just past the paving");
  const two = lineRoom(TWO_WAY);
  assert.ok(two.right < 0.7 && two.left >= 1.4, "two-way cycleway: little room right, the other half to the left");
  const road = lineRoom(ROAD);
  assert.ok(road.right <= 0.35 && road.left === 1.5, "road: kerb on the right, car lane on the left");
}

console.log("ride-line scenes:");

check(
  "walker standing in a one-way cycleway",
  ride(ONE_WAY, [
    { id: 1, kind: "bicycle", dir: 1, z: 0, finish: 40 },
    { id: 2, kind: "bicycle", dir: 1, z: -5, finish: 40 },
    { id: 3, kind: "scooter", dir: 1, z: -10, finish: 40 },
  ], { walkers: [{ x: 0, z: 20, r: 0.32 }] }),
  { within: 15, still: 1 },
);

check(
  "walker on the kerb lane of a road",
  ride(ROAD, [{ id: 1, kind: "bicycle", dir: 1, z: 0, finish: 30 }], { walkers: [{ x: -2.6, z: 15, r: 0.32 }] }),
  { within: 10, still: 1 },
);

// Kerbside parked car sits on the bike line (centre ~3.05 m off the road centre).
// It is a box to ride around, not a driving car and not a tram to queue behind.
check(
  "parked car on the kerb",
  ride(
    ROAD,
    [{ id: 1, kind: "bicycle", dir: 1, z: 0, finish: 40 }],
    { boxes: [{ x: -3.05, z: 18, tx: 0, tz: 1, hl: 2.1, hw: 0.875 }], seconds: 25 },
  ),
  { within: 20, still: 4 },
);

check(
  "head-on on a centreline",
  ride(CENTRELINE, [
    { id: 1, kind: "bicycle", dir: 1, z: 0, finish: 40 },
    { id: 2, kind: "bicycle", dir: -1, z: 40, finish: 0 },
  ]),
  { within: 12, still: 0.5 },
);

check(
  "bakfiets head-on on a centreline",
  ride(CENTRELINE, [
    { id: 1, kind: "cargo", dir: 1, z: 0, finish: 50 },
    { id: 2, kind: "bicycle", dir: -1, z: 50, finish: 0 },
    { id: 3, kind: "scooter", dir: -1, z: 55, finish: 0 },
  ]),
  { within: 16, still: 0.5 },
);

// The jam from the screenshot: a scooter halfway past a bike, a bakfiets coming the other way,
// all three already close and slow.
check(
  "scooter mid-pass meets a bakfiets",
  ride(TWO_WAY, [
    { id: 1, kind: "bicycle", dir: -1, z: 10, cur: 1, finish: -10 },
    { id: 2, kind: "scooter", dir: -1, z: 10.5, line: -1.1, cur: 1, finish: -10 },
    { id: 3, kind: "cargo", dir: 1, z: 5, cur: 1, finish: 25 },
  ]),
  { within: 10, still: 2 },
);

{
  const res = ride(ONE_WAY, [
    { id: 1, kind: "scooter", dir: 1, z: 10, speed: 3.5, finish: 120 },
    { id: 2, kind: "cargo", dir: 1, z: 0, finish: 120 },
  ]);
  check("bakfiets overtakes a slow scooter", res);
  assert.ok(res.riders[1].done < res.riders[0].done, "the bakfiets gets ahead");
}

{
  // Oncoming rider far enough off: pass, and be back in before meeting it.
  let outAtMeet = 0;
  const res = ride(TWO_WAY, [
    { id: 1, kind: "bicycle", dir: 1, z: 6, speed: 3, finish: 150 },
    { id: 2, kind: "cargo", dir: 1, z: 0, finish: 150 },
    { id: 3, kind: "bicycle", dir: -1, z: 70, finish: -10 },
  ], {
    seconds: 60,
    watch: ([, cargo, oncoming]) => {
      if (Math.abs(cargo.z - oncoming.z) < 3) outAtMeet = Math.max(outAtMeet, -cargo.line, oncoming.line < 0 ? -oncoming.line : 0);
    },
  });
  check("passes with an oncoming rider well ahead", res);
  assert.ok(res.riders[1].done < res.riders[0].done, "the bakfiets gets by");
  assert.ok(outAtMeet < 0.3, `both back in their own half when they meet (${outAtMeet.toFixed(2)} m out)`);
}

{
  // Oncoming rider close: hang back behind the slow bike until it has gone by.
  let pulledOut = 0;
  const res = ride(TWO_WAY, [
    { id: 1, kind: "bicycle", dir: 1, z: 6, speed: 3, finish: 150 },
    { id: 2, kind: "cargo", dir: 1, z: 0, cur: 3, finish: 150 },
    { id: 3, kind: "bicycle", dir: -1, z: 30, finish: -10 },
  ], {
    seconds: 60,
    watch: ([, cargo, oncoming]) => {
      if (oncoming.done == null && oncoming.z > cargo.z) pulledOut = Math.max(pulledOut, -cargo.line);
    },
  });
  check("waits for a close oncoming rider before passing", res);
  assert.ok(pulledOut < 0.3, `no pull-out into the oncoming rider (${pulledOut.toFixed(2)} m)`);
  assert.ok(res.riders[1].done < res.riders[0].done, "the bakfiets still gets by afterwards");
}

{
  const res = ride(ONE_WAY, [
    { id: 1, kind: "bicycle", dir: 1, z: 6, speed: 5, finish: 80 },
    { id: 2, kind: "bicycle", dir: 1, z: 0, speed: 5, finish: 80 },
  ]);
  check("follows a rider at the same pace", res);
  assert.ok(res.riders[1].maxLine < 0.05, "no needless overtake");
}

check(
  "walker in a busy two-way cycleway",
  ride(TWO_WAY, [
    { id: 1, kind: "bicycle", dir: 1, z: 0, finish: 60 },
    { id: 2, kind: "cargo", dir: 1, z: -6, finish: 60 },
    { id: 3, kind: "scooter", dir: 1, z: -12, finish: 60 },
    { id: 4, kind: "bicycle", dir: -1, z: 50, finish: 0 },
    { id: 5, kind: "bicycle", dir: -1, z: 56, finish: 0 },
    { id: 6, kind: "cargo", dir: -1, z: 64, finish: 0 },
  ], { walkers: [{ x: 0, z: 28, r: 0.32 }] }),
  { within: 25, still: 3 },
);

console.log("ride-line ok");
