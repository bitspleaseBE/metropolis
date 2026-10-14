/**
 * Sole contact for skinned humanoids. The foot bone sits at the ankle, a hand's width
 * above the shoe, so grounding on it buries the feet. The heel and toe tip are read off
 * the skinned mesh once, in the bind pose (soles flat), and kept in foot-bone space.
 * Each frame the supporting foot is turned flat, the body set so the standing ankle sits
 * at level-sole height, and any toe or heel still under the floor tipped back up.
 */

/** Lowest skinned vertex height of `root` in its current pose, world space. */
export function skinnedFloor(THREE, root) {
  root.updateMatrixWorld(true);
  let floor = Infinity;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      if (v.y < floor) floor = v.y;
    }
  });
  return floor;
}

/**
 * Heel and toe-tip contact points of each foot, in that foot bone's local space.
 * Call in the bind pose. Returns null when the mesh has no vertices on the feet.
 */
export function captureSoles(THREE, root, feet) {
  root.updateMatrixWorld(true);
  const sides = feet.filter(Boolean).map((bone) => {
    const own = new Set();
    bone.traverse((b) => b.isBone && own.add(b));
    return { bone, own, pts: [] };
  });
  if (!sides.length) return null;
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const bones = o.skeleton.bones;
    const si = o.geometry.attributes.skinIndex;
    const sw = o.geometry.attributes.skinWeight;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) {
          bw = w;
          best = si.getComponent(i, k);
        }
      }
      const side = sides.find((s) => s.own.has(bones[best]));
      if (!side) continue;
      side.pts.push(o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).clone());
    }
  });
  const out = [];
  for (const { bone, pts } of sides) {
    if (pts.length < 8) return null;
    const floor = Math.min(...pts.map((p) => p.y));
    const ankle = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    // Trouser hems are skinned to the foot too; the shoe is what hangs below the ankle.
    const shoe = pts.filter((p) => p.y < ankle.y - 0.02);
    if (shoe.length < 8) return null;
    let far = shoe[0];
    let reach = -1;
    for (const p of shoe) {
      const d = Math.hypot(p.x - ankle.x, p.z - ankle.z);
      if (d > reach) {
        reach = d;
        far = p;
      }
    }
    const ax = (far.x - ankle.x) / (reach || 1);
    const az = (far.z - ankle.z) / (reach || 1);
    const along = shoe.map((p) => (p.x - ankle.x) * ax + (p.z - ankle.z) * az);
    const lo = Math.min(...along);
    const span = reach - lo;
    // The bottom of the heel and of the toe cap. A pointed bind foot keeps them at
    // different heights, so flat means levelling these two, not the bind.
    const lowest = (keep) => {
      let best = null;
      shoe.forEach((p, i) => {
        if (keep(along[i]) && (!best || p.y < best.y)) best = p;
      });
      return best;
    };
    const heel = lowest((a) => a < lo + span * 0.15);
    const tip = lowest((a) => a > reach - span * 0.15);
    const ball = lowest((a) => a > lo + span * 0.55 && a < reach - span * 0.15);
    if (!heel || !tip) return null;
    const local = (p) => bone.worldToLocal(p.clone());
    const h = local(heel);
    const t = local(tip);
    const b = local(ball || tip);
    // Ankle height over a level sole, in world units: its distance to the heel–toe line,
    // or deeper where the ball hangs below that line.
    const sole = t.clone().sub(h);
    const down = h.clone().sub(sole.clone().multiplyScalar(h.dot(sole) / sole.lengthSq()));
    const lineDrop = down.length();
    const scale = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x;
    const stand = Math.max(lineDrop, b.dot(down) / (lineDrop || 1)) * scale;
    out.push({ bone, heel: h, tip: t, ball: b, drop: ankle.y - floor, stand });
  }
  return out;
}

/**
 * Per foot, the local turn that levels a pointed bind sole. Clips play as offsets from
 * the bind, so a toe-down bind points every swing foot at the floor; this undoes it.
 * Call in the bind pose with the soles from `captureSoles`.
 */
