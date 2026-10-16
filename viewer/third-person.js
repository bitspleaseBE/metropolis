/**
 * Third-person boom camera: look is instant, boom position lags, looks along the
 * aim ray (crosshair stays screen-center), pulls in when a building blocks the boom.
 */

import { EYE_M } from "./person-scale.js";

export function createThirdPersonCamera(THREE, camera, getOutdoors = () => null) {
  const lookYaw = { value: 0 };
  const lookPitch = { value: 0.14 };
  const desired = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const probe = new THREE.Vector3();

  // Tuned to OpenWorldPlay Züri (zurich.openworldplay.com): boom sits higher than the
  // chest probe so the body stays in the lower-middle of the frame under the crosshair.
  const DIST = 4.4;
  const SIDE = 0.3;
  const CHEST_Y = 1.45; // pull-in / occlusion probe (Züri M.y + 1.45)
  const BOOM_Y = 1.65; // upright boom height (Züri n.y + 1.65 when standing)
  const FOV_WALK = 58;
  const FOV_TIGHT = 48;
  const PITCH_MIN = -0.5;
  const PITCH_MAX = 0.72;
  const LOOK_X = 0.0025;
  const LOOK_Y = 0.002;

  // GTA V on foot with a gun: closer, further right; aiming: tight over the right shoulder.
  const ARMED = { dist: 3.5, side: 0.42, y: 1.6, fov: 55 };
  const AIM = { dist: 1.9, side: 0.47, y: 1.62, fov: 42 };
  const AIM_LOOK = 0.62;

  let fov = FOV_WALK;
  let snapped = false;
  let armedK = 0;
  let aimK = 0;
  let trauma = 0;
  let shakeT = 0;
  let kickPitch = 0;
  let kickYaw = 0;
  /** Recoil climb not yet recovered. Sustained fire caps it; letting go settles most of it. */
  let climb = 0;
  let sinceKick = 9;
  const CLIMB_MAX = 0.09;

  function applyLook(dx, dy) {
    const s = 1 - (1 - AIM_LOOK) * aimK;
    lookYaw.value -= dx * LOOK_X * s;
    lookPitch.value = Math.max(PITCH_MIN, Math.min(PITCH_MAX, lookPitch.value + dy * LOOK_Y * s));
  }

  /**
   * Recoil in degrees. Most of it climbs the aim (you pull it back down), the rest
   * is a quick visual kick that springs back.
   */
  function recoil(pitchDeg, yawDeg = 0, shake = 0) {
    const p = (pitchDeg * Math.PI) / 180;
    const y = (yawDeg * Math.PI) / 180;
    const before = lookPitch.value;
    lookPitch.value = Math.max(PITCH_MIN, lookPitch.value - p * 0.55);
    climb += before - lookPitch.value;
    sinceKick = 0;
    lookYaw.value += y * 0.55;
    kickPitch += p * 0.45;
    kickYaw += y * 0.45;
    trauma = Math.min(1, trauma + shake);
  }

  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function setYaw(y) {
    lookYaw.value = y;
  }

  function yaw() {
    return lookYaw.value;
  }

  function pitch() {
    return lookPitch.value;
  }

  function mix3(free, armed, aim) {
    const hip = free + (armed - free) * armedK;
    return hip + (aim - hip) * aimK;
  }

  /** Desired boom position behind the player (world). */
  function desiredPosition(playerPos, boomY = BOOM_Y) {
    const yaw = lookYaw.value;
    const pitch = lookPitch.value;
    const o = mix3(DIST, ARMED.dist, AIM.dist);
    const a = mix3(SIDE, ARMED.side, AIM.side);
    desired.set(
      playerPos.x + Math.sin(yaw) * o + Math.cos(yaw) * a,
      Math.max(0.45, boomY + Math.sin(pitch) * o),
      playerPos.z + Math.cos(yaw) * o - Math.sin(yaw) * a,
    );
    return desired;
  }

  /**
   * If the boom would sit inside a building, binary-search back toward the chest.
   */
  function clearBoom(from, to) {
    const outdoors = typeof getOutdoors === "function" ? getOutdoors() : getOutdoors;
    if (!outdoors || !outdoors.insideBuilding) return to;
    if (!outdoors.insideBuilding(to.x, to.z)) return to;
    let lo = 0;
    let hi = 1;
    const clear = probe;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      clear.set(
        from.x + (to.x - from.x) * mid,
        from.y + (to.y - from.y) * mid,
        from.z + (to.z - from.z) * mid,
      );
      if (outdoors.insideBuilding(clear.x, clear.z)) hi = mid;
      else lo = mid;
    }
    to.set(
      from.x + (to.x - from.x) * lo,
      from.y + (to.y - from.y) * lo,
      from.z + (to.z - from.z) * lo,
    );
    return to;
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y?: number, z: number }} playerPos
   * @param {{ tight?: boolean, armed?: boolean, aim?: number }} [opts]
   *   armed: holding a gun (hip framing); aim: 0..1 raise toward the shoulder view.
   */
  function update(dt, playerPos, opts = {}) {
    const tight = !!opts.tight;
    armedK += ((opts.armed ? 1 : 0) - armedK) * (1 - Math.exp(-6 * dt));
    aimK += (Math.max(0, Math.min(1, opts.aim ?? 0)) - aimK) * (1 - Math.exp(-14 * dt));
    // Player root stores eye height (EYE_M on the ground). Lift the boom with jumps.
    const eye = EYE_M;
    const lift = Number.isFinite(playerPos.y) ? Math.max(0, playerPos.y - eye) : 0;
    chest.set(playerPos.x, CHEST_Y + lift, playerPos.z);
    // Boom height is Züri's 1.65 m, not the 1.45 m chest probe — using chest for both
    // put the body too high relative to the center crosshair.
    desiredPosition(playerPos, mix3(BOOM_Y, ARMED.y, AIM.y) + lift);
    clearBoom(chest, desired);

    if (!snapped) {
      camPos.copy(desired);
      snapped = true;
    } else {
      // Aiming stiffens the boom so the reticle doesn't swim.
      const k = 1 - Math.exp(-(12 + 18 * aimK) * dt);
      camPos.lerp(desired, k);
    }

    aimDir.set(
      -Math.sin(lookYaw.value) * Math.cos(lookPitch.value),
      -Math.sin(lookPitch.value),
      -Math.cos(lookYaw.value) * Math.cos(lookPitch.value),
    );

    sinceKick += dt;
    if (climb > CLIMB_MAX) {
      // Past the cap the muzzle stops rising and just shakes around the line.
      lookPitch.value += climb - CLIMB_MAX;
      climb = CLIMB_MAX;
    }
    if (sinceKick > 0.12 && climb > 1e-5) {
      const back = climb * (1 - Math.exp(-7 * dt));
      lookPitch.value = Math.min(PITCH_MAX, lookPitch.value + back * 0.8);
      climb -= back;
    }
    kickPitch *= Math.exp(-14 * dt);
    kickYaw *= Math.exp(-14 * dt);
    trauma = Math.max(0, trauma - 2.2 * dt);
    shakeT += dt;
    const sh = trauma * trauma * 0.012;
    const ky = lookYaw.value + kickYaw + sh * Math.sin(shakeT * 61);
    const kp = lookPitch.value - kickPitch + sh * Math.sin(shakeT * 47 + 1.3);
    const vx = -Math.sin(ky) * Math.cos(kp);
    const vy = -Math.sin(kp);
    const vz = -Math.cos(ky) * Math.cos(kp);

    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camPos.x + vx * 30, camPos.y + vy * 30, camPos.z + vz * 30);

    const hipFov = FOV_WALK + (ARMED.fov - FOV_WALK) * armedK;
    const targetFov = tight ? FOV_TIGHT : hipFov + (AIM.fov - hipFov) * aimK;
    fov += (targetFov - fov) * (1 - Math.exp(-8 * dt));
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function snap(playerPos) {
    snapped = false;
    update(1 / 60, playerPos);
    snapped = true;
  }

  /**
   * Ease camera yaw toward a vehicle heading (wheels face one way; look can drift).
   * Heading is the direction of travel on XZ (atan2 style matching playerMotion.yaw).
   */
  function easeYawToward(heading, dt, lambda = 3) {
    const target = heading;
    const dy = Math.atan2(Math.sin(target - lookYaw.value), Math.cos(target - lookYaw.value));
    lookYaw.value += dy * (1 - Math.exp(-lambda * dt));
  }

  /** The crosshair ray without recoil kick or shake (what bullets follow). */
  function aimRay(outPos, outDir) {
    outPos.copy(camPos);
    outDir.copy(aimDir);
  }

  return {
    applyLook,
    recoil,
    shake,
    aimRay,
    get aimK() {
      return aimK;
    },
    setYaw,
    yaw,
    pitch,
    update,
    snap,
    easeYawToward,
    DIST,
    SIDE,
  };
}
