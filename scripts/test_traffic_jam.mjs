/**
 * A jam makes drivers honk, and restless ones leave a blocked exit.
 *   node scripts/test_traffic_jam.mjs
 */
import assert from "node:assert/strict";
import { BAIL_AFTER_S, DETOUR_AFTER_S, HONK_AFTER_S, HONK_GAP_S, isRestless, jamReaction } from "../viewer/traffic-jam.js";

assert.equal(isRestless(0.1), true);
assert.equal(isRestless(0.4), false);

const quiet = jamReaction({ wait: "red", blocked: 20, queued: 20, restless: true }, 30);
assert.equal(quiet.honk, false, "a red light is not a horn");

const early = jamReaction({ wait: "queue", queued: HONK_AFTER_S - 0.2 }, 10);
assert.equal(early.honk, false);

const line = jamReaction({ wait: "queue", queued: HONK_AFTER_S + 0.1, lastHonk: 0 }, 10);
assert.equal(line.honk, true);
assert.equal(line.detour, false);
assert.equal(line.bail, false);

const again = jamReaction({ wait: "queue", queued: 8, lastHonk: 10 - HONK_GAP_S + 0.2 }, 10);
assert.equal(again.honk, false, "horns have a gap");

const exit = jamReaction(
  { wait: "car", blocked: DETOUR_AFTER_S, holdEntry: true, next: { index: 3 }, restless: true, lastHonk: 0 },
  20,
);
assert.equal(exit.detour, true);
assert.equal(exit.bail, false, "a junction try is not a despawn");

const patient = jamReaction(
  { wait: "car", blocked: DETOUR_AFTER_S + 2, holdEntry: true, next: { index: 3 }, restless: false },
  20,
);
assert.equal(patient.detour, false);

const lane = jamReaction({ wait: "cross", blocked: BAIL_AFTER_S, restless: true, lastHonk: 99 }, 100);
assert.equal(lane.bail, true);
assert.equal(lane.honk, false);

const walker = jamReaction({ wait: "ped", blocked: 20, restless: true }, 30);
assert.equal(walker.bail, false, "waiting for someone crossing is not a bail");

console.log("traffic jam ok");
