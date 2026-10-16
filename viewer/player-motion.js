/**
 * Third-person movement with inertia, shared by walking and everything you can ride.
 *
 * Speeds are m/s. Walking is a brisk game walk and Shift jogs; every ride is faster than a jog
 * so it is worth taking, but still slow enough to read the streets. On wheels A/D steer (you
 * can't strafe a bike) and S brakes, then rolls back slowly.
 *
 * `getYaw` / `setYaw` come from the look camera (mouse). The player root only stores position.
 *
 * Speed and gait changes also update viewer/movement.html.
 * See .cursor/rules/movement-gallery.mdc.
 */
import { EYE_M } from "./person-scale.js";

export const MOVE = {
  // Shift multiplies walk to a clear jog (~7.4 m/s); rides keep a milder boost.
  walk: { speed: 3.6, boost: 2.05, accel: 16, brake: 20, eye: EYE_M },
  velo: { speed: 8.6, boost: 1.3, accel: 3.8, brake: 7, eye: 1.62, turn: 1.5, reverse: 1.2 },
  scooter: { speed: 7.6, boost: 1.0, accel: 4.2, brake: 7.5, eye: 1.62, turn: 1.8, reverse: 1.0 },
};

/** Space: fence-height hop, a short hang, then you just fall. `hop` is the minimum ground speed. */
export const JUMP = { strength: 6.2, g: -16, hang: 1.4, hangG: 0.55, hop: 2.8 };

/** A new hop state: { v, y, active }. */
export function makeJump() {
  return { v: 0, y: 0, active: false };
}

/** Advance a hop by dt. Returns true on the frame it lands. */
export function stepJump(j, dt) {
  if (!j.active) return false;
  // Lighter gravity near the apex so the hop hangs instead of peaking like a spike.
  const g = Math.abs(j.v) < JUMP.hang ? JUMP.g * JUMP.hangG : JUMP.g;
  j.v += g * dt;
  j.y += j.v * dt;
  if (j.y > 0) return false;
  j.y = 0;
  j.v = 0;
  j.active = false;
  return true;
}

function approach(v, target, up, down, dt) {
  const speedingUp = Math.abs(target) > Math.abs(v) && target * v >= 0;
  const d = target - v;
  const s = (speedingUp ? up : down) * dt;
  return Math.abs(d) <= s ? target : v + Math.sign(d) * s;
}

/**
 * @param {object} THREE
 * @param {import("three").Object3D} playerObject
 * @param {() => number} getYaw
 * @param {(y: number) => void} setYaw
 */
export function createPlayerMotion(THREE, playerObject, getYaw, setYaw) {
  const state = { fwd: 0, side: 0, kind: "walk", footScale: 1 };

  function yaw() {
    return getYaw();
  }

  /** Facing along the direction of travel (flips ~π when you roll backwards). */
  function travelYaw() {
    const y = getYaw();
    const fx = -Math.sin(y) * state.fwd + Math.cos(y) * state.side;
    const fz = -Math.cos(y) * state.fwd - Math.sin(y) * state.side;
    if (fx * fx + fz * fz > 1e-6) return Math.atan2(-fx, -fz);
    return y;
  }

  /**
   * Integrate one frame. `keys` = { w, a, s, d, shift, stick? }. On foot an analog
   * `stick` ({ x: right, y: forward }, length 0..1) replaces the digital W/A/S/D so a
   * half push walks slower. Returns how far the player moved so callers can animate
   * wheels / footsteps.
   */
  function step(dt, keys, kind = "walk") {
    const cfg = MOVE[kind] || MOVE.walk;
    if (kind !== state.kind) {
      state.kind = kind;
      state.fwd = Math.min(state.fwd, cfg.speed);
      state.side = 0;
    }
    const onWheels = kind !== "walk";
    const sprint = !!(keys.shift || keys.Shift);
    const top = cfg.speed * (sprint ? cfg.boost : 1) * (onWheels ? 1 : state.footScale);
    const stick = !onWheels && keys.stick;
    const fwdIn = stick ? stick.y : (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const sideIn = stick ? stick.x : (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const fwdTarget = fwdIn > 0 ? top * fwdIn : fwdIn < 0 ? (onWheels ? cfg.reverse : top * 0.8) * fwdIn : 0;
    // Snap into the jog a bit faster than a normal walk start so Shift feels immediate.
    const accel = sprint && !onWheels ? cfg.accel * 1.4 : cfg.accel;
    state.fwd = approach(state.fwd, fwdTarget, accel, cfg.brake, dt);
    state.side = onWheels ? 0 : approach(state.side, sideIn * top * 0.85, accel, cfg.brake, dt);
    if (onWheels && sideIn) {
      const grip = Math.min(1, 0.35 + Math.abs(state.fwd) / cfg.speed);
      setYaw(getYaw() - sideIn * cfg.turn * grip * dt);
    }
    const y = getYaw();
    const sx = Math.sin(y);
    const cz = Math.cos(y);
    if (state.fwd) {
      playerObject.position.x -= sx * state.fwd * dt;
      playerObject.position.z -= cz * state.fwd * dt;
    }
    if (state.side) {
      playerObject.position.x += cz * state.side * dt;
      playerObject.position.z -= sx * state.side * dt;
    }
    return Math.hypot(state.fwd, state.side) * dt;
  }

  function bump(keep = 0.5) {
    state.fwd *= keep;
    state.side *= keep;
  }

  /** GTA hop: if you're nearly still, shove along the way you face; otherwise keep your direction. */
  function hop(minSpeed = 2.8) {
    const sp = Math.hypot(state.fwd, state.side);
    if (sp >= minSpeed) return;
    if (sp < 0.15) {
      state.fwd = minSpeed;
      state.side = 0;
      return;
    }
    const k = minSpeed / sp;
    state.fwd *= k;
    state.side *= k;
  }

  function stop() {
    state.fwd = 0;
    state.side = 0;
  }

  return {
    state,
    yaw,
    travelYaw,
    step,
    bump,
    hop,
    stop,
    eye: (kind) => (MOVE[kind] || MOVE.walk).eye,
    /** Walking / jogging pace multiplier (injuries); rides are unaffected. */
    setFootScale(f) {
      state.footScale = f;
    },
    /** Signed forward speed in m/s (for the speedometer). */
    get speed() {
      return state.fwd;
    },
  };
}
