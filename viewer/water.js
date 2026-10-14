/**
 * Shallow park water: liquid look + wade (slow creep on the silt bed).
 * Deep water (Scheldt, docks): push the walker out — no swimming yet.
 *
 * Rings come from water.json (Blender XY → Three z = −y), same as outdoors.js.
 * Feet sit at ``bed_y`` (soil), not at groundAt−sink (which clamps to ≥0).
 */

import { fetchJsonCached } from "./json-cache.js";

const WADE_FOOT = 0.48; // share of walk speed while in shallow water
const RIPPLE_SPEED = 1.35;
const DEFAULT_BED_Y = -0.28; // keep in sync with cityview.water.BED_Y / Blender Z_WATER_BED

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
 * Upgrade baked water materials to a cheap liquid (transmission + ripples).
 * Safe on already-merged tile batches: matches material / mesh name.
 */
export function applyLiquidMaterials(THREE, root) {
  if (!root || !THREE) return { upgraded: 0 };
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
      if (mat.userData && mat.userData.cityviewLiquid) return mat;
      let liq = cache.get(mat.uuid);
      if (!liq) {
        const deep = n.includes("water_deep") || n.includes("deep");
        const color = mat.color ? mat.color.clone() : new THREE.Color(deep ? 0x1a2e47 : 0x346f7a);
        if (THREE.MeshPhysicalMaterial) {
          liq = new THREE.MeshPhysicalMaterial({
            color,
            roughness: deep ? 0.22 : 0.06,
            metalness: 0.0,
            transmission: deep ? 0.15 : 0.72,
            thickness: deep ? 2.5 : 0.45,
            ior: 1.333,
            transparent: true,
            opacity: deep ? 0.92 : 0.78,
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
  return { upgraded };
}

function patchRipples(mat) {
  if (!mat || mat.userData.ripplePatched) return;
  mat.userData.ripplePatched = true;
  mat.userData.rippleTime = { value: 0 };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    if (typeof prev === "function") prev(shader);
    shader.uniforms.uRippleTime = mat.userData.rippleTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uRippleTime;\nvarying vec2 vRippleUv;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vRippleUv = vec2(position.x, position.z) * 0.085;
        float rip = sin(vRippleUv.x * 6.0 + uRippleTime * 1.7) * 0.012
                  + sin(vRippleUv.y * 5.0 - uRippleTime * 1.3) * 0.010;
        transformed.y += rip;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uRippleTime;\nvarying vec2 vRippleUv;`,
      )
      .replace(
        "#include <output_fragment>",
        `float spark = 0.04 * sin(vRippleUv.x * 18.0 + uRippleTime * 2.1)
                     * sin(vRippleUv.y * 16.0 - uRippleTime * 1.6);
        outgoingLight += spark;
        #include <output_fragment>`,
      );
    mat.userData.shader = shader;
  };
  mat.needsUpdate = true;
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
    const t = (performance.now() * 0.001 * RIPPLE_SPEED) % 1000;
    // Materials patched in applyLiquidMaterials hold a shared time uniform per mat.
    // Nothing else to do here unless we keep a list — traverse is too heavy.
    void t;
    void dt;
  }

  /** Advance ripple clocks on liquid materials under root (call once per frame). */
  function tickRipples(root, dt) {
    if (!root) return;
    const step = Number(dt) || 0;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        if (m?.userData?.rippleTime) m.userData.rippleTime.value += step * RIPPLE_SPEED;
      }
    });
  }

  return {
    ready: bodies.length > 0,
    count: bodies.length,
    at,
    rejectIfDeep,
    update,
    tickRipples,
    applyLiquidMaterials,
  };
}
