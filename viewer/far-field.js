/**
 * Far-field skyline: every footprint in buildings.json extruded to its measured height, one merged
 * mesh per chunk cell. A cell's silhouette shows only while its detailed chunk is not resident, so
 * the horizon is never empty past the streaming radius and a cell that is still downloading is
 * not a hole in the city.
 *
 * Cells follow the Blender peel (district_chunks.py): bounding-box centre in Blender XY, floor by
 * cell_m, and anything within core_r of spawn belongs to "core".
 */

const FAR_M = 1600;
const LANDMARK_CAP_M = 30;
const DEFAULT_H = 12;
const MIN_AREA_M2 = 12;
const BUILD_BUDGET_MS = 4;

const WALLS = [
  [0.74, 0.69, 0.6],
  [0.66, 0.6, 0.53],
  [0.62, 0.45, 0.38],
  [0.78, 0.76, 0.72],
  [0.56, 0.55, 0.53],
];
const ROOF = [0.33, 0.33, 0.35];

function hash(n) {
  let h = Number(n) | 0 || 1;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

function signedArea(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return s / 2;
}

/** Cell id for a footprint (Blender XY ring), matching the chunk peel. */
export function farCellId(ring, spawn, cellM, coreR) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (spawn && Math.hypot(cx - spawn.x, cy - spawn.y) <= coreR) return { id: "core", cx, cy };
  return { id: `c_${Math.floor(cx / cellM)}_${Math.floor(cy / cellM)}`, cx, cy };
}

/**
 * Walls + flat roof for one footprint, appended to `pos` / `nrm` / `col` (Three XZ, z = −y).
 * Exported for tests.
 */
export function extrudeFootprint(THREE, b, pos, nrm, col) {
  const ring = b.ring;
  if (!ring || ring.length < 3) return 0;
  const area = Math.abs(signedArea(ring));
  if (area < MIN_AREA_M2) return 0;
  let h = Number(b.h) || DEFAULT_H;
  if (b.lm) h = Math.min(h, LANDMARK_CAP_M);
  const wall = WALLS[hash(b.id) % WALLS.length];
  // Three XZ: z = −y flips handedness, so a CCW Blender ring becomes CW seen from +Y.
  const toXZ = (pts) => pts.map((p) => [p[0], -p[1]]);
  const outer = toXZ(ring);
  if (signedArea(outer) > 0) outer.reverse();
  const holes = (b.holes || []).filter((hl) => hl.length >= 3).map(toXZ);
  for (const hl of holes) if (signedArea(hl) < 0) hl.reverse();
  let tris = 0;
  for (const loop of [outer, ...holes]) {
    for (let i = 0; i < loop.length; i++) {
      const [ax, az] = loop[i];
      const [bx, bz] = loop[(i + 1) % loop.length];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const nx = -dz / len;
      const nz = dx / len;
      pos.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, 0, az, bx, h, bz, ax, h, az);
      for (let k = 0; k < 6; k++) {
        nrm.push(nx, 0, nz);
        col.push(wall[0], wall[1], wall[2]);
      }
      tris += 2;
    }
  }
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const holeV = holes.map((hl) => hl.map((p) => new THREE.Vector2(p[0], p[1])));
  const all = [...outer, ...holes.flat()];
  for (const f of THREE.ShapeUtils.triangulateShape(contour, holeV)) {
    let [i0, i1, i2] = f;
    const a = all[i0];
    const b1 = all[i1];
    const c = all[i2];
    // Face up (+Y): y of (b−a)×(c−a) is (bz−az)(cx−ax) − (bx−ax)(cz−az).
    if ((b1[1] - a[1]) * (c[0] - a[0]) - (b1[0] - a[0]) * (c[1] - a[1]) < 0) [i1, i2] = [i2, i1];
    for (const i of [i0, i1, i2]) {
      pos.push(all[i][0], h, all[i][1]);
      nrm.push(0, 1, 0);
      col.push(ROOF[0], ROOF[1], ROOF[2]);
    }
    tris += 1;
  }
  return tris;
}

/**
 * @param {object} o
 * @param {*} o.THREE
 * @param {*} o.scene
 */
export function createFarField({ THREE, scene }) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sources = [];

  /**
   * @param {object} s
   * @param {{ spawn?: {x:number,y:number}, buildings: object[] }} s.doc — buildings.json
   * @param {{ isResident: (id: string) => boolean }} s.stream
   * @param {number} [s.cellM]
   * @param {number} [s.coreR]
   * @param {boolean} [s.coreAlwaysResident] — our own core.glb never unloads
   * @param {{ x: number, z: number, y?: number, sx?: number } | null} [s.transform]
   * @param {string} s.name
   */
  function addSource(s) {
    const cellM = Number(s.cellM) || 256;
    const coreR = Number(s.coreR) || 160;
    const t = s.transform || null;
    const sx = t ? Number(t.sx) || 1 : 1;
    const tx = t ? Number(t.x) || 0 : 0;
    const tz = t ? Number(t.z) || 0 : 0;
    const root = new THREE.Group();
    root.name = "FarField_" + s.name;
    root.position.set(tx, t ? Number(t.y) || 0 : 0, tz);
    root.scale.x = sx;
    root.matrixAutoUpdate = false;
    root.updateMatrix();
    scene.add(root);
    const cells = new Map();
    for (const b of (s.doc && s.doc.buildings) || []) {
      if (!b.ring || b.ring.length < 3) continue;
      const { id, cx, cy } = farCellId(b.ring, s.doc.spawn, cellM, coreR);
      let c = cells.get(id);
      if (!c) {
        c = { id, buildings: [], sumX: 0, sumY: 0, mesh: null };
        cells.set(id, c);
      }
      c.buildings.push(b);
      c.sumX += cx;
      c.sumY += cy;
    }
    for (const c of cells.values()) {
      // Cell centre in our frame for the distance test.
      c.x = (c.sumX / c.buildings.length) * sx + tx;
      c.z = -(c.sumY / c.buildings.length) + tz;
    }
    sources.push({ ...s, root, cells: [...cells.values()] });
    return cells.size;
  }

  function buildCell(src, c) {
    const pos = [];
    const nrm = [];
    const col = [];
    for (const b of c.buildings) extrudeFootprint(THREE, b, pos, nrm, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "far_" + c.id;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    src.root.add(mesh);
    src.root.updateMatrixWorld(true);
    c.mesh = mesh;
  }

  function update(x, z) {
    const t0 = performance.now();
    for (const src of sources) {
      for (const c of src.cells) {
        const resident = c.id === "core" && src.coreAlwaysResident ? true : src.stream.isResident(c.id);
        const want = !resident && Math.hypot(c.x - x, c.z - z) <= FAR_M;
        if (want && !c.mesh) {
          if (performance.now() - t0 > BUILD_BUDGET_MS) continue;
          buildCell(src, c);
        }
        if (c.mesh) c.mesh.visible = want;
      }
    }
  }

  return { addSource, update, sources, material };
}
