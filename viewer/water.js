/**
 * Shallow park water: liquid look + wade (slow creep on the silt bed).
 * Deep water (Scheldt, docks): push the walker out — no swimming yet.
 *
 * Rings come from water.json (Blender XY → Three z = −y), same as outdoors.js.
 * Feet sit at ``bed_y`` (soil), not at groundAt−sink (which clamps to ≥0).
 *
 * Park ponds are sunk below the lawn at load (``sinkPonds``): the surface drops to
 * POND_SURFACE_Y, a stone kade + bank wall lines the edge, and two depth-only cutters
 * hide the lawn / courtyard polygons that the baked GLBs still draw over the pond.
 */

import { fetchJsonCached } from "./json-cache.js";

const WADE_FOOT = 0.48; // share of walk speed while in shallow water
const RIPPLE_SPEED = 1.35;
const DEFAULT_BED_Y = -0.28; // legacy water.json value (surface at −0.04)
// Relative to the lawn. Overrides the baked heights (cityview.water SURFACE_Y 0.02 / BED_Y
// −0.28, Blender Z_WATER / Z_WATER_BED) until a rebuild bakes the pond this low itself.
const POND_SURFACE_Y = -0.38;
const POND_BED_Y = -0.7;
// Stays above the GLB skirt plane (box.min.y − 0.35 ≈ −0.49).
const BANK_FOOT_Y = -0.45;
const KADE_TOP_Y = 0.03;
const KADE_FACE_Y = -0.2;
const KADE_W = 0.24;
// Highest courtyard layer is 0.032 (courtyards_blender.LAYER_Z); roads start at 0.04.
const CUT_HIGH_Y = 0.035;

/**
 * Opaque draw order around the pond cutters. Everything else stays 0 (skirt −1):
 * pond surface / bank → lawn cutter → lawn + ground → courtyard cutter → courtyards.
 * Only meshes drawn after a cutter can be hidden by it.
 */
export const RENDER_ORDER = { cutLawn: 1, lawn: 2, cutYard: 3, yard: 4 };
const LAWN_MESH = /^(?:park_(?!path)|ground$)/i;
const YARD_MESH = /^courtyard_/i;

/** One clock for every liquid material (shimmer only; geometry never moves). */
const rippleTime = { value: 0 };
/** Ponds sunk by ``sinkPonds`` — wade rings in world XZ, checked before water.json. */
const sunkPonds = [];

function pointInRing(x, z, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i * 2];
    const z1 = ring[i * 2 + 1];
    const x2 = ring[j * 2];
    const z2 = ring[j * 2 + 1];
    if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / ((z2 - z1) || 1e-12) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function ringFromPts(pts) {
  const ring = new Float32Array(pts.length * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = Array.isArray(p) ? Number(p[0]) : Number(p.x) || 0;
    const y = Array.isArray(p) ? Number(p[1]) : Number(p.y) || 0;
    const z = -y;
    ring[i * 2] = x;
    ring[i * 2 + 1] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, ring };
}

function distToSegment2(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apz * abz) / ab2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { d2: dx * dx + dz * dz, x: cx, z: cz };
}

function nearestEdge(x, z, body) {
  const r = body.ring;
  let best = Infinity;
  let sx = x;
  let sz = z;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const hit = distToSegment2(x, z, r[i * 2], r[i * 2 + 1], r[j * 2], r[j * 2 + 1]);
    if (hit.d2 < best) {
      best = hit.d2;
      sx = hit.x;
      sz = hit.z;
    }
  }
  return { x: sx, z: sz, d2: best };
}

/**
 * Upgrade baked water materials to a cheap liquid (tinted alpha + shimmer) and sink
 * park ponds below the lawn (see ``sinkPonds``). Call on every loaded root (core,
 * chunks, neighbour chunks) before ``mergeStaticMeshes``.
 */
