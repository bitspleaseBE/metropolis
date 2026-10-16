/**
 * Hysteresis for spatial city chunk streaming.
 *   node scripts/test_chunk_stream.mjs
 */
import assert from "node:assert/strict";
import {
  LOAD_M,
  UNLOAD_M,
  chunkWanted,
  overviewLatched,
} from "../viewer/chunk-stream.js";

const here = { x: 0, z: 0 };

assert.equal(chunkWanted({ x: LOAD_M - 1, z: 0, overview: false, loaded: false }, here), true);
assert.equal(chunkWanted({ x: LOAD_M + 5, z: 0, overview: false, loaded: false }, here), false);
assert.equal(chunkWanted({ x: LOAD_M + 40, z: 0, overview: false, loaded: true }, here), true);
assert.equal(chunkWanted({ x: UNLOAD_M + 5, z: 0, overview: false, loaded: true }, here), false);
assert.equal(chunkWanted({ x: 900, z: 400, overview: true, loaded: false }, here), true);

assert.equal(overviewLatched("walk", 800, true), false);
assert.equal(overviewLatched("free", 400, false), true);

import { pickWithin } from "../viewer/chunk-stream.js";
const spots = [
  { id: "near", x: 10, z: 0 },
  { id: "mid", x: 40, z: 0 },
  { id: "far", x: 90, z: 0 },
];
const picked = pickWithin(spots, 0, 0, 2, () => true).map((s) => s.id);
assert.deepEqual(picked, ["near", "mid"]);
assert.equal(pickWithin(spots, 0, 0, Infinity, (s) => s.id !== "mid").length, 2);

console.log("chunk stream hysteresis ok");
