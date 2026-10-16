/**
 * Street-life placement is pure: names at street starts, one-way discs, halt totems.
 *   node scripts/test_street_life.mjs
 */
import assert from "node:assert/strict";
import {
  splitStreetName,
  plateNameLines,
  streetStartPlates,
  nearestFacade,
  nearestStreetCorner,
  attachPlatesToFacades,
  PLATE_WIDTH_M,
  PLATE_CORNER_M,
  PLATE_PROUD_M,
  trafficSigns,
  stopTotems,
} from "../viewer/street-life.js";

assert.deepEqual(splitStreetName("Maria Pijpelinckxstraat"), {
  head: "MARIA PIJPELINCKX",
  suffix: "STRAAT",
});
assert.deepEqual(splitStreetName("Maria-Pijpelinckxstraat"), {
  head: "MARIA-PIJPELINCKX",
  suffix: "STRAAT",
});
assert.deepEqual(splitStreetName("Van Eycklei"), { head: "VAN EYCK", suffix: "LEI" });
assert.deepEqual(splitStreetName("Mechelsesteenweg"), { head: "MECHELSE", suffix: "STEENWEG" });
assert.deepEqual(splitStreetName("Stadspark"), { head: "STADSPARK", suffix: "" });
assert.deepEqual(plateNameLines("MARIA PIJPELINCKX"), ["MARIA", "PIJPELINCKX"]);
assert.deepEqual(plateNameLines("MARIA-PIJPELINCKX"), ["MARIA", "PIJPELINCKX"]);
assert.deepEqual(plateNameLines("VAN EYCK"), ["VAN EYCK"]);
assert.deepEqual(plateNameLines("STADSPARK"), ["STADSPARK"]);

const wall = nearestFacade(0, 0, [{ ring: [[4, 0], [4, 4], [8, 4], [8, 0]] }], 18);
assert.ok(wall);
assert.ok(wall.x > 3.1 && wall.x < 4.1);

const ring = [
  [4, 0],
  [4, 4],
  [8, 4],
  [8, 0],
];
const corner = nearestStreetCorner(0, 0, [{ ring }], 18, { ox: 1, oz: 0 });
assert.ok(corner);
assert.ok(Math.abs(corner.x - 4) < 0.05);
assert.ok(Math.abs(corner.z) < 0.05);

const hung = attachPlatesToFacades(
  [{ name: "Kerkstraat", x: 0, z: 0, ox: 1, oz: 0, tx: 0, tz: -1, yaw: 0 }],
  [{ ring }],
);
assert.equal(hung.length, 1);
const along = PLATE_CORNER_M + PLATE_WIDTH_M * 0.5;
assert.ok(Math.abs(hung[0].z + along) < 0.08, `plate z ${hung[0].z} should sit ${along} m off the corner`);
assert.ok(Math.abs(4 - hung[0].x - PLATE_PROUD_M) < 0.05, "plate sits on the wall, not out in the street");

const stepped = attachPlatesToFacades(
  [{ name: "Kerkstraat", x: 0, z: 0, ox: 1, oz: 0, tx: 0, tz: -1, yaw: 0 }],
  [{ ring: [[4, 0], [4, -0.4], [10, -0.4], [10, 4], [4, 4]] }],
);
assert.ok(
  Math.hypot(stepped[0].x - 4, stepped[0].z) > PLATE_CORNER_M,
  "a short corner return pushes the plate onto the long wall",
);

const chain = streetStartPlates([
  { kind: "residential", name: "Kerkstraat", points: [[0, 0], [10, 0]] },
  { kind: "residential", name: "Kerkstraat", points: [[10, 0], [20, 0]] },
  { kind: "residential", name: "Kerkstraat", points: [[20, 0], [30, 0]] },
]);
assert.equal(chain.length, 2);
assert.ok(chain.every((p) => p.name === "Kerkstraat"));

const junction = streetStartPlates([
  { kind: "residential", name: "Van Eycklei", points: [[0, 0], [10, 0]] },
  { kind: "tertiary", name: "Rubenslei", points: [[0, 0], [0, 10]] },
]);
assert.equal(junction.length, 4);
assert.deepEqual(
  [...new Set(junction.map((p) => p.name))].sort(),
  ["Rubenslei", "Van Eycklei"],
);

const signs = trafficSigns([
  {
    kind: "secondary",
    name: "Van Eycklei",
    oneway: 1,
    points: [
      [0, 0],
      [20, 0],
    ],
  },
  { kind: "residential", name: "TwoWay", oneway: 0, points: [[0, 0], [20, 0]] },
]);
assert.equal(signs.length, 2);
assert.deepEqual(
  signs.map((s) => s.kind).sort(),
  ["noentry", "oneway"],
);

const totems = stopTotems([
  { id: 1, name: "Antwerpen Stadspark", lines: ["1", "8"], mode: "tram", x: 10, y: 20 },
  { id: 2, name: "Antwerpen Stadspark", lines: ["1"], mode: "bus", x: 12, y: 21 },
  { id: 3, name: "", lines: ["4"], mode: "tram", x: 100, y: 100 },
]);
assert.equal(totems.length, 1);
assert.equal(totems[0].name, "Antwerpen Stadspark");
assert.equal(totems[0].z, -20);

console.log("street life placement ok");
