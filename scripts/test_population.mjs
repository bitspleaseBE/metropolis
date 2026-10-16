/**
 * Jewish characters only in 2018. That district is 50/5/45; every other is 50/50.
 *   node scripts/test_population.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JEWISH_DISTRICT,
  bucketOf,
  createPopulation,
  mixForDistrict,
  rosterIds,
} from "../viewer/npc/population.js";
import { foodOnTable, hipDrop, dinerMode, HIP_Y, TABLE_Y } from "../viewer/interiors/table-seat.js";
import { generateInterior } from "../viewer/interiors/interior-gen.js";

const people = JSON.parse(readFileSync(new URL("../viewer/characters/people/manifest.json", import.meta.url), "utf8")).people;

function share(id, n = 8000) {
  const pop = createPopulation({ id, population: { looks: { hasidic: 0.9 }, hotspots: [{ looks: { hasidic: 5 } }] } });
  const counts = {};
  for (let i = 0; i < n; i++) {
    const look = pop.pickLook(12, -40);
    counts[look] = (counts[look] || 0) + 1;
  }
  return counts;
}

const harm = mixForDistrict(JEWISH_DISTRICT);
assert.equal(harm.hasidic, 0.5);
assert.equal(+(harm.arab + harm.muslim).toFixed(2), 0.05);
assert.equal(harm.european, 0.45);
assert.equal(harm.african || 0, 0);

const city = mixForDistrict("2000-antwerpen");
assert.equal(city.hasidic || 0, 0);
assert.equal(city.european, 0.5);
assert.equal(city.african, 0.25);
assert.equal(+(city.arab + city.muslim).toFixed(2), 0.25);

const drawn = share("2000-antwerpen");
assert.equal(drawn.hasidic || 0, 0, "a published hotspot must not spawn a Jewish character in 2000");
const flemish = (drawn.european || 0) / 8000;
const other = ((drawn.african || 0) + (drawn.arab || 0) + (drawn.muslim || 0)) / 8000;
assert.ok(Math.abs(flemish - 0.5) < 0.03, `flemish share ${flemish}`);
assert.ok(Math.abs(other - 0.5) < 0.03, `black/arab share ${other}`);

const belt = share(JEWISH_DISTRICT);
assert.ok(Math.abs((belt.hasidic || 0) / 8000 - 0.5) < 0.03);
assert.equal(belt.african || 0, 0);

const rng = () => 0.3;
const cityRoster = rosterIds(people, "2000-antwerpen", 14, rng);
const byId = new Map(people.map((p) => [p.id, p]));
assert.equal(cityRoster.length, 14);
assert.ok(cityRoster.every((id) => bucketOf(byId.get(id).look) !== "jewish"));
const buckets = {};
for (const id of cityRoster) {
  const b = bucketOf(byId.get(id).look);
  buckets[b] = (buckets[b] || 0) + 1;
}
assert.equal(buckets.flemish, 7);
assert.equal((buckets.black || 0) + (buckets.arab || 0), 7);

const home = rosterIds(people, JEWISH_DISTRICT, 16, rng);
const homeBuckets = {};
for (const id of home) {
  const b = bucketOf(byId.get(id).look);
  homeBuckets[b] = (homeBuckets[b] || 0) + 1;
}
assert.equal(home.length, 16);
assert.equal(homeBuckets.jewish, 8);
assert.equal(homeBuckets.flemish, 7);
assert.equal(homeBuckets.arab, 1);
assert.equal(homeBuckets.black || 0, 0);

const published = JSON.parse(
  readFileSync(new URL("../viewer/districts/2000-antwerpen/interiors.json", import.meta.url), "utf8"),
).interiors;
const snack = published.find((r) => r.name === "Snackhuis Antwerpen");
const room = generateInterior(snack);
const seats = room.spots.filter((s) => s.kind === "sit" && Number.isFinite(s.seatX));
assert.ok(seats.length >= 2, "a snack bar needs chairs");
for (const s of seats) {
  const stand = Math.hypot(s.x - s.seatX, s.z - s.seatZ);
  assert.ok(stand > 0.15 && stand < 0.9, `chair should sit in front of the aisle spot, was ${stand}`);
  const food = foodOnTable(s.seatX, s.seatZ, s.face);
  const toward = (food.x - s.seatX) * Math.sin(s.face) + (food.z - s.seatZ) * Math.cos(s.face);
  assert.ok(toward > 0.3, "the plate is on the table, in front of the sitter");
  assert.equal(food.y, TABLE_Y);
}
assert.ok(hipDrop(0.95) < 0);
assert.equal(hipDrop(0.95) + 0.95, HIP_Y);
assert.equal(dinerMode(0), "eat");
assert.equal(dinerMode(1), "talk");

console.log("population ok");