export function applyLiquidMaterials(THREE, root) {
  if (!root || !THREE) return { upgraded: 0, ponds: 0 };
  const ponds = sinkPonds(THREE, root);
  const cache = new Map();
  let upgraded = 0;

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const meshName = (obj.name || "").toLowerCase();
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    let changed = false;
    const next = list.map((mat) => {
      if (!mat) return mat;
      const n = `${mat.name || ""} ${meshName}`.toLowerCase();
      if (!n.includes("water") || n.includes("water_bed")) return mat;
      if (mat.userData && (mat.userData.cityviewLiquid || mat.userData.cityviewPond)) return mat;
      let liq = cache.get(mat.uuid);
      if (!liq) {
        const deep = n.includes("water_deep") || n.includes("deep");
        const color = mat.color ? mat.color.clone() : new THREE.Color(deep ? 0x1a2e47 : 0x346f7a);
        if (THREE.MeshPhysicalMaterial) {
          // No transmission: any visible transmissive mesh makes three.js redraw the whole
          // opaque scene into a refraction target every frame (2× draw calls). A darker
          // tint over a thinner alpha gives the same see-through-to-the-bed look.
          color.multiplyScalar(deep ? 0.85 : 0.4);
          liq = new THREE.MeshPhysicalMaterial({
            color,
            roughness: deep ? 0.22 : 0.06,
            metalness: 0.0,
            ior: 1.333,
            transparent: true,
            opacity: deep ? 0.92 : 0.65,
            envMapIntensity: deep ? 0.55 : 1.05,
            side: THREE.DoubleSide,
            depthWrite: !deep,
          });
        } else {
          liq = mat.clone();
          liq.transparent = true;
          liq.opacity = deep ? 0.9 : 0.72;
          liq.roughness = deep ? 0.22 : 0.08;
          liq.metalness = 0.05;
          liq.envMapIntensity = 1.0;
        }
        liq.name = mat.name || (deep ? "water_deep" : "water_shallow");
        liq.userData = { ...(mat.userData || {}), cityview_shader: "pbr", cityviewLiquid: true };
        patchRipples(liq);
        cache.set(mat.uuid, liq);
        upgraded++;
      }
      changed = true;
      return liq;
    });
    if (changed) obj.material = Array.isArray(obj.material) ? next : next[0];
  });
  return { upgraded, ponds };
}

/**
 * Fragment-only shimmer in world XZ. No vertex displacement: water GLBs ship
 * meshopt-quantized (unit-cube positions under a node scale of 10–1000), so a
 * local-space ripple turned into metres-high swells that cut through the lawn.
 */
function patchRipples(mat, amount = 0.06, sheen = 0) {
  if (!mat || mat.userData.ripplePatched) return;
  mat.userData.ripplePatched = true;
  const prev = mat.onBeforeCompile;
  // Optional sky sheen for flat (up-facing) ponds: grazing views blend toward a blue taken from
  // the fog colour, which already follows day / night, instead of a GGX highlight that washes
  // out to white.
  const sheenGlsl = sheen
    ? `float fres = pow(1.0 - clamp(abs(normalize(vRippleView).y), 0.0, 1.0), 4.0);
        #ifdef USE_FOG
        outgoingLight = mix(outgoingLight, fogColor * vec3(0.22, 0.36, 0.5), fres * ${sheen.toFixed(3)});
        #endif`
    : "";
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.uniforms.uRippleTime = rippleTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec2 vRippleXZ;\nvarying vec3 vRippleView;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 rippleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRippleXZ = rippleWorld.xz;
        vRippleView = cameraPosition - rippleWorld;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uRippleTime;\nvarying vec2 vRippleXZ;\nvarying vec3 vRippleView;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float spark = sin(vRippleXZ.x * 1.3 + uRippleTime * 1.7) * sin(vRippleXZ.y * 1.1 - uRippleTime * 1.3);
        outgoingLight *= 1.0 + ${amount.toFixed(3)} * spark;
        ${sheenGlsl}
        #include <opaque_fragment>`,
      );
  };
  mat.needsUpdate = true;
}

let pondMat = null;
let bankMat = null;
let cutMat = null;

