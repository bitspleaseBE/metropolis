/**
 * Same cases as cityview.test_kerbs.FrontagePavementTests, on the viewer port.
 */
import { Carriageways, Footprints, facadeSeatDrop, frontageSidewalkRuns } from "../viewer/pavement-frontage.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// The classes aren't exported. Re-test through frontageSidewalkRuns only,
// constructing indexes the way the module does internally — export them if needed.
void Carriageways;
void Footprints;

const road = [
  [0, 0],
  [20, 0],
];
const house = [
  [-1, 9],
  [21, 9],
  [21, 16],
  [-1, 16],
];

// Exports: frontageSidewalkRuns expects class instances. They are not exported.
// This file imports them — if the import fails, the classes need exporting.
const fp = new Footprints([house]);
const runs = frontageSidewalkRuns(road, 4, 1, fp, null, 0);
assert(runs.length === 1, "one run to the facade");
const ys = runs[0][1].map((p) => p[1]);
assert(Math.min(...ys) > 8.9, `facade reach ${Math.min(...ys)}`);
assert(Math.abs(runs[0][0][0][1] - 4) < 0.02, "kerb edge");

const open = frontageSidewalkRuns(road, 4, 1, new Footprints([]), null, 0);
for (let i = 0; i < open[0][0].length; i++) {
  const w = open[0][1][i][1] - open[0][0][i][1];
  assert(Math.abs(w - 2) < 0.05, `nominal width ${w}`);
}

const ours = { kind: "secondary", width: 8, points: [[-40, 0], [40, 0]] };
const other = { kind: "secondary", width: 8, points: [[-40, 12], [40, 12]] };
const far = [[-30, 20], [30, 20], [30, 28], [-30, 28]];
const idx = new Carriageways([ours, other]);
const blvd = frontageSidewalkRuns(ours.points, 4, 1, new Footprints([far]), idx, 0);
assert(blvd.length > 0, "boulevard has pavement");
for (const run of blvd) {
  for (const p of run[1]) assert(p[1] < 8, `crossed the median at y=${p[1]}`);
}

const main = { kind: "residential", width: 8, points: [[-40, 0], [40, 0]] };
const side = { kind: "residential", width: 6, points: [[0, 0], [0, 40]] };
const sideHouse = [[8, 9], [24, 9], [24, 16], [8, 16]];
const mouth = frontageSidewalkRuns(
  main.points,
  4,
  1,
  new Footprints([sideHouse]),
  new Carriageways([main, side]),
  0,
);
const xs = mouth.flatMap((run) => run[0].map((p) => p[0]));
assert(xs.every((x) => x < -1.5 || x > 1.5), "junction mouth stayed open");
const reached = mouth.flatMap((run) => run[1].filter((p) => p[0] > 10).map((p) => p[1]));
assert(Math.max(...reached) > 8.9, "pavement still reaches the house past the junction");

assert(Math.abs(facadeSeatDrop(0.77, 0.12) - 0.65) < 1e-9, "floating façade drops onto the wall");
assert(facadeSeatDrop(0.12, 0.12) === 0, "façade already on the wall stays");
assert(facadeSeatDrop(0.1, 0.2) === 0, "façade below the wall is not pushed up");

console.log("pavement frontage ok");
