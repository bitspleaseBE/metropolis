/**
 * Far-field skyline: chunk-cell binning and footprint extrusion.
 *   node scripts/test_far_field.mjs
 */
import assert from "node:assert/strict";
import { extrudeFootprint, farCellId } from "../viewer/far-field.js";

// Convex footprints only: a fan is a valid triangulation.
const THREE = {
  Vector2: class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  },
  ShapeUtils: {
    triangulateShape: (contour) => contour.slice(1, -1).map((_, i) => [0, i + 1, i + 2]),
  },
};

const spawn = { x: 0, y: 0 };
assert.equal(farCellId([[10, 10], [20, 10], [20, 20]], spawn, 256, 160).id, "core");
assert.equal(farCellId([[300, 10], [310, 10], [310, 20]], spawn, 256, 160).id, "c_1_0");
assert.equal(farCellId([[-300, -10], [-290, -10], [-290, -20]], spawn, 256, 160).id, "c_-2_-1");

function walls(pos, nrm) {
  const out = [];
  for (let v = 0; v < nrm.length / 3; v += 6) {
    if (nrm[v * 3 + 1] !== 0) continue;
    const mx = (pos[v * 3] + pos[v * 3 + 3]) / 2;
    const mz = (pos[v * 3 + 2] + pos[v * 3 + 5]) / 2;
    out.push({ mx, mz, nx: nrm[v * 3], nz: nrm[v * 3 + 2] });
  }
  return out;
}

for (const ring of [
  [[0, 0], [10, 0], [10, 10], [0, 10]],
  [[0, 0], [0, 10], [10, 10], [10, 0]],
]) {
  const pos = [];
  const nrm = [];
  const col = [];
  const tris = extrudeFootprint(THREE, { id: 1, ring, h: 15 }, pos, nrm, col);
  assert.equal(tris, 8 + 2);
  assert.equal(pos.length, nrm.length);
  assert.equal(pos.length, col.length);
  // Centre of the box in Three XZ is (5, −5); every wall faces away from it.
  for (const w of walls(pos, nrm)) {
    assert.ok((w.mx - 5) * w.nx + (w.mz + 5) * w.nz > 0, `wall at ${w.mx},${w.mz} faces inward`);
  }
  // Roof triangles wind counter-clockwise seen from above (+Y).
  for (let v = 48; v < pos.length / 3; v += 3) {
    const [ax, ay, az] = pos.slice(v * 3, v * 3 + 3);
    const [bx, , bz] = pos.slice(v * 3 + 3, v * 3 + 6);
    const [cx, , cz] = pos.slice(v * 3 + 6, v * 3 + 9);
    assert.equal(ay, 15);
    assert.ok((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0);
  }
}

{
  const pos = [];
  extrudeFootprint(THREE, { id: 2, ring: [[0, 0], [20, 0], [20, 20], [0, 20]], h: 120, lm: 1 }, pos, [], []);
  assert.equal(Math.max(...pos.filter((_, i) => i % 3 === 1)), 30);
}

assert.equal(extrudeFootprint(THREE, { id: 3, ring: [[0, 0], [2, 0], [2, 2]] }, [], [], []), 0);

console.log("far field ok");
