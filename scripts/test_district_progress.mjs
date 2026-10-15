/**
 * District campaign locks: 2000 and 2018 first, then the belt, then the rest.
 *   node scripts/test_district_progress.mjs
 */
import assert from "node:assert/strict";
import {
  BELT,
  BELT_GATE_S,
  HOME,
  STARTER,
  STARTER_GATE_S,
  STORAGE_KEY,
  beltReady,
  createPlayClock,
  emptyPlay,
  gateName,
  isUnlocked,
  loadPlay,
  lockReason,
  recordPlay,
  savePlay,
  setPlayed,
  startersReady,
  streamableNeighbours,
} from "../viewer/district-progress.js";

function memory() {
  const box = new Map();
  return {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
  };
}

const fresh = emptyPlay();

assert.deepEqual(STARTER, ["2000-antwerpen", "2018-harmonie"]);
assert.equal(HOME, "2018-harmonie");
assert.equal(isUnlocked(fresh, "2000-antwerpen"), true);
assert.equal(isUnlocked(fresh, "2018-harmonie"), true);
assert.equal(isUnlocked(fresh, "2020-kiel"), false);
assert.equal(isUnlocked(fresh, "2060-noord"), false);
assert.equal(isUnlocked(fresh, "2140-borgerhout"), false);
assert.equal(isUnlocked(fresh, "2050-linkeroever"), false);
assert.equal(isUnlocked(fresh, "2030-haven"), false);
assert.equal(isUnlocked(fresh, "2100-deurne"), false, "a district added later stays locked");
assert.equal(gateName(fresh), "starter");

{
  let play = fresh;
  play = setPlayed(play, "2000-antwerpen", STARTER_GATE_S);
  assert.equal(startersReady(play), false, "one starter is not enough");
  assert.equal(isUnlocked(play, "2020-kiel"), false);
  assert.equal(lockReason(play, "2020-kiel"), "Play 3 min in Klein Antwerpen");
  play = setPlayed(play, "2018-harmonie", STARTER_GATE_S - 0.2);
  assert.equal(isUnlocked(play, "2140-borgerhout"), false);
  play = recordPlay(play, "2018-harmonie", 0.2);
  assert.equal(startersReady(play), true);
  assert.equal(gateName(play), "belt");
  for (const id of BELT) assert.equal(isUnlocked(play, id), true, id);
  assert.equal(isUnlocked(play, "2050-linkeroever"), false);
  assert.equal(isUnlocked(play, "2030-haven"), false);
  assert.match(lockReason(play, "2030-haven"), /Kiel/);
  play = setPlayed(play, "2060-noord", BELT_GATE_S);
  assert.equal(beltReady(play), true);
  assert.equal(gateName(play), "city");
  assert.equal(isUnlocked(play, "2050-linkeroever"), true);
  assert.equal(isUnlocked(play, "2030-haven"), true);
  assert.equal(isUnlocked(play, "2100-deurne"), true);
  assert.equal(lockReason(play, "2030-haven"), "");
}

{
  const jumped = recordPlay(fresh, "2018-harmonie", 30);
  assert.equal(jumped.seconds["2018-harmonie"], 1, "a stalled frame counts at most one second");
}

{
  const store = memory();
  savePlay({ seconds: { "2000-antwerpen": 12, nope: "x", "2018-harmonie": -4 } }, store);
  const loaded = loadPlay(store);
  assert.equal(loaded.seconds["2000-antwerpen"], 12);
  assert.equal(loaded.seconds["2018-harmonie"], undefined);
  store.setItem(STORAGE_KEY, "{");
  assert.deepEqual(loadPlay(store), emptyPlay());
}

{
  const store = memory();
  const clock = createPlayClock(store);
  assert.equal(clock.tick("2000-antwerpen", 0.05), null);
  for (let i = 0; i < STARTER_GATE_S * 20; i++) clock.tick("2000-antwerpen", 0.05);
  for (let i = 0; i < (STARTER_GATE_S - 1) * 20; i++) clock.tick("2018-harmonie", 0.05);
  assert.equal(gateName(clock.play), "starter");
  const opened = clock.tick("2018-harmonie", 1);
  assert.equal(opened, "belt");
  assert.equal(gateName(loadPlay(store)), "belt", "opening a gate saves immediately");
  const ids = streamableNeighbours(
    ["2018-harmonie", "2020-kiel", "2000-antwerpen", "2140-borgerhout", "2050-linkeroever"],
    fresh,
  );
  assert.deepEqual(ids, ["2018-harmonie", "2000-antwerpen"]);
  const later = streamableNeighbours(["2020-kiel", "2030-haven"], clock.play);
  assert.deepEqual(later, ["2020-kiel"]);
}

assert.match(lockReason(fresh, "2060-noord"), /3 min in Antwerpen and 3 min in Klein Antwerpen/);

console.log("district-progress ok");
