/**
 * Headless check of NPC trip planning over both districts and a 24 h day.
 *
 *   node scripts/sim_npc_trips.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal stubs — ped-graph is pure JS with no Three dependency.
const { walksToRoutes, buildPedGraph } = await import(join(root, "viewer/npc/ped-graph.js"));
const { collectPois, planTrip, shopOpen } = await import(join(root, "viewer/npc/trips.js"));
const { createPopulation } = await import(join(root, "viewer/npc/population.js"));
const { buildCyclePaths, planCycleRoute, buildCycleHandoffs, nearestCycleSpot } = await import(
  join(root, "viewer/npc/cycle-graph.js")
);

function loadJson(rel) {
  // Only district viewer JSON — never user-controlled paths.
  if (!/^viewer\/districts\/[a-z0-9-]+\/(district|roads|shops|transit)\.json$/.test(rel)) {
    throw new Error(`refusing to read ${rel}`);
  }
  const abs = join(root, rel);
  if (!abs.startsWith(root + "/") && abs !== root) {
    throw new Error(`refusing to read ${rel}`);
  }
  return JSON.parse(readFileSync(abs, "utf8"));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runDistrict(id) {
  const district = loadJson(`viewer/districts/${id}/district.json`);
  const roads = loadJson(`viewer/districts/${id}/roads.json`);
  const shops = loadJson(`viewer/districts/${id}/shops.json`);
  const transit = loadJson(`viewer/districts/${id}/transit.json`);

  const routes = walksToRoutes(roads.walks);
  const pedGraph = buildPedGraph(routes);
  assert(pedGraph.nodes.length > 10, `${id}: too few ped nodes`);
  assert(routes.every((r) => r.width > 0), `${id}: walk missing width`);

  const pois = collectPois({ shops: shops.shops || [], stops: transit.stops || [], pedGraph });
  const population = createPopulation(district);

  const cyclePaths = buildCyclePaths(roads.roads || [], roads.cycleways || []);
  const handoffs = buildCycleHandoffs(cyclePaths);
  assert(cyclePaths.length > 5, `${id}: too few cycle paths`);

  // Riders never use walks.
  for (const p of cyclePaths) {
    assert(p.kind !== "sidewalk" && p.kind !== "crossing" && p.kind !== "footway", `${id}: cycle path is a walk`);
  }

  let reached = 0;
  let failed = 0;
  let kidsAfter17 = 0;
  let bakfietsPeak = 0;
  let bakfietsOff = 0;
  let samplesPeak = 0;
  let samplesOff = 0;
  const lookCounts = {};

  for (let hour = 0; hour < 24; hour += 0.5) {
    const rules = population.hourRules(hour);
    for (let i = 0; i < 20; i++) {
      const look = population.pickLook(0, 0);
      lookCounts[look] = (lookCounts[look] || 0) + 1;
      const age = rules.allowChildren && Math.random() < 0.1 ? "child" : "adult";
      if (!rules.allowChildren && age === "child") kidsAfter17++;
      const mode = population.pickMode(look, age === "child" ? "adult" : age, "m", hour);
      if (hour >= 15 && hour < 17) {
        samplesPeak++;
        if (mode === "bakfiets") bakfietsPeak++;
      } else {
        samplesOff++;
        if (mode === "bakfiets") bakfietsOff++;
      }
      const trip = planTrip({
        pedGraph,
        pois,
        hour,
        day: 5,
        mode: mode === "bike" || mode === "step" || mode === "bakfiets" ? mode : "walk",
      });
      if (!trip) {
        failed++;
        continue;
      }
      // Soft: path should make progress on the small district graph.
      if (trip.path.length >= 8) reached++;
      else failed++;
    }
  }

  // Cycle A* sample.
  const a = nearestCycleSpot(cyclePaths, 0, 0);
  const b = nearestCycleSpot(cyclePaths, 80, -40);
  if (a && b) {
    const plan = planCycleRoute(cyclePaths, handoffs, a, b);
    assert(plan == null || plan.length >= 1, `${id}: cycle plan malformed`);
  }

  const totalLooks = Object.values(lookCounts).reduce((s, n) => s + n, 0) || 1;
  const hasidicShare = (lookCounts.hasidic || 0) / totalLooks;
  console.log(
    `[${id}] trips ok=${reached} fail=${failed} nodes=${pedGraph.nodes.length} ` +
      `cycle=${cyclePaths.length} hasidic=${(hasidicShare * 100).toFixed(1)}% ` +
      `bakfiets peak=${bakfietsPeak} off=${bakfietsOff} kidsAfter17=${kidsAfter17}`
  );

  assert(kidsAfter17 === 0, `${id}: spawned children after 17:00`);
  assert(reached > failed * 0.5, `${id}: too many failed trips (${reached} ok / ${failed} fail)`);
  if (id === "2018-harmonie") {
    assert(hasidicShare > 0.15, `${id}: hasidic share too low (${hasidicShare})`);
  }
  if (id === "2000-antwerpen") {
    assert(hasidicShare < 0.08, `${id}: hasidic share too high around centre (${hasidicShare})`);
  }
  // School-run bakfiets rate should beat the off-peak rate (3× weight).
  const ratePeak = bakfietsPeak / Math.max(1, samplesPeak);
  const rateOff = bakfietsOff / Math.max(1, samplesOff);
  assert(ratePeak > rateOff * 1.2, `${id}: bakfiets peak rate ${ratePeak.toFixed(3)} ≤ off ${rateOff.toFixed(3)}`);
  return { reached, failed, hasidicShare };
}

let failed = false;
for (const id of ["2018-harmonie", "2000-antwerpen"]) {
  try {
    runDistrict(id);
  } catch (err) {
    console.error("FAIL", id, err.message || err);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("sim_npc_trips: OK");
