/**
 * A Velo dock sits on the pavement, parallel to the street, and stops
 * before the carriageway.
 *   node scripts/test_velo_seat.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyVeloSeats,
  BIKE_REACH,
  dockSolid,
  fromRoadsDoc,
  makeWalk,
  rackPieces,
  railAxis,
  seatStation,
  streetAxis,
} from "../viewer/velo-seat.js";

function ctxOf(walks, extra = {}) {
  return { walks, roads: extra.roads || [], crossings: extra.crossings || [] };
}

function eastWest() {
  const near = makeWalk("sidewalk", 1, [
    { x: -20, z: 0 },
    { x: 20, z: 0 },
  ], "L");
  const far = makeWalk("sidewalk", 1, [
    { x: -20, z: 8 },
    { x: 20, z: 8 },
  ], "R");
  return ctxOf([near, far]);
}

const parked = {
  x: 2,
  z: 0.2,
  yaw: 1.2,
  railLength: 34,
  capacity: 36,
  bikesAvailable: 24,
};
const seat = seatStation(parked, eastWest());
assert.ok(seat, "seats beside a sidewalk");
const street = streetAxis(seat.yaw);
const rail = railAxis(seat.yaw);
assert.ok(street.z > 0.95, `bikes point at the road, got ${street.z}`);
assert.ok(Math.abs(rail.z) < 0.05, "rail runs with the street");
assert.ok(seat.z < 0, "rail sits back from the kerb");
const noseZ = seat.z + street.z * BIKE_REACH;
assert.ok(noseZ < 0.95, `front wheels stay on the pavement, nose z ${noseZ}`);
assert.ok(seat.railLength <= 34 && seat.railLength > 20);
const solid = dockSolid(seat);
const edgeZ = solid.pos.z + street.z * solid.hw;
assert.ok(edgeZ < 1, `the stop stays inside the kerb, edge z ${edgeZ}`);

const crossing = makeWalk("crossing", 2, [
  { x: 18, z: 0 },
  { x: 18, z: 8 },
], "x");
const blocked = seatStation(parked, { ...eastWest(), crossings: [crossing] });
assert.ok(blocked.railLength < seat.railLength, "a crossing shortens the dock");
const half = blocked.railLength * 0.5;
const tan = railAxis(blocked.yaw);
for (const s of [-1, 1]) {
  const x = blocked.x + tan.x * half * s;
  const z = blocked.z + tan.z * half * s;
  assert.ok(Math.hypot(x - 18, z) > 1.1, `end ${x.toFixed(1)} stays off the crossing`);
}

assert.equal(seatStation({ x: 0, z: 0, yaw: 0 }, ctxOf([])), null);

const roads = JSON.parse(readFileSync("viewer/districts/2000-antwerpen/roads.json", "utf8"));
const velo = JSON.parse(readFileSync("viewer/districts/2000-antwerpen/velo.json", "utf8"));
const raw = velo.stations.find((s) => s.id === "191");
const rijn = { ...raw };
applyVeloSeats([rijn], roads);
const published = railAxis(raw.yaw);
const seatedRail = railAxis(rijn.yaw);
const side = roads.walks.find((w) => w.id === "sw20008417_L");
const a = side.points[3];
const b = side.points[4];
const sdx = b[0] - a[0];
const sdz = -(b[1] - a[1]);
const sl = Math.hypot(sdx, sdz);
const dot = Math.abs((seatedRail.x * sdx + seatedRail.z * sdz) / sl);
assert.ok(dot > 0.98, `Rijnpoort rail follows the sidewalk, dot ${dot}`);
assert.ok(Math.abs(published.x * sdx + published.z * sdz) / sl < 0.8, "the published yaw was the bad one");
assert.ok(rijn.railLength < raw.railLength, "the 34 m rail is shortened to the pavement");
assert.ok(rijn.capacity < raw.capacity, "fewer slots once the rail is shorter");

const ctx = fromRoadsDoc(roads);
const farWalk = ctx.walks.find((w) => w.id === "sw20008417_R");
const nearWalk = ctx.walks.find((w) => w.id === "sw20008417_L");
function nearest(walk, x, z) {
  let best = 1e9;
  for (const seg of walk.segs) {
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - seg.ax) * dx + (z - seg.az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (seg.ax + dx * t), z - (seg.az + dz * t)));
  }
  return best;
}
for (const s of [-1, 1]) {
  const x = rijn.x + seatedRail.x * rijn.railLength * 0.5 * s;
  const z = rijn.z + seatedRail.z * rijn.railLength * 0.5 * s;
  const mine = nearest(nearWalk, x, z);
  const other = nearest(farWalk, x, z);
  assert.ok(mine + 1 < other, `end stays on the near pavement (${mine.toFixed(2)} vs ${other.toFixed(2)})`);
}
const rack = rackPieces(rijn);
assert.ok(rack.posts.length >= 4, "the rack reads as a row, not a single post");
assert.ok(rack.totem.sy > 1.6, "the red terminal is tall enough to see from the saddle");
const totemOff = Math.hypot(rack.totem.x - rijn.x, rack.totem.z - rijn.z);
assert.ok(totemOff < rijn.railLength * 0.5 + 0.5, "the terminal stands at the end of the rail");

const nose = streetAxis(rijn.yaw);
const noseD = nearest(farWalk, rijn.x + nose.x * BIKE_REACH, rijn.z + nose.z * BIKE_REACH);
const railD = nearest(farWalk, rijn.x, rijn.z);
assert.ok(noseD < railD, "bikes point toward the street, not the building");

console.log(
  `velo seat ok — Rijnpoort rail ${raw.railLength}m → ${rijn.railLength}m, ` +
    `moved ${Math.hypot(rijn.x - raw.x, rijn.z - raw.z).toFixed(1)}m`,
);
