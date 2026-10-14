/**
 * Inventory / trigger logic, bullet hits, and armour.
 *   node scripts/test_combat.mjs
 */
import assert from "node:assert/strict";
import { createCombat } from "../viewer/combat.js";
import { createHitscan } from "../viewer/hitscan.js";
import { absorb, DROPS } from "../viewer/loot.js";
import { damageAt, SLOTS, WEAPONS } from "../viewer/weapons.js";
import { Vector3 as ShimVector3 } from "./_three_shim.mjs";

class Vector3 extends ShimVector3 {
  clone() { return new Vector3(this.x, this.y, this.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  divideScalar(k) { return this.multiplyScalar(1 / k); }
}
const THREE = { Vector3, Raycaster: class {} };

const step = (c, s, dt = 1 / 60) => {
  for (let t = 0; t < s; t += dt) c.update(dt);
};

// ---- Inventory ----
{
  const fired = [];
  const melee = [];
  const equips = [];
  const c = createCombat({ onFire: (s) => fired.push(s), onMelee: (m) => melee.push(m), onEquip: (id) => equips.push(id) });
  assert.equal(c.weapon, "unarmed", "you start unarmed");
  assert.equal(c.armed, false);

  c.attack();
  assert.equal(melee.at(-1).kind, "punch", "unarmed click punches");
  step(c, 0.5);
  assert.equal(c.kick(), true, "unarmed right-click kicks");

  assert.equal(c.give("pistol", 20), "new");
  assert.equal(c.weapon, "pistol", "first gun is drawn");
  assert.deepEqual(c.ammoOf("pistol"), { mag: 12, reserve: 8 });
  assert.equal(c.kick(), false, "no kick with a gun out");

  step(c, 0.5); // holster/draw
  c.setTrigger(true);
  step(c, 1);
  c.setTrigger(false);
  assert.equal(fired.length, 1, "pistol is semi-auto: holding fires once");

  // Taps faster than the fire rate are buffered, not lost.
  for (let i = 0; i < 3; i++) {
    c.setTrigger(true);
    c.update(0.01);
    c.setTrigger(false);
    c.update(0.01);
  }
  step(c, 0.5);
  assert.ok(fired.length >= 3, `buffered taps fire (${fired.length})`);

  assert.equal(c.give("rifle", 90), "new");
  assert.equal(c.weapon, "pistol", "picking up a gun doesn't swap while holding one");
  c.equip("rifle");
  c.setAim(true);
  step(c, 0.8);
  const before = fired.length;
  c.setTrigger(true);
  step(c, 0.6);
  c.setTrigger(false);
  assert.ok(fired.length - before >= 6, "rifle is automatic");
  assert.ok(fired.at(-1).spread > fired[before].spread, "spread blooms while holding the trigger");

  // Empty magazine reloads itself.
  c.setTrigger(true);
  step(c, 5);
  c.setTrigger(false);
  assert.ok(c.ammoOf("rifle").mag > 0 || c.ammoOf("rifle").reserve === 0, "auto reload");

  c.setAim(true);
  step(c, 0.6);
  assert.ok(c.aimBlend > 0.95, "aim raises the gun");

  // Wheel: hover then release equips.
  c.setWheel(true);
  c.setHover("pistol");
  c.setHover("smg"); // not owned: ignored
  c.setWheel(false);
  assert.equal(c.weapon, "pistol");

  assert.equal(c.give("pistol", 9999), "ammo");
  assert.equal(c.give("pistol", 10), "full", "a full gun leaves the pickup on the ground");

  assert.deepEqual(SLOTS.filter(c.has), ["unarmed", "pistol", "rifle"]);
  c.cycle(1);
  assert.equal(c.weapon, "rifle");
  c.cycle(1);
  assert.equal(c.weapon, "unarmed", "cycling wraps to fists");

  c.equip("rifle");
  c.clear();
  assert.equal(c.weapon, "unarmed");
  assert.equal(equips.at(-1), "unarmed", "busted: the avatar drops the gun model too");
  assert.equal(c.has("rifle"), false);
}

// ---- Blocked (menu open, riding) ----
{
  let fired = 0;
  const c = createCombat({ blocked: () => true, onFire: () => fired++ });
  c.give("smg", 60);
  step(c, 0.5);
  c.setTrigger(true);
  step(c, 0.5);
  assert.equal(fired, 0, "no shots while blocked");
}

// ---- Knife ----
{
  const melee = [];
  const c = createCombat({ onMelee: (m) => melee.push(m) });
  assert.equal(c.give("knife"), "new");
  assert.equal(c.give("knife"), "full");
  assert.equal(c.armed, false, "a knife is melee, not a gun");
  step(c, 0.5);
  c.attack();
  assert.equal(melee.at(-1).kind, "knife");
}

// ---- Damage falloff ----
for (const id of Object.keys(WEAPONS)) {
  const w = WEAPONS[id];
  if (w.melee) continue;
  assert.ok(damageAt(w, 1) >= damageAt(w, w.range * 0.9), `${id} falls off with distance`);
  assert.ok(damageAt(w, 1) > 0);
}

// ---- Hitscan ----
{
  const hs = createHitscan(THREE, {
    solidAt: (x) => x > 30 && x < 32,
    groundY: () => 0,
  });
  const target = { x: 10, y: 0, z: 0, r: 0.26, h: 1.75 };
  const o = new Vector3(0, 1.2, 0);
  const east = new Vector3(1, 0, 0);

  const body = hs.cast(o, east, 100, [target]);
  assert.equal(body.target, target, "chest shot hits");
  assert.equal(body.head, false);
  assert.ok(Math.abs(body.dist - (10 - 0.26)) < 1e-6, "hits the front of the cylinder");

  const head = hs.cast(new Vector3(0, 1.61, 0), east, 100, [target]);
  assert.equal(head.head, true, "head height is a headshot");

  // A level ray at neck height must not slip between body and head.
  for (let y = 1.3; y <= 1.72; y += 0.01) {
    const r = hs.cast(new Vector3(0, y, 0), east, 100, [target]);
    assert.equal(r.target, target, `no gap at y=${y.toFixed(2)}`);
  }

  const over = hs.cast(new Vector3(0, 2.2, 0), east, 25, [target]);
  assert.equal(over.target, null, "over the head misses");
  assert.equal(over.hit, false);

  const side = hs.cast(new Vector3(0, 1.2, 0.5), east, 25, [target]);
  assert.equal(side.target, null, "beside the body misses");

  const wall = hs.cast(o, east, 100, [{ ...target, x: 40 }]);
  assert.equal(wall.object, "building", "buildings stop bullets");
  assert.ok(wall.dist < 32);

  const down = new Vector3(1, -0.1, 0).normalize();
  const floor = hs.cast(new Vector3(0, 1.5, 0), down, 100, []);
  assert.equal(floor.object, "ground");
  assert.ok(Math.abs(floor.point.y) < 1e-6);

  assert.equal(hs.cast(o, east, 100, [{ ...target, dead: true }]).target, null, "dead targets are skipped");

  // Spread: every pellet stays within the cone.
  const d = new Vector3();
  for (let i = 0; i < 500; i++) {
    hs.jitter(east, 3, d);
    const deg = (Math.acos(Math.min(1, d.dot(east))) * 180) / Math.PI;
    assert.ok(deg <= 3.0001, `jitter inside cone (${deg})`);
  }

  // Camera-then-muzzle: a crosshair hit is confirmed from the barrel.
  const pellets = hs.shoot({
    camPos: new Vector3(-2, 1.4, 0.4),
    camDir: east,
    muzzle: new Vector3(0, 1.4, 0.4),
    spread: 0,
    pellets: 1,
    range: 100,
    targets: [{ ...target, z: 0.4 }],
  });
  assert.equal(pellets.length, 1);
  assert.ok(pellets[0].target, "muzzle ray confirms the hit");
  assert.ok(Math.abs(pellets[0].dist - (10 - 0.26)) < 0.05, "distance is from the muzzle");
}

// ---- Armour / drops ----
assert.deepEqual(absorb(0, 30), { armor: 0, health: 30 });
assert.deepEqual(absorb(100, 30), { armor: 24, health: 6 });
const split = absorb(10, 30);
assert.equal(split.armor, 10);
assert.equal(split.health, 20, "armour runs out mid-hit");
for (const [kind, rows] of Object.entries(DROPS)) {
  for (const row of rows) {
    assert.ok(row.p > 0 && row.p <= 1, `${kind} drop chance`);
    if (row.weapon && row.weapon !== "any") assert.ok(WEAPONS[row.weapon], `${kind} drops a real weapon`);
  }
}

console.log("combat ok");
