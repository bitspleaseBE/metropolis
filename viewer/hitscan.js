/**
 * Bullets, GTA style: the camera ray through the crosshair decides what you aim at,
 * then a second ray from the muzzle to that point decides what you actually hit, so
 * cover right in front of the gun still blocks the shot.
 *
 * Characters are a vertical cylinder body plus a head sphere. Targets are plain
 * objects `{ x, y, z, r, h, kind, ref }` with feet at y. World geometry is raycast
 * meshes plus an optional `solidAt(x, y, z)` sampler (building footprints).
 */
import { ADULT_M } from "./person-scale.js";

const HEAD_R = 0.13;
// Up to the neck, overlapping the head sphere so a level shot can't slip between them.
const BODY_TOP = 0.87;
const STEP = 0.6;

export function createHitscan(THREE, opts = {}) {
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const basisU = new THREE.Vector3();
  const basisV = new THREE.Vector3();

  function hitCharacter(o, d, t, best) {
    const sx = o.x - t.x;
    const sz = o.z - t.z;
    const a = d.x * d.x + d.z * d.z;
    // Head first: a headshot wins over a body hit at nearly the same distance.
    const headY = t.y + t.h * 0.92;
    const hr = (t.headR ?? HEAD_R) * (t.h / ADULT_M);
    const hx = o.x - t.x;
    const hy = o.y - headY;
    const hz = o.z - t.z;
    const b2 = hx * d.x + hy * d.y + hz * d.z;
    const c2 = hx * hx + hy * hy + hz * hz - hr * hr;
    const disc2 = b2 * b2 - c2;
    if (disc2 >= 0) {
      const s = -b2 - Math.sqrt(disc2);
      if (s > 0 && s < best.dist) {
        best.dist = s;
        best.target = t;
        best.head = true;
        best.normal = null;
      }
    }
    if (a < 1e-9) return;
    const b = sx * d.x + sz * d.z;
    const c = sx * sx + sz * sz - t.r * t.r;
    const disc = b * b - a * c;
    if (disc < 0) return;
    const s = (-b - Math.sqrt(disc)) / a;
    if (s <= 0 || s >= best.dist - 0.05) return;
    const y = o.y + d.y * s;
    if (y < t.y || y > t.y + t.h * BODY_TOP) return;
    best.dist = s;
    best.target = t;
    best.head = false;
    best.normal = null;
  }

  /**
   * First hit along a ray. `targets` is an array (or iterable) of characters.
   * Returns { dist, point, normal, target, head, object } (target/object null on a miss).
   */
  function cast(origin, direction, maxDist, targets = [], skip = null) {
    const best = { dist: maxDist, target: null, head: false, normal: null, object: null };
    for (const t of targets) {
      if (!t || t.dead || t === skip) continue;
      const dx = t.x - origin.x;
      const dz = t.z - origin.z;
      if (dx * dx + dz * dz > (maxDist + 2) * (maxDist + 2)) continue;
      hitCharacter(origin, direction, t, best);
    }
    const meshes = opts.occluders?.();
    if (meshes?.length) {
      ray.set(origin, direction);
      ray.far = best.dist;
      ray.near = 0.02;
      const h = ray.intersectObjects(meshes, true)[0];
      if (h && h.distance < best.dist) {
        best.dist = h.distance;
        best.target = null;
        best.head = false;
        best.object = h.object;
        best.normal = h.face ? tmp.copy(h.face.normal).transformDirection(h.object.matrixWorld).clone() : null;
      }
    }
    if (opts.solidAt) {
      for (let s = STEP; s < best.dist; s += STEP) {
        v.copy(direction).multiplyScalar(s).add(origin);
        if (opts.solidAt(v.x, v.y, v.z)) {
          // Back up to the wall face; good enough for a puff of dust.
          best.dist = Math.max(0.05, s - STEP * 0.5);
          best.target = null;
          best.head = false;
          best.object = "building";
          best.normal = new THREE.Vector3(-direction.x, 0, -direction.z).normalize();
          break;
        }
      }
    }
    const ground = opts.groundY?.(origin.x, origin.z);
    if (ground != null && direction.y < -1e-4) {
      const s = (ground - origin.y) / direction.y;
      if (s > 0 && s < best.dist) {
        best.dist = s;
        best.target = null;
        best.head = false;
        best.object = "ground";
        best.normal = new THREE.Vector3(0, 1, 0);
      }
    }
    best.point = new THREE.Vector3().copy(direction).multiplyScalar(best.dist).add(origin);
    best.hit = !!(best.target || best.object);
    return best;
  }

  /** Random direction within a cone of half-angle `deg` around `d` (uniform over the disk). */
  function jitter(d, deg, out = new THREE.Vector3()) {
    out.copy(d);
    if (!(deg > 0)) return out;
    const helper = Math.abs(d.y) < 0.95 ? tmp.set(0, 1, 0) : tmp.set(1, 0, 0);
    basisU.crossVectors(d, helper).normalize();
    basisV.crossVectors(basisU, d).normalize();
    const r = Math.tan((deg * Math.PI) / 180) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return out.addScaledVector(basisU, Math.cos(a) * r).addScaledVector(basisV, Math.sin(a) * r).normalize();
  }

  /**
   * One trigger pull. `camPos`/`camDir` is the crosshair ray, `muzzle` the barrel tip.
   * Returns one result per pellet with `from` (muzzle) and `point` for tracers.
   */
  function shoot({ camPos, camDir, muzzle, spread = 0, pellets = 1, range = 100, targets = [], skip = null }) {
    const out = [];
    for (let i = 0; i < pellets; i++) {
      jitter(camDir, spread, dir);
      // Start the camera ray at the player's depth so nothing behind them is aimed at.
      const lead = Math.max(0, tmp.copy(muzzle).sub(camPos).dot(dir));
      const o = camPos.clone().addScaledVector(dir, lead);
      const aim = cast(o, dir, range, targets, skip);
      const to = aim.point;
      const md = new THREE.Vector3().subVectors(to, muzzle);
      const len = md.length();
      if (len < 1e-3) {
        out.push({ ...aim, from: muzzle.clone() });
        continue;
      }
      md.divideScalar(len);
      const real = cast(muzzle, md, Math.max(0.01, len + (aim.hit ? 0.05 : 0)), targets, skip);
      out.push({ ...(real.hit ? real : aim), from: muzzle.clone(), dist: muzzle.distanceTo(real.hit ? real.point : to) });
    }
    return out;
  }

  /**
   * What sits under the crosshair right now (red reticle, aim assist). Cheap: only
   * characters, no world raycast past the first wall check.
   */
  function probe(camPos, camDir, range, targets) {
    return cast(camPos, camDir, range, targets);
  }

  return { cast, shoot, jitter, probe };
}
