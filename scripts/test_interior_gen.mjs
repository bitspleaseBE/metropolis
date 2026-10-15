/**
 * Every enterable shop in every published district gets a usable room from
 * viewer/interiors/interior-gen.js: furniture inside the walls and clear of the doorway, a
 * cashier, customer spots the spawn can walk to, and the same layout on every call.
 *   node scripts/test_interior_gen.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { generateInterior, findPath, INTERIOR_TEMPLATES } from "../viewer/interiors/interior-gen.js";

const root = new URL("../viewer/districts/", import.meta.url);
const records = [];
for (const dir of readdirSync(root)) {
  const file = new URL(`${dir}/interiors.json`, root);
  if (!existsSync(file)) continue;
  for (const r of JSON.parse(readFileSync(file, "utf8")).interiors || []) records.push({ ...r, district: dir });
}
assert.ok(records.length > 100, `expected published interiors, found ${records.length}`);

const stats = {};
const failures = [];
for (const rec of records) {
  const tag = `${rec.district}/${rec.id} ${rec.name || ""} (${rec.template}/${rec.variant}/${rec.size} ${rec.w}×${rec.d})`;
  try {
    const a = generateInterior(rec);
    const b = generateInterior(rec);
    assert.deepEqual(a.placements, b.placements, "layout is not deterministic");
    const { w, d, door } = a;
    for (const p of a.placements) {
      assert.ok(Math.abs(p.x) <= w / 2 + 1e-6 && p.z <= 1e-6 && p.z >= -d - 1e-6, `${p.item} outside the room at ${p.x},${p.z}`);
    }
    assert.ok(Math.abs(door.x) <= w / 2 - 0.5, "door outside the street wall");
    assert.ok(a.staffSpots.some((s) => s.role === "cashier"), "no cashier");
    const solidsInDoor = a.placements.filter(
      (p) => !["doorMat", "lightPanel", "menuBoard", "till", "espresso"].includes(p.item) && Math.abs(p.x - door.x) < 0.5 && p.z > -1.2,
    );
    assert.equal(solidsInDoor.length, 0, `doorway blocked by ${solidsInDoor.map((p) => p.item)}`);
    const spawn = [a.spawn.x, a.spawn.z];
    const reach = a.spots.filter((s) => findPath(a.nav, spawn, [s.x, s.z]));
    assert.ok(a.spots.length === 0 || reach.length >= Math.ceil(a.spots.length * 0.6), `only ${reach.length}/${a.spots.length} spots reachable`);
    const key = `${a.template}/${a.variant}`;
    stats[key] ??= { n: 0, items: 0, spots: 0, staff: 0 };
    stats[key].n++;
    stats[key].items += a.placements.length;
    stats[key].spots += reach.length;
    stats[key].staff += a.staffSpots.length;
  } catch (err) {
    failures.push(`${tag}: ${err.message}`);
  }
}

for (const [k, s] of Object.entries(stats).sort()) {
  console.log(`${k.padEnd(26)} ${String(s.n).padStart(4)} rooms · ${(s.items / s.n).toFixed(0)} items · ${(s.spots / s.n).toFixed(1)} spots · ${(s.staff / s.n).toFixed(1)} staff`);
}
for (const t of INTERIOR_TEMPLATES) assert.ok(Object.keys(stats).some((k) => k.startsWith(`${t}/`)), `no ${t} rooms in the data`);
if (failures.length) {
  console.log(failures.slice(0, 30).join("\n"));
  console.log(`${failures.length} of ${records.length} interiors failed`);
  process.exit(1);
}
console.log(`ok: ${records.length} interiors`);