export function soleLevelers(THREE, soles) {
  return soles.map((s) => {
    s.bone.updateWorldMatrix(true, false);
    const heel = s.heel.clone().applyMatrix4(s.bone.matrixWorld);
    const tip = s.tip.clone().applyMatrix4(s.bone.matrixWorld);
    const dir = tip.sub(heel);
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (dir.lengthSq() < 1e-8 || flat.lengthSq() < 1e-8) return { bone: s.bone, q: new THREE.Quaternion(), pitch: 0 };
    const world = new THREE.Quaternion().setFromUnitVectors(dir.normalize(), flat.normalize());
    const boneQ = s.bone.getWorldQuaternion(new THREE.Quaternion());
    const q = boneQ.clone().invert().multiply(world).multiply(boneQ);
    return { bone: s.bone, q, pitch: Math.asin(Math.min(1, Math.max(-1, -dir.y))) };
  });
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Per-frame sole contact. `plant(root, { still })` flattens the supporting foot (both
 * when `still`) and returns how far the body must rise for the lower ankle to stand at
 * its level-sole height, which keeps the clip's own hip motion. After the body is
 * placed, `plant.clamp(root)` tips any heel or toe that still dips under the floor back
 * up to it, turning the foot about the ankle rather than lifting the body.
 * Call after the mixer, with world matrices current.
 */
const MAX_PITCH = (40 * Math.PI) / 180;
const PITCH_GIVE = 0.35;

export function createFootPlant(THREE, soles) {
  const heel = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const r = new THREE.Vector3();
  const to = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pt = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const level = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  const ankles = soles.map(() => 0);

  const rotateFoot = (bone, q) => {
    bone.getWorldQuaternion(worldQ).premultiply(q);
    bone.parent.getWorldQuaternion(parentQ);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateMatrixWorld(true);
  };

  function plant(root, { still = false } = {}) {
    for (let i = 0; i < soles.length; i++) {
      ankle.setFromMatrixPosition(soles[i].bone.matrixWorld);
      ankles[i] = ankle.y;
    }
    let want = -Infinity;
    for (let i = 0; i < soles.length; i++) {
      const s = soles[i];
      // Mocap toe-offs point the foot near vertical; past a natural push-off angle,
      // ease the pitch back so the swing foot trails rather than dangles.
      heel.copy(s.heel).applyMatrix4(s.bone.matrixWorld);
      tip.copy(s.tip).applyMatrix4(s.bone.matrixWorld);
      dir.subVectors(tip, heel);
      flat.set(dir.x, 0, dir.z);
      const run = flat.length();
      const pitch = Math.atan2(-dir.y, run);
      if (pitch > MAX_PITCH && run > 1e-6) {
        const eased = MAX_PITCH + (pitch - MAX_PITCH) * PITCH_GIVE;
        flat.multiplyScalar(Math.cos(eased) / run).addScaledVector(up, -Math.sin(eased));
        turn.setFromUnitVectors(dir.normalize(), flat);
        rotateFoot(s.bone, turn);
      }
      const other = soles.length > 1 ? ankles[1 - i] : ankles[i] + 1;
      // The foot carrying the body is the lower one while the other swings. At the
      // hand-over both are down, and the heel strike and toe-off keep their roll.
      const w = still ? 1 : smooth(0.015, 0.07, other - ankles[i]);
      want = Math.max(want, s.stand - (ankles[i] - root.position.y));
      if (w <= 1e-3) continue;
      heel.copy(s.heel).applyMatrix4(s.bone.matrixWorld);
      tip.copy(s.tip).applyMatrix4(s.bone.matrixWorld);
      dir.subVectors(tip, heel);
      flat.set(dir.x, 0, dir.z);
      if (dir.lengthSq() < 1e-8 || flat.lengthSq() < 1e-8) continue;
      level.setFromUnitVectors(dir.normalize(), flat.normalize());
      turn.slerpQuaternions(ident, level, w);
      rotateFoot(s.bone, turn);
    }
    return want;
  }

  plant.clamp = (root, pad = 0) => {
    const floor = root.position.y + pad;
    for (const s of soles) {
      // Two passes: lifting the toe can drop the heel, and the other way round.
      for (let pass = 0; pass < 2; pass++) {
        let low = null;
        let lowY = floor;
        for (const local of [s.heel, s.ball, s.tip]) {
          pt.copy(local).applyMatrix4(s.bone.matrixWorld);
          if (pt.y < lowY) {
            lowY = pt.y;
            low = local;
          }
        }
        if (!low) break;
        ankle.setFromMatrixPosition(s.bone.matrixWorld);
        pt.copy(low).applyMatrix4(s.bone.matrixWorld);
        r.subVectors(pt, ankle);
        const u = floor - ankle.y;
        fwd.set(r.x, 0, r.z);
        const f = fwd.length();
        if (f < 1e-5) break;
        fwd.multiplyScalar(1 / f);
        // Keep the reach in the foot's vertical plane, swing the point up to the floor.
        const reach = Math.hypot(f, r.y);
        if (u >= 0 || -u > reach) break;
        const along = Math.sqrt(Math.max(0, reach * reach - u * u));
        to.copy(fwd).multiplyScalar(along).addScaledVector(up, u);
        if (to.lengthSq() < 1e-10) break;
        turn.setFromUnitVectors(r.normalize(), to.normalize());
        rotateFoot(s.bone, turn);
      }
    }
  };

  return plant;
}
