/**
 * Playable cast for Klein Antwerpen. Separate from sidewalk Mixamo civilians
 * in characters.js — these three bodies never enter the pedestrian pool.
 *
 * Movement changes (clips, gait, strikes) also update viewer/movement.html.
 * See .cursor/rules/movement-gallery.mdc.
 */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { VELO_FWD, VELO_RIDE } from "./velo.js";
import { leanToBars } from "./ride-lean.js";
import { createArmedRig } from "./player-armed.js";
import { captureSoles, createFootPlant, skinnedHeight, soleLevelers } from "./foot-plant.js";
import { ADULT_M, EYE_M } from "./person-scale.js";

export const PLAYERS = [
  {
    id: "pieter",
    name: "Pieter",
    blurb: "Antwerp boy. Jacket, jeans, and the killer smile.",
  },
  {
    id: "mo",
    name: "Mo",
    blurb: "Youthful rascal. Grey hoodie, sneakers, and grit.",
  },
  {
    id: "jacob",
    name: "Jacob",
    blurb: "Traditional and kind. Black coat, white shirt, black hat.",
  },
];

const STORAGE_KEY = "metropolis-player";
const base = new URL("./characters/players/", import.meta.url);
const loader = new GLTFLoader();
const cache = new Map();

function load(path) {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(new URL(path, base).href);
    cache.set(path, p);
  }
  return p;
}

export function getStoredPlayerId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (PLAYERS.some((p) => p.id === id)) return id;
  } catch {
    /* ignore */
  }
  return PLAYERS[0].id;
}