function pondMaterials(THREE) {
  if (!pondMat) {
    // Opaque: drawn before the lawn cutter, so it can never sort or z-fight with grass.
    // Lambert + sheen: a GGX surface catches the sun at grazing angles and reads as a white sheet.
    pondMat = new THREE.MeshLambertMaterial({ name: "water_pond", color: 0x173a3a });
    pondMat.userData = { cityview_shader: "lambert", cityviewPond: true };
    patchRipples(pondMat, 0.08, 0.4);
    bankMat = new THREE.MeshLambertMaterial({
      name: "pond_bank",
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    bankMat.userData = { cityview_shader: "lambert" };
    // Depth only; the bias lets the lawn-level cutter win over the coplanar grass.
    cutMat = new THREE.MeshBasicMaterial({
      name: "pond_cut",
      colorWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  }
  return { pondMat, bankMat, cutMat };
}

function hash01(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Edges used by exactly one triangle, in ``rel`` space, each with the third vertex
 * of its triangle (the water side). Handles quantized / indexed / plain geometry.
 */
function boundaryEdges(THREE, geom, rel) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  const v = new THREE.Vector3();
  const ids = new Map();
  const pts = [];
  const canon = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(rel);
    const key = `${Math.round(v.x * 500)}|${Math.round(v.z * 500)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = pts.length;
      ids.set(key, id);
      pts.push([v.x, v.y, v.z]);
    }
    canon[i] = id;
  }
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const edges = new Map();
  const vert = (k) => canon[idx ? idx.getX(k) : k];
  for (let t = 0; t < tri; t++) {
    const a = vert(t * 3);
    const b = vert(t * 3 + 1);
    const c = vert(t * 3 + 2);
    for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
      if (p === q) continue;
      const key = p < q ? `${p}|${q}` : `${q}|${p}`;
      const e = edges.get(key);
      if (e) e.n++;
      else edges.set(key, { n: 1, p, q, r });
    }
  }
  const out = [];
  for (const e of edges.values()) {
    if (e.n === 1) out.push({ a: pts[e.p], b: pts[e.q], c: pts[e.r] });
  }
  return { edges: out, pts, tri };
}

/** Triangle centroids (largest first) of a geometry in world space. */
function samplePoints(THREE, geom, world, max) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const list = [];
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(world);
    b.fromBufferAttribute(pos, i1).applyMatrix4(world);
    c.fromBufferAttribute(pos, i2).applyMatrix4(world);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    list.push({ area, x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3 });
  }
  list.sort((p, q) => q.area - p.area);
  return list.slice(0, max);
}

/**
 * Sink park ponds below the lawn. A pond is a shallow water mesh (``water_shallow``
 * bake) or a legacy ``water`` disc that lawn (``park_``) covers — the pre-hole bakes
 * draw Stadspark grass straight over Stadsparkvijver. Docks and the Scheldt are
 * left alone. Also sets RENDER_ORDER on lawn / courtyard meshes of every root.
 */
export function sinkPonds(THREE, root) {
  if (!root || !THREE) return 0;
  root.updateMatrixWorld(true);
  const waters = [];
  const lawns = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;
    const name = obj.name || "";
    if (LAWN_MESH.test(name)) {
      obj.renderOrder = RENDER_ORDER.lawn;
      if (/^park_/i.test(name)) lawns.push(obj);
      return;
    }
    if (YARD_MESH.test(name)) {
      obj.renderOrder = RENDER_ORDER.yard;
      return;
    }
    if (Array.isArray(obj.material) || !obj.material) return;
    const mat = (obj.material.name || "").toLowerCase();
    if (!/^water_/i.test(name) || /^water_bed/i.test(name)) return;
    if (mat === "water_shallow") waters.push({ obj, shallow: true });
    else if (mat === "water") waters.push({ obj, shallow: false });
  });
  if (!waters.length) return 0;

  const box = new THREE.Box3();
  const lawnBoxes = lawns.map((m) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    return box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).clone();
  });
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const { pondMat: surfMat, bankMat: kadeMat, cutMat: depthMat } = pondMaterials(THREE);

  const bank = { pos: [], nor: [], col: [] };
  const cutLawn = [];
  const cutYard = [];
  let sunk = 0;
  for (const { obj, shallow } of waters) {
    const geom = obj.geometry;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const wbox = box.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
    const waterY = wbox.max.y;
    const rootY = root.matrixWorld.elements[13];
    // Root-local lawn height: Z_PARK (0) for shallow bakes, measured under legacy discs.
    let lawnY = 0;
    if (!shallow) {
      // XZ overlap only: both discs are flat at different heights.
      const near = lawns.filter((_, i) => {
        const b = lawnBoxes[i];
        return b.min.x <= wbox.max.x && b.max.x >= wbox.min.x && b.min.z <= wbox.max.z && b.max.z >= wbox.min.z;
      });
      if (!near.length) continue;
      const samples = samplePoints(THREE, geom, obj.matrixWorld, 12);
      let covered = 0;
      let ySum = 0;
      ray.far = 10;
      for (const s of samples) {
        origin.set(s.x, waterY + 5, s.z);
        ray.set(origin, down);
        const hit = ray.intersectObjects(near, false)[0];
        if (hit && hit.point.y > waterY + 0.005) {
          covered++;
          ySum += hit.point.y;
        }
      }
      if (covered < samples.length * 0.5) continue;
      lawnY = ySum / covered - rootY;
    }
    rel.multiplyMatrices(inv, obj.matrixWorld);
    const { edges } = boundaryEdges(THREE, geom, rel);
    if (edges.length < 3) continue;
    const surfY = lawnY + POND_SURFACE_Y;

    // Surface: shift the disc down (works for quantized node-scaled meshes too).
    obj.position.y += surfY - (waterY - rootY);
    obj.updateMatrix();
    obj.updateMatrixWorld(true);
    obj.material = surfMat;
    obj.renderOrder = 0;

    // Cutters: the pond outline, triangulated like the surface, at lawn and yard height.
    const flat = (y) => {
      const g = new THREE.BufferGeometry();
      const p = geom.attributes.position;
      const out = new Float32Array(p.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(rel);
        out[i * 3] = v.x;
        out[i * 3 + 1] = y;
        out[i * 3 + 2] = v.z;
      }
      g.setAttribute("position", new THREE.BufferAttribute(out, 3));
      if (geom.index) g.setIndex(geom.index.clone());
      return g;
    };
    cutLawn.push(flat(lawnY));
    cutYard.push(flat(lawnY + CUT_HIGH_Y));

    // Kade: stone cap on the lawn side, stone face, then wet bank down past the surface.
    const ring = new Float32Array(edges.length * 4);
    edges.forEach((e, i) => {
      const [ax, , az] = e.a;
      const [bx, , bz] = e.b;
      ring.set([ax, az, bx, bz], i * 4);
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) return;
      let nx = -dz / len;
      let nz = dx / len;
      if (nx * (e.c[0] - ax) + nz * (e.c[2] - az) > 0) {
        nx = -nx;
        nz = -nz;
      }
      const steps = Math.max(1, Math.ceil(len / 0.9));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const x0 = ax + dx * t0;
        const z0 = az + dz * t0;
        const x1 = ax + dx * t1;
        const z1 = az + dz * t1;
        const tint = 0.86 + 0.22 * hash01(x0, z0);
        const cap = [0.56 * tint, 0.55 * tint, 0.5 * tint];
        const face = [0.42 * tint, 0.41 * tint, 0.38 * tint];
        const wet = [0.16, 0.17, 0.13];
        const top = lawnY + KADE_TOP_Y;
        const ox = nx * KADE_W;
        const oz = nz * KADE_W;
        quad(bank, [x0, top, z0], [x1, top, z1], [x1 + ox, top, z1 + oz], [x0 + ox, top, z0 + oz], [0, 1, 0], cap);
        quad(bank, [x0, lawnY + KADE_FACE_Y, z0], [x1, lawnY + KADE_FACE_Y, z1], [x1, top, z1], [x0, top, z0], [-nx, 0, -nz], face);
        quad(bank, [x0, lawnY + BANK_FOOT_Y, z0], [x1, lawnY + BANK_FOOT_Y, z1], [x1, lawnY + KADE_FACE_Y, z1], [x0, lawnY + KADE_FACE_Y, z0], [-nx, 0, -nz], wet);
      }
    });
    registerPond(root, obj, ring, lawnY);
    sunk++;
  }
  if (!sunk) return 0;

  const bankGeom = new THREE.BufferGeometry();
  bankGeom.setAttribute("position", new THREE.Float32BufferAttribute(bank.pos, 3));
  bankGeom.setAttribute("normal", new THREE.Float32BufferAttribute(bank.nor, 3));
  bankGeom.setAttribute("color", new THREE.Float32BufferAttribute(bank.col, 3));
  bankGeom.computeBoundingSphere();
  const bankMesh = new THREE.Mesh(bankGeom, kadeMat);
  bankMesh.name = "pond_bank";
  const added = [bankMesh];
  for (const [list, order, name] of [
    [cutLawn, RENDER_ORDER.cutLawn, "pond_cut_lawn"],
    [cutYard, RENDER_ORDER.cutYard, "pond_cut_yard"],
  ]) {
    const g = mergeFlat(THREE, list);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, depthMat);
    m.name = name;
    m.renderOrder = order;
    added.push(m);
  }
  for (const m of added) {
    root.add(m);
    m.castShadow = false;
    m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.updateMatrixWorld(true);
  }
  return sunk;
}

function quad(out, a, b, c, d, n, col) {
  for (const p of [a, b, c, a, c, d]) {
    out.pos.push(p[0], p[1], p[2]);
    out.nor.push(n[0], n[1], n[2]);
    out.col.push(col[0], col[1], col[2]);
  }
}

function mergeFlat(THREE, list) {
  let verts = 0;
  let indices = 0;
  for (const g of list) {
    verts += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(verts * 3);
  const index = new Uint32Array(indices);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position;
    pos.set(p.array, vo * 3);
    const n = g.index ? g.index.count : p.count;
    for (let i = 0; i < n; i++) index[io + i] = vo + (g.index ? g.index.getX(i) : i);
    vo += p.count;
    io += n;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

/** Wade ring for a sunk pond: boundary edges in world XZ (crossing test needs no loop order). */
function registerPond(root, obj, ringLocal, lawnY) {
  const m = root.matrixWorld.elements;
  const edges = new Float32Array(ringLocal.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < ringLocal.length; i += 2) {
    const lx = ringLocal[i];
    const lz = ringLocal[i + 1];
    const x = m[0] * lx + m[8] * lz + m[12];
    const z = m[2] * lx + m[10] * lz + m[14];
    edges[i] = x;
    edges[i + 1] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const key = `${obj.name}|${Math.round(minX)}|${Math.round(minZ)}`;
  const i = sunkPonds.findIndex((p) => p.key === key);
  const pond = { key, edges, minX, maxX, minZ, maxZ, bed_y: lawnY + m[13] + POND_BED_Y };
  if (i >= 0) sunkPonds[i] = pond;
  else sunkPonds.push(pond);
}

function insideEdges(x, z, e) {
  let inside = false;
  for (let i = 0; i < e.length; i += 4) {
    const x1 = e[i];
    const z1 = e[i + 1];
    const x2 = e[i + 2];
    const z2 = e[i + 3];
    if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / ((z2 - z1) || 1e-12) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function sunkPondAt(x, z) {
  for (const p of sunkPonds) {
    if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
    if (insideEdges(x, z, p.edges)) return p;
  }
  return null;
}

/**
 * @param {{ THREE?: object, url?: string }} [opts]
 */
export async function createWater(opts = {}) {
  /** @type {{ minX:number,maxX:number,minZ:number,maxZ:number,ring:Float32Array,wade:boolean,depth_m:number,kind:string }[]} */
  const bodies = [];
  const url = opts.url || "./water.json";
  try {
    const res = await fetchJsonCached(url);
    if (res.ok) {
      const doc = await res.json();
      for (const b of doc.bodies || []) {
        const pts = b.ring || [];
        if (pts.length < 3) continue;
        const geom = ringFromPts(pts);
        const deep = b.depth === "deep" || b.wade === false;
        const bedY = Number(b.bed_y);
        bodies.push({
          ...geom,
          wade: b.wade !== false && !deep,
          depth_m: Number(b.depth_m) || (deep ? 0 : 0.3),
          bed_y: Number.isFinite(bedY) ? bedY : deep ? 0 : DEFAULT_BED_Y,
          bank: String(b.bank || "natural"),
          kind: String(b.kind || "pond"),
          deep,
        });
      }
    }
  } catch {
    console.warn("[metropolis] water.json unavailable — ponds stay visual-only");
  }

  function at(x, z) {
    const pond = sunkPondAt(x, z);
    if (pond) {
      return {
        kind: "pond",
        deep: false,
        wade: true,
        bed_y: pond.bed_y,
        bank: "built",
        sink_m: Math.min(0.45, POND_SURFACE_Y - POND_BED_Y),
        footScale: WADE_FOOT,
      };
    }
    for (const b of bodies) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (!pointInRing(x, z, b.ring)) continue;
      if (b.deep || !b.wade) {
        return {
          kind: b.kind,
          deep: true,
          wade: false,
          bed_y: 0,
          bank: b.bank,
          sink_m: 0,
          footScale: 1,
        };
      }
      // Stand on the silt bed — do not derive Y from groundAt (clamped ≥ 0).
      const bed = Number.isFinite(b.bed_y) ? b.bed_y : DEFAULT_BED_Y;
      return {
        kind: b.kind,
        deep: false,
        wade: true,
        bed_y: bed,
        bank: b.bank,
        sink_m: Math.min(0.45, Math.max(0.08, -bed)),
        footScale: WADE_FOOT,
      };
    }
    return null;
  }

  /** Soft barrier for deep water (same slide pattern as outdoors.rejectIfIndoors). */
  function rejectIfDeep(pos, before) {
    const hit = at(pos.x, pos.z);
    if (!hit || !hit.deep) return false;
    const tryX = { x: pos.x, z: before.z };
    const tryZ = { x: before.x, z: pos.z };
    if (!at(tryX.x, tryX.z)?.deep) {
      pos.x = tryX.x;
      pos.z = tryX.z;
    } else if (!at(tryZ.x, tryZ.z)?.deep) {
      pos.x = tryZ.x;
      pos.z = tryZ.z;
    } else {
      pos.x = before.x;
      pos.z = before.z;
    }
    const still = at(pos.x, pos.z);
    if (still?.deep) {
      for (const b of bodies) {
        if (!b.deep) continue;
        if (pos.x < b.minX || pos.x > b.maxX || pos.z < b.minZ || pos.z > b.maxZ) continue;
        if (!pointInRing(pos.x, pos.z, b.ring)) continue;
        const edge = nearestEdge(pos.x, pos.z, b);
        pos.x = edge.x;
        pos.z = edge.z;
        break;
      }
    }
    return true;
  }

  function update(dt) {
    void dt;
  }

  /** Advance the shared shimmer clock once per frame (``root`` kept for old callers). */
  function tickRipples(root, dt) {
    void root;
    rippleTime.value = (rippleTime.value + (Number(dt) || 0) * RIPPLE_SPEED) % 10000;
  }

  return {
    ready: bodies.length > 0 || sunkPonds.length > 0,
    count: bodies.length,
    get ponds() {
      return sunkPonds.length;
    },
    at,
    rejectIfDeep,
    update,
    tickRipples,
    applyLiquidMaterials,
  };
}
