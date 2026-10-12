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

console.log("chunk stream hysteresis ok");