export function setStoredPlayerId(id) {
  if (!PLAYERS.some((p) => p.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function playerById(id) {
  return PLAYERS.find((p) => p.id === id) || PLAYERS[0];
}

/** Walk mesh plus the Mixamo moves clip, so the first step is not the old Rocketbox walk. */
export function preloadPlayer(id = getStoredPlayerId()) {
  return Promise.all([
    load(`${id}_Walking.glb`),
    load(`clips/${id}_moves.glb`).catch(() => null),
    load(`clips/${id}_combat.glb`).catch(() => null),
  ]);
}

/** Native metres/second of each Mixamo loop, so playback matches the feet. */
const CLIP_SPEED = { idle: 0, walk: 1.08, jog: 2.48, run: 5.43, ride: 4.2 };

/**
 * Third-person player avatar: walk / ride / scooter clips, with grip IK on wheels.
 */
export function createPlayerAvatar(THREE, scene, { remember = true } = {}) {
  let root = new THREE.Group();
  root.name = "player-avatar";
  scene.add(root);

  let visual = null;
  let mixer = null;
  let actions = { walk: null, ride: null, scooter: null };
  let current = null;
  let mocap = false;
  let speeds = { ...CLIP_SPEED };
  const footPhase = {};
  let melee = null;
  let meleeQueue = null;
  let jumpLatch = false;
  let pedal = 0;
  let playerId = getStoredPlayerId();
  let facing = 0;
  let ready = Promise.resolve();
  let built = false;
  let buildGen = 0;
  let clipLoads = { ride: null, scooter: null };
  /** @type {null | { lUpper: object, lFore: object, lHand: object, rUpper: object, rFore: object, rHand: object }} */
  let armBones = null;
  /** Clavicle / Mixamo shoulder bones — ride clips roll these; we hold the bind on wheels. */
  /** @type {null | { l: object, r: object }} */
  let clavBones = null;
  /** Bind local quats for clavicles + upper arms, captured once per rig. */
  /** @type {{ bone: object, q: import("three").Quaternion }[]} */
  let shoulderBind = [];
  /** @type {null | { lThigh: object, rThigh: object, lCalf: object, rCalf: object, spine: object, head: object }} */
  let bodyBones = null;
  let airBlend = 0;
  let airPoseSaved = false;
  /** Hips XZ (root space) to hold. Pieter's walk translates the pelvis a full stride per loop. */
  let pelvisPin = null;
  /** Gun layer (player-armed.js). Null until the combat clips load. */
  let armed = null;
  let pendingWeapon = "unarmed";
  const _airBase = {
    lThigh: new THREE.Quaternion(),
    rThigh: new THREE.Quaternion(),
    lCalf: new THREE.Quaternion(),
    rCalf: new THREE.Quaternion(),
    spine: new THREE.Quaternion(),
  };
  const _headPrev = new THREE.Quaternion();
  const _headBind = new THREE.Quaternion();
  const _qClip = new THREE.Quaternion();
  const _qKeyA = new THREE.Quaternion();
  const _qKeyB = new THREE.Quaternion();
  let headReady = false;
  let headBindReady = false;
  /** Walk head keys ~180° off the bind (Pieter). Crossfading them spins the neck. */
  let headOffBind = false;
  let headTrack = null;
  /** Finger rotations from the baked Punch fist, for wrapping the bars. */
  let gripPose = [];
  /** Knuckle frames for wrapping the step's bar ends; null when the rig has no fingers. */
  let barHands = null;
  const GRIP_CURL = 0.8;

  // Scooter grips match viewer/scooters.js. Velo points come from velo.glb (VELO_RIDE).
  // The ride Velo sits VELO_FWD ahead of the root (placeRideVelo in viewer/velo.js).
  const GRIP = {
    // Bar height above the ground, and above the deck top the root stands on while riding.
    scooter: { fwd: 0.18, y: 1.167, z: -0.26, x: 0.22 },
    scooterOnDeck: { fwd: 0.18, y: 0.995, z: -0.26, x: 0.22 },
    velo: { fwd: VELO_FWD, y: 0, z: 0, x: 0 },
  };
  const _seatCfg = { fwd: VELO_FWD, y: 0, z: 0, x: 0 };
  const _seatW = new THREE.Vector3();
  let visualBaseY = 0;
  /** Sole contact on foot; null until the rig is built. `lift` raises the ankle-grounded body onto its soles. */
  let plantFeet = null;
  /** Per foot: the local turn that levels a toe-down bind, and the last value written. */
  let footLevel = [];
  let soleDrop = 0;
  let lift = 0;
  const _gripL = new THREE.Vector3();
  const _gripR = new THREE.Vector3();
  const _ikA = new THREE.Vector3();
  const _ikB = new THREE.Vector3();
  const _ikC = new THREE.Vector3();
  const _ikQ = new THREE.Quaternion();
  const _ikParentQ = new THREE.Quaternion();
  const _ikWorldQ = new THREE.Quaternion();

  /**
   * Older Mixamo player GLBs shipped at FBX scale ~0.0001. Current Rocketbox
   * cast (Pieter / Mo / Jacob) is already ~0.01 — only bump when still tiny.
   */
  function normalizeImportScale(root) {
    if (!root) return false;
    let fixed = false;
    for (const name of ["Bip01", "Armature"]) {
      const o = root.getObjectByName(name);
      if (o && o.scale.x > 0 && o.scale.x < 0.001) {
        o.scale.setScalar(0.01);
        fixed = true;
      }
    }
    return fixed;
  }

  const STRIDE_KEYS = ["walk", "jog", "run", "aimWalk", "aimWalkBack", "aimStrafeL", "aimStrafeR", "aimRun"];
  const _stL = new THREE.Vector3();
  const _stR = new THREE.Vector3();
  /**
   * Ground speed of an in-place gait clip on the loaded rig: how fast the planted
   * (lower) foot travels under the body along the gait's axis (sideways for strafes;
   * the ankle rolls across that axis), in metres per second of clip time, and the
   * loop fraction `leftDown` where the left foot carries the body.
   */
  function strideOf(clip, lateral = false) {
    const lf = bodyBones?.lFoot;
    const rf = bodyBones?.rFoot;
    if (!clip || !lf || !rf || !(clip.duration > 0.1)) return null;
    const saved = [];
    visual.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
    const probe = new THREE.AnimationMixer(visual);
    probe.clipAction(clip).play();
    root.updateMatrixWorld(true);
    const N = 60;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      probe.setTime((clip.duration * i) / N);
      normalizeImportScale(visual);
      visual.updateMatrixWorld(true);
      pts.push([root.worldToLocal(lf.getWorldPosition(_stL)).clone(), root.worldToLocal(rf.getWorldPosition(_stR)).clone()]);
    }
    probe.stopAllAction();
    probe.uncacheRoot(visual);
    for (const [o, p, q, s] of saved) {
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }
    visual.updateMatrixWorld(true);
    // Where in the clip the left foot is most below the right, as a fraction of the
    // loop: the fundamental of their height difference.
    let cs = 0;
    let sn = 0;
    for (let i = 0; i < N; i++) {
      const d = pts[i][0].y - pts[i][1].y;
      cs += d * Math.cos((2 * Math.PI * i) / N);
      sn += d * Math.sin((2 * Math.PI * i) / N);
    }
    const leftDown = (Math.atan2(sn, cs) / (2 * Math.PI) + 1.5) % 1;
    // A planted foot is near its lowest and the slower of the two; strafes shuffle the
    // swing foot low too, and runs have flight frames where neither is down.
    const dt = clip.duration / N;
    const floor = [0, 1].map((k) => Math.min(...pts.map((p) => p[k].y)) + 0.03);
    const v = [];
    for (let i = 0; i < N; i++) {
      const sp = [0, 1].map((k) => Math.abs(lateral ? pts[i + 1][k].x - pts[i][k].x : pts[i + 1][k].z - pts[i][k].z) / dt);
      const k = sp[0] < sp[1] ? 0 : 1;
      if (pts[i][k].y < floor[k] && pts[i + 1][k].y < floor[k]) v.push(sp[k]);
    }
    if (v.length < 4) return { speed: 0, leftDown };
    v.sort((x, y) => x - y);
    return { speed: v[Math.floor(v.length / 2)], leftDown };
  }

  /** Drop scale tracks — FBX keys identity scale and fights normalizeImportScale. */
  function sanitizeClip(clip) {
    if (!clip?.tracks?.length) return clip;
    const tracks = clip.tracks.filter((t) => !t.name.endsWith(".scale"));
    if (tracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  /** Mixamo loops often key from one frame in; the gap before the first key would hold
   * a frozen pose once a cycle (the feet stall while the body moves). */
  function loopClip(clip) {
    if (!clip?.tracks?.length) return clip;
    const t0 = Math.min(...clip.tracks.map((t) => t.times[0] ?? 0));
    if (!(t0 > 1e-3) || !(clip.duration - t0 > 0.1)) return clip;
    const tracks = clip.tracks.map((t) => t.clone().shift(-t0));
    return new THREE.AnimationClip(clip.name, clip.duration - t0, tracks);
  }

  /** Bone name from a track path like `Bip01 L Thigh.quaternion`. */
  function trackBone(trackName) {
    return (trackName || "").split(".")[0];
  }

  /** Legs + hips stay on the gait; punches overlay everything else. */
  function isLowerBodyBone(name) {
    // The rig root carries the gait's bob and sway; without it a planted foot floats.
    if (/^bip01$/i.test(name || "")) return true;
    const n = (name || "")
      .replace(/^mixamorig\d*:?/i, "")
      .replace(/^bip01[_\s]?/i, "");
    // Biped thighs hang off the first spine bone, so it must come from the same clip
    // as the legs or an overlay's twist swings the stride and the feet cross.
    if (isFirstSpine(n)) return true;
    return (
      /^(pelvis|hips|l thigh|r thigh|l calf|r calf|l foot|r foot|l toe|r toe|leftupleg|rightupleg|leftleg|rightleg|leftfoot|rightfoot|lefttoe|righttoe)/i.test(
        n,
      ) || /(thigh|calf|foot|toe0?|pelvis|hips|upleg)/i.test(n)
    );
  }

  function isFirstSpine(name) {
    return /^spine$/i.test((name || "").replace(/^mixamorig\d*:?/i, "").replace(/^bip01[_\s]?/i, ""));
  }

  /**
   * An overlay loses its first-spine track to the gait. Fold that rotation into the
   * next spine bone, against the bind, so the chest still turns as the clip meant.
   */
  function foldFirstSpine(clip, tracks) {
    const spine = clip.tracks.find((t) => /\.quaternion$/.test(t.name) && isFirstSpine(trackBone(t.name)));
    const bone = spine && visual?.getObjectByName(trackBone(spine.name));
    const nextName = bone?.children.find((c) => c.isBone)?.name;
    const i = nextName ? tracks.findIndex((t) => t.name === `${nextName}.quaternion`) : -1;
    if (i < 0) return tracks;
    const next = tracks[i];
    const sample = spine.createInterpolant();
    const bindInv = bone.quaternion.clone().invert();
    const s = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    const values = new Float32Array(next.values.length);
    for (let k = 0; k < next.times.length; k++) {
      s.fromArray(sample.evaluate(next.times[k]));
      q.fromArray(next.values, k * 4);
      q.premultiply(s).premultiply(bindInv);
      q.toArray(values, k * 4);
    }
    const out = tracks.slice();
    out[i] = new THREE.QuaternionKeyframeTrack(next.name, Array.from(next.times), Array.from(values));
    return out;
  }

  function filterClipBones(clip, keepLower) {
    if (!clip?.tracks?.length) return clip;
    let tracks = clip.tracks.filter((t) => {
      const lower = isLowerBodyBone(trackBone(t.name));
      return keepLower ? lower : !lower;
    });
    if (!tracks.length || tracks.length === clip.tracks.length) return clip;
    if (!keepLower) tracks = foldFirstSpine(clip, tracks);
    const tag = keepLower ? "Legs" : "Upper";
    return new THREE.AnimationClip(`${clip.name}${tag}`, clip.duration, tracks);
  }

  const upperBodyClip = (clip) => filterClipBones(clip, false);
  const legsOnlyClip = (clip) => filterClipBones(clip, true);

  // Reused each frame. Shoulder leveling borrows two positions; the thigh lift
  // only applies if a Mixamo-skinned player is loaded.
  const _qLift = new THREE.Quaternion();
  const _vBone = new THREE.Vector3();
  const _spreadL = new THREE.Vector3();
  const _spreadA = new THREE.Vector3();

  /**
   * After the mixer: boost Mixamo hip flexion so steps read as thigh-led.
   * Rocketbox arms/legs are corrected in scripts/rocketbox_to_player_glb.py
   * (weight repair + arm tuck + world-space bake) — do not double-tuck here.
   */
  function polishWalkPose(rig, walkPhase, moving) {
    if (!rig || !moving) return;
    const swing = Math.sin(walkPhase);
    // Legacy Mixamo UpLeg polish (only if a Mixamo-skinned player GLB is loaded).
    const thighPairs = [
      ["mixamorig9LeftUpLeg", 1, -1, 0, 0],
      ["mixamorig9RightUpLeg", -1, 1, 0, 0],
    ];
    const liftAmp = 0.5;
    for (const [name, side, ax, ay, az] of thighPairs) {
      const bone = rig.getObjectByName(name);
      if (!bone) continue;
      const lift = liftAmp * Math.max(0, side * swing);
      if (lift < 1e-4) continue;
      _qLift.setFromAxisAngle(_vBone.set(ax, ay, az), lift);
      bone.quaternion.premultiply(_qLift);
    }
  }

  function cacheArmBones(rig) {
    armBones = {
      lUpper: findNamed(rig, "Bip01_L_UpperArm", "Bip01 L UpperArm", "LeftArm", "mixamorigLeftArm"),
      lFore: findNamed(rig, "Bip01_L_Forearm", "Bip01 L Forearm", "LeftForeArm", "mixamorigLeftForeArm"),
      lHand: findNamed(rig, "Bip01_L_Hand", "Bip01 L Hand", "LeftHand", "mixamorigLeftHand"),
      rUpper: findNamed(rig, "Bip01_R_UpperArm", "Bip01 R UpperArm", "RightArm", "mixamorigRightArm"),
      rFore: findNamed(rig, "Bip01_R_Forearm", "Bip01 R Forearm", "RightForeArm", "mixamorigRightForeArm"),
      rHand: findNamed(rig, "Bip01_R_Hand", "Bip01 R Hand", "RightHand", "mixamorigRightHand"),
    };
    clavBones = {
      l: findNamed(rig, "Bip01_L_Clavicle", "Bip01 L Clavicle", "LeftShoulder", "mixamorigLeftShoulder"),
      r: findNamed(rig, "Bip01_R_Clavicle", "Bip01 R Clavicle", "RightShoulder", "mixamorigRightShoulder"),
    };
    bodyBones = {
      lThigh: findNamed(rig, "Bip01_L_Thigh", "Bip01 L Thigh", "LeftUpLeg", "mixamorigLeftUpLeg"),
      rThigh: findNamed(rig, "Bip01_R_Thigh", "Bip01 R Thigh", "RightUpLeg", "mixamorigRightUpLeg"),
      lCalf: findNamed(rig, "Bip01_L_Calf", "Bip01 L Calf", "LeftLeg", "mixamorigLeftLeg"),
      rCalf: findNamed(rig, "Bip01_R_Calf", "Bip01 R Calf", "RightLeg", "mixamorigRightLeg"),
      lFoot: findNamed(rig, "Bip01_L_Foot", "Bip01 L Foot", "LeftFoot", "mixamorigLeftFoot"),
      rFoot: findNamed(rig, "Bip01_R_Foot", "Bip01 R Foot", "RightFoot", "mixamorigRightFoot"),
      spine: findNamed(rig, "Bip01_Spine", "Bip01 Spine", "Spine", "mixamorigSpine"),
      spine1: findNamed(rig, "Bip01_Spine1", "Bip01 Spine1", "Spine1", "mixamorigSpine1"),
      spine2: findNamed(rig, "Bip01_Spine2", "Bip01 Spine2", "Spine2", "mixamorigSpine2"),
      head: findNamed(rig, "Bip01_Head", "Bip01 Head", "Head", "mixamorigHead"),
      pelvis: findNamed(rig, "Bip01_Pelvis", "Bip01 Pelvis", "Pelvis", "mixamorigHips"),
    };
    // Ride clips key spine + UpperArm (Rocketbox) / Shoulder+Arm (Mixamo). Holding the
    // bind before lean+IK keeps the fold a pure pitch — clip twist rolls one deltoid.
    shoulderBind = [];
    for (const bone of [
      clavBones.l,
      clavBones.r,
      armBones.lUpper,
      armBones.rUpper,
      bodyBones.spine,
      bodyBones.spine1,
      bodyBones.spine2,
    ]) {
      if (bone) shoulderBind.push({ bone, q: bone.quaternion.clone() });
    }
    headReady = false;
    headBindReady = false;
    airPoseSaved = false;
    pelvisPin = null;
    if (bodyBones.head) {
      _headBind.copy(bodyBones.head.quaternion);
      headBindReady = true;
    }
    const clip = actions.walk?.getClip();
    headTrack =
      clip?.tracks?.find((t) => /head\.quaternion$/i.test(t.name)) || null;
    headOffBind = false;
    if (headTrack && headBindReady) {
      _qClip.fromArray(headTrack.values, 0);
      headOffBind = Math.abs(_qClip.dot(_headBind)) < 0.5;
    }
    // Flat soles in the bind. Kept relative to the root: the rig can be built (or the
    // player switched) while the body faces any way, and the pedal IK turns it by yaw.
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_ikParentQ).invert();
    for (const key of ["lFoot", "rFoot"]) {
      const bone = bodyBones[key];
      if (!bone) continue;
      bone.userData.bindRootQ = new THREE.Quaternion();
      bone.getWorldQuaternion(bone.userData.bindRootQ).premultiply(_ikParentQ);
    }
  }

  /**
   * The walk was baked with the hips travelling forward and the feet planted in
   * the world. Stripping that travel makes the feet slide back, then the loop
   * yanks them forward a stride (two steps). Shift the mesh by the opposite
   * amount so the hips stay put and the loop matches.
   */
  function pinWalkPelvis() {
    const pelvis = bodyBones?.pelvis;
    if (!pelvis) return;
    visual.position.x = 0;
    visual.position.z = 0;
    root.updateMatrixWorld(true);
    _vBone.setFromMatrixPosition(pelvis.matrixWorld);
    root.worldToLocal(_vBone);
    if (!pelvisPin) pelvisPin = { x: _vBone.x, z: _vBone.z };
    visual.position.x = pelvisPin.x - _vBone.x;
    visual.position.z = pelvisPin.z - _vBone.z;
  }

  /**
   * Knees up, like clearing a low fence, then hold that shape in the air.
   * The mixer skips rewriting a frozen clip, so a multiply would stack every
   * frame and pitch him onto his back. Re-apply the flex from the pose we
   * captured on takeoff.
   */
  function captureAirPose() {
    if (!bodyBones) return;
    for (const key of Object.keys(_airBase)) {
      if (bodyBones[key]) _airBase[key].copy(bodyBones[key].quaternion);
    }
    airPoseSaved = true;
  }
  function restoreAirPose() {
    if (!airPoseSaved || !bodyBones) return;
    for (const key of Object.keys(_airBase)) {
      if (bodyBones[key]) bodyBones[key].quaternion.copy(_airBase[key]);
    }
    airPoseSaved = false;
  }
  function polishAirPose(k) {
    if (!bodyBones || !airPoseSaved || k < 1e-3) return;
    const flex = (key, ang) => {
      const bone = bodyBones[key];
      if (!bone) return;
      _qLift.setFromAxisAngle(_vBone.set(0, 0, 1), ang);
      bone.quaternion.copy(_airBase[key]).multiply(_qLift);
    };
    flex("lThigh", 0.85 * k);
    flex("rThigh", 0.85 * k);
    flex("lCalf", 1.05 * k);
    flex("rCalf", 1.05 * k);
    flex("spine", 0.22 * k);
  }

  /** Unblended quaternion from a clip track. The mixer blend is wrong for Pieter. */
  function sampleTrackQuat(track, time, out) {
    const times = track.times;
    const values = track.values;
    const n = times.length;
    if (!n) return;
    const end = times[n - 1];
    let t = time;
    if (end > 0) {
      t = t % end;
      if (t < 0) t += end;
    }
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    const i1 = Math.min(lo, n - 1);
    const i0 = Math.max(0, i1 - 1);
    const span = times[i1] - times[i0];
    const u = span > 1e-6 ? Math.min(1, Math.max(0, (t - times[i0]) / span)) : 0;
    _qKeyA.fromArray(values, i0 * 4);
    _qKeyB.fromArray(values, i1 * 4);
    out.copy(_qKeyA).slerp(_qKeyB, u);
  }

  /**
   * Pieter's walk keys sit ~180° off the head bind. Fading that track against
   * the bind (mounting or leaving a scooter) spins the head and the snap
   * guard then freezes the bad pose. Write the clip sample directly instead.
   */
  function applyWalkHead() {
    const head = bodyBones?.head;
    if (!head || !headTrack) return;
    const dur = actions.walk.getClip()?.duration || headTrack.times[headTrack.times.length - 1] || 1;
    const t = dur > 0 ? ((actions.walk.time % dur) + dur) % dur : 0;
    sampleTrackQuat(headTrack, t, _qClip);
    if (headOffBind && headBindReady) head.quaternion.copy(_headBind).multiply(_qClip);
    else head.quaternion.copy(_qClip);
  }

  function stabilizeHead() {
    const head = bodyBones?.head;
    if (!head) return;
    if (!headReady) {
      _headPrev.copy(head.quaternion);
      headReady = true;
      return;
    }
    const dot = Math.abs(THREE.MathUtils.clamp(_headPrev.dot(head.quaternion), -1, 1));
    const ang = 2 * Math.acos(dot);
    if (ang > 0.65) head.quaternion.copy(_headPrev);
    _headPrev.copy(head.quaternion);
  }

  /** World-space grip point matching scooter/velo mesh placement under the player. */
  function gripTarget(out, yaw, side, cfg) {
    const ox = -Math.sin(yaw) * cfg.fwd;
    const oz = -Math.cos(yaw) * cfg.fwd;
    const lx = side * cfg.x;
    const lz = cfg.z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.set(
      root.position.x + ox + lx * c + lz * s,
      root.position.y + cfg.y,
      root.position.z + oz - lx * s + lz * c,
    );
    return out;
  }

  /** CCD two-bone IK so the wrist reaches the handlebar grip. */
  function ccdArmIK(upper, fore, hand, target, iterations = 10) {
    if (!upper?.parent || !fore || !hand) return;
    const chain = [upper, fore];
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = chain.length - 1; i >= 0; i--) {
        const bone = chain[i];
        bone.updateWorldMatrix(true, true);
        hand.updateWorldMatrix(true, false);
        _ikA.setFromMatrixPosition(bone.matrixWorld);
        _ikB.setFromMatrixPosition(hand.matrixWorld);
        _ikB.sub(_ikA);
        if (_ikB.lengthSq() < 1e-10) continue;
        _ikB.normalize();
        _ikC.copy(target).sub(_ikA);
        if (_ikC.lengthSq() < 1e-10) continue;
        _ikC.normalize();
        _ikQ.setFromUnitVectors(_ikB, _ikC);
        bone.parent.getWorldQuaternion(_ikParentQ);
        bone.getWorldQuaternion(_ikWorldQ);
        _ikWorldQ.premultiply(_ikQ);
        bone.quaternion.copy(_ikParentQ).invert().multiply(_ikWorldQ);
        bone.updateMatrixWorld(true);
      }
    }
  }

  /** Drop the clip's spine twist and shoulder roll so lean + bar IK start square. */
  function stabilizeRideShoulders() {
    for (const { bone, q } of shoulderBind) {
      bone.quaternion.copy(q);
      // Clear leanToBars' undo cache — we replaced the mixer pose it would restore.
      if (bone.userData) {
        bone.userData.leanIn = null;
        bone.userData.leanOut = null;
      }
    }
    if (shoulderBind.length) root.updateMatrixWorld(true);
  }

  /**
   * After lean + bar IK the clip/IK often leave one deltoid high or forward.
   * Tip the top spine so the shoulder line is level and square to travel, then
   * the next grip pass puts the hands back on the bars from a square chest.
   */
  function levelRideShoulders(yaw) {
    const spine = bodyBones?.spine2 || bodyBones?.spine1;
    if (!spine?.parent || !armBones?.lUpper || !armBones?.rUpper) return;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    armBones.lUpper.getWorldPosition(_spreadL);
    armBones.rUpper.getWorldPosition(_spreadA);
    const span = Math.max(0.2, Math.hypot(_spreadA.x - _spreadL.x, _spreadA.z - _spreadL.z));
    const dy = _spreadA.y - _spreadL.y;
    const dFwd = (_spreadA.x - _spreadL.x) * fx + (_spreadA.z - _spreadL.z) * fz;
    if (Math.abs(dy) < 0.008 && Math.abs(dFwd) < 0.008) return;
    spine.getWorldQuaternion(_ikWorldQ);
    // Roll about forward: positive dy ⇒ right high ⇒ roll left.
    if (Math.abs(dy) >= 0.008) {
      _leanAxis.set(fx, 0, fz);
      _ikQ.setFromAxisAngle(_leanAxis, -Math.atan2(dy, span) * 0.9);
      _ikWorldQ.premultiply(_ikQ);
    }
    // Yaw about up: positive dFwd ⇒ right shoulder ahead ⇒ turn chest left.
    if (Math.abs(dFwd) >= 0.008) {
      _ikQ.setFromAxisAngle(_worldUp, -Math.atan2(dFwd, span) * 0.9);
      _ikWorldQ.premultiply(_ikQ);
    }
    spine.parent.getWorldQuaternion(_ikParentQ);
    spine.quaternion.copy(_ikParentQ.invert().multiply(_ikWorldQ));
    spine.updateMatrixWorld(true);
  }

  function polishRideGrips(kind, yaw, deck = null) {
    if (!armBones || (kind !== "velo" && kind !== "scooter")) return;
    const cfg = kind === "scooter" && deck ? GRIP.scooterOnDeck : GRIP[kind];
    if (!cfg) return;
    if (kind === "velo") {
      cfg.y = VELO_RIDE.bar.y;
      cfg.z = VELO_RIDE.bar.z;
      cfg.x = VELO_RIDE.grip;
    }
    gripTarget(_gripL, yaw, -1, cfg);
    gripTarget(_gripR, yaw, 1, cfg);
    const wrapBars = () => {
      if (kind === "scooter" && barHands) {
        barGrip(barHands.L, armBones.lUpper, armBones.lFore, _gripL, yaw, -1);
        barGrip(barHands.R, armBones.rUpper, armBones.rFore, _gripR, yaw, 1);
        return;
      }
      ccdArmIK(armBones.lUpper, armBones.lFore, armBones.lHand, _gripL);
      ccdArmIK(armBones.rUpper, armBones.rFore, armBones.rHand, _gripR);
    };
    wrapBars();
    levelRideShoulders(yaw);
    wrapBars();
  }

  /**
   * Each hand's knuckle frame in hand-local space: fingers toward the middle knuckle,
   * `across` toward the thumb side, `palm` halfway out to the knuckles.
   */
  function cacheBarHands(rig) {
    const knuckle = (side, n) => rig.getObjectByName(`Bip01_${side}_${n}`) || rig.getObjectByName(`Bip01 ${side} ${n}`);
    const frame = (side) => {
      const hand = side === "L" ? armBones.lHand : armBones.rHand;
      const idx = knuckle(side, "Finger1");
      const mid = knuckle(side, "Finger2");
      const pinky = knuckle(side, "Finger4") || knuckle(side, "Finger3");
      if (!hand || !idx || !mid || !pinky) return null;
      const local = (b) => hand.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
      const m = local(mid);
      const finger = m.clone().normalize();
      const across = local(idx).sub(local(pinky));
      across.addScaledVector(finger, -across.dot(finger)).normalize();
      const basis = new THREE.Matrix4().makeBasis(finger, across, new THREE.Vector3().crossVectors(finger, across));
      return { hand, palm: m.multiplyScalar(0.5), inv: new THREE.Quaternion().setFromRotationMatrix(basis).invert() };
    };
    rig.updateMatrixWorld(true);
    const L = frame("L");
    const R = frame("R");
    barHands = L && R ? { L, R } : null;
  }

  const _barF = new THREE.Vector3();
  const _barA = new THREE.Vector3();
  const _barN = new THREE.Vector3();
  const _barM = new THREE.Matrix4();
  const _barQ = new THREE.Quaternion();
  const _barP = new THREE.Vector3();
  const _barS = new THREE.Vector3();

  /**
   * Hand over a horizontal bar end: palm on top of the grip, fingers pointing forward
   * and down so the closed fist wraps the front of it, thumb toward the stem.
   */
  function barGrip(frame, upper, fore, grip, yaw, side) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    _barF.set(fx * 0.72 + rx * side * 0.2, -0.66, fz * 0.72 + rz * side * 0.2).normalize();
    _barA.set(-rx * side, 0, -rz * side);
    _barA.addScaledVector(_barF, -_barA.dot(_barF)).normalize();
    _barN.crossVectors(_barF, _barA);
    _barM.makeBasis(_barF, _barA, _barN);
    _barQ.setFromRotationMatrix(_barM).multiply(frame.inv);
    // Palm a bar's radius above, just behind and a little inboard of the grip centre,
    // so the knuckles stay on the rubber; the wrist trails it.
    _barP.set(grip.x - fx * 0.015 - rx * side * 0.015, grip.y + 0.03, grip.z - fz * 0.015 - rz * side * 0.015);
    frame.hand.getWorldScale(_barS);
    _barP.sub(_ikA.copy(frame.palm).multiplyScalar(_barS.x).applyQuaternion(_barQ));
    // Elbows back, out and a little down. CCD has no elbow side, and near full reach
    // it would fold one arm backwards.
    upper.getWorldPosition(_barS);
    _barS.x += -fx * 0.35 + rx * side * 0.3;
    _barS.y -= 0.25;
    _barS.z += -fz * 0.35 + rz * side * 0.3;
    solveLeg(upper, fore, frame.hand, _barP, _barS);
    frame.hand.parent.getWorldQuaternion(_ikParentQ);
    frame.hand.quaternion.copy(_ikParentQ.invert().multiply(_barQ));
    frame.hand.updateMatrixWorld(true);
  }

  /** The ride clips leave the fingers straight. Close them most of the way to the punch fist. */
  function closeGrip() {
    const w = GRIP_CURL * (actions[current]?.getEffectiveWeight() ?? 1);
    for (const { bone, q } of gripPose) bone.quaternion.slerp(q, w);
  }

  const _leanAxis = new THREE.Vector3();

  /** Bend the riding clip's upright torso forward until the hands can reach the Velo bars. */
  function leanOnVelo(yaw) {
    if (!armBones || !bodyBones) return;
    const cfg = GRIP.velo;
    cfg.y = VELO_RIDE.bar.y;
    cfg.z = VELO_RIDE.bar.z;
    cfg.x = VELO_RIDE.grip;
    gripTarget(_gripL, yaw, -1, cfg);
    gripTarget(_gripR, yaw, 1, cfg);
    _leanAxis.set(-Math.cos(yaw), 0, Math.sin(yaw));
    leanToBars(
      THREE,
      {
        spine: [bodyBones.pelvis, bodyBones.spine, bodyBones.spine1, bodyBones.spine2],
        head: bodyBones.head,
        arms: [
          [armBones.lUpper, armBones.lFore, armBones.lHand],
          [armBones.rUpper, armBones.rFore, armBones.rHand],
        ],
      },
      [_gripL, _gripR],
      _leanAxis,
    );
  }

  /** Taller riders stand too upright for the step bars. Bend above the pelvis so the planted legs stay put. */
  function leanOnScooter(yaw, deck) {
    if (!armBones || !bodyBones) return;
    const cfg = deck ? GRIP.scooterOnDeck : GRIP.scooter;
    gripTarget(_gripL, yaw, -1, cfg);
    gripTarget(_gripR, yaw, 1, cfg);
    _leanAxis.set(-Math.cos(yaw), 0, Math.sin(yaw));
    leanToBars(
      THREE,
      {
        spine: [bodyBones.spine, bodyBones.spine1, bodyBones.spine2],
        head: bodyBones.head,
        arms: [
          [armBones.lUpper, armBones.lFore, armBones.lHand],
          [armBones.rUpper, armBones.rFore, armBones.rHand],
        ],
      },
      [_gripL, _gripR],
      _leanAxis,
      { max: 0.6 },
    );
  }

  // Two-bone leg solve. Reused so the scooter stance does not allocate per frame.
  const _aimPos = new THREE.Vector3();
  const _aimY = new THREE.Vector3();
  const _aimZ = new THREE.Vector3();
  const _legHip = new THREE.Vector3();
  const _legKnee = new THREE.Vector3();
  const _legAnkle = new THREE.Vector3();
  const _legPole = new THREE.Vector3();
  const _legDir = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);

  /**
   * Swing `bone` so `child` lands on the line to `worldPoint`. Pieter's legs run
   * along local +Y, but Mo's and Jacob's Biped legs run along +X, so no fixed axis.
   */
  function aimBone(bone, child, worldPoint) {
    const parent = bone.parent;
    if (!parent) return;
    bone.updateWorldMatrix(true, true);
    _aimPos.setFromMatrixPosition(bone.matrixWorld);
    _aimY.setFromMatrixPosition(child.matrixWorld).sub(_aimPos);
    _aimZ.copy(worldPoint).sub(_aimPos);
    if (_aimY.lengthSq() < 1e-8 || _aimZ.lengthSq() < 1e-8) return;
    _ikQ.setFromUnitVectors(_aimY.normalize(), _aimZ.normalize());
    bone.getWorldQuaternion(_ikWorldQ);
    _ikWorldQ.premultiply(_ikQ);
    parent.getWorldQuaternion(_ikParentQ);
    bone.quaternion.copy(_ikParentQ.invert()).multiply(_ikWorldQ);
  }

  /**
   * Hip → knee → ankle. Knee bends toward `pole` (in front of the hip) so the
   * leg does not hyperextend. Lengths come from the current bone spacing.
   */
  function solveLeg(thigh, calf, foot, target, pole) {
    if (!thigh || !calf || !foot) return;
    thigh.updateWorldMatrix(true, true);
    _legHip.setFromMatrixPosition(thigh.matrixWorld);
    _legKnee.setFromMatrixPosition(calf.matrixWorld);
    _legAnkle.setFromMatrixPosition(foot.matrixWorld);
    const upper = Math.max(0.05, _legHip.distanceTo(_legKnee));
    const lower = Math.max(0.05, _legKnee.distanceTo(_legAnkle));
    _legDir.copy(target).sub(_legHip);
    const reach = _legDir.length();
    if (reach < 1e-4) return;
    _legDir.multiplyScalar(1 / reach);
    const dist = Math.max(Math.abs(upper - lower) + 0.02, Math.min((upper + lower) * 0.985, reach));
    const along = (dist * dist + upper * upper - lower * lower) / (2 * dist);
    const bow = Math.sqrt(Math.max(0, upper * upper - along * along));
    _legPole.copy(pole).sub(_legHip);
    _legPole.addScaledVector(_legDir, -_legPole.dot(_legDir));
    if (_legPole.lengthSq() < 1e-6) {
      _legPole.copy(_worldUp);
      _legPole.addScaledVector(_legDir, -_legPole.dot(_legDir));
    }
    _legPole.normalize();
    _legKnee.copy(_legHip).addScaledVector(_legDir, along).addScaledVector(_legPole, bow);
    aimBone(thigh, calf, _legKnee);
    thigh.updateMatrixWorld(true);
    aimBone(calf, foot, target);
    calf.updateMatrixWorld(true);
    const bind = foot.userData.bindRootQ;
    if (bind) {
      root.getWorldQuaternion(_ikWorldQ).multiply(bind);
      foot.parent.getWorldQuaternion(_ikParentQ);
      foot.quaternion.copy(_ikParentQ.invert()).multiply(_ikWorldQ);
    }
  }

  /**
   * The boxing clips throw from a bladed stance the gait doesn't have, so over a run
   * the fists land wide and at belly height. While a fist is going out, turn the
   * shoulders into it and steer it to full reach on the chin line ahead.
   */
  const STRIKE_TURN = 0.45;
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const _stkQ = new THREE.Quaternion();
  const _stkF = new THREE.Vector3();
  const _stkR = new THREE.Vector3();
  const _stkS = new THREE.Vector3();
  const _stkO = new THREE.Vector3();
  const _stkH = new THREE.Vector3();
  const _stkD = new THREE.Vector3();
  const _stkT = new THREE.Vector3();
  const _stkP = new THREE.Vector3();
  const strikeSaved = [];
  function restoreStrike() {
    for (const [bone, q] of strikeSaved) bone.quaternion.copy(q);
    strikeSaved.length = 0;
  }
  /** Off hand back to the chin, elbow tucked, when the clip swings it wide. */
  function guardHand([side, upper, fore, hand], g) {
    upper.getWorldPosition(_stkS);
    hand.getWorldPosition(_stkH);
    _stkT.copy(_stkS).addScaledVector(_stkF, 0.24).addScaledVector(_stkR, -side * 0.1).addScaledVector(_worldUp, 0.02);
    _stkT.lerp(_stkH, 1 - g);
    _stkP.copy(_stkS).addScaledVector(_stkR, side * 0.15).addScaledVector(_worldUp, -0.4);
    solveLeg(upper, fore, hand, _stkT, _stkP);
  }

  function polishStrike() {
    if (!melee || !UPPER_STRIKE.has(melee) || !armBones || !bodyBones?.spine1) return;
    const act = actions[melee];
    if (!act?.isRunning()) return;
    const k = act.getEffectiveWeight();
    if (k < 0.05) return;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_stkQ);
    _stkF.set(0, 0, -1).applyQuaternion(_stkQ).setY(0).normalize();
    _stkR.crossVectors(_stkF, _worldUp);
    const sides = [
      [-1, armBones.lUpper, armBones.lFore, armBones.lHand],
      [1, armBones.rUpper, armBones.rFore, armBones.rHand],
    ];
    let lead = null;
    let best = -Infinity;
    for (const s of sides) {
      s[1].getWorldPosition(_stkS);
      const reach = s[3].getWorldPosition(_stkH).sub(_stkS).dot(_stkF);
      if (reach > best) {
        best = reach;
        lead = s;
      }
    }
    const w = k * smooth(0.12, 0.42, best);
    const rear = lead === sides[0] ? sides[1] : sides[0];
    rear[1].getWorldPosition(_stkS);
    const flare = rear[3].getWorldPosition(_stkH).sub(_stkS).dot(_stkR) * rear[0];
    const g = k * smooth(0.08, 0.25, flare);
    if (w < 0.01 && g < 0.01) return;
    for (const b of [bodyBones.spine1, bodyBones.spine2, ...sides.flatMap((s) => [s[1], s[2]])]) {
      if (b) strikeSaved.push([b, b.quaternion.clone()]);
    }
    if (g >= 0.01) guardHand(rear, g);
    if (w < 0.01) return;
    const [side, upper, fore, hand] = lead;
    // Shoulders into the punch: the punching side comes forward.
    _stkQ.setFromAxisAngle(_worldUp, (side * STRIKE_TURN * w) / 2);
    for (const b of [bodyBones.spine1, bodyBones.spine2]) {
      if (!b) continue;
      b.getWorldQuaternion(_ikWorldQ).premultiply(_stkQ);
      b.parent.getWorldQuaternion(_ikParentQ);
      b.quaternion.copy(_ikParentQ.invert().multiply(_ikWorldQ));
      b.updateMatrixWorld(true);
    }
    upper.getWorldPosition(_stkS);
    sides[0][1].getWorldPosition(_stkO).add(sides[1][1].getWorldPosition(_stkT)).multiplyScalar(0.5);
    const arm = _stkS.distanceTo(fore.getWorldPosition(_stkT)) + _stkT.distanceTo(hand.getWorldPosition(_stkH));
    _stkD.subVectors(_stkH, _stkS);
    const len = _stkD.length();
    if (len < 1e-4) return;
    _stkD.multiplyScalar(1 / len);
    // The chin line: straight out from between the shoulders, just above their height.
    const half = _stkO.distanceTo(_stkS);
    const ahead = Math.sqrt(Math.max(0, (arm * 0.97) ** 2 - half * half));
    _stkT.copy(_stkO).addScaledVector(_stkF, ahead).addScaledVector(_worldUp, 0.03).sub(_stkS).normalize();
    _stkD.lerp(_stkT, w).normalize();
    _stkT.copy(_stkS).addScaledVector(_stkD, len + (arm * 0.97 - len) * w);
    _stkP.copy(_stkS).addScaledVector(_stkR, side * 0.3).addScaledVector(_worldUp, -0.35);
    solveLeg(upper, fore, hand, _stkT, _stkP);
  }

  /**
   * Feet on the Velo cranks. Phase 0 is the left pedal forward; increasing
   * angle pushes that pedal down. Matches the crank in viewer/velo.js.
   */
  function polishVeloLegs(yaw) {
    if (!bodyBones) return;
    const dur = actions.ride?.getClip()?.duration || 1;
    const t = actions.ride ? actions.ride.time : 0;
    pedal = ((t % dur) + dur) % dur / dur;
    const ang = pedal * Math.PI * 2;
    const bx = root.position.x - Math.sin(yaw) * VELO_FWD;
    const bz = root.position.z - Math.cos(yaw) * VELO_FWD;
    const R = VELO_RIDE.crankR;
    const crank = VELO_RIDE.crank;
    const ankle = 0.09;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const feet = [
      ["lThigh", "lCalf", "lFoot", -1, 0],
      ["rThigh", "rCalf", "rFoot", 1, Math.PI],
    ];
    for (const [thighK, calfK, footK, side, extra] of feet) {
      const a = ang + extra;
      const lx = crank.x + side * VELO_RIDE.pedalX;
      const ly = crank.y - R * Math.sin(a) + ankle;
      const lz = crank.z - R * Math.cos(a);
      _gripL.set(bx + c * lx + s * lz, ly, bz - s * lx + c * lz);
      const thigh = bodyBones[thighK];
      if (!thigh) continue;
      thigh.updateWorldMatrix(true, false);
      _legHip.setFromMatrixPosition(thigh.matrixWorld);
      _legPole.set(
        _legHip.x - Math.sin(yaw) * 0.4,
        _legHip.y + 0.2,
        _legHip.z - Math.cos(yaw) * 0.4,
      );
      solveLeg(thigh, bodyBones[calfK], bodyBones[footK], _gripL, _legPole);
    }
  }

  /** Shift the body so the pelvis rests on the Velo saddle, the same rule as movement.html. */
  function seatOnVelo(yaw) {
    const pelvis = bodyBones?.pelvis;
    if (!pelvis || !visual) return;
    _seatCfg.y = VELO_RIDE.saddle.y + 0.06;
    _seatCfg.z = VELO_RIDE.saddle.z;
    _seatCfg.x = VELO_RIDE.saddle.x;
    gripTarget(_seatW, yaw, 1, _seatCfg);
    root.updateMatrixWorld(true);
    _vBone.setFromMatrixPosition(pelvis.matrixWorld);
    root.worldToLocal(_vBone);
    root.worldToLocal(_seatW);
    visual.position.add(_seatW.sub(_vBone));
    root.updateMatrixWorld(true);
  }

  /**
   * NPC scooter clips plant one foot toward the stem and one toward the tail,
   * soles on the deck. The player clip only guesses a crouch, so the legs
   * trail off the board. Solve them onto the same stance.
   * `deck` is { x, y, z, yaw } with y on the grip and -Z (yaw 0) toward the stem.
   */
  function polishScooterLegs(deck) {
    if (!bodyBones || !deck) return;
    const c = Math.cos(deck.yaw);
    const s = Math.sin(deck.yaw);
    const ankle = 0.07; // sole thickness: foot bone sits above the grip
    // Left foot forward on the deck, right foot back. Matches the NPC stagger.
    const feet = [
      ["lThigh", "lCalf", "lFoot", -0.045, -0.06, -1],
      ["rThigh", "rCalf", "rFoot", 0.045, 0.12, 1],
    ];
    for (const [thighK, calfK, footK, lx, lz, side] of feet) {
      _gripL.set(deck.x + lx * c + lz * s, deck.y + ankle, deck.z - lx * s + lz * c);
      const thigh = bodyBones[thighK];
      if (!thigh) continue;
      thigh.updateWorldMatrix(true, false);
      _legHip.setFromMatrixPosition(thigh.matrixWorld);
      const fx = -Math.sin(deck.yaw);
      const fz = -Math.cos(deck.yaw);
      const rx = Math.cos(deck.yaw);
      const rz = -Math.sin(deck.yaw);
      _legPole.set(
        _legHip.x + fx * 0.45 + rx * side * 0.18,
        _legHip.y - 0.05,
        _legHip.z + fz * 0.45 + rz * side * 0.18,
      );
      solveLeg(thigh, bodyBones[calfK], bodyBones[footK], _gripL, _legPole);
    }
  }

  /** Rocketbox Bip01_* or Mixamo mixamorig9:Head etc. */
  function findNamed(root, ...suffixes) {
    for (const s of suffixes) {
      const exact = root.getObjectByName(s);
      if (exact) return exact;
    }
    let found = null;
    const want = suffixes.map((s) =>
      s.toLowerCase().replace(/^mixamorig\d*:/, "").replace(/^mixamorig:?/, "")
    );
    root.traverse((o) => {
      if (found) return;
      const n = (o.name || "")
        .toLowerCase()
        .replace(/^mixamorig\d*:/, "")
        .replace(/^mixamorig:?/, "")
        .replace(/^bip01[_\s]?/, "");
      if (want.includes(n) || want.includes(`bip01_${n}`) || want.includes(n.replace(/\s/g, "_")))
        found = o;
    });
    return found;
  }

  function ensureClip(kind) {
    if (actions[kind] || clipLoads[kind]) return;
    const id = playerId;
    const gen = buildGen;
    const file = kind === "ride" ? "Riding" : "Scooter";
    clipLoads[kind] = load(`${id}_${file}.glb`)
      .then((gltf) => {
        if (gen !== buildGen || !mixer || !gltf?.animations?.length) return;
        const clip = sanitizeClip(gltf.animations[0]);
        if (!clip || clip.duration < 1e-3) return;
        const action = mixer.clipAction(clip);
        action.enabled = true;
        action.setEffectiveWeight(0);
        action.setLoop(THREE.LoopRepeat, Infinity);
        actions[kind] = action;
      })
      .catch(() => {});
  }

  async function build(id) {
    const gen = ++buildGen;
    clipLoads = { ride: null, scooter: null };
    const walkGltf = await load(`${id}_Walking.glb`);
    if (gen !== buildGen) return;

    if (visual) {
      root.remove(visual);
      visual.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m?.dispose?.();
        }
      });
      visual = null;
      armBones = null;
      clavBones = null;
      shoulderBind = [];
    }
    armed = null;
    mixer = null;
    actions = { walk: null, ride: null, scooter: null };
    current = null;
    mocap = false;
    melee = null;
    meleeQueue = null;
    jumpLatch = false;

    visual = cloneSkeleton(walkGltf.scene);
    // Drop stray Rocketbox helpers (e.g. Icosphere) that break bounds / grounding.
    const drop = [];
    visual.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.name || "").toLowerCase();
      if (n.includes("ico") || n.includes("sphere")) drop.push(o);
    });
    for (const o of drop) o.parent?.remove(o);
    visual.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    normalizeImportScale(visual);
    visual.updateMatrixWorld(true);

    // Sole to crown, the same ruler as everyone else (viewer/person-scale.js).
    // Measuring ankle-to-skull and calling that the body left the hair and the
    // shoes on top, so the player stood a head above the staff.
    const span = skinnedHeight(THREE, visual);
    const s = span > 0.01 ? ADULT_M / span : 1;
    visual.scale.setScalar(s);
    const foot = findNamed(
      visual,
      "Bip01_L_Foot",
      "Bip01 L Foot",
      "Bip01_R_Foot",
      "LeftFoot",
      "mixamorigLeftFoot",
      "mixamorig:LeftFoot"
    );
    // Player motion with yaw=0 walks toward −Z. Both binds need the half-turn;
    // a thigh cross-product here faced Pieter at the camera.
    visual.rotation.y = Math.PI;
    visual.updateMatrixWorld(true);
    if (foot) {
      foot.updateWorldMatrix(true, false);
      visual.position.y -= foot.matrixWorld.elements[13] - root.position.y;
    } else {
      const box = new THREE.Box3().setFromObject(visual);
      if (Number.isFinite(box.min.y)) visual.position.y -= box.min.y;
    }
    visualBaseY = visual.position.y;

    mixer = new THREE.AnimationMixer(visual);
    mixer.addEventListener("finished", (e) => {
      if (!melee || e.action !== actions[melee]) return;
      const next = meleeQueue;
      const done = melee;
      melee = null;
      meleeQueue = null;
      // Upper-body strikes sit on top of the gait — fade them out; keep legs moving.
      // Kicks own the whole body: leave `current` on the clip so the next gait fades it.
      if (done !== "kick") e.action.fadeOut(0.12);
      if (next && actions[next]) playStrike(next, 0.12);
    });

    let moves = null;
    let combatClips = null;
    try {
      [moves, combatClips] = await Promise.all([
        load(`clips/${id}_moves.glb`),
        load(`clips/${id}_combat.glb`).catch(() => null),
      ]);
    } catch {
      moves = null;
    }
    if (gen !== buildGen) return;
    try {
      const res = await fetch(new URL("clips/locomotion.json", base));
      if (res.ok) speeds = { ...CLIP_SPEED, ...(await res.json()) };
    } catch {
      /* baked defaults */
    }
    try {
      const res = await fetch(new URL("clips/combat.json", base));
      if (res.ok) {
        for (const [k, v] of Object.entries(await res.json())) speeds[k[0].toLowerCase() + k.slice(1)] = v;
      }
    } catch {
      /* combat clips play at 1x */
    }
    if (gen !== buildGen) return;

    const byName = new Map((moves?.animations || []).map((c) => [c.name, sanitizeClip(c)]));
    const add = (key, clip, loop) => {
      if (!clip) return;
      const action = mixer.clipAction(loop ? loopClip(clip) : clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      actions[key] = action;
    };
    add("idle", byName.get("Idle"), true);
    add("walk", byName.get("Walk"), true);
    add("jog", byName.get("Jog"), true);
    add("run", byName.get("Run"), true);
    // Legs-only gaits under upper-body punches so the stride keeps going while you jab.
    add("idleLegs", legsOnlyClip(byName.get("Idle")), true);
    add("walkLegs", legsOnlyClip(byName.get("Walk")), true);
    add("jogLegs", legsOnlyClip(byName.get("Jog")), true);
    add("runLegs", legsOnlyClip(byName.get("Run")), true);
    add("jump", byName.get("Jump"), false);
    add("punch", upperBodyClip(byName.get("Punch")), false);
    add("cross", upperBodyClip(byName.get("Cross")), false);
    add("kick", byName.get("Kick"), false); // full-body: a kick needs the legs
    add("ride", byName.get("Riding"), true);
    mocap = !!(actions.idle && actions.walk && actions.jog && actions.run);
    gripPose = [];
    const fistClip = byName.get("Punch");
    for (const track of fistClip?.tracks || []) {
      const m = /^(Bip01_[LR]_Finger\d+)\.quaternion$/.exec(track.name);
      const bone = m && visual.getObjectByName(m[1]);
      if (!bone) continue;
      const q = new THREE.Quaternion();
      sampleTrackQuat(track, fistClip.duration * 0.5, q);
      gripPose.push({ bone, q });
    }

    if (!actions.walk) {
      const walkClipRaw =
        walkGltf.animations.find((c) => /walk/i.test(c.name)) || walkGltf.animations[0];
      const walkClip = walkClipRaw ? sanitizeClip(walkClipRaw) : null;
      if (walkClip) actions.walk = mixer.clipAction(loopClip(walkClip));
    }
    root.add(visual);
    cacheArmBones(visual);
    cacheBarHands(visual);
    // Still in the bind pose: soles flat, ankle on the floor.
    const soles = captureSoles(THREE, visual, [bodyBones?.lFoot, bodyBones?.rFoot]);
    plantFeet = soles ? createFootPlant(THREE, soles) : null;
    footLevel = soles ? soleLevelers(THREE, soles).map((f) => ({ ...f, last: new THREE.Quaternion(), set: false })) : [];
    soleDrop = soles ? Math.max(...soles.map((s) => s.drop)) : 0;
    lift = soleDrop;
    if (combatClips?.animations?.length && armBones) {
      armed = createArmedRig(THREE, {
        root,
        visual,
        mixer,
        actions,
        arms: armBones,
        body: bodyBones,
        ik: ccdArmIK,
        limb: solveLeg,
        clips: new Map(combatClips.animations.map((c) => [c.name, sanitizeClip(c)])),
        speeds,
        footPhase,
        upper: upperBodyClip,
        legs: legsOnlyClip,
        loop: loopClip,
        fist: () => gripPose,
      });
      if (pendingWeapon !== "unarmed") armed.setWeapon(pendingWeapon);
    }
    // The baked speeds are the Mixamo source's hips path (sway included, source leg
    // length); playback rate must follow this rig's own stride or the feet skate.
    for (const key of STRIDE_KEYS) {
      const s = actions[key] && strideOf(actions[key].getClip(), /Strafe/.test(key));
      if (!s) continue;
      if (s.speed > 0.2) speeds[key] = s.speed;
      footPhase[key] = s.leftDown;
    }

    const start = actions.idle || actions.walk;
    if (start) {
      start.enabled = true;
      start.setEffectiveWeight(1);
      start.play();
      current = actions.idle ? "idle" : "walk";
    }
    playerId = id;
    // Fetch the ride clips now, so the first frames on a scooter don't show the walk.
    clipLoads = { ride: null, scooter: null };
    if (!actions.ride) ensureClip("ride");
    ensureClip("scooter");
    await Promise.all(Object.values(clipLoads).filter(Boolean));
  }

  /** Strafe legs while aiming. The rig blends its own clips; just fade the gait out. */
  function useArmedLegs() {
    if (current === "armed") return;
    const prev = current ? actions[current] : null;
    if (prev) prev.fadeOut(0.15);
    current = "armed";
  }

  function setAction(name, fade = 0.16, once = false, force = false) {
    if (name === current && !force) return;
    const next = actions[name];
    const prev = current ? actions[current] : null;
    if (!next) return;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = !!once;
    // Clips are parked at weight 0 so they don't all blend on load. fadeIn
    // multiplies that weight, so a parked clip fades from 0 to 0 and the body
    // snaps back to the bind pose (arms out, legs straight) once idle fades out.
    next.reset();
    // Gait to gait, pick up on the same foot so the crossfade doesn't scissor.
    if (prev && !once && footPhase[name] != null && footPhase[current] != null) {
      const p = prev.time / prev.getClip().duration - footPhase[current];
      next.time = ((((p + footPhase[name]) % 1) + 1) % 1) * next.getClip().duration;
    }
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current = name;
    // The ride crossfade can leave a spun head. Don't treat the next pose as a glitch.
    headReady = false;
  }

  // Trimmed Mixamo boxing: jab-cross, then a hook, then a checked kick.
  // Near real time. The next hit blends in before the last one returns to guard.
  const STRIKE_RATE = { punch: 1.08, cross: 1.05, kick: 1.08 };
  const UPPER_STRIKE = new Set(["punch", "cross"]);

  function gaitFor(speed) {
    const s = Math.abs(speed);
    if (s < 0.28) return "idle";
    if (s < 1.7) return "walk";
    if (s < 5.2) return "jog";
    return "run";
  }

  /** Drive locomotion. `legsOnly` keeps the stride under an upper-body punch. */
  function driveGait(moveSpeed, legsOnly = false) {
    const gait = gaitFor(moveSpeed);
    const legsKey = `${gait}Legs`;
    const name = legsOnly && actions[legsKey] ? legsKey : actions[gait] ? gait : "walk";
    setAction(name, legsOnly ? 0.1 : 0.18);
    const action = actions[name];
    if (!action) return;
    const native = speeds[gait] || 0;
    if (gait === "idle" || native < 0.2) action.setEffectiveTimeScale(1);
    else {
      const rate = Math.abs(moveSpeed) / native;
      // A walk played much below native freezes mid-stride and reads as a shuffle;
      // keep the full step cadence and let the feet slide a touch instead.
      const floor = gait === "walk" ? 0.75 : 0.4;
      action.setEffectiveTimeScale(Math.max(floor, Math.min(2.4, rate)));
    }
  }

  function playStrike(name, fade) {
    melee = name;
    const act = actions[name];
    if (!act) return;
    if (UPPER_STRIKE.has(name)) {
      // Keep legs on the gait; overlay spine/arms from the punch clip.
      act.reset();
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      act.setEffectiveWeight(1);
      act.setEffectiveTimeScale(STRIKE_RATE[name] || 1.08);
      act.fadeIn(fade).play();
      return;
    }
    setAction(name, fade, true, true);
    act.setEffectiveTimeScale(STRIKE_RATE[name] || 1.08);
  }

  function strike(kind) {
    if (!mocap || !visual) return;
    if (current === "ride" || current === "scooter" || jumpLatch) return;
    const want = kind === "kick" ? "kick" : "punch";
    if (!actions[want] && !(want === "punch" && actions.cross)) return;
    if (melee) {
      const act = actions[melee];
      const dur = act?.getClip()?.duration || 1;
      if (act && act.time > dur * 0.22) {
        if (kind === "kick" && actions.kick) meleeQueue = "kick";
        else meleeQueue = melee === "punch" && actions.cross ? "cross" : "punch";
      }
      return;
    }
    meleeQueue = null;
    playStrike(actions[want] ? want : "cross", 0.1);
  }

  function start() {
    if (!built) {
      built = true;
      ready = build(playerId);
    }
    return ready;
  }

  return {
    root,
    get playerId() {
      return playerId;
    },
    get facing() {
      return facing;
    },
    ready: () => start(),
    async setPlayer(id) {
      if (id === playerId && visual) return;
      if (remember) setStoredPlayerId(id);
      playerId = id;
      built = true;
      ready = build(id);
      await ready;
    },
    /**
     * @param {number} dt
     * @param {{ x: number, y?: number, z: number }} pos  xz world; y = eye height (≈1.7 on ground)
     * @param {number} moveSpeed  m/s forward magnitude
     * @param {number} targetYaw  body facing (Three Y)
     * @param {"walk"|"velo"|"scooter"} kind
     * @param {{ x: number, y: number, z: number, yaw: number } | null} [deck]
     *   Scooter grip surface in world space. Feet are solved onto it.
     */
    update(dt, pos, moveSpeed, targetYaw, kind = "walk", deck = null, fight = null) {
      if (!visual) return;
      root.position.x = pos.x;
      root.position.z = pos.z;
      // Walker stores eye height; feet sit eye−EYE_M (jump lifts both).
      // On a scooter the eye is already deck + ride height, so the soles use the grip.
      // On foot the soles may go below 0 (pond bed). Wheels keep the floor: their eye is
      // under EYE_M, so eye−EYE_M would sink the bike.
      const eye = kind === "scooter" && deck ? 1.58 : EYE_M;
      const feet = Number.isFinite(pos.y) ? pos.y - eye : 0;
      root.position.y = kind === "walk" ? feet : Math.max(0, feet);

      // On wheels the bike snaps to targetYaw every frame; keep the rider with it so the
      // pedal IK does not twist the feet. On foot, snap once you are moving so a look-turn
      // does not leave you walking sideways — ease only when nearly still (idle turn).
      if (kind === "velo" || kind === "scooter" || Math.abs(moveSpeed) > 0.3) {
        facing = targetYaw;
      } else {
        const dy = Math.atan2(Math.sin(targetYaw - facing), Math.cos(targetYaw - facing));
        facing += dy * (1 - Math.exp(-18 * dt));
      }
      root.rotation.y = facing;

      // Pavement is 0.12 m. A few centimetres of sidewalk must not freeze the stride;
      // only a hop clear of the kerb counts as airborne.
      const airborne = kind === "walk" && root.position.y > 0.2;
      const onFoot = kind !== "velo" && kind !== "scooter";
      if (!onFoot) {
        melee = null;
        meleeQueue = null;
        jumpLatch = false;
      }

      const dead = !!fight?.dead;
      const aimLegs =
        !!armed?.ready && onFoot && !airborne && !melee && !dead && (fight?.aim ?? 0) > 0.5 && armed.weapon !== "unarmed" && armed.weapon !== "knife";
      if (dead && actions.death) {
        if (current !== "death") {
          armed?.clear();
          melee = null;
          meleeQueue = null;
          setAction("death", 0.12, true, true);
        }
      } else if (kind === "velo") {
        if (actions.ride) setAction("ride", 0.2);
        else ensureClip("ride");
      } else if (kind === "scooter") {
        if (actions.scooter) setAction("scooter", 0.2);
        else ensureClip("scooter");
      } else if (melee && actions[melee]) {
        const act = actions[melee];
        const dur = act.getClip()?.duration || 1;
        if (meleeQueue && act.time > dur * 0.62) {
          const next = meleeQueue;
          meleeQueue = null;
          playStrike(next, 0.16);
        } else if (!UPPER_STRIKE.has(melee)) {
          setAction(melee, 0.1, true);
          act.setEffectiveTimeScale(STRIKE_RATE[melee] || 1.08);
        }
        // Punches/crosses keep the stride; kicks still own the whole body.
        if (UPPER_STRIKE.has(melee) && mocap) driveGait(moveSpeed, true);
      } else if (aimLegs) {
        useArmedLegs();
      } else if (airborne && actions.jump) {
        if (!jumpLatch) {
          jumpLatch = true;
          setAction("jump", 0.05, true, true);
        }
        // The Mixamo hop is ~2.2s; the fence-clear is closer to 1.2s.
        actions.jump.setEffectiveTimeScale(1.75);
      } else if (mocap) {
        if (jumpLatch) jumpLatch = false;
        // Three.js averages every clip on a bone, so a full-body gait would halve a reload.
        driveGait(moveSpeed, !!armed?.busy);
      } else {
        setAction("walk");
        if (airborne) airBlend = Math.min(1, airBlend + dt * 9);
        else airBlend = Math.max(0, airBlend - dt * 6);
        if (actions.walk && current === "walk") {
          const scale = Math.max(0.05, Math.min(3.2, Math.abs(moveSpeed) / 1.7));
          actions.walk.setEffectiveTimeScale(airborne ? 0 : Math.abs(moveSpeed) < 0.08 ? 0 : scale);
        }
      }

      if (actions.ride && current === "ride") {
        const native = speeds.ride || 4.2;
        actions.ride.setEffectiveTimeScale(Math.max(0.15, Math.min(2.2, Math.abs(moveSpeed) / native)));
      } else if (actions.scooter && current === "scooter") {
        actions.scooter.setEffectiveTimeScale(Math.max(0.2, Math.min(1.8, Math.abs(moveSpeed) / 3.5)));
      }

      armed?.drive(dt, {
        legsOwned: current === "armed",
        aim: dead ? 0 : (fight?.aim ?? 0),
        moveSpeed,
        moveYaw: fight?.moveYaw ?? targetYaw,
        facing,
        onFoot,
        dead,
      });
      restoreStrike();
      if (mixer) mixer.update(dt);
      // A bone the mixer left alone still holds last frame's levelled value.
      for (const f of footLevel) {
        if (f.set && f.bone.quaternion.equals(f.last)) continue;
        f.bone.quaternion.multiply(f.q);
      }
      // Walk clips re-assert the tiny FBX armature scale after mixer.update.
      normalizeImportScale(visual);
      visual.position.y = visualBaseY;
      const gaitNow = /^(idle|walk|jog|run)(Legs)?$/.test(current || "");
      if (!mocap && current === "walk" && actions.walk) {
        pinWalkPelvis();
        const dur = actions.walk.getClip()?.duration || 1;
        const phase = (actions.walk.time / dur) * Math.PI * 2;
        polishWalkPose(visual, phase, !airborne && Math.abs(moveSpeed) >= 0.08);
        if (airborne && !airPoseSaved) captureAirPose();
        const tuck = airBlend * airBlend * (3 - 2 * airBlend);
        if (tuck > 1e-3 && airPoseSaved) polishAirPose(tuck);
        else if (!airborne) restoreAirPose();
        applyWalkHead();
        stabilizeHead();
      } else if (mocap && gaitNow && onFoot) {
        pinWalkPelvis();
      } else if (kind === "velo" || kind === "scooter") {
        visual.position.x = 0;
        // Scooter mesh sits 0.18 m ahead of the root. Shift onto the deck so both
        // feet can plant under the hips instead of one leg lunging at the stem.
        visual.position.z = kind === "scooter" && deck ? -0.14 : 0;
        // Walk's head track is still fading out. Hold the bind so that blend can't stick.
        if (headOffBind && headBindReady && bodyBones?.head) {
          bodyBones.head.quaternion.copy(_headBind);
        }
        // Ride clips don't put Rocketbox/Mixamo wrists on the bars — IK does.
        // Scooter legs are solved onto the deck; the baked crouch leaves them trailing.
        root.updateMatrixWorld(true);
        // Clip upper-arm / Mixamo shoulder keys roll the deltoids. Square them before
        // lean measures reach (twisted arms look short → over-fold) and before bar IK.
        stabilizeRideShoulders();
        if (kind === "scooter") {
          polishScooterLegs(deck);
          leanOnScooter(targetYaw, deck);
        }
        if (kind === "velo") {
          seatOnVelo(targetYaw);
          leanOnVelo(targetYaw);
          polishVeloLegs(targetYaw);
        }
        polishRideGrips(kind, targetYaw, deck);
        closeGrip();
      }
      if (onFoot && plantFeet) {
        // In the air the lift holds, so a jump doesn't drop the hips.
        const grounded = !airborne && !dead;
        if (grounded) {
          root.updateMatrixWorld(true);
          // The sole's rim reaches a little below the heel, ball and toe points.
          const still = Math.abs(moveSpeed) < 0.15 && !melee;
          if (!still) armed?.squareHips();
          const want = Math.max(0, plantFeet(root, { still }) + 0.02);
          // Follow this frame's sole. Holding the lowest plant of the stride locked a limp.
          lift += (want - lift) * (1 - Math.exp(-8 * dt));
        } else if (dead) {
          lift += (soleDrop - lift) * (1 - Math.exp(-6 * dt));
        }
        visual.position.y = visualBaseY + lift;
        if (grounded) {
          root.updateMatrixWorld(true);
          plantFeet.clamp(root, 0.02);
        }
      }
      if (onFoot && !dead) polishStrike();
      if (armed && onFoot && !dead) {
        root.updateMatrixWorld(true);
        armed.post(dt, fight?.aimPoint || null);
      }
      for (const f of footLevel) {
        f.last.copy(f.bone.quaternion);
        f.set = true;
      }
      root.visible = true;
    },
    setVisible(v) {
      root.visible = !!v;
    },
    strike,
    /** Put a weapon in the right hand ("unarmed" empties it). */
    setWeapon(id) {
      pendingWeapon = id;
      armed?.setWeapon(id);
    },
    /** Recoil kick for one shot. */
    fire(def) {
      armed?.fire(def);
    },
    reload(dur) {
      return armed?.reload(dur) ?? false;
    },
    /** Knife attack (`move` "slash" or "stab"); falls back to a jab without the clips. */
    stab(move = "stab") {
      if (!armed?.stab(move)) strike("punch");
    },
    hitReact() {
      armed?.hitReact();
    },
    /** World muzzle position and barrel direction. False when no gun is in hand. */
    muzzle(outPos, outDir) {
      return armed?.muzzle(outPos, outDir) ?? false;
    },
    get armedReady() {
      return !!armed?.ready;
    },
    get weapon() {
      return pendingWeapon;
    },
    /** 0–1 through the pedal revolution, for the Velo crank. */
    pedalPhase() {
      return pedal;
    },
    /** True while a Mixamo jab, cross, or kick is playing. */
    get striking() {
      return !!melee;
    },
    get bones() {
      return armBones;
    },
    get legs() {
      return bodyBones;
    },
  };
}
