/**
 * Bend a seated rider's spine toward the handlebars. The riding clip sits up
 * straight or even leans back, so the hands can't reach the grips. The hips and
 * back fold forward about the saddle, and the head tips back up to keep looking
 * ahead. Shared by viewer/players.js and viewer/movement.html so the
 * gallery shows the same pose as the game.
 */

function dist(THREE, a, b) {
  a.updateWorldMatrix(true, false);
  const pa = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
  if (b.isVector3) return pa.distanceTo(b);
  b.updateWorldMatrix(true, false);
  return pa.distanceTo(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
}

/**
 * The riding clips key only some spine bones. Undo last frame's lean on a bone
 * the mixer left alone, so the lean never stacks from frame to frame.
 */
function takeBase(THREE, bone) {
  const u = bone.userData;
  if (u.leanOut && u.leanIn && Math.abs(bone.quaternion.dot(u.leanOut)) > 0.999999) {
    bone.quaternion.copy(u.leanIn);
    bone.updateMatrix();
  }
  u.leanIn = (u.leanIn || new THREE.Quaternion()).copy(bone.quaternion);
}

function keepOut(THREE, bone) {
  bone.userData.leanOut = (bone.userData.leanOut || new THREE.Quaternion()).copy(bone.quaternion);
}

function turnWorld(THREE, bone, axis, angle) {
  if (!bone?.parent || Math.abs(angle) < 1e-5) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const world = new THREE.Quaternion();
  const parent = new THREE.Quaternion();
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(world);
  bone.parent.getWorldQuaternion(parent);
  world.premultiply(q);
  bone.quaternion.copy(parent.invert()).multiply(world);
  bone.updateMatrix();
  bone.updateMatrixWorld(true);
}

/**
 * @param {object} THREE
 * @param {{ spine: object[], head?: object, arms: object[][] }} rig
 *   spine = pelvis and spine bones, root first (the hips tip as well as the back);
 *   arms = [[upper, fore, hand], ...] in the same order as `grips`.
 * @param {import("three").Vector3[]} grips  world grip points
 * @param {import("three").Vector3} axis  world unit axis, up × rider forward
 * @param {{ reach?: number, max?: number }} [opts]
 *   reach: fraction of the arm the shoulder may sit from its grip. max: radians.
 * @returns {number} the lean applied, in radians
 */
export function leanToBars(THREE, rig, grips, axis, opts = {}) {
  const spine = (rig.spine || []).filter(Boolean);
  if (!spine.length) return 0;
  const touched = rig.head ? [...spine, rig.head] : spine;
  for (const bone of touched) takeBase(THREE, bone);
  spine[0].parent?.updateMatrixWorld(true);
  const reach = opts.reach ?? 0.96;
  const max = opts.max ?? 1.7;
  const arms = rig.arms.map(([upper, fore, hand]) =>
    upper && fore && hand ? { upper, len: dist(THREE, upper, fore) + dist(THREE, fore, hand) } : null
  );
  const short = () => {
    let worst = -Infinity;
    arms.forEach((arm, i) => {
      if (arm && grips[i]) worst = Math.max(worst, dist(THREE, arm.upper, grips[i]) - arm.len * reach);
    });
    return worst;
  };
  let total = 0;
  for (let i = 0; i < 8; i++) {
    const gap = short();
    if (!(gap > 0.01)) break;
    const step = Math.min(0.3, gap / 0.4, max - total);
    if (step < 1e-3) break;
    for (const bone of spine) turnWorld(THREE, bone, axis, step / spine.length);
    total += step;
  }
  if (rig.head && total > 0) turnWorld(THREE, rig.head, axis, -total * 0.7);
  for (const bone of touched) keepOut(THREE, bone);
  return total;
}
