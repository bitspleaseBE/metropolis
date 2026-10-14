/**
 * Sole contact for skinned humanoids. The foot bone sits at the ankle, a hand's width
 * above the shoe, so grounding on it buries the feet. The heel and toe tip are read off
 * the skinned mesh once, in the bind pose (soles flat), and kept in foot-bone space.
 * Each frame the supporting foot is turned flat and the body lifted so the lowest sole
 * touches the floor.
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
    out.push({ bone, heel: local(heel), tip: local(tip), ball: local(ball || tip), drop: ankle.y - floor });
  }
  return out;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Per-frame sole contact. `plant(root, { still })` flattens the supporting foot (both
 * when `still`) and returns how far the body must rise for the lowest sole to sit on
 * root.position.y. Call after the mixer, with world matrices current.
 */
export function createFootPlant(THREE, soles) {
  const heel = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const ball = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const level = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  const ankles = soles.map(() => 0);

  return function plant(root, { still = false } = {}) {
    for (let i = 0; i < soles.length; i++) {
      ankle.setFromMatrixPosition(soles[i].bone.matrixWorld);
      ankles[i] = ankle.y;
    }
    let floor = Infinity;
    for (let i = 0; i < soles.length; i++) {
      const s = soles[i];
      const other = soles.length > 1 ? ankles[1 - i] : ankles[i] + 1;
      // The foot carrying the body is the lower one while the other swings. At the
      // hand-over both are down, and the heel strike and toe-off keep their roll.
      const w = still ? 1 : smooth(0.015, 0.07, other - ankles[i]);
      heel.copy(s.heel).applyMatrix4(s.bone.matrixWorld);
      tip.copy(s.tip).applyMatrix4(s.bone.matrixWorld);
      if (w > 1e-3) {
        dir.subVectors(tip, heel);
        flat.set(dir.x, 0, dir.z);
        if (dir.lengthSq() > 1e-8 && flat.lengthSq() > 1e-8) {
          level.setFromUnitVectors(dir.normalize(), flat.normalize());
          turn.slerpQuaternions(ident, level, w);
          s.bone.getWorldQuaternion(worldQ).premultiply(turn);
          s.bone.parent.getWorldQuaternion(parentQ);
          s.bone.quaternion.copy(parentQ.invert().multiply(worldQ));
          s.bone.updateMatrixWorld(true);
          heel.copy(s.heel).applyMatrix4(s.bone.matrixWorld);
          tip.copy(s.tip).applyMatrix4(s.bone.matrixWorld);
        }
      }
      ball.copy(s.ball).applyMatrix4(s.bone.matrixWorld);
      floor = Math.min(floor, heel.y, tip.y, ball.y);
    }
    return root.position.y - floor;
  };
}
