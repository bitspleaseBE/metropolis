/**
 * AnimationMixer layers for NPC walk / idle / turn / get-up / ride / step / sit / mount.
 *
 * Crossfades ~0.25 s. Walk speed is time-scaled against naturalSpeed. Yaw is
 * rate-limited; a sharp turn while stopped can play a turn clip when available.
 */

const FADE = 0.25;
const YAW_RATE = 4.0; // rad/s

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {THREE} THREE
 * @param {object} person instance from people.js (root, mixer, action, getUp, …)
 * @param {object} [extra] optional clips: idle, turnL, turnR, ride, step, sit, mount, limp, swagger
 */
export function createNpcAnim(THREE, person, extra = {}) {
  const mixer = person.mixer;
  const layers = {
    walk: person.action || null,
    getUp: person.getUp || null,
    idle: null,
    turnL: null,
    turnR: null,
    ride: null,
    step: null,
    sit: null,
    mount: null,
    limp: null,
    swagger: null,
  };

  for (const [name, clip] of Object.entries(extra)) {
    if (!clip || !mixer) continue;
    const action = mixer.clipAction(clip);
    if (name === "getUp" || name === "mount") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    layers[name] = action;
  }

  let current = layers.walk ? "walk" : null;
  if (layers.walk) {
    layers.walk.enabled = true;
    layers.walk.setEffectiveWeight(1);
    layers.walk.play();
  }

  const state = {
    yaw: 0,
    targetYaw: 0,
    moving: false,
    limp: false,
    swagger: false,
  };

  function crossfade(to, fade = FADE) {
    if (!mixer || !to || to === current) return;
    const next = layers[to];
    if (!next) return;
    const prev = current ? layers[current] : null;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, fade, false);
    }
    current = to;
  }

  function setGait({ moving, speed = 1.25, naturalSpeed = 1.25, limp = false, swagger = false } = {}) {
    state.moving = !!moving;
    state.limp = !!limp;
    state.swagger = !!swagger;
    if (!moving) {
      if (layers.idle) crossfade("idle");
      else if (layers.walk) layers.walk.setEffectiveTimeScale(0);
      return;
    }
    const clipName = limp && layers.limp ? "limp" : swagger && layers.swagger ? "swagger" : "walk";
    crossfade(clipName);
    const action = layers[clipName] || layers.walk;
    if (action) {
      const rate = naturalSpeed > 0.05 ? speed / naturalSpeed : 1;
      action.setEffectiveTimeScale(Math.max(0.05, Math.min(1.8, rate)));
    }
  }

  function playGetUp() {
    if (!layers.getUp) return false;
    const g = layers.getUp;
    g.reset().play();
    g.paused = true;
    g.setEffectiveWeight(0);
    return true;
  }

  function blendGetUp(weight) {
    if (!layers.getUp) return;
    const w = Math.max(0, Math.min(1, weight));
    layers.getUp.setEffectiveWeight(w);
    if (layers.walk) layers.walk.setEffectiveWeight(1 - w);
  }

  function scrambleGetUp() {
    if (!layers.getUp) return;
    layers.getUp.paused = false;
  }

  function getUpDone() {
    if (!layers.getUp) return true;
    return layers.getUp.time >= layers.getUp.getClip().duration - 1e-3;
  }

  function playRide(kind = "ride") {
    const name = kind === "step" ? "step" : kind === "sit" ? "sit" : "ride";
    crossfade(layers[name] ? name : "ride");
  }

  function playMount() {
    if (layers.mount) crossfade("mount");
  }

  function setYaw(yaw, immediate = false) {
    state.targetYaw = yaw;
    if (immediate) state.yaw = yaw;
  }

  function updateYaw(dt) {
    const d = wrapAngle(state.targetYaw - state.yaw);
    const max = YAW_RATE * dt;
    if (Math.abs(d) <= max) state.yaw = state.targetYaw;
    else state.yaw += Math.sign(d) * max;
    // Turn-in-place when stopped and yaw error is large.
    if (!state.moving && Math.abs(d) > 0.6) {
      if (d > 0 && layers.turnL) crossfade("turnL");
      else if (d < 0 && layers.turnR) crossfade("turnR");
    }
    return state.yaw;
  }

  function update(dt) {
    if (mixer && dt > 0) mixer.update(dt);
    return updateYaw(dt);
  }

  function stop() {
    mixer?.stopAllAction();
  }

  return {
    layers,
    state,
    crossfade,
    setGait,
    playGetUp,
    blendGetUp,
    scrambleGetUp,
    getUpDone,
    playRide,
    playMount,
    setYaw,
    updateYaw,
    update,
    stop,
    get current() {
      return current;
    },
  };
}

export { FADE, YAW_RATE, wrapAngle };
