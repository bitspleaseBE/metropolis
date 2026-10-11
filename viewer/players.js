/**
 * Playable cast for Klein Antwerpen. Separate from sidewalk Mixamo civilians
 * in characters.js — these three bodies never enter the pedestrian pool.
 */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

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
  ]);
}

/** Native metres/second of each Mixamo loop, so playback matches the feet. */
const CLIP_SPEED = { idle: 0, walk: 1.5, jog: 1.9, run: 5.43, ride: 4.2 };

/**
 * Third-person player avatar: walk / ride / scooter clips, with grip IK on wheels.
 */
export function createPlayerAvatar(THREE, scene) {
  let root = new THREE.Group();
  root.name = "player-avatar";
  scene.add(root);

  let visual = null;
  let mixer = null;
  let actions = { walk: null, ride: null, scooter: null };
  let current = null;
  let mocap = false;
  let speeds = { ...CLIP_SPEED };
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
  /** @type {null | { lThigh: object, rThigh: object, lCalf: object, rCalf: object, spine: object, head: object }} */
  let bodyBones = null;
  let airBlend = 0;
  let airPoseSaved = false;
  /** Hips XZ (root space) to hold. Pieter's walk translates the pelvis a full stride per loop. */
  let pelvisPin = null;
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

  // Grip targets match viewer/scooters.js + viewer/velo.js (bike scale 1.55).
  const GRIP = {
    scooter: { fwd: 0.18, y: 1.17, z: -0.26, x: 0.22 },
    velo: { fwd: 0.15, y: 0.67 * 1.55, z: -0.3 * 1.55, x: 0.2 * 1.55 },
  };
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

  /** Drop scale tracks — FBX keys identity scale and fights normalizeImportScale. */
  function sanitizeClip(clip) {
    if (!clip?.tracks?.length) return clip;
    const tracks = clip.tracks.filter((t) => !t.name.endsWith(".scale"));
    if (tracks.length === clip.tracks.length) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  // Reused each frame for Mixamo thigh-lift polish.
  const _qLift = new THREE.Quaternion();
  const _vBone = new THREE.Vector3();

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
    bodyBones = {
      lThigh: findNamed(rig, "Bip01_L_Thigh", "Bip01 L Thigh", "LeftUpLeg", "mixamorigLeftUpLeg"),
      rThigh: findNamed(rig, "Bip01_R_Thigh", "Bip01 R Thigh", "RightUpLeg", "mixamorigRightUpLeg"),
      lCalf: findNamed(rig, "Bip01_L_Calf", "Bip01 L Calf", "LeftLeg", "mixamorigLeftLeg"),
      rCalf: findNamed(rig, "Bip01_R_Calf", "Bip01 R Calf", "RightLeg", "mixamorigRightLeg"),
      lFoot: findNamed(rig, "Bip01_L_Foot", "Bip01 L Foot", "LeftFoot", "mixamorigLeftFoot"),
      rFoot: findNamed(rig, "Bip01_R_Foot", "Bip01 R Foot", "RightFoot", "mixamorigRightFoot"),
      spine: findNamed(rig, "Bip01_Spine", "Bip01 Spine", "Spine", "mixamorigSpine"),
      head: findNamed(rig, "Bip01_Head", "Bip01 Head", "Head", "mixamorigHead"),
      pelvis: findNamed(rig, "Bip01_Pelvis", "Bip01 Pelvis", "Pelvis", "mixamorigHips"),
    };
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
    // Flat soles in the bind, body yaw still 0. Scooter IK keeps this orientation.
    root.updateMatrixWorld(true);
    for (const key of ["lFoot", "rFoot"]) {
      const bone = bodyBones[key];
      if (!bone) continue;
      bone.userData.bindWorldQ = new THREE.Quaternion();
      bone.getWorldQuaternion(bone.userData.bindWorldQ);
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

  function polishRideGrips(kind, yaw) {
    if (!armBones || (kind !== "velo" && kind !== "scooter")) return;
    const cfg = GRIP[kind];
    if (!cfg) return;
    gripTarget(_gripL, yaw, -1, cfg);
    gripTarget(_gripR, yaw, 1, cfg);
    ccdArmIK(armBones.lUpper, armBones.lFore, armBones.lHand, _gripL);
    ccdArmIK(armBones.rUpper, armBones.rFore, armBones.rHand, _gripR);
  }

  // Two-bone leg solve. Reused so the scooter stance does not allocate per frame.
  const _aimPos = new THREE.Vector3();
  const _aimX = new THREE.Vector3();
  const _aimY = new THREE.Vector3();
  const _aimZ = new THREE.Vector3();
  const _legHip = new THREE.Vector3();
  const _legKnee = new THREE.Vector3();
  const _legAnkle = new THREE.Vector3();
  const _legPole = new THREE.Vector3();
  const _legDir = new THREE.Vector3();
  const _legM = new THREE.Matrix4();
  const _yawQ = new THREE.Quaternion();
  const _worldUp = new THREE.Vector3(0, 1, 0);

  /** Point `bone`'s local +Y at `worldPoint`, twist so local +Z leans toward `poleWorld`. */
  function aimBone(bone, worldPoint, poleWorld) {
    const parent = bone.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    bone.updateWorldMatrix(true, false);
    _aimPos.setFromMatrixPosition(bone.matrixWorld);
    _aimY.copy(worldPoint).sub(_aimPos);
    if (_aimY.lengthSq() < 1e-8) return;
    _aimY.normalize();
    _aimZ.copy(poleWorld).sub(_aimPos);
    _aimZ.addScaledVector(_aimY, -_aimZ.dot(_aimY));
    if (_aimZ.lengthSq() < 1e-8) {
      _aimZ.copy(_worldUp);
      _aimZ.addScaledVector(_aimY, -_aimZ.dot(_aimY));
    }
    if (_aimZ.lengthSq() < 1e-8) return;
    _aimZ.normalize();
    _aimX.crossVectors(_aimY, _aimZ).normalize();
    _aimZ.crossVectors(_aimX, _aimY).normalize();
    _legM.makeBasis(_aimX, _aimY, _aimZ);
    _ikWorldQ.setFromRotationMatrix(_legM);
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
    aimBone(thigh, _legKnee, pole);
    thigh.updateMatrixWorld(true);
    aimBone(calf, target, pole);
    calf.updateMatrixWorld(true);
    const bind = foot.userData.bindWorldQ;
    if (bind) {
      _yawQ.setFromAxisAngle(_worldUp, root.rotation.y);
      _ikWorldQ.copy(_yawQ).multiply(bind);
      foot.parent.getWorldQuaternion(_ikParentQ);
      foot.quaternion.copy(_ikParentQ.invert()).multiply(_ikWorldQ);
    }
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
    const bx = root.position.x - Math.sin(yaw) * 0.15;
    const bz = root.position.z - Math.cos(yaw) * 0.15;
    const SCALE = 1.55;
    const R = 0.11;
    const ankle = 0.09 / SCALE;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const feet = [
      ["lThigh", "lCalf", "lFoot", -0.055, 0],
      ["rThigh", "rCalf", "rFoot", 0.055, Math.PI],
    ];
    for (const [thighK, calfK, footK, lat, extra] of feet) {
      const a = ang + extra;
      const lx = lat * SCALE;
      const ly = (0.2 - R * Math.sin(a) + ankle) * SCALE;
      const lz = (0.02 - R * Math.cos(a)) * SCALE;
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
    }
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

    const targetH = 1.72;
    const head = findNamed(
      visual,
      "Bip01_Head",
      "Bip01 Head",
      "Head",
      "mixamorigHead",
      "mixamorig:Head"
    );
    const foot = findNamed(
      visual,
      "Bip01_L_Foot",
      "Bip01 L Foot",
      "Bip01_R_Foot",
      "LeftFoot",
      "mixamorigLeftFoot",
      "mixamorig:LeftFoot"
    );
    let measureY = 0;
    if (head && foot) {
      head.updateWorldMatrix(true, false);
      foot.updateWorldMatrix(true, false);
      measureY = Math.abs(head.matrixWorld.elements[13] - foot.matrixWorld.elements[13]);
    }
    if (measureY < 0.2) {
      const box = new THREE.Box3().setFromObject(visual);
      measureY = box.max.y - box.min.y;
    }
    // Pedestrian loader uses >0.01; the old >0.3 gate left Mixamo James at 1.8 cm.
    const s = measureY > 0.01 ? targetH / measureY : 1;
    visual.scale.setScalar(s);
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

    mixer = new THREE.AnimationMixer(visual);
    mixer.addEventListener("finished", (e) => {
      if (!melee || e.action !== actions[melee]) return;
      const next = meleeQueue;
      melee = null;
      meleeQueue = null;
      current = null;
      if (next && actions[next]) {
        melee = next;
        setAction(next, 0.05, true, true);
      }
    });

    let moves = null;
    try {
      moves = await load(`clips/${id}_moves.glb`);
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
    if (gen !== buildGen) return;

    const byName = new Map((moves?.animations || []).map((c) => [c.name, sanitizeClip(c)]));
    const add = (key, clipName, loop) => {
      const clip = byName.get(clipName);
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      actions[key] = action;
    };
    add("idle", "Idle", true);
    add("walk", "Walk", true);
    add("jog", "Jog", true);
    add("run", "Run", true);
    add("jump", "Jump", false);
    add("punch", "Punch", false);
    add("cross", "Cross", false);
    add("kick", "Kick", false);
    add("ride", "Riding", true);
    mocap = !!(actions.idle && actions.walk && actions.jog && actions.run);

    if (!actions.walk) {
      const walkClipRaw =
        walkGltf.animations.find((c) => /walk/i.test(c.name)) || walkGltf.animations[0];
      const walkClip = walkClipRaw ? sanitizeClip(walkClipRaw) : null;
      if (walkClip) actions.walk = mixer.clipAction(walkClip);
    }
    const start = actions.idle || actions.walk;
    if (start) {
      start.enabled = true;
      start.setEffectiveWeight(1);
      start.play();
      current = actions.idle ? "idle" : "walk";
    }

    root.add(visual);
    cacheArmBones(visual);
    playerId = id;
    // A ride clip that resolved against the previous body must be fetched again.
    clipLoads = { ride: null, scooter: null };
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
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    current = name;
    // The ride crossfade can leave a spun head. Don't treat the next pose as a glitch.
    headReady = false;
  }

  function strike(kind) {
    if (!mocap || !visual) return;
    if (current === "ride" || current === "scooter" || jumpLatch) return;
    const want = kind === "kick" ? "kick" : "punch";
    if (!actions[want] && !(want === "punch" && actions.cross)) return;
    if (melee) {
      const act = actions[melee];
      const dur = act?.getClip()?.duration || 1;
      if (kind === "punch" && act && act.time > dur * 0.42) {
        meleeQueue = melee === "punch" && actions.cross ? "cross" : "punch";
      }
      return;
    }
    meleeQueue = null;
    melee = actions[want] ? want : "cross";
    setAction(melee, 0.07, true, true);
  }

  function gaitFor(speed) {
    const s = Math.abs(speed);
    if (s < 0.28) return "idle";
    if (s < 2.4) return "walk";
    if (s < 5.2) return "jog";
    return "run";
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
      setStoredPlayerId(id);
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
    update(dt, pos, moveSpeed, targetYaw, kind = "walk", deck = null) {
      if (!visual) return;
      root.position.x = pos.x;
      root.position.z = pos.z;
      // Walker stores eye height; feet sit eye−1.7 (jump lifts both).
      // On a scooter the eye is already deck + ride height, so the soles use the grip.
      const eye = kind === "scooter" && deck ? 1.58 : 1.7;
      root.position.y = Number.isFinite(pos.y) ? Math.max(0, pos.y - eye) : 0;

      const dy = Math.atan2(Math.sin(targetYaw - facing), Math.cos(targetYaw - facing));
      facing += dy * (1 - Math.exp(-20 * dt));
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

      if (kind === "velo") {
        if (actions.ride) setAction("ride", 0.2);
        else ensureClip("ride");
      } else if (kind === "scooter") {
        if (actions.scooter) setAction("scooter", 0.2);
        else ensureClip("scooter");
      } else if (melee && actions[melee]) {
        setAction(melee, 0.07, true);
        actions[melee].setEffectiveTimeScale(1);
      } else if (airborne && actions.jump) {
        if (!jumpLatch) {
          jumpLatch = true;
          setAction("jump", 0.05, true, true);
        }
        // The Mixamo hop is ~2.2s; the fence-clear is closer to 1.2s.
        actions.jump.setEffectiveTimeScale(1.75);
      } else if (mocap) {
        if (jumpLatch) {
          jumpLatch = false;
          current = null;
        }
        const gait = gaitFor(moveSpeed);
        const name = actions[gait] ? gait : "walk";
        setAction(name, 0.18);
        const action = actions[name];
        if (action) {
          const native = speeds[name] || 0;
          if (name === "idle" || native < 0.2) action.setEffectiveTimeScale(1);
          else {
            const rate = Math.abs(moveSpeed) / native;
            action.setEffectiveTimeScale(Math.max(0.7, Math.min(2.1, rate)));
          }
        }
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

      if (mixer) mixer.update(dt);
      // Walk clips re-assert the tiny FBX armature scale after mixer.update.
      normalizeImportScale(visual);
      const gaitNow = current === "idle" || current === "walk" || current === "jog" || current === "run";
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
        if (kind === "scooter") polishScooterLegs(deck);
        if (kind === "velo") polishVeloLegs(targetYaw);
        polishRideGrips(kind, targetYaw);
      }
      root.visible = true;
    },
    setVisible(v) {
      root.visible = !!v;
    },
    strike,
    /** 0–1 through the pedal revolution, for the Velo crank. */
    pedalPhase() {
      return pedal;
    },
  };
}
