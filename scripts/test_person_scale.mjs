import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ADULT_M, CHILD_M, CROWN_TO_EYE, EYE_M, HEIGHT_JITTER, heightFor } from "../viewer/person-scale.js";

assert.equal(EYE_M, ADULT_M - CROWN_TO_EYE);
assert.equal(heightFor("adult"), ADULT_M);
assert.equal(heightFor("senior"), ADULT_M);
assert.equal(heightFor("child"), CHILD_M);
assert.ok(HEIGHT_JITTER > 0 && HEIGHT_JITTER < 0.05);

const players = readFileSync(new URL("../viewer/players.js", import.meta.url), "utf8");
assert.match(players, /ADULT_M \/ span/, "the player is fitted sole to crown");
assert.doesNotMatch(players, /targetH = 1\.72/, "ankle-to-skull is not the body");
assert.match(players, /EYE_M/, "feet use the shared eye height");

const people = readFileSync(new URL("../viewer/people.js", import.meta.url), "utf8");
assert.match(people, /heightFor\(p\.age\)/, "the crowd uses the same heights");
assert.doesNotMatch(people, /p\.height \* jitter/);

const motion = readFileSync(new URL("../viewer/player-motion.js", import.meta.url), "utf8");
assert.match(motion, /eye: EYE_M/);

console.log("person-scale ok");
