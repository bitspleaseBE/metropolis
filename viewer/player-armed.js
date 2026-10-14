/**
 * The armed layer of the player avatar: gun in the right palm, Mixamo aim pose on the
 * upper body, strafe legs while aiming, a spine solve that puts the barrel on the
 * crosshair hit, left hand on the support grip, and procedural recoil.
 *
 * players.js owns the mixer and gait; this adds its clips to the same `actions` map
 * (so setAction can fade to `death`) and runs before and after mixer.update.
 */
import { loadWeaponModel, WEAPONS } from "./weapons.js";
import { RELOADS, poseAt, splitPart, makeMag, makeShell, createDrops } from "./weapon-reload.js";

const LEG_KEYS = ["aimIdleLegs", "aimWalk", "aimWalkBack", "aimStrafeL", "aimStrafeR", "aimRun"];
const OVERLAYS = ["holdPistol", "holdRifle", "reloadPistol", "reloadRifle", "stab", "slash", "hitReact"];
const RIFLE_LOW = 0.6;
const MAX_SOLVE = 1.1;
const HIP_SQUARE = 0.7;

export function createArmedRig(THREE, ctx) {
  const { root, visual, mixer, actions, arms, body, ik, limb, clips, speeds, footPhase, upper, legs, loop: loopClip, fist } = ctx;
  const has = (k) => !!actions[k];
  const weight = Object.fromEntries([...LEG_KEYS, ...OVERLAYS].map((k) => [k, 0]));
  const goal = { ...weight };

  function add(key, clip, loop = true) {
    if (!clip) return;
    const a = mixer.clipAction(loop ? loopClip(clip) : clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    actions[key] = a;
  }
  const C = (n) => clips.get(n);
  add("aimIdleLegs", legs(C("AimPistol")));
  add("aimWalk", legs(C("AimWalk")));
  add("aimWalkBack", legs(C("AimWalkBack")));
  add("aimStrafeL", legs(C("AimStrafeL")));
  add("aimStrafeR", legs(C("AimStrafeR")));
  add("aimRun", legs(C("AimRun")));
  add("holdPistol", upper(C("AimPistol")));
  add("holdRifle", upper(C("AimRifle") || C("AimPistol")));
  add("reloadPistol", upper(C("ReloadPistol")), false);
  add("reloadRifle", upper(C("ReloadRifle") || C("ReloadPistol")), false);
  // The knife clips throw the head back; it rides the chest instead.
  const headless = (clip) =>
    clip && new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter((t) => !/(neck|head)/i.test(t.name)));
  add("stab", headless(upper(C("Stab"))), false);
  add("slash", headless(upper(C("Slash"))), false);
  add("hitReact", upper(C("HitReact")), false);
  add("death", C("Death"), false);
  const ready = has("holdPistol");

  // --- Grip calibration: in each aim pose the barrel points along the body's forward.
  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const grip = {};
  const finger = (n) => visual.getObjectByName(`Bip01_R_${n}`) || visual.getObjectByName(`Bip01 R ${n}`);
  const f1 = finger("Finger1");
  const f2 = finger("Finger2");

  function palmWorld(out) {
    const hand = arms.rHand;
    hand.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(hand.matrixWorld);
    if (f1 && f2) {
      _w.setFromMatrixPosition(f1.matrixWorld).add(_s.setFromMatrixPosition(f2.matrixWorld)).multiplyScalar(0.5);
      return out.lerp(_w, 0.5);
    }
    _w.setFromMatrixPosition(arms.rFore.matrixWorld);
    return out.addScaledVector(_v.copy(out).sub(_w).normalize(), 0.07);
  }

  function calibrate(key, clip) {
    if (!clip || !arms?.rHand) return;
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.reset().setEffectiveWeight(1).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    const hand = arms.rHand;
    const p = palmWorld(new THREE.Vector3());
    hand.getWorldQuaternion(_q);
    hand.getWorldScale(_s);
    root.getWorldQuaternion(_q2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    grip[key] = {
      q: _q.clone().invert().multiply(_q2),
      p: hand.worldToLocal(p.clone()),
      s: 1 / Math.max(1e-6, _s.x),
    };
    a.stop();
  }
  // Each hand's frame from its own knuckles (hand-local), so one grip rule fits
  // Pieter's two-segment fingers and the Biped hands alike.
  const knuckle = (side, n) => visual.getObjectByName(`Bip01_${side}_${n}`) || visual.getObjectByName(`Bip01 ${side} ${n}`);
  function handFrame(side) {
    const hand = side === "L" ? arms?.lHand : arms?.rHand;
    const idx = knuckle(side, "Finger1");
    const mid = knuckle(side, "Finger2");
    const pinky = knuckle(side, "Finger4") || knuckle(side, "Finger3");
    if (!hand || !idx || !mid || !pinky) return null;
    root.updateMatrixWorld(true);
    const local = (b) => hand.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    const m = local(mid);
    const finger = m.clone().normalize();
    const across = local(idx).sub(local(pinky));
    across.addScaledVector(finger, -across.dot(finger)).normalize();
    const basis = new THREE.Matrix4().makeBasis(finger, across, new THREE.Vector3().crossVectors(finger, across));
    return { hand, palm: m.multiplyScalar(0.5), inv: new THREE.Quaternion().setFromRotationMatrix(basis).invert() };
  }
  const leftFrame = handFrame("L");
  // --- Fingers. The aim clips' retargeted fingers splay on these rigs, so grips are
  // built here: every finger starts from the bind pose (straight) and bends about
  // its own hinge, found from how that finger closes in the baked Punch fist.
  const bindLocal = new Map();
  visual.traverse((o) => {
    if (!o.isSkinnedMesh || bindLocal.size) return;
    const sk = o.skeleton;
    const world = sk.bones.map((_, i) => new THREE.Matrix4().copy(sk.boneInverses[i]).invert());
    const index = new Map(sk.bones.map((b, i) => [b, i]));
    const m = new THREE.Matrix4();
    sk.bones.forEach((b, i) => {
      const pi = index.get(b.parent);
      if (pi === undefined) return;
      const q = new THREE.Quaternion();
      m.copy(world[pi]).invert().multiply(world[i]).decompose(new THREE.Vector3(), q, new THREE.Vector3());
      bindLocal.set(b, q);
    });
  });
  const fistLocal = new Map((fist?.() || []).map(({ bone, q }) => [bone, q]));

  function buildFingers(side) {
    const hand = side === "L" ? arms?.lHand : arms?.rHand;
    if (!hand || !bindLocal.size) return null;
    const fingers = [];
    for (let n = 0; n < 5; n++) {
      const base = knuckle(side, `Finger${n}`);
      if (!base || !bindLocal.has(base)) continue;
      const chain = [base];
      for (const k of [1, 2]) {
        const b = knuckle(side, `Finger${n}${k}`);
        if (b && bindLocal.has(b)) chain.push(b);
      }
      // The last segment's far end, estimated from its own length (bones point down +x).
      const tip = chain.length > 1 ? chain.at(-1).position.clone().multiplyScalar(0.8) : null;
      fingers.push({ n, chain, tip, axis: new THREE.Vector3() });
    }
    if (!fingers.length) return null;
    const bones = fingers.flatMap((f) => f.chain);
    const saved = bones.map((b) => b.quaternion.clone());
    const pose = (map) => {
      for (const b of bones) b.quaternion.copy(map.get(b) || bindLocal.get(b));
      hand.updateMatrixWorld(true);
    };
    const local = (b) => hand.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    const tipOf = (f) => (f.chain.length > 1 ? f.chain.at(-1) : null);
    pose(bindLocal);
    const open = fingers.map((f) => [local(f.chain[0]), tipOf(f) && local(tipOf(f))]);
    pose(fistLocal);
    fingers.forEach((f, i) => {
      const [b, o] = open[i];
      const tip = tipOf(f);
      if (tip) f.axis.crossVectors(o.clone().sub(b), local(tip).sub(b));
      if (f.axis.lengthSq() < 1e-12) f.axis.set(0, 0, 0);
      else f.axis.normalize();
    });
    bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    hand.updateMatrixWorld(true);
    // A finger with no fist motion borrows its neighbour's hinge.
    const ref = fingers.find((f) => f.n === 2 && f.axis.lengthSq()) || fingers.find((f) => f.n > 0 && f.axis.lengthSq());
    for (const f of fingers) if (!f.axis.lengthSq() && ref) f.axis.copy(ref.axis);
    return { hand, fingers };
  }
  const fingerRig = { L: buildFingers("L"), R: buildFingers("R") };

  // Degrees per joint (knuckle, middle, tip) for thumb, index, middle, ring, pinky.
  const GRIPS = {
    // Left hand round a rifle handguard: limits only, each joint stops on the tube.
    handguard: [[18, 24, 16], [70, 75, 50], [70, 75, 50], [72, 78, 50], [74, 80, 50]],
    // Right hand on a pistol grip: three fingers wrap, index nearly straight on the trigger.
    pistolGrip: [[10, 20, 14], [22, 40, 12], [80, 85, 60], [80, 85, 60], [80, 85, 60]],
    // Left hand wrapped over the firing hand's fingers, thumb forward along the frame.
    cup: [[6, 10, 8], [70, 75, 50], [70, 75, 50], [72, 78, 50], [74, 80, 50]],
    // Holding a magazine, a fingertip claw on a slide or charging handle, a shell pinch.
    mag: [[20, 25, 15], [50, 55, 35], [55, 58, 38], [58, 60, 40], [60, 62, 40]],
    claw: [[15, 20, 10], [35, 45, 30], [38, 48, 32], [40, 50, 34], [42, 52, 34]],
    pinch: [[25, 25, 15], [35, 45, 25], [60, 75, 45], [65, 78, 45], [68, 80, 45]],
    // Knife handle: a full closed fist.
    // `thumb`: where the thumb points in the weapon's frame, when the fist hinge
    // can't get it there (it only folds the thumb across the palm).
    knife: [[26, 32, 18], [62, 78, 46], [66, 80, 46], [70, 82, 46], [72, 82, 44]],
  };
  // Right thumb forward and down the left of the frame; left thumb forward under the slide.
  const THUMBS = { pistolGrip: [0.3, -0.35, 0.89], cup: [0.05, -0.2, 1] };
  const _td = new THREE.Vector3();
  const _tc = new THREE.Vector3();
  const DEG = Math.PI / 180;
  const OPEN_DEG = 45;
  // Grip shapes as elliptic cylinders in the weapon's own frame (metres): centre,
  // axis ("y" up a pistol grip, "z" along a barrel) and the two radii, finger
  // thickness included. `over` is for a hand wrapped round the other hand.
  const WRAPS = {
    // Handguard tube: ~29 mm radius, centre ~4 mm above the Support empty.
    rifle: { c: [0, 0.004, 0], axis: "z", r: [0.038, 0.038], fromSupport: true },
    // Pistol grip: 28 x 56 mm section under the slide.
    pistol: { c: [0, -0.03, -0.001], axis: "y", r: [0.023, 0.037], over: [0.041, 0.055] },
  };
  const _wrap = { inv: new THREE.Matrix4(), c: new THREE.Vector3(), axis: "z", r: [0, 0] };
  function setWrap(kind, over) {
    const w = WRAPS[kind];
    if (!w || !model) return null;
    _wrap.c.fromArray(w.c);
    if (w.fromSupport && model.support) _wrap.c.add(model.support.position);
    _wrap.axis = w.axis;
    _wrap.r = over && w.over ? w.over : w.r;
    model.root.updateWorldMatrix(true, false);
    _wrap.inv.copy(model.root.matrixWorld).invert();
    return _wrap;
  }
  const _gq = new THREE.Quaternion();
  const _ga = new THREE.Vector3();
  const _gr = new THREE.Quaternion();
  const _gb = new THREE.Quaternion();
  const _gp = new THREE.Quaternion();
  const _gc = new THREE.Vector3();
  const _gl = new THREE.Vector3();

  /** Where `b`'s child joint (or estimated fingertip) sits against the wrap: < 0 inside. */
  function wrapGap(f, j, wrap) {
    const next = f.chain[j + 1];
    if (next) next.getWorldPosition(_gc);
    else _gc.copy(f.tip).applyMatrix4(f.chain[j].matrixWorld);
    _gc.applyMatrix4(wrap.inv).sub(wrap.c);
    const q = wrap.axis === "z" ? _gc.y : _gc.z;
    return Math.hypot(_gc.x / wrap.r[0], q / wrap.r[1]) - 1;
  }

  /**
   * Pose one hand's fingers as `grip`, blended over the clip by `w`. With `wrap`
   * (from setWrap) each joint bends only until the next joint meets the surface,
   * so any hand size closes snugly round the grip.
   */
  function gripFingers(side, grip, w = 1, wrap = null) {
    const rig = fingerRig[side];
    const table = GRIPS[grip];
    if (!rig || !table || w <= 0.01) return;
    rig.hand.updateWorldMatrix(true, false);
    rig.hand.getWorldQuaternion(_gq);
    for (const f of rig.fingers) {
      const deg = table[f.n];
      const clip = w < 0.999 ? f.chain.map((b) => b.quaternion.clone()) : null;
      for (const b of f.chain) b.quaternion.copy(bindLocal.get(b));
      f.chain[0].updateMatrixWorld(true);
      _ga.copy(f.axis).applyQuaternion(_gq);
      // Two-segment fingers (Pieter) fold the middle and tip into one joint.
      const angles = f.chain.length === 3 ? deg : f.chain.length === 2 ? [deg[0], deg[1] + deg[2] * 0.7] : [deg[0]];
      f.chain.forEach((b, j) => {
        const bind = bindLocal.get(b);
        b.parent.getWorldQuaternion(_gp);
        _gl.copy(_ga).applyQuaternion(_gp.invert());
        const bend = (deg) => {
          b.quaternion.copy(bind).premultiply(_gr.setFromAxisAngle(_gl, deg * DEG));
          b.updateMatrixWorld(true);
        };
        let deg = angles[j];
        bend(deg);
        if (wrap && !(f.n === 0 && THUMBS[grip]) && (f.tip || f.chain[j + 1]) && wrapGap(f, j, wrap) < 0) {
          // Bend until the next joint touches; if even straight goes in, open the joint.
          bend(0);
          let lo = 0;
          let hi = deg;
          if (wrapGap(f, j, wrap) < 0) {
            lo = -OPEN_DEG;
            hi = 0;
          }
          for (let it = 0; it < 9; it++) {
            const mid = (lo + hi) / 2;
            bend(mid);
            if (wrapGap(f, j, wrap) < 0) hi = mid;
            else lo = mid;
          }
          bend(lo);
        }
      });
      if (f.n === 0 && THUMBS[grip] && model && f.tip) {
        const t = f.chain.at(-1);
        f.chain[0].getWorldPosition(_tc);
        _gc.copy(f.tip).applyMatrix4(t.matrixWorld).sub(_tc).normalize();
        model.root.getWorldQuaternion(_gb);
        _td.fromArray(THUMBS[grip]).normalize().applyQuaternion(_gb);
        rotateWorld(f.chain[0], _gr.setFromUnitVectors(_gc, _td));
      }
      if (clip) f.chain.forEach((b, j) => b.quaternion.slerpQuaternions(clip[j], b.quaternion, w));
    }
    rig.hand.updateMatrixWorld(true);
  }

  if (ready && arms) {
    calibrate("pistol", C("AimPistol"));
    calibrate("rifle", C("AimRifle") || C("AimPistol"));
    if (grip.pistol) {
      grip.knife = {
        ...grip.pistol,
        q: grip.pistol.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)),
      };
    }
    mixer.stopAllAction();
  }

  // --- Weapon model in the hand.
  // Where the palm centre sits in each model's frame (metres; gun right is -x):
  // the pistol rides a third of the way down the grip, against its right panel.
  const PALM = { pistol: [-0.016, -0.024, -0.03] };
  let weaponId = "unarmed";
  let model = null;
  let loadGen = 0;
  const muzzleW = new THREE.Vector3();
  const fwdW = new THREE.Vector3();

  async function setWeapon(id) {
    if (id === weaponId) return;
    endReload(false);
    weaponId = id;
    const gen = ++loadGen;
    if (model) {
      model.root.removeFromParent();
      model = null;
    }
    const w = WEAPONS[id];
    if (!w || !arms?.rHand) return;
    const m = await loadWeaponModel(THREE, id);
    if (gen !== loadGen || !m) return;
    // The butt: back end of the stock at bore height, in the model's own metres.
    m.root.position.set(0, 0, 0);
    m.root.quaternion.identity();
    m.root.scale.setScalar(1);
    m.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.root);
    const boreY = m.muzzle ? m.muzzle.getWorldPosition(new THREE.Vector3()).y : box.max.y * 0.6;
    m.butt = new THREE.Vector3(0, boreY - 0.03, box.min.z);
    // Magazine and slide as their own parts, so a reload can move them.
    const rd = RELOADS[id];
    m.mag = null;
    m.slide = null;
    if (rd?.mag?.box) m.mag = splitPart(THREE, m.root, rd.mag.box);
    else if (rd?.mag?.make) {
      let mat = null;
      m.root.traverse((o) => (mat ??= o.isMesh ? o.material : null));
      m.mag = makeMag(THREE, rd.mag.make, rd.mag.at, mat);
      m.root.add(m.mag);
    }
    if (rd?.slide) m.slide = splitPart(THREE, m.root, rd.slide.box);
    m.magTemplate = m.mag?.clone() ?? null;
    const g = grip[w.hold] || grip.pistol;
    if (g) {
      m.root.position.copy(g.p);
      m.root.quaternion.copy(g.q);
      m.root.scale.setScalar(g.s);
      if (PALM[id]) m.root.position.sub(_v.fromArray(PALM[id]).multiplyScalar(g.s).applyQuaternion(g.q));
    }
    arms.rHand.add(m.root);
    model = m;
  }

  // --- Leg and overlay drive (before mixer.update).
  let phase = 0;
  let aimK = 0;
  let kick = 0;
  let kickSide = 0;
  let legsOn = false;
  let busy = null;
  let busyT = 0;
  const holdOf = () => WEAPONS[weaponId]?.hold || null;

  // The mixer skips writing a bone whose sampled value didn't change since its last
  // write, so the post-mixer solves would stack frame on frame on static aim clips.
  const solved = [];
  body?.spine?.traverse((o) => o.isBone && solved.push([o, new THREE.Quaternion()]));
  let solvedDirty = false;
  function snapSolved() {
    for (const [b, q] of solved) q.copy(b.quaternion);
    solvedDirty = true;
  }

  // The aim gaits keep the hips bladed 25-50° off the facing, so a strafe steps
  // diagonally across itself. While moving, turn most of that back; the aim solve
  // brings the gun round again.
  let moveK = 0;
  let hipsDirty = false;
  const hipsClean = new THREE.Quaternion();
  const _hl = new THREE.Vector3();
  const _hr = new THREE.Vector3();
  const _hipQ = new THREE.Quaternion();
  const _hipUp = new THREE.Vector3(0, 1, 0);
  function squareHips() {
    const k = moveK * aimK * HIP_SQUARE;
    if (!legsOn || k < 0.01 || !body?.pelvis || !body.lThigh || !body.rThigh) return;
    hipsClean.copy(body.pelvis.quaternion);
    hipsDirty = true;
    root.updateMatrixWorld(true);
    body.lThigh.getWorldPosition(_hl);
    body.rThigh.getWorldPosition(_hr).sub(_hl);
    root.getWorldQuaternion(_hipQ);
    _hl.set(1, 0, 0).applyQuaternion(_hipQ);
    const blade = Math.atan2(_hr.z * _hl.x - _hr.x * _hl.z, _hr.x * _hl.x + _hr.z * _hl.z);
    rotateWorld(body.pelvis, _hipQ.setFromAxisAngle(_hipUp, blade * k));
  }

  // Clip analysis gets the straight gaits right, but diagonal blends land off by up
  // to a third. Each of eight travel directions keeps a stride gain, nudged by how
  // far the planted foot drifts along the travel line, measured against the commanded
  // speed rather than the root's actual motion (a held-in-place preview never moves).
  const stride = {};
  let strideDir = null;
  let strideSpeed = 0;
  let strideYaw = 0;
  const _fl = new THREE.Vector3();
  const _fr = new THREE.Vector3();
  const _rootAt = new THREE.Vector3();
  const feetPrev = { l: new THREE.Vector3(), r: new THREE.Vector3(), ok: false };
  function learnStride(dt) {
    const lf = body?.lFoot;
    const rf = body?.rFoot;
    if (strideDir === null || !(dt > 0) || !lf || !rf) {
      feetPrev.ok = false;
      return;
    }
    root.getWorldPosition(_rootAt);
    lf.getWorldPosition(_fl).sub(_rootAt);
    rf.getWorldPosition(_fr).sub(_rootAt);
    if (feetPrev.ok) {
      const lx = _fl.x - feetPrev.l.x;
      const lz = _fl.z - feetPrev.l.z;
      const rx = _fr.x - feetPrev.r.x;
      const rz = _fr.z - feetPrev.r.z;
      const left = _fl.y < _fr.y;
      // Planted: clearly the lower foot.
      if (Math.abs(_fl.y - _fr.y) > 0.02) {
        const dx = left ? lx : rx;
        const dz = left ? lz : rz;
        const along = (dx * -Math.sin(strideYaw) + dz * -Math.cos(strideYaw)) / dt + strideSpeed;
        const e = along / strideSpeed;
        if (Math.abs(e) < 1.2) {
          const g = (stride[strideDir] ?? 1) * Math.exp(1.2 * e * dt);
          stride[strideDir] = Math.max(0.6, Math.min(1.7, g));
        }
      }
    }
    feetPrev.l.copy(_fl);
    feetPrev.r.copy(_fr);
    feetPrev.ok = true;
  }

  /** Call every frame. `legsOwned` is true while players.js gave us the legs. */
  function drive(dt, s) {
    if (solvedDirty) {
      for (const [b, q] of solved) b.quaternion.copy(q);
      solvedDirty = false;
    }
    if (hipsDirty) {
      body.pelvis.quaternion.copy(hipsClean);
      hipsDirty = false;
    }
    legsOn = !!s.legsOwned && ready;
    aimK += ((s.aim ?? 0) - aimK) * (1 - Math.exp(-16 * dt));
    for (const k of LEG_KEYS) goal[k] = 0;
    if (legsOn) {
      const speed = Math.abs(s.moveSpeed || 0);
      const a = Math.atan2(Math.sin(s.moveYaw - s.facing), Math.cos(s.moveYaw - s.facing));
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const sum = Math.abs(c) + Math.abs(sn) || 1;
      const m = Math.min(1, Math.max(0, (speed - 0.12) / 0.4));
      moveK = m;
      const run = Math.min(1, Math.max(0, (speed - 3.6) / 1.2)) * Math.max(0, c);
      const fwd = (Math.max(0, c) / sum) * m;
      goal.aimWalk = fwd * (1 - run);
      goal.aimRun = has("aimRun") ? fwd * run : 0;
      if (!has("aimRun")) goal.aimWalk = fwd;
      goal.aimWalkBack = (Math.max(0, -c) / sum) * m;
      goal.aimStrafeR = (Math.max(0, -sn) / sum) * m;
      goal.aimStrafeL = (Math.max(0, sn) / sum) * m;
      goal.aimIdleLegs = 1 - m;
      // One phase for every direction, each clip offset to its own left-foot stance,
      // so diagonals don't scissor the feet. The pace
      // comes from the moving clips only (blended by weight), never from idle.
      let lead = null;
      let native = 0;
      let wsum = 0;
      for (const k of LEG_KEYS) {
        if (k === "aimIdleLegs" || !(goal[k] > 0)) continue;
        if (!lead || goal[k] > goal[lead]) lead = k;
        native += goal[k] * (speeds[k] || 1.2);
        wsum += goal[k];
      }
      native = wsum ? native / wsum : 1.2;
      const sector = (Math.round(a / (Math.PI / 4)) + 8) % 8;
      const rate = lead ? Math.max(0.2, Math.min(2.2, (speed / native) * (stride[sector] ?? 1))) : 1;
      const dur = actions[lead || "aimIdleLegs"]?.getClip().duration || 1;
      phase = (phase + (dt * rate) / dur) % 1;
      strideDir = lead && speed > 0.6 ? sector : null;
      strideSpeed = speed;
      strideYaw = s.moveYaw;
    } else {
      strideDir = null;
      moveK = 0;
    }

    const hold = holdOf();
    const gunHold = s.onFoot && !s.dead && (hold === "pistol" || hold === "rifle");
    // Strafe legs carry no upper body, so the hold must stay solid under them.
    const base = legsOn ? (busy ? 0.15 : 1) : busy ? 0 : proc ? 1 : null;
    goal.holdPistol = gunHold && hold === "pistol" ? (base ?? aimK) : 0;
    goal.holdRifle = gunHold && hold === "rifle" ? (base ?? RIFLE_LOW + (1 - RIFLE_LOW) * aimK) : 0;

    if (busy) {
      busyT -= dt;
      if (busyT <= 0) {
        actions[busy]?.fadeOut(0.15);
        busy = null;
      }
    }

    const k = 1 - Math.exp(-14 * dt);
    for (const key of [...LEG_KEYS, "holdPistol", "holdRifle"]) {
      const act = actions[key];
      if (!act) continue;
      weight[key] += (goal[key] - weight[key]) * k;
      if (weight[key] < 0.002 && goal[key] === 0) {
        if (act.isRunning()) act.stop();
        weight[key] = 0;
        continue;
      }
      if (!act.isRunning()) act.play();
      act.stopFading();
      act.setEffectiveWeight(weight[key]);
      if (LEG_KEYS.includes(key)) {
        act.timeScale = 0;
        act.time = ((phase + (footPhase?.[key] ?? 0)) % 1) * act.getClip().duration;
      }
    }
    if (model) model.root.visible = !!s.onFoot && !s.dead;
  }

  function overlay(key, dur, w = 1) {
    const act = actions[key];
    if (!act) return false;
    if (busy && busy !== key) actions[busy]?.fadeOut(0.1);
    act.reset();
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.setEffectiveWeight(w);
    const clipDur = act.getClip().duration;
    act.setEffectiveTimeScale(dur ? clipDur / dur : 1);
    act.fadeIn(0.1).play();
    busy = key;
    busyT = dur || clipDur;
    busyDur = busyT;
    return true;
  }

  // --- Knife: the Mixamo stab pokes high and the slash trails low, both from a
  // stance this body doesn't have. Steer them, and hold a ready stance around them.
  const KNIFE_READY_S = 1.6;
  let busyDur = 1;
  let knifeReady = 0;
  let readyHold = 0;
  const _kF = new THREE.Vector3();
  const _kR = new THREE.Vector3();
  const _kU = new THREE.Vector3(0, 1, 0);
  const _kSL = new THREE.Vector3();
  const _kSR = new THREE.Vector3();
  const _kC = new THREE.Vector3();
  const _kH = new THREE.Vector3();
  const _kT = new THREE.Vector3();
  const _kP = new THREE.Vector3();
  const _kD = new THREE.Vector3();
  const _kQ = new THREE.Quaternion();
  const _kQ2 = new THREE.Quaternion();
  const _kTip = new THREE.Vector3();
  const _kDir = new THREE.Vector3();
  const knifeSmooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function knifeFrame() {
    const yaw = root.rotation.y;
    _kF.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _kR.set(Math.cos(yaw), 0, -Math.sin(yaw));
    arms.lUpper.getWorldPosition(_kSL);
    arms.rUpper.getWorldPosition(_kSR);
    _kC.addVectors(_kSL, _kSR).multiplyScalar(0.5);
  }

  /** Chest turn (+ brings the right shoulder forward) and lean (+ forward). */
  function turnChest(turn, lean) {
    const parts = [body?.spine1, body?.spine2].filter(Boolean);
    if (!parts.length) return;
    _kQ.setFromAxisAngle(_kU, turn / parts.length);
    _kQ2.setFromAxisAngle(_kR, -lean / parts.length);
    _kQ.premultiply(_kQ2);
    for (const b of parts) rotateWorld(b, _kQ);
    knifeFrame();
  }

  function armReach(upper, fore, hand) {
    return upper.getWorldPosition(_kT).distanceTo(fore.getWorldPosition(_kP)) + _kP.distanceTo(hand.getWorldPosition(_kD));
  }

  /** Right hand to `target`, elbow toward `pole`; then the blade toward `dir` by `w`. */
  function knifeHand(target, pole, dir, w) {
    limb(arms.rUpper, arms.rFore, arms.rHand, target, pole);
    if (!dir || !muzzle(_kTip, _kDir)) return;
    _kQ.setFromUnitVectors(_kDir, dir);
    rotateWorld(arms.rHand, _kQ2.slerpQuaternions(_id, _kQ, w));
  }

  function knifeMoves(dt) {
    const attack = busy === "stab" || busy === "slash" ? busy : null;
    readyHold -= dt;
    const want = attack || readyHold > 0 ? 1 : 0;
    knifeReady += (want - knifeReady) * (1 - Math.exp(-(want ? 12 : 3) * dt));
    if (knifeReady < 0.01 || !arms?.rUpper || !limb) return;
    const u = attack ? 1 - Math.max(0, busyT) / busyDur : 1;
    knifeFrame();

    // Ready: blade low and forward, tip up; free hand guarding the chest. The clip
    // owns the middle of an attack.
    const own = attack ? knifeSmooth(0, 0.12, u) * (1 - knifeSmooth(0.7, 1, u)) : 0;
    const r = knifeReady * (1 - own);
    if (r > 0.01) {
      arms.rHand.getWorldPosition(_kH);
      _kT.copy(_kSR).addScaledVector(_kF, 0.34).addScaledVector(_kU, -0.24).addScaledVector(_kR, -0.04);
      _kT.lerp(_kH, 1 - r);
      _kP.copy(_kSR).addScaledVector(_kR, 0.25).addScaledVector(_kU, -0.4).addScaledVector(_kF, -0.1);
      _kD.copy(_kF).multiplyScalar(Math.cos(0.35)).addScaledVector(_kU, Math.sin(0.35));
      knifeHand(_kT, _kP, _kD, r);
      arms.lHand.getWorldPosition(_kH);
      _kT.copy(_kSL).addScaledVector(_kF, 0.36).addScaledVector(_kU, -0.18).addScaledVector(_kR, 0.08);
      _kT.lerp(_kH, 1 - r);
      _kP.copy(_kSL).addScaledVector(_kR, -0.25).addScaledVector(_kU, -0.4);
      limb(arms.lUpper, arms.lFore, arms.lHand, _kT, _kP);
      gripFingers("L", "claw", r);
    }
    if (!attack) return;

    // The slash clip arches the back and throws the head up; keep the torso over the
    // hips, a touch forward.
    if (body?.spine1 && body.head) {
      body.spine1.getWorldPosition(_kT);
      body.head.getWorldPosition(_kH).sub(_kT);
      const pitch = Math.atan2(_kH.dot(_kF), _kH.dot(_kU));
      if (pitch < 0.08) turnChest(0, (0.08 - pitch) * 0.85 * own);
    }
    if (attack === "stab") {
      // The clip shoves the free hand out after the thrust; it guards instead.
      arms.lHand.getWorldPosition(_kH);
      _kT.copy(_kSL).addScaledVector(_kF, 0.36).addScaledVector(_kU, -0.16).addScaledVector(_kR, 0.1);
      _kT.lerp(_kH, 1 - own);
      _kP.copy(_kSL).addScaledVector(_kR, -0.25).addScaledVector(_kU, -0.4);
      limb(arms.lUpper, arms.lFore, arms.lHand, _kT, _kP);
    }

    const arm = armReach(arms.rUpper, arms.rFore, arms.rHand);
    arms.rHand.getWorldPosition(_kH);
    if (attack === "stab") {
      // Thrust: shoulders and weight drive in, blade out to full reach at the sternum.
      const w = knifeSmooth(0.12, 0.38, _kD.subVectors(_kH, _kSR).dot(_kF));
      if (w < 0.01) return;
      turnChest(0.42 * w, 0.14 * w);
      arms.rHand.getWorldPosition(_kH);
      const half = _kC.distanceTo(_kSR);
      const ahead = Math.sqrt(Math.max(0, (arm * 0.95) ** 2 - half * half - 0.1 * 0.1));
      _kT.copy(_kC).addScaledVector(_kF, ahead).addScaledVector(_kU, -0.1);
      _kT.lerpVectors(_kH, _kT, w);
      _kP.copy(_kSR).addScaledVector(_kR, 0.3).addScaledVector(_kU, -0.35);
      _kD.copy(_kF).addScaledVector(_kU, -0.08).normalize();
      knifeHand(_kT, _kP, _kD, w);
      return;
    }
    // Slash: the chest follows the blade across, held at chest height and near full
    // reach, tip leading out along the arc.
    const w = knifeSmooth(0.3, 0.42, u) * (1 - knifeSmooth(0.62, 0.8, u));
    if (w < 0.01) return;
    _kD.subVectors(_kH, _kC).setY(0);
    const az = Math.atan2(-_kD.dot(_kR), _kD.dot(_kF));
    turnChest(0.4 * az * w, 0.06 * w);
    arms.rHand.getWorldPosition(_kH);
    _kD.subVectors(_kH, _kC).setY(0);
    const radius = Math.max(_kD.length(), arm * 0.85);
    _kD.normalize();
    _kT.copy(_kC).addScaledVector(_kD, radius).addScaledVector(_kU, -0.1);
    _kT.lerpVectors(_kH, _kT, w);
    _kP.copy(_kSR).addScaledVector(_kR, 0.3).addScaledVector(_kU, -0.4);
    knifeHand(_kT, _kP, _kD.addScaledVector(_kU, 0.15).normalize(), w);
  }

  // --- After mixer.update: aim solve, recoil, support hand.
  const _target = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _part = new THREE.Quaternion();
  const _full = new THREE.Quaternion();
  const _id = new THREE.Quaternion();
  const _pq = new THREE.Quaternion();
  const _bq = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _sup = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _pw = new THREE.Vector3();
  const _hw = new THREE.Vector3();
  const _fd = new THREE.Vector3();
  const _sd = new THREE.Vector3();
  const _nd = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();
  const _hq = new THREE.Quaternion();

  const _ea = new THREE.Vector3();
  const _eb = new THREE.Vector3();
  const _ec = new THREE.Vector3();
  const _ew = new THREE.Vector3();
  const _eq = new THREE.Quaternion();
  /**
   * Turn the upper arm about the shoulder→wrist line so the elbow points toward
   * `want` (world). The wrist stays put; the caller restores the hand's rotation.
   */
  function swingElbow(upper, fore, hand, want, amount) {
    upper.getWorldPosition(_ea);
    hand.getWorldPosition(_eb).sub(_ea);
    const len = _eb.length();
    if (len < 1e-4) return;
    _eb.divideScalar(len);
    fore.getWorldPosition(_ec).sub(_ea);
    _ec.addScaledVector(_eb, -_ec.dot(_eb));
    _ew.copy(want).addScaledVector(_eb, -want.dot(_eb));
    if (_ec.lengthSq() < 1e-8 || _ew.lengthSq() < 1e-8) return;
    _ec.normalize();
    _ew.normalize();
    const ang = Math.atan2(_ea.crossVectors(_ec, _ew).dot(_eb), _ec.dot(_ew));
    rotateWorld(upper, _eq.setFromAxisAngle(_eb, ang * amount));
  }

  /**
   * Place the support hand's palm centre (not the wrist) on `target`, fingers along
   * `fingerDir` and the index-to-pinky line against `indexDir` (both world).
   */
  function supportHand(target, fingerDir, indexDir) {
    const f = leftFrame;
    _fd.copy(indexDir);
    _nd.copy(fingerDir).normalize();
    _sd.copy(_fd).addScaledVector(_nd, -_fd.dot(_nd)).normalize();
    _m4.makeBasis(_nd, _sd, _hw.crossVectors(_nd, _sd));
    _hq.setFromRotationMatrix(_m4).multiply(f.inv);
    _pw.copy(target);
    for (let pass = 0; pass < 3; pass++) {
      ik(arms.lUpper, arms.lFore, arms.lHand, _pw, 8);
      f.hand.parent.getWorldQuaternion(_pq);
      f.hand.quaternion.copy(_pq.invert().multiply(_hq));
      f.hand.updateMatrixWorld(true);
      // Shift the wrist goal by however far the palm still is from the grip.
      _hw.copy(f.palm);
      f.hand.localToWorld(_hw);
      _pw.add(_sd.copy(target).sub(_hw));
      _sd.copy(_fd).addScaledVector(_nd, -_fd.dot(_nd)).normalize();
    }
    // Support elbow hangs under the gun, a little out to the left.
    const yaw = root.rotation.y;
    _hw.set(-Math.cos(yaw) * 0.35, -1, Math.sin(yaw) * 0.35);
    swingElbow(arms.lUpper, arms.lFore, arms.lHand, _hw, 0.6);
    f.hand.parent.getWorldQuaternion(_pq);
    f.hand.quaternion.copy(_pq.invert().multiply(_hq));
    f.hand.updateMatrixWorld(true);
  }

  function rotateWorld(bone, q) {
    bone.getWorldQuaternion(_bq);
    _bq.premultiply(q);
    bone.parent.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_bq));
    bone.updateMatrixWorld(true);
  }

  function muzzle(outPos, outDir) {
    if (!model) return false;
    model.root.updateWorldMatrix(true, true);
    (model.muzzle || model.root).getWorldPosition(outPos);
    model.root.getWorldQuaternion(_q);
    outDir.set(0, 0, 1).applyQuaternion(_q);
    return true;
  }

  // --- Procedural reload (weapon-reload.js).
  const drops = createDrops(THREE);
  let proc = null;
  let shellObj = null;
  const _ra = new THREE.Vector3();
  const _rf = new THREE.Vector3();
  const _ri = new THREE.Vector3();
  const _rb = new THREE.Vector3();
  const _rq = new THREE.Quaternion();
  const _rm = new THREE.Matrix4();
  const _rn = new THREE.Matrix4();
  const _rs = new THREE.Vector3();
  const armSave = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const smooth01 = (x) => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };
  const sceneOf = (o) => {
    while (o.parent) o = o.parent;
    return o;
  };

  function startReload(def, dur) {
    endReload(true);
    proc = { def, t: 0, dur: Math.max(0.4, dur || 2), ev: 0, held: null, fresh: null, gaze: null };
  }

  // Turn the arm about the shoulder-hand line so the elbow points along `pole`;
  // the hand stays put. CCD alone happily parks the elbow up by the ear.
  const _swes = new THREE.Vector3();
  const _sweh = new THREE.Vector3();
  const _swee = new THREE.Vector3();
  const _swep = new THREE.Vector3();
  const _sweq = new THREE.Quaternion();
  function swingElbow(upper, fore, hand, pole, w) {
    upper.getWorldPosition(_swes);
    fore.getWorldPosition(_swee);
    hand.getWorldPosition(_sweh);
    const axis = _sweh.sub(_swes);
    if (axis.lengthSq() < 1e-6) return;
    axis.normalize();
    _swee.sub(_swes);
    _swee.addScaledVector(axis, -_swee.dot(axis));
    _swep.copy(pole).addScaledVector(axis, -pole.dot(axis));
    if (_swee.lengthSq() < 1e-8 || _swep.lengthSq() < 1e-8) return;
    _swee.normalize();
    _swep.normalize();
    const ang = Math.atan2(_swee.clone().cross(_swep).dot(axis), _swee.dot(_swep));
    rotateWorld(upper, _sweq.setFromAxisAngle(axis, ang * w));
  }

  // Eyes on the work: the head turns toward the magazine well, up to ~30 degrees.
  const _gz = new THREE.Vector3();
  const _lq = new THREE.Quaternion();
  function lookAtWork(def, env) {
    const head = body.head;
    if (!head || env < 0.01) return;
    head.getWorldQuaternion(_lq);
    if (!proc.gaze) {
      const yaw = root.rotation.y;
      proc.gaze = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).applyQuaternion(_lq.clone().invert());
    }
    _gz.copy(proc.gaze).applyQuaternion(_lq);
    _ra.fromArray(def.look || [0, -0.02, 0.12]);
    model.root.localToWorld(_ra);
    head.getWorldPosition(_rb);
    _ra.sub(_rb).normalize();
    _rq.setFromUnitVectors(_gz, _ra);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(_rq.w)));
    const k = Math.min(1, 0.7 / Math.max(ang, 1e-3)) * 0.75 * env;
    rotateWorld(head, _lq.slerpQuaternions(_id, _rq, Math.min(1, k)));
  }

  /** Finish (`seat`) or abandon the reload; a fresh magazine ends up in the gun. */
  function endReload(seat) {
    if (!proc) return;
    const p = proc;
    proc = null;
    shellObj?.removeFromParent();
    if (p.fresh) {
      p.fresh.removeFromParent();
      if (seat && model) seatMag(p.fresh);
    }
    if (p.held && model && seat) seatMag(p.held);
    else p.held?.removeFromParent();
    if (model && !model.mag && model.magTemplate && seat) seatMag(model.magTemplate.clone());
    if (model?.slide) model.slide.position.copy(model.slide.userData.seat);
  }

  function seatMag(mag) {
    model.root.add(mag);
    mag.position.copy(mag.userData.seat ?? model.magTemplate.userData.seat);
    mag.quaternion.identity();
    mag.scale.setScalar(1);
    model.mag = mag;
  }

  /** Normal support-hand pose for the held gun: palm point, finger and index directions. */
  function supportPose(hold, out) {
    model.root.updateWorldMatrix(true, true);
    model.support.getWorldPosition(out.p);
    model.root.getWorldQuaternion(_q);
    if (hold === "rifle") {
      // Palm bone a hand's thickness under the handguard, a touch to the near
      // side; fingers leave nearly level, index to the muzzle, and wrap the far side.
      out.p.addScaledVector(_up.set(0, -1, 0).applyQuaternion(_q), 0.044);
      out.p.addScaledVector(_v.set(1, 0, 0).applyQuaternion(_q), 0.01);
      out.f.set(-Math.cos(0.35), Math.sin(0.35), 0).applyQuaternion(_q);
      out.i.set(0, 0, 1).applyQuaternion(_q);
      out.grip = "handguard";
    } else {
      // Palm flat on the left of the grip over the firing hand's fingertips;
      // fingers forward-down round the front, index tucked under the trigger guard.
      model.root.localToWorld(out.p.set(0.046, -0.022, -0.01));
      out.f.set(0, -Math.sin(0.3), Math.cos(0.3)).applyQuaternion(_q);
      out.i.set(0, 1, 0).applyQuaternion(_q);
      out.grip = "cup";
    }
    return out;
  }
  const _supPose = { p: new THREE.Vector3(), f: new THREE.Vector3(), i: new THREE.Vector3(), grip: "" };
  const _poseA = { p: new THREE.Vector3(), f: new THREE.Vector3(), i: new THREE.Vector3(), grip: "" };
  const _poseB = { p: new THREE.Vector3(), f: new THREE.Vector3(), i: new THREE.Vector3(), grip: "" };

  /** A choreography pose in world space. Gun poses use +x = gun left, like the model. */
  function resolvePose(pose, out) {
    if (pose.frame === "support") {
      out.p.copy(_supPose.p);
      out.f.copy(_supPose.f);
      out.i.copy(_supPose.i);
      out.grip = _supPose.grip;
      if (pose.pump) out.p.addScaledVector(_ra.set(0, 0, 1).applyQuaternion(_q), pose.pump);
      return out;
    }
    if (pose.frame === "belt") {
      // Pouch on the left of the belt, a little forward of the hip. The body faces
      // -z at yaw 0, so left is (-cos, sin) and forward (-sin, -cos); x = left, z = forward.
      const yaw = root.rotation.y;
      const sn = Math.sin(yaw);
      const cs = Math.cos(yaw);
      const body3 = (x, y, z, v) => v.set(-x * cs - z * sn, y, x * sn - z * cs);
      (body.pelvis || body.spine).getWorldPosition(out.p);
      out.p.add(body3(0.13, 0.03, 0.07, _rb));
      body3(...pose.f, out.f).normalize();
      body3(...pose.i, out.i).normalize();
      out.grip = pose.grip;
      return out;
    }
    model.root.localToWorld(out.p.fromArray(pose.p));
    out.f.fromArray(pose.f).normalize().applyQuaternion(_q);
    out.i.fromArray(pose.i).normalize().applyQuaternion(_q);
    out.grip = pose.grip;
    return out;
  }

  /** World matrix the left hand has when its palm sits on `pose` (no IK needed). */
  function handMatrixFor(pose, out) {
    const f = leftFrame;
    _nd.copy(pose.f).normalize();
    _sd.copy(pose.i).addScaledVector(_nd, -pose.i.dot(_nd)).normalize();
    _m4.makeBasis(_nd, _sd, _hw.crossVectors(_nd, _sd));
    _rq.setFromRotationMatrix(_m4).multiply(f.inv);
    f.hand.getWorldScale(_rs);
    _rb.copy(f.palm).multiplyScalar(_rs.x).applyQuaternion(_rq);
    return out.compose(_ra.copy(pose.p).sub(_rb), _rq, _rs);
  }

  function reloadEvent(name, def) {
    const hand = arms.lHand;
    const scene = sceneOf(root);
    if (name === "grabOld" && model.mag) {
      hand.attach(model.mag);
      proc.held = model.mag;
      model.mag = null;
    } else if (name === "dropOld") {
      const mag = proc.held || model.mag;
      if (!mag) return;
      scene.attach(mag);
      _rb.fromArray(def.mag.axis).normalize().applyQuaternion(_q).multiplyScalar(proc.held ? 0.4 : 1.6);
      _rb.x += (Math.random() - 0.5) * 0.3;
      _rb.z += (Math.random() - 0.5) * 0.3;
      drops.add(mag, _rb, root.getWorldPosition(_ra).y);
      proc.held = null;
      model.mag = null;
    } else if (name === "takeNew" && model.magTemplate) {
      // In the hand exactly as it will sit once seated, so the insert is seamless.
      const fresh = model.magTemplate.clone();
      model.root.updateWorldMatrix(true, false);
      _rn.compose(fresh.userData.seat ?? fresh.position, _rq.identity(), _rs.set(1, 1, 1)).premultiply(model.root.matrixWorld);
      handMatrixFor(resolvePose(def.poses.mag, _poseA), _rm);
      _rm.invert().multiply(_rn).decompose(fresh.position, fresh.quaternion, fresh.scale);
      hand.add(fresh);
      proc.fresh = fresh;
    } else if (name === "seatNew" && proc.fresh) {
      seatMag(proc.fresh);
      proc.fresh = null;
    } else if (name === "takeShell") {
      shellObj ??= makeShell(THREE, def.shell);
      const f = leftFrame;
      f.hand.getWorldScale(_rs);
      shellObj.position.copy(f.palm).multiplyScalar(1.7);
      _rq.copy(f.inv).invert();
      shellObj.quaternion.setFromUnitVectors(_ra.set(0, 1, 0), _rb.set(0, 1, 0).applyQuaternion(_rq));
      shellObj.scale.setScalar(1 / _rs.x);
      hand.add(shellObj);
    } else if (name === "shellIn") {
      shellObj?.removeFromParent();
    }
  }

  /**
   * Run the reload: cant and draw in the gun, walk the support hand through its key
   * poses, fire the magazine events. `twoHanded` is false for a pistol at the hip,
   * where the left arm blends in and out instead of snapping.
   */
  function reloadStep(dt, hold, twoHanded) {
    const def = proc.def;
    proc.t += dt;
    const u = Math.min(1, proc.t / proc.dur);
    const env = smooth01(Math.min(u, 1 - u) / 0.1);
    const yaw = root.rotation.y;
    // Shoulders follow the support hand down to the pouch: turn left, dip, lean in.
    const keyed = poseAt(def, u);
    const reach = (keyed.a.frame === "belt" ? 1 - keyed.s : 0) + (keyed.b.frame === "belt" ? keyed.s : 0);
    if (reach > 0.001) {
      const tw = reach * (def.twist ?? 0.22);
      const sp = [body.spine1, body.spine2].filter(Boolean);
      _ra.set(0, 1, 0);
      _rq.setFromAxisAngle(_ra, tw / sp.length);
      for (const b of sp) rotateWorld(b, _rq);
      _ra.set(Math.cos(yaw), 0, -Math.sin(yaw));
      _rq.setFromAxisAngle(_ra, (-0.12 * reach) / sp.length);
      for (const b of sp) rotateWorld(b, _rq);
      _ra.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      _rq.setFromAxisAngle(_ra, (-0.1 * reach) / sp.length);
      for (const b of sp) rotateWorld(b, _rq);
    }
    // Firing hand into the workspace in front of the chest, then canted.
    if (arms.rUpper && env > 0.01) {
      (body.spine2 || body.spine1 || body.spine).getWorldPosition(_ra);
      _ra.x += -Math.sin(yaw) * 0.3 + Math.cos(yaw) * 0.05;
      _ra.z += -Math.cos(yaw) * 0.3 - Math.sin(yaw) * 0.05;
      _ra.y -= 0.17;
      arms.rHand.getWorldPosition(_hw);
      arms.rHand.getWorldQuaternion(_q2);
      _hw.lerp(_ra, (def.cant.pull ?? (hold === "pistol" ? 0.8 : 0.55)) * env);
      ik(arms.rUpper, arms.rFore, arms.rHand, _hw, 8);
      _rb.set(Math.cos(yaw) * 0.6, -1, -Math.sin(yaw) * 0.6);
      swingElbow(arms.rUpper, arms.rFore, arms.rHand, _rb, env);
      arms.rHand.parent.getWorldQuaternion(_pq);
      arms.rHand.quaternion.copy(_pq.invert().multiply(_q2));
      arms.rHand.updateMatrixWorld(true);
      model.root.getWorldQuaternion(_q);
      rotateWorld(arms.rHand, _rq.setFromAxisAngle(_ra.set(0, 0, 1).applyQuaternion(_q), def.cant.roll * env));
      model.root.getWorldQuaternion(_q);
      rotateWorld(arms.rHand, _rq.setFromAxisAngle(_ra.set(1, 0, 0).applyQuaternion(_q), -def.cant.pitch * env));
    }
    model.root.updateWorldMatrix(true, true);
    model.root.getWorldQuaternion(_q);
    supportPose(hold, _supPose);
    model.root.getWorldQuaternion(_q);

    while (proc.ev < def.events.length && u >= def.events[proc.ev][0]) reloadEvent(def.events[proc.ev++][1], def);

    const { a, b, s } = poseAt(def, u);
    resolvePose(a, _poseA);
    resolvePose(b, _poseB);
    _poseA.p.lerp(_poseB.p, s);
    _poseA.f.lerp(_poseB.f, s).normalize();
    _poseA.i.lerp(_poseB.i, s).normalize();
    const grip = s < 0.5 ? _poseA.grip : _poseB.grip;
    if (model.slide) {
      model.slide.position.copy(model.slide.userData.seat);
      model.slide.position.z -= (a.slide || 0) * (1 - s) + (b.slide || 0) * s;
    }

    const arm = [arms.lUpper, arms.lFore, arms.lHand];
    const w = twoHanded ? 1 : env;
    if (w < 1) arm.forEach((bn, n) => armSave[n].copy(bn.quaternion));
    supportHand(_poseA.p, _poseA.f, _poseA.i);
    const wrap = grip === "handguard" ? setWrap("rifle") : grip === "cup" ? setWrap("pistol", true) : null;
    gripFingers("L", grip, w, wrap);
    if (w < 1) {
      arm.forEach((bn, n) => bn.quaternion.slerpQuaternions(armSave[n], bn.quaternion, w));
      arms.lUpper.updateMatrixWorld(true);
    }
    lookAtWork(def, env);
    if (u >= 1) endReload(true);
  }

  function post(dt, aimPoint) {
    snapSolved();
    learnStride(dt);
    drops.update(dt);
    kick *= Math.exp(-16 * dt);
    kickSide *= Math.exp(-16 * dt);
    const hold = holdOf();
    if (!model || !model.root.visible) return;
    if (hold === "knife") knifeMoves(dt);
    gripFingers("R", weaponId === "knife" ? "knife" : "pistolGrip", 1, hold === "pistol" ? setWrap("pistol") : null);
    if (!body?.spine || (hold !== "pistol" && hold !== "rifle")) return;
    const clipReload = busy && busy.startsWith("reload") ? 1 : 0;
    const reloadW = proc ? smooth01(Math.min(proc.t / proc.dur, 1 - proc.t / proc.dur) / 0.1) : clipReload;
    const k = aimK * (1 - reloadW);
    // The first spine bone carries the thighs on these rigs, so turning it would swing
    // the stride off the travel line.
    const spine = [body.spine1, body.spine2].filter(Boolean);
    let solveK = k;
    if (aimPoint) _target.copy(aimPoint);
    if (proc && muzzle(muzzleW, fwdW)) {
      // Torso stays square to a near-level line; the firing hand dips the muzzle.
      const yaw = root.rotation.y + 0.12;
      _to.set(-Math.sin(yaw) * Math.cos(0.1), -Math.sin(0.1), -Math.cos(yaw) * Math.cos(0.1));
      _to.multiplyScalar(20).add(muzzleW);
      if (aimPoint) _target.lerp(_to, reloadW);
      else _target.copy(_to);
      solveK = Math.max(aimK, reloadW);
    }
    if (solveK > 0.01 && (aimPoint || proc)) {
      for (let it = 0; it < 3; it++) {
        if (!muzzle(muzzleW, fwdW)) break;
        _to.copy(_target).sub(muzzleW);
        if (_to.lengthSq() < 0.8) break;
        _to.normalize();
        _full.setFromUnitVectors(fwdW, _to);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(_full.w)));
        if (ang < 0.004) break;
        const lim = Math.min(1, MAX_SOLVE / ang);
        _part.slerpQuaternions(_id, _full, (solveK * lim) / spine.length);
        for (const b of spine) rotateWorld(b, _part);
      }
    }
    // Shoulder long guns: the Mixamo rifle sits lower on these bodies than on Remy.
    if (hold === "rifle" && k > 0.05 && arms?.rUpper) {
      model.root.getWorldQuaternion(_q);
      _v.set(0, 0, 1).applyQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      arms.rUpper.getWorldPosition(_sup);
      const yaw = root.rotation.y;
      // Shoulder pocket: just inside the joint, in front of it and level with its top,
      // so the sights come up under the right eye. The hand goes wherever that puts
      // the grip.
      _sup.x -= Math.cos(yaw) * 0.02;
      _sup.z += Math.sin(yaw) * 0.02;
      _sup.addScaledVector(_v, 0.07).addScaledVector(_up, 0.06);
      model.root.updateWorldMatrix(true, false);
      _pw.copy(model.butt);
      model.root.localToWorld(_pw);
      arms.rHand.getWorldPosition(_hw);
      _sup.sub(_pw.sub(_hw));
      _sup.lerp(_hw, 1 - k);
      arms.rHand.getWorldQuaternion(_q2);
      ik(arms.rUpper, arms.rFore, arms.rHand, _sup, 8);
      // Firing elbow out to the side and a little down, not tucked against the ribs.
      _hw.set(Math.cos(yaw), -0.45, -Math.sin(yaw));
      swingElbow(arms.rUpper, arms.rFore, arms.rHand, _hw, 0.55 * k);
      arms.rHand.parent.getWorldQuaternion(_pq);
      arms.rHand.quaternion.copy(_pq.invert().multiply(_q2));
      arms.rHand.updateMatrixWorld(true);
    }
    if (kick > 1e-3 && arms?.rUpper) {
      const yaw = root.rotation.y;
      _axis.set(Math.cos(yaw), 0, -Math.sin(yaw));
      rotateWorld(arms.rUpper, _part.setFromAxisAngle(_axis, kick));
      if (body.spine2) rotateWorld(body.spine2, _part.setFromAxisAngle(_axis, kick * 0.25));
      if (Math.abs(kickSide) > 1e-3) rotateWorld(arms.rUpper, _part.setFromAxisAngle(_up.set(0, 1, 0), kickSide));
    }
    const support = hold === "rifle" ? 1 - clipReload : aimK * (1 - clipReload);
    if (proc && model.support && arms?.lHand && leftFrame) {
      reloadStep(dt, hold, support > 0.5);
      return;
    }
    if (support > 0.3 && model.support && arms?.lHand) {
      if (leftFrame) {
        supportPose(hold, _supPose);
        supportHand(_supPose.p, _supPose.f, _supPose.i);
      } else {
        model.support.getWorldPosition(_sup);
        ik(arms.lUpper, arms.lFore, arms.lHand, _sup, 8);
      }
      const gw = Math.min(1, (support - 0.3) / 0.3);
      if (hold === "rifle") gripFingers("L", "handguard", gw, setWrap("rifle"));
      else gripFingers("L", "cup", gw, setWrap("pistol", true));
    }
  }

  return {
    ready,
    drive,
    post,
    setWeapon,
    muzzle,
    get weapon() {
      return weaponId;
    },
    get hasModel() {
      return !!model;
    },
    /** After mixer.update, before the feet are planted. */
    squareHips,
    /** An upper-body clip (reload, stab, flinch) owns the arms right now. */
    get busy() {
      return !!busy || !!proc;
    },
    /** Procedural kick; `deg` from the weapon's stats. */
    fire(def) {
      const r = ((def?.kick ?? 1) * Math.PI) / 180;
      kick = Math.min(0.5, kick + r * 2.4);
      kickSide += (Math.random() - 0.5) * r * 0.8;
    },
    reload(dur) {
      const def = RELOADS[weaponId];
      if (def && model?.support && arms?.lHand && leftFrame) {
        startReload(def, dur);
        return true;
      }
      const key = holdOf() === "rifle" ? "reloadRifle" : "reloadPistol";
      return overlay(key, dur);
    },
    stab(move = "stab") {
      readyHold = KNIFE_READY_S;
      if (move === "slash" && has("slash")) return overlay("slash", 0.62);
      return overlay("stab", 0.55);
    },
    hitReact() {
      if (busy) return false;
      return overlay("hitReact", 0.5, 0.7);
    },
    /** Stop every armed clip (death takes the body). */
    clear() {
      for (const k of [...LEG_KEYS, ...OVERLAYS]) {
        actions[k]?.stop();
        weight[k] = 0;
      }
      busy = null;
      endReload(true);
    },
  };
}
