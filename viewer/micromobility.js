/**
 * Micromobility: bicycles, e-scooters, and electric cargo bikes.
 * Ride kerb-side on driveable OSM roads plus exported cycleways (npc/cycle-graph).
 * Procedural vehicle meshes + Rocketbox riders (people/ride|step); Mixamo fallback.
 */
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { fitHumanoid } from "./humanoid-fit.js";
import { makeShareScooter } from "./scooters.js";
import { CHARACTERS, STARTER, loadCharacterTemplates, streamCharacterTemplates } from "./characters.js";
import { shared } from "./lanes.js";
import { createCellGrid } from "./cell-grid.js";
import { fetchJsonCached } from "./json-cache.js";
import { buildCyclePaths, buildCycleHandoffs } from "./npc/cycle-graph.js";
import { createPopulation } from "./npc/population.js";

const KMH = 1 / 3.6;
const SPAWN_GAP = 7; // m between riders at spawn
const LOOK_AHEAD = 9; // m: riders react to anything this far ahead in their lane
const LOOK_AHEAD_HARD = 22; // m: trams / buses are long — brake earlier
const LANE_HALF = 0.55; // m: half a bike's swept width
const HARD_SIDE = 2.4; // m: notice a tram/bus on a parallel track before riding into it
const STOP_GAP = 1.6; // m nose-to-tail when queued
const SWERVE = 0.75; // m to the right when an oncoming rider shares the lane
const OVERTAKE = 1.3; // m to the left when passing something that blocks the lane
const HARD_HIT_SPEED = 1.5; // m/s closing → knock-down (not a soft brush)
const CRASH_KILL_SPEED = 7.5; // m/s closing with a tram/bus → lethal
const CRASH_LIE_S = 3.2; // s on the deck before scramble / clear
const CRASH_DEAD_S = 9; // s before a killed rider is cleared
const MAX_WRECKS = 4; // cap tipped bikes/scooters on the ground at once

/** Shared lamp materials so setNight can brighten every rider at once. */
let _lampMat = null;
let _tailMat = null;

function nightMats(THREE) {
  if (!_lampMat) {
    _lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff6dd,
      emissive: 0xfff2cc,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    _tailMat = new THREE.MeshStandardMaterial({
      color: 0xa01010,
      emissive: 0xff2020,
      emissiveIntensity: 0,
      roughness: 0.45,
    });
  }
  return { lamp: _lampMat, tail: _tailMat };
}

function addBikeLights(THREE, g, frontZ, rearZ, y = 0.55) {
  const { lamp, tail } = nightMats(THREE);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lamp);
  head.position.set(0, y, frontZ);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.025), tail);
  back.position.set(0, y - 0.05, rearZ);
  g.add(head, back);
}

// Pedals and bars relative to the saddle top (m, +Z forward). The baked Riding clip
// (scripts/bake_mixamo_rider_clips.py) puts ankles and wrists on exactly these points.
const RIDE = { bbFwd: 0.2, bbDown: 0.54, crank: 0.16, barFwd: 0.46, barUp: 0.08, gripHalf: 0.3 };

const KINDS = {
  bicycle: {
    label: "bicycle",
    weight: 0.5,
    speedKmh: 18,
    color: [0x2a6a9a, 0xc44a3a, 0x3a8a5a, 0x1a1a1a, 0xe8c040],
  },
  scooter: {
    label: "scooter",
    weight: 0.3,
    speedKmh: 20,
    color: [0x00c2a8, 0x6b4cff, 0xff3d6e, 0x222222], // shared-fleet vibes
  },
  // Speed-pedelec long-john: up to ~40 km/h, pulls away hard, 2.7 m long.
  cargo: {
    label: "cargo",
    weight: 0.2,
    speedKmh: 35,
    accel: 2.8,
    hl: 1.35, // half length about the hit centre
    nose: 0.21, // hit centre ahead of the rider
    color: [0x9fb5a8, 0x3a5a78, 0xd4a020, 0x8a4a3a, 0x2a2a2a],
  },
};

function pickKindWeighted() {
  const r = Math.random();
  if (r < KINDS.bicycle.weight) return "bicycle";
  if (r < KINDS.bicycle.weight + KINDS.scooter.weight) return "scooter";
  return "cargo";
}

/** npc/cycle-graph paths ({x,z}) → micromobility Vector3 paths. */
function cyclePathsToMicro(cyclePaths, THREE) {
  return cyclePaths.map((p) => ({
    id: p.id,
    kind: p.kind,
    dir: p.dir,
    contraflow: !!p.contraflow,
    width: p.width,
    bikeOffset: p.bikeOffset,
    points: p.points.map((q) => new THREE.Vector3(q.x, 0, q.z)),
    cumulative: p.cumulative,
    length: p.length,
    start: new THREE.Vector3(p.start.x, 0, p.start.z),
    end: new THREE.Vector3(p.end.x, 0, p.end.z),
  }));
}

function handoffsFromCycle(rawPaths, microPaths) {
  const byId = new Map(microPaths.map((p) => [String(p.id), p]));
  const out = new Map();
  for (const [key, cands] of buildCycleHandoffs(rawPaths)) {
    out.set(
      key,
      cands
        .map((c) => {
          const path = byId.get(String(c.path.id));
          return path ? { path, reverse: c.reverse, s: c.s } : null;
        })
        .filter(Boolean),
    );
  }
  return out;
}

function samplePath(path, s, THREE, outPos, outTan) {
  const dist = Math.max(0, Math.min(path.length, s));
  const cum = path.cumulative;
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(path.points.length - 1, i);
  const segStart = cum[i0];
  const segLen = Math.max(1e-6, cum[i1] - segStart);
  const t = (dist - segStart) / segLen;
  const a = path.points[i0];
  const b = path.points[i1];
  outPos.lerpVectors(a, b, t);
  outTan.subVectors(b, a);
  if (outTan.lengthSq() < 1e-8) outTan.set(1, 0, 0);
  else outTan.normalize();
  outPos.y = 0;
}

function applyBikeLane(path, travelTan, outPos) {
  // Right-hand side of travel direction (Belgium).
  outPos.x += -travelTan.z * path.bikeOffset;
  outPos.z += travelTan.x * path.bikeOffset;
}

function makeWheel(THREE, tireMat, rimMat, radius, thick = 0.04) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, thick, 6, 14), tireMat);
  tire.rotation.y = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(thick * 1.2, thick * 1.2, thick * 1.5, 8), rimMat);
  hub.rotation.z = Math.PI / 2;
  g.add(tire, hub);
  g.userData.spin = true;
  return g;
}

function makeProceduralRider(THREE, seated) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd4a882 });
  const cloth = new THREE.MeshLambertMaterial({
    color: [0x3a5068, 0x6a4a5a, 0x4a6a5a, 0x5a5a78][(Math.random() * 4) | 0],
  });
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.14, seated ? 0.35 : 0.45, 3, 6),
    cloth
  );
  torso.position.y = seated ? 0.95 : 1.15;
  if (seated) torso.rotation.x = 0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), skin);
  head.position.y = seated ? 1.35 : 1.55;
  head.position.z = seated ? 0.08 : 0;
  g.add(torso, head);
  g.userData = { hipsY: seated ? 0.75 : null };
  return g;
}

function makeMixamoRider(THREE, templates, seated) {
  if (!templates.length) return makeProceduralRider(THREE, seated);
  const tmpl = templates[(Math.random() * templates.length) | 0];
  const root = cloneSkeleton(tmpl.scene);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;
    }
  });

  // Clips are baked for a 1.70 m rider; stay close so hands and feet land on the controls.
  const hipsY = fitHumanoid(THREE, root, 1.67 + Math.random() * 0.06);

  const mixer = new THREE.AnimationMixer(root);
  let action = null;
  if (tmpl.clips.length) {
    const clip =
      tmpl.clips.find((c) => (seated ? /rid|bike|cycl/i : /scoot|kick/i).test(c.name)) ||
      tmpl.clips[0];
    action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    action.time = Math.random() * clip.duration;
  }

  root.userData = { mixamo: true, mixer, action, hipsY };
  return root;
}

/** Rocketbox person with baked ride/step clip (same pool as sidewalk crowd). */
function makeRocketboxRider(THREE, pool, seated) {
  if (!pool?.pickTemplate || !pool?.instanceRide) return null;
  const kind = seated ? "ride" : "step";
  const t = pool.pickTemplate(
    (p) => p.age !== "child" && pool.templateHas(p.id, kind),
  );
  if (!t) return null;
  const inst = pool.instanceRide(t, kind);
  const root = inst.root;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;
    }
  });
  root.userData = {
    rocketbox: true,
    mixer: inst.mixer,
    action: inst.action,
    hipsY: inst.hipsY ?? 0.9,
    person: inst,
  };
  return root;
}

/** Set for the duration of one vehicle build so makeRider can see the people pool. */
let _peoplePoolSlot = null;

function makeRider(THREE, templates, seated) {
  return (
    makeRocketboxRider(THREE, _peoplePoolSlot, seated) || makeMixamoRider(THREE, templates, seated)
  );
}

/** Put a fitted rider's pelvis just above the saddle (feet are at the rider's y = 0). */
function seatRider(rider, saddleY, saddleZ) {
  const hipsY = rider.userData.hipsY ?? 0.9;
  rider.position.y += saddleY + 0.07 - hipsY;
  rider.position.z = saddleZ;
}

/** Thin cylinder from a to b (each [x, y, z]). */
function tube(THREE, mat, a, b, r) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
  m.position.copy(A).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function handlebar(THREE, metal, gripMat, y, z) {
  const h = RIDE.gripHalf;
  return [
    tube(THREE, metal, [-h - 0.04, y, z], [h + 0.04, y, z], 0.012),
    tube(THREE, gripMat, [h - 0.05, y, z], [h + 0.05, y, z], 0.018),
    tube(THREE, gripMat, [-h + 0.05, y, z], [-h - 0.05, y, z], 0.018),
  ];
}

/** Spinning crank. Phase 0 (rotation.x = −π/2) puts the left pedal on world −X when the bike faces +Z. */
function bikeCrank(THREE, metal, tireMat, bb, armLen) {
  const crank = new THREE.Group();
  crank.position.set(bb[0], bb[1], bb[2]);
  for (const up of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, armLen, 0.016), metal);
    arm.position.y = up * armLen * 0.5;
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.016, 0.04), tireMat);
    pedal.position.set(up > 0 ? -0.08 : 0.08, up * armLen, 0);
    crank.add(arm, pedal);
  }
  return crank;
}

function makeBicycle(THREE, color, rideTemplates, withRider = true) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const metal = new THREE.MeshLambertMaterial({ color: 0x777777 });

  // Diamond-frame city bike (NPC traffic — distinct from docked Velo step-throughs), front +Z.
  const R = 0.32; // wheel radius
  const rearHub = [0, R, -0.52];
  const frontHub = [0, R, 0.52];
  const saddleY = 0.82;
  const saddleZ = -0.27;
  const bb = [0, saddleY - RIDE.bbDown, saddleZ + RIDE.bbFwd]; // bottom bracket
  const barY = saddleY + RIDE.barUp;
  const barZ = saddleZ + RIDE.barFwd;
  const seatTop = [0, 0.7, -0.25];
  const headTop = [0, 0.76, 0.33];
  const headBot = [0, 0.6, 0.38];
  const parts = [
    tube(THREE, frameMat, bb, seatTop, 0.02), // seat tube
    tube(THREE, frameMat, [0, 0.67, -0.24], headTop, 0.02), // top tube
    tube(THREE, frameMat, bb, headBot, 0.024), // down tube
    tube(THREE, frameMat, headBot, headTop, 0.026), // head tube
    tube(THREE, frameMat, [0.05, ...bb.slice(1)], [0.05, ...rearHub.slice(1)], 0.012), // chainstays
    tube(THREE, frameMat, [-0.05, ...bb.slice(1)], [-0.05, ...rearHub.slice(1)], 0.012),
    tube(THREE, frameMat, [0.04, ...seatTop.slice(1)], [0.05, ...rearHub.slice(1)], 0.011), // seatstays
    tube(THREE, frameMat, [-0.04, ...seatTop.slice(1)], [-0.05, ...rearHub.slice(1)], 0.011),
    tube(THREE, metal, [0.04, ...headBot.slice(1)], [0.04, ...frontHub.slice(1)], 0.012), // fork
    tube(THREE, metal, [-0.04, ...headBot.slice(1)], [-0.04, ...frontHub.slice(1)], 0.012),
    tube(THREE, metal, seatTop, [0, saddleY - 0.02, saddleZ], 0.014), // seat post
    tube(THREE, metal, headTop, [0, barY, barZ], 0.014), // stem
    ...handlebar(THREE, metal, tireMat, barY, barZ),
    tube(THREE, metal, [-0.09, ...bb.slice(1)], [0.09, ...bb.slice(1)], 0.012), // crank axle
  ];
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.26), tireMat);
  saddle.position.set(0, saddleY, saddleZ);

  const front = makeWheel(THREE, tireMat, metal, R, 0.025);
  front.position.set(...frontHub);
  const rear = makeWheel(THREE, tireMat, metal, R, 0.025);
  rear.position.set(...rearHub);

  const crank = bikeCrank(THREE, metal, tireMat, bb, RIDE.crank);
  g.add(...parts, saddle, front, rear, crank);
  addBikeLights(THREE, g, 0.42, -0.4, 0.72);
  g.userData.wheels = [front, rear];
  g.userData.crank = crank;
  g.userData.seat = {
    saddle: new THREE.Vector3(0, saddleY, saddleZ),
    crank: new THREE.Vector3(bb[0], bb[1], bb[2]),
    crankR: RIDE.crank,
    pedalX: 0.08,
    bar: new THREE.Vector3(0, barY, barZ),
    grip: RIDE.gripHalf,
  };
  if (withRider) {
    const rider = makeRider(THREE, rideTemplates, true);
    seatRider(rider, saddleY, saddleZ);
    g.add(rider);
    g.userData.rider = rider;
  }
  return g;
}

/** City bicycle at its real size, without a rider. */
export function makeBicycleMesh(THREE, color = 0x2a6a9a) {
  return makeBicycle(THREE, color, [], false);
}

function makeScooter(THREE, color, scooterTemplates, withRider = true) {
  const g = new THREE.Group();
  // Same model as the parked share scooters; that one faces −Z, NPC traffic faces +Z.
  const body = makeShareScooter(THREE, { name: `npc-${color}`, body: color, trim: 0xf4f6f8, deck: 0x22262b });
  body.rotation.y = Math.PI;
  body.userData.kickstand.visible = false;
  g.add(body);
  addBikeLights(THREE, g, 0.47, -0.5, 0.44);
  g.userData.wheels = body.userData.wheels;
  g.userData.wheelSign = -1; // wheels live in the flipped frame
  g.userData.wheelR = 0.15;
  body.updateMatrix();
  const raw = body.userData.seat;
  g.userData.seat = {
    kind: "step",
    deck: raw.deck.clone().applyMatrix4(body.matrix),
    bar: raw.bar.clone().applyMatrix4(body.matrix),
    grip: raw.grip,
  };
  if (withRider) {
    const rider = makeRider(THREE, scooterTemplates, false);
    // Deck top and stance; the baked Scooter clip reaches grips 0.99 m up and 0.34 m ahead.
    rider.position.y += 0.175;
    rider.position.z = -0.08;
    g.add(rider);
    g.userData.rider = rider;
  }
  return g;
}

/** Share step at its real size, without a rider. Front ends up toward +Z. */
export function makeScooterMesh(THREE, color = 0x222222) {
  return makeScooter(THREE, color, [], false);
}

/**
 * Electric long-john bakfiets (Urban Arrow style), front +Z: 26" rear wheel under the rider,
 * a low foam box slung between the rider and a 20" front wheel, steered by a rod under the box.
 * About 2.7 m nose to tail.
 */
function makeCargoBike(THREE, color, rideTemplates, withRider = true) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color });
  const boxMat = new THREE.MeshLambertMaterial({ color: 0x26292b });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const metal = new THREE.MeshLambertMaterial({ color: 0x777777 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c2c2c });

  const RR = 0.33; // rear wheel radius
  const FR = 0.25; // front wheel radius
  const rearHub = [0, RR, -0.8];
  const frontHub = [0, FR, 1.3];
  const saddleY = 0.86;
  const saddleZ = -0.5;
  const bb = [0, saddleY - RIDE.bbDown, saddleZ + RIDE.bbFwd];
  const barY = saddleY + RIDE.barUp;
  const barZ = saddleZ + RIDE.barFwd;
  const spineY = 0.24;
  const seatTop = [0, 0.72, -0.44];
  const headTop = [0, barY - 0.1, barZ - 0.06];
  const forkTop = [0, 0.66, 1.2];

  // Box side profile (z, y), extruded across the bike: flat floor, raked nose.
  const W = 0.62;
  const prof = [
    [0.12, 0.3],
    [0.92, 0.3],
    [1.14, 0.52],
    [1.2, 0.8],
    [0.12, 0.86],
  ];
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)));
  const box = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false }), boxMat);
  box.rotation.y = -Math.PI / 2;
  box.position.x = W / 2;
  const rim = [];
  for (const x of [-W / 2, W / 2]) {
    for (let i = 1; i < prof.length; i++) {
      const [z0, y0] = prof[i - 1];
      const [z1, y1] = prof[i];
      if (i === 1) continue; // the floor edge sits on the spine
      rim.push(tube(THREE, frameMat, [x, y0, z0], [x, y1, z1], 0.022));
    }
  }
  rim.push(tube(THREE, frameMat, [-W / 2, 0.8, 1.2], [W / 2, 0.8, 1.2], 0.022));
  rim.push(tube(THREE, frameMat, [-W / 2, 0.86, 0.12], [W / 2, 0.86, 0.12], 0.022));

  const parts = [
    // Low spine: bottom bracket, under the box floor, up to the front head tube.
    tube(THREE, frameMat, bb, [0, spineY, 0.12], 0.04),
    tube(THREE, frameMat, [0, spineY, 0.12], [0, spineY, 0.95], 0.04),
    tube(THREE, frameMat, [0, spineY, 0.95], forkTop, 0.035),
    // Rear triangle.
    tube(THREE, frameMat, bb, seatTop, 0.03),
    tube(THREE, frameMat, [0.05, ...bb.slice(1)], [0.05, ...rearHub.slice(1)], 0.015),
    tube(THREE, frameMat, [-0.05, ...bb.slice(1)], [-0.05, ...rearHub.slice(1)], 0.015),
    tube(THREE, frameMat, [0.04, ...seatTop.slice(1)], [0.05, ...rearHub.slice(1)], 0.014),
    tube(THREE, frameMat, [-0.04, ...seatTop.slice(1)], [-0.05, ...rearHub.slice(1)], 0.014),
    // Steering column behind the box, and its stem.
    tube(THREE, frameMat, [0, spineY + 0.02, 0.06], headTop, 0.032),
    tube(THREE, metal, headTop, [0, barY, barZ], 0.016),
    ...handlebar(THREE, metal, tireMat, barY, barZ),
    tube(THREE, metal, seatTop, [0, saddleY - 0.02, saddleZ], 0.015),
    // Front fork and the steering rod under the box.
    tube(THREE, metal, [0.045, ...forkTop.slice(1)], [0.045, ...frontHub.slice(1)], 0.014),
    tube(THREE, metal, [-0.045, ...forkTop.slice(1)], [-0.045, ...frontHub.slice(1)], 0.014),
    tube(THREE, metal, [0.06, 0.2, 0.06], [0.06, 0.2, 1.16], 0.008),
    tube(THREE, metal, [-0.09, ...bb.slice(1)], [0.09, ...bb.slice(1)], 0.012),
  ];
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.26), tireMat);
  seat.position.set(0, saddleY, saddleZ);
  // Mid-drive motor at the cranks and the frame battery in front of the seat tube.
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 12), dark);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0, bb[1] - 0.02, bb[2] + 0.02);
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.11), dark);
  battery.position.set(0, 0.42, 0.0);
  battery.rotation.x = -0.25;
  const fender = new THREE.Mesh(new THREE.TorusGeometry(RR + 0.04, 0.02, 4, 16, Math.PI * 0.75), tireMat);
  fender.rotation.y = Math.PI / 2; // arc runs from behind the hub over the top
  fender.position.set(...rearHub);

  const crank = bikeCrank(THREE, metal, tireMat, bb, RIDE.crank);
  const front = makeWheel(THREE, tireMat, metal, FR, 0.03);
  front.position.set(...frontHub);
  front.userData.r = FR;
  const rear = makeWheel(THREE, tireMat, metal, RR, 0.035);
  rear.position.set(...rearHub);
  rear.userData.r = RR;

  g.add(...parts, ...rim, box, seat, motor, battery, fender, crank, front, rear);
  addBikeLights(THREE, g, 1.22, -1.14, 0.72);
  g.userData.wheels = [front, rear];
  g.userData.wheelR = RR;
  g.userData.crank = crank;
  g.userData.seat = {
    saddle: new THREE.Vector3(0, saddleY, saddleZ),
    crank: new THREE.Vector3(bb[0], bb[1], bb[2]),
    crankR: RIDE.crank,
    pedalX: 0.08,
    bar: new THREE.Vector3(0, barY, barZ),
    grip: RIDE.gripHalf,
  };
  if (withRider) {
    const rider = makeRider(THREE, rideTemplates, true);
    seatRider(rider, saddleY, saddleZ);
    g.add(rider);
    g.userData.rider = rider;
  }
  return g;
}

/** Bakfiets at its real size, without a rider. The box stays in front; the rider is not scaled to it. */
export function makeCargoMesh(THREE, color = 0x3a5a78) {
  return makeCargoBike(THREE, color, [], false);
}

function makeVehicle(THREE, kind, rideTemplates, scooterTemplates, pool) {
  const cfg = KINDS[kind];
  const colors = cfg.color;
  const color = colors[(Math.random() * colors.length) | 0];
  _peoplePoolSlot = pool || null;
  try {
    if (kind === "scooter") return makeScooter(THREE, color, scooterTemplates);
    if (kind === "cargo") return makeCargoBike(THREE, color, rideTemplates);
    return makeBicycle(THREE, color, rideTemplates);
  } finally {
    _peoplePoolSlot = null;
  }
}


export async function createMicromobility(scene, THREE, opts = {}) {
  const COUNT = opts.count ?? 28;
  const peoplePool = opts.people || null;
  const population = createPopulation(opts.district || window.__DISTRICT || {});
  let gameHour = Number.isFinite(opts.hour) ? opts.hour : 12;
  let gameDay = Number.isFinite(opts.day) ? opts.day : 5;

  let roads = [];
  let cycleways = [];
  try {
    // Fixed relative path only (opts.roadsUrl ignored — avoids SSRF on user-controlled URLs).
    const res = await fetchJsonCached("./roads.json");
    if (res.ok) {
      const data = await res.json();
      roads = data.roads || [];
      cycleways = data.cycleways || [];
    }
  } catch (err) {
    console.warn("[cityview] micromobility: roads.json failed", err);
  }

  const rawCycle = buildCyclePaths(roads, cycleways);
  const paths = cyclePathsToMicro(rawCycle, THREE);
  if (!paths.length) {
    console.warn("[cityview] micromobility: no bikeable paths");
    return { update() {}, dispose() {}, vehicles: [], count: 0 };
  }

  // Mixamo fallback when Rocketbox ride/step clips are missing for a spawn.
  const [rideTemplates, scooterTemplates] = await Promise.all([
    loadCharacterTemplates("Riding", [STARTER]),
    loadCharacterTemplates("Scooter", [STARTER]),
  ]);

  const handoffs = handoffsFromCycle(rawCycle, paths);
  const root = new THREE.Group();
  root.name = "Micromobility";
  scene.add(root);

  const _pos = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const vehicles = [];

  function place(v) {
    samplePath(v.path, v.s, THREE, _pos, _tan);
    if (v.reverse) _tan.negate();
    applyBikeLane(v.path, _tan, _pos);
    if (v.swerve) {
      _pos.x += -_tan.z * v.swerve;
      _pos.z += _tan.x * v.swerve;
    }
    v.mesh.position.copy(_pos);
    v.mesh.rotation.y = Math.atan2(_tan.x, _tan.z);
    v.pos.set(_pos.x, 0, _pos.z);
    v.tan.set(_tan.x, 0, _tan.z);
  }

  function legalDirs(path) {
    if (path.dir === 1) return [false];
    if (path.dir === -1) return [true];
    if (path.contraflow) return [false, true];
    return [false, true];
  }

  function pickKind() {
    const look = population.pickLook(opts.spawnCenter?.x ?? 0, opts.spawnCenter?.z ?? 0);
    const mode = population.pickMode(look, "adult", Math.random() < 0.5 ? "f" : "m", gameHour);
    if (mode === "step") return "scooter";
    if (mode === "bakfiets") return "cargo";
    if (mode === "bike") return "bicycle";
    // Walkers are sidewalk-only; still bias toward bikes when mode is walk.
    return pickKindWeighted();
  }

  function releaseRider(mesh) {
    const rider = mesh?.userData?.rider;
    const person = rider?.userData?.person;
    if (person && peoplePool) peoplePool.release(person);
  }

  function spawnOne() {
    // Pick a free spot: never spawn a rider on top of another one (they would ride as one).
    let path = paths[0];
    let reverse = false;
    let s = 0.5;
    for (let attempt = 0; attempt < 12; attempt++) {
      path = paths[(Math.random() * paths.length) | 0];
      const dirs = legalDirs(path);
      reverse = dirs[(Math.random() * dirs.length) | 0];
      s = Math.random() * path.length * 0.9 + 0.5;
      samplePath(path, s, THREE, _pos, _tan);
      if (!vehicles.some((o) => o.pos.distanceToSquared(_pos) < SPAWN_GAP * SPAWN_GAP)) break;
    }
    const kind = pickKind();
    const cfg = KINDS[kind];
    const speed = cfg.speedKmh * KMH * (0.85 + Math.random() * 0.3);
    const mesh = makeVehicle(THREE, kind, rideTemplates, scooterTemplates, peoplePool);
    root.add(mesh);
    const v = {
      kind,
      hl: cfg.hl || 0, // half length for long bikes (0 = round footprint)
      nose: cfg.nose || 0,
      path,
      reverse,
      s,
      speed,
      cur: speed,
      swerve: 0,
      mesh,
      pos: new THREE.Vector3(),
      tan: new THREE.Vector3(),
      wheelPhase: Math.random() * Math.PI * 2,
    };
    place(v);
    vehicles.push(v);
  }

  /**
   * Keep riders apart: follow the one ahead in the same lane, swerve right for oncoming
   * riders sharing the lane, and brake for the walker / other obstacles on the bike lane.
   * Oriented obstacles (trams / buses: `{ x, z, tx, tz, hl, hw, hard }`) are solid — riders
   * brake and never try to overtake through them.
   */
  // Spatial prefilter over this frame's obstacle list (24 m cells). Exact tests stay as-is;
  // the grid only drops obstacles that cannot reach the rider.
  const obsGrid = createCellGrid();
  const _nearObs = [];
  let gridSrc = null;
  let gridReach = 0;
  function buildObstacleGrid(obstacles) {
    obsGrid.clear();
    gridSrc = obstacles;
    let maxExt = 0;
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      obsGrid.insert(ob, ob.x, ob.z);
      const ext = ob.hl != null ? Math.max(ob.hl ?? 1, ob.hw ?? 1) : ob.r ?? 0.4;
      if (ext > maxExt) maxExt = ext;
    }
    // Longest look-ahead + obstacle half-extent + lateral notice band (+ slack).
    gridReach = Math.max(LOOK_AHEAD, LOOK_AHEAD_HARD) + maxExt + HARD_SIDE + 2;
  }
  function nearObstacles(v, obstacles) {
    if (obstacles !== gridSrc) return obstacles; // not this frame's list: no prefilter
    return obsGrid.query(v.pos.x, v.pos.z, gridReach, _nearObs);
  }

  function targetSpeed(v, obstacles) {
    let gap = Infinity;
    let oncoming = false;
    let hardBlock = false;
    const tx = v.tan.x;
    const tz = v.tan.z;
    const cfg = KINDS[v.kind];
    // Long nose ahead of the rider, and the stopping distance at this speed (brakes ~5 m/s²).
    const front = cfg.hl ? cfg.nose + cfg.hl - 0.5 : 0;
    const look = Math.max(LOOK_AHEAD, front + STOP_GAP + (v.speed * v.speed) / 10);
    const consider = (ox, oz, otx, otz, radius) => {
      const dx = ox - v.pos.x;
      const dz = oz - v.pos.z;
      const along = dx * tx + dz * tz;
      if (along <= 0 || along > look) return;
      const lat = Math.abs(dx * tz - dz * tx);
      if (lat > LANE_HALF + radius) return;
      if (otx * tx + otz * tz < -0.3) oncoming = true;
      gap = Math.min(gap, along - radius);
    };
    const considerBox = (ob) => {
      const dx = ob.x - v.pos.x;
      const dz = ob.z - v.pos.z;
      const hl = ob.hl ?? 1;
      const hw = ob.hw ?? 1;
      const ahead = dx * tx + dz * tz;
      const reach = Math.max(ob.hard ? LOOK_AHEAD_HARD : LOOK_AHEAD, look) + hl;
      if (ahead < -hl || ahead > reach) return;
      const lat = Math.abs(dx * tz - dz * tx);
      // Soft lane box for cars; hard transit is noticed from the neighbouring track too
      // so riders brake instead of overtaking into a tram that looks "beside" them.
      const side = ob.hard ? HARD_SIDE + hw : LANE_HALF + hw;
      if (lat > side) return;
      const otx = ob.tx || 0;
      const otz = ob.tz || 0;
      if (otx * tx + otz * tz < -0.3) oncoming = true;
      // Closing on the box: prefer the nose gap; if already alongside, treat as zero gap.
      const nose = ahead - hl;
      gap = Math.min(gap, lat > LANE_HALF + hw * 0.85 ? Math.max(0.2, nose) : nose);
      if (ob.hard) hardBlock = true;
    };
    for (const o of vehicles) {
      if (o === v) continue;
      // Tipped wrecks are static debris in the lane — brake for them, do not ride through.
      if (o.crash) {
        consider(o.pos.x, o.pos.z, 0, 0, 0.85);
        continue;
      }
      const oc = KINDS[o.kind];
      consider(o.pos.x, o.pos.z, o.tan.x, o.tan.z, oc.hl ? oc.hl - oc.nose : 0.5);
    }
    for (const ob of nearObstacles(v, obstacles)) {
      if (ob.hl != null) considerBox(ob);
      else consider(ob.x, ob.z, 0, 0, ob.r ?? 0.4);
    }
    // Measure from this bike's own nose, not the saddle.
    gap -= front;
    // Held up for a while behind something that is not moving: pull out and pass on the left —
    // never past a tram / bus (they fill the lane; "passing" would ride through them).
    v.stuck = gap < STOP_GAP + 1 && v.cur < 0.5 ? (v.stuck || 0) + dtSwerve : 0;
    if (!hardBlock && v.stuck > 2.5) {
      v.overtake = 3.5; // s spent out in the passing line
      v.stuck = 0;
    }
    if (hardBlock) v.overtake = 0;
    if (v.overtake > 0) v.overtake -= dtSwerve;
    const passing = v.overtake > 0 && !oncoming && !hardBlock;
    const want = oncoming ? SWERVE : passing ? -OVERTAKE : 0;
    const k = Math.min(1, dtSwerve * 2.5);
    v.swerve += (want - v.swerve) * k;
    if (passing) return v.speed * 0.6;
    if (gap === Infinity) return v.speed;
    // Hard stop in front of a tram / bus that already overlaps the bike's nose.
    if (hardBlock && gap < STOP_GAP) return 0;
    return v.speed * Math.max(0, Math.min(1, (gap - STOP_GAP) / (look - front - STOP_GAP)));
  }
  let dtSwerve = 0;

  const FIRST = Math.min(COUNT, opts.firstCount ?? 3);
  for (let i = 0; i < FIRST; i++) spawnOne();

  let varietyStarted = false;
  function streamVariety() {
    if (varietyStarted) return;
    varietyStarted = true;
    // Mixamo bodies only when the Rocketbox pool is missing ride/step coverage.
    if (!peoplePool) {
      const rest = CHARACTERS.filter((n) => n !== STARTER);
      const add = (list) => (tmpl) => {
        if (!list.some((t) => t.name === tmpl.name)) list.push(tmpl);
      };
      streamCharacterTemplates("Riding", add(rideTemplates), rest);
      streamCharacterTemplates("Scooter", add(scooterTemplates), rest);
    }
    let left = COUNT - vehicles.length;
    const step = () => {
      if (left <= 0) return;
      spawnOne();
      left--;
      if (left > 0) setTimeout(step, 200);
    };
    if (left > 0) setTimeout(step, 200);
  }
  shared.bikes = vehicles;

  const rocketboxN = vehicles.filter((v) => v.mesh.userData.rider?.userData?.rocketbox).length;
  console.info(
    `[cityview] micromobility: ${vehicles.length} riders` +
      ` (${vehicles.filter((v) => v.kind === "bicycle").length} bikes,` +
      ` ${vehicles.filter((v) => v.kind === "scooter").length} scooters,` +
      ` ${vehicles.filter((v) => v.kind === "cargo").length} cargo)` +
      ` · Rocketbox=${rocketboxN} Mixamo fallback ride=${rideTemplates.length}` +
      ` · cycle paths=${paths.length}`,
  );

  function advanceEnd(v) {
    const atEnd = !v.reverse;
    const key = `${v.path.id}:${atEnd ? "e" : "s"}`;
    const cands = handoffs.get(key) || [];
    if (cands.length) {
      const next = cands[(Math.random() * cands.length) | 0];
      v.path = next.path;
      v.reverse = next.reverse;
      v.s = next.s;
      return;
    }
    // Dead end: U-turn if the road allows both ways, else teleport to a random path
    if (v.path.dir === 0) {
      v.reverse = !v.reverse;
      v.s = Math.max(0.5, Math.min(v.path.length - 0.5, v.s));
    } else {
      const path = paths[(Math.random() * paths.length) | 0];
      v.path = path;
      v.reverse = legalDirs(path)[0];
      v.s = Math.random() * path.length * 0.8;
    }
  }

  /**
   * True when a rider centred at (x, z) touches an oriented transit body.
   * Pads are the bike's own half-length / half-width: a bus that clips the
   * wheel or the bars counts, not only a hit that swallows the saddle.
   */
  function riderTouchesBody(ob, x, z, pad = 0.35) {
    if (!ob?.hard || ob.hl == null) return false;
    const dx = x - ob.x;
    const dz = z - ob.z;
    const otx = ob.tx || 0;
    const otz = ob.tz || 0;
    const along = Math.abs(dx * otx + dz * otz);
    const lat = Math.abs(dx * otz - dz * otx);
    // 0.32 m is a handlebar / shoulder past the saddle, so a bus that
    // brushes the bike counts. A clear gap beside the body does not.
    return along < (ob.hl ?? 1) + pad && lat < (ob.hw ?? 1) + 0.32;
  }

  /** Nearest hard tram/bus the rider's body is touching, or null. */
  function hardHit(v, obstacles) {
    let best = null;
    let bestD = Infinity;
    const cfg = KINDS[v.kind];
    const nose = cfg.nose || 0;
    const cx = v.pos.x + v.tan.x * nose;
    const cz = v.pos.z + v.tan.z * nose;
    for (const ob of nearObstacles(v, obstacles)) {
      if (!riderTouchesBody(ob, cx, cz, cfg.hl || 0.35)) continue;
      const dx = v.pos.x - ob.x;
      const dz = v.pos.z - ob.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = ob;
      }
    }
    return best;
  }

  /** Put the rider back on a free path after an accident (or after lying dead is cleared). */
  function respawnRider(v) {
    const path = paths[(Math.random() * paths.length) | 0];
    v.path = path;
    v.reverse = legalDirs(path)[0];
    v.s = Math.random() * Math.max(1, path.length - 2) + 0.5;
    v.cur = 0;
    v.swerve = 0;
    v.overtake = 0;
    v.stuck = 0;
    v.crash = null;
    v.mesh.rotation.x = 0;
    v.mesh.rotation.z = 0;
    v.mesh.visible = true;
    const rider = v.mesh.userData.rider;
    if (rider) {
      rider.visible = true;
      if (rider.userData?.action) rider.userData.action.setEffectiveTimeScale(1);
    }
    place(v);
  }

  /**
   * Real-world hit: tip the bike, throw the rider, damage by closing speed.
   * Trams never swerve — the bike takes the hit; violent ones kill and clear later.
   */
  function startCrash(v, ob) {
    const otx = ob.tx || 0;
    const otz = ob.tz || 0;
    // Throw off the track: bike heading plus a shove from the consist's flank.
    const dx = v.pos.x - ob.x;
    const dz = v.pos.z - ob.z;
    let nx = dx - (dx * otx + dz * otz) * otx;
    let nz = dz - (dx * otx + dz * otz) * otz;
    let nl = Math.hypot(nx, nz);
    if (nl < 0.05) {
      // Dead-centre hit: shove sideways off the track instead of nowhere.
      nx = -otz;
      nz = otx;
      nl = 1;
    }
    nx /= nl;
    nz /= nl;
    const speed = Math.max(v.cur, 0);
    const closing = speed + Math.max(0, Number(ob.speed) || 0);
    const kick = 2.2 + closing * 0.55;
    const dead = closing >= CRASH_KILL_SPEED;
    v.cur = 0;
    v.swerve = 0;
    v.overtake = 0;
    v.stuck = 0;
    v.crash = {
      t: 0,
      dead,
      vx: v.tan.x * Math.max(speed, 1.2) * 0.35 + nx * kick,
      vz: v.tan.z * Math.max(speed, 1.2) * 0.35 + nz * kick,
      vy: 1.1 + closing * 0.18,
      y: 0.15,
      roll: 0,
      spin: 3.8 + closing * 0.35,
      lie: dead ? CRASH_DEAD_S : CRASH_LIE_S,
    };
    const rider = v.mesh.userData.rider;
    if (rider?.userData?.action) rider.userData.action.setEffectiveTimeScale(0);
  }

  function updateCrash(v, dt, obstacles = []) {
    const c = v.crash;
    c.t += dt;
    const airborne = c.y > 0 || c.vy > 0;
    const hs = Math.hypot(c.vx, c.vz);
    if (hs > 0.05) {
      v.mesh.position.x += c.vx * dt;
      v.mesh.position.z += c.vz * dt;
      v.pos.x = v.mesh.position.x;
      v.pos.z = v.mesh.position.z;
      // Do not slide the wreck back through a tram/bus body.
      if (hardHit(v, obstacles)) {
        c.vx *= -0.15;
        c.vz *= -0.15;
        v.mesh.position.x += c.vx * dt;
        v.mesh.position.z += c.vz * dt;
        v.pos.x = v.mesh.position.x;
        v.pos.z = v.mesh.position.z;
      }
      if (!airborne) {
        const slow = Math.max(0, hs - 6 * dt) / hs;
        c.vx *= slow;
        c.vz *= slow;
      }
    }
    if (airborne) {
      c.vy -= 9.81 * dt;
      c.y = Math.max(0, c.y + c.vy * dt);
      if (c.y === 0) c.vy = 0;
    }
    // Tip onto the side while thrown.
    if (c.roll < Math.PI / 2) c.roll = Math.min(Math.PI / 2, c.roll + c.spin * dt);
    v.mesh.rotation.z = c.roll;
    v.mesh.position.y = c.y + Math.sin(c.roll) * 0.35;
    if (c.roll >= Math.PI / 2 - 1e-3 && hs < 0.08 && !airborne) {
      c.lie -= dt;
      if (c.lie <= 0) {
        if (c.dead) {
          // Violent hit: clear the wreck and put a fresh rider elsewhere.
          respawnRider(v);
        } else {
          // Survived: scramble back onto the network (no ghosting through the tram).
          respawnRider(v);
        }
      }
    }
  }

  // Distance LOD (mirrors pedestrians.js Hot / Warm / Cold), measured from the camera:
  //   Hot  <= HOT_M   full mixer, hard-hit tests
  //   Warm <= WARM_M  mixer at half rate, hard-hit tests (a visible clip still crashes)
  //   Cold <= COLD_M  hidden, mixer frozen, path still advances
  //   Far  >  FAR_M   recycled onto a path near the camera (rate-limited)
  const HOT_M = 60;
  const WARM_M = 120;
  const COLD_M = 200;
  const FAR_M = 200;
  const RECYCLE_MIN_M = 50;
  const RECYCLE_MAX_M = 150;
  const RECYCLES_PER_FRAME = 2;
  let lodFrame = 0;
  let recycled = 0;
  const camPos = { x: 0, z: 0, set: false };

  /** Same pattern as traffic.setCamera: update() reads this when no cam is passed. */
  function setCamera(x, z) {
    if (Number.isFinite(x) && Number.isFinite(z)) {
      camPos.x = x;
      camPos.z = z;
      camPos.set = true;
    }
  }

  /** Move a far-away rider onto a path point 50-150 m from the camera. True when it moved. */
  function recycleNear(v, cx, cz) {
    if (recycled >= RECYCLES_PER_FRAME) return false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const path = paths[(Math.random() * paths.length) | 0];
      const s = Math.random() * Math.max(1, path.length - 2) + 0.5;
      samplePath(path, s, THREE, _pos, _tan);
      const d = Math.hypot(_pos.x - cx, _pos.z - cz);
      if (d < RECYCLE_MIN_M || d > RECYCLE_MAX_M) continue;
      if (vehicles.some((o) => o !== v && o.pos.distanceToSquared(_pos) < SPAWN_GAP * SPAWN_GAP)) continue;
      v.path = path;
      v.reverse = legalDirs(path)[0];
      v.s = s;
      v.cur = v.speed;
      v.swerve = 0;
      v.overtake = 0;
      v.stuck = 0;
      place(v);
      recycled++;
      return true;
    }
    return false;
  }

  function update(dt, obstacles = [], cam = null) {
    if (!(dt > 0)) return;
    dtSwerve = dt;
    lodFrame++;
    recycled = 0;
    buildObstacleGrid(obstacles);
    if (cam && Number.isFinite(cam.x) && Number.isFinite(cam.z)) setCamera(cam.x, cam.z);
    const haveCam = camPos.set;
    const cx = camPos.x;
    const cz = camPos.z;
    const hot2 = HOT_M * HOT_M;
    const warm2 = WARM_M * WARM_M;
    const far2 = FAR_M * FAR_M;
    for (let vi = 0; vi < vehicles.length; vi++) {
      const v = vehicles[vi];
      if (v.crash) {
        updateCrash(v, dt, obstacles);
        continue;
      }

      const d2 = haveCam ? (v.pos.x - cx) * (v.pos.x - cx) + (v.pos.z - cz) * (v.pos.z - cz) : 0;
      if (d2 > warm2) {
        // Cold / Far: hidden, mixer frozen; still advance along the path cheaply.
        v.mesh.visible = false;
        v.s += (v.reverse ? -v.speed : v.speed) * dt * 0.85;
        if (v.s >= v.path.length) {
          v.s = v.path.length - 0.01;
          advanceEnd(v);
        } else if (v.s <= 0) {
          v.s = 0.01;
          advanceEnd(v);
        }
        place(v);
        if (d2 > far2) recycleNear(v, cx, cz);
        continue;
      }
      v.mesh.visible = true;

      const want = targetSpeed(v, obstacles);
      const rate = want < v.cur ? 6.0 : KINDS[v.kind].accel || 1.6; // brake hard, pull away gently
      v.cur += Math.max(-rate * dt, Math.min(rate * dt, want - v.cur));
      const delta = v.cur * dt;
      v.s += v.reverse ? -delta : delta;
      if (v.s >= v.path.length) {
        v.s = v.path.length - 0.01;
        advanceEnd(v);
      } else if (v.s <= 0) {
        v.s = 0.01;
        advanceEnd(v);
      }
      place(v);

      const hot = d2 <= hot2;
      // A bus / tram that clips the bike throws the rider. Visible riders (hot and
      // warm) all count — a touch you can see has to become an accident.
      const hit = hardHit(v, obstacles);
      if (hit) {
        const busV = Math.max(0, Number(hit.speed) || 0);
        const closing = Math.max(v.cur, 0) + busV;
        // A stopped pair can sit side by side. Fall when someone is actually moving.
        if (closing >= HARD_HIT_SPEED || (busV >= 0.6 && v.cur < 0.4)) {
          startCrash(v, hit);
          continue;
        }
      }

      // Spin wheels
      v.wheelPhase += delta / (v.mesh.userData.wheelR || 0.32);
      const wheels = v.mesh.userData.wheels || [];
      const spin = v.wheelPhase * (v.mesh.userData.wheelSign || 1);
      const refR = v.mesh.userData.wheelR || 0.32;
      for (const w of wheels) w.rotation.x = w.userData.r ? (spin * refR) / w.userData.r : spin;

      const rider = v.mesh.userData.rider;
      if (rider?.userData?.mixer) {
        // Warm riders tick every other frame (staggered per rider) with the accumulated dt.
        v.mixDt = (v.mixDt || 0) + dt;
        if (hot || ((lodFrame + vi) & 1) === 0) {
          // Pedal / push cadence roughly tracks travel speed
          const scale = Math.max(0.05, Math.min(1.6, v.cur / 4.5));
          if (rider.userData.action) rider.userData.action.setEffectiveTimeScale(scale);
          rider.userData.mixer.update(v.mixDt);
          v.mixDt = 0;
        }
      }
    }
    cullExcessWrecks();
  }

  /** Cap visible tipped wrecks; oldest force-respawn onto the network. */
  function cullExcessWrecks() {
    const wrecks = [];
    for (const v of vehicles) if (v.crash) wrecks.push(v);
    if (wrecks.length <= MAX_WRECKS) return;
    wrecks.sort((a, b) => (b.crash.t || 0) - (a.crash.t || 0));
    for (let i = MAX_WRECKS; i < wrecks.length; i++) respawnRider(wrecks[i]);
  }

  function dispose() {
    scene.remove(root);
    for (const v of vehicles) {
      releaseRider(v.mesh);
      const rider = v.mesh.userData.rider;
      if (rider?.userData?.mixer && !rider.userData.rocketbox) rider.userData.mixer.stopAllAction();
    }
    vehicles.length = 0;
    if (shared.bikes === vehicles) shared.bikes = null;
  }

  function setNight(glow) {
    const g = Math.max(0, Math.min(1, Number(glow) || 0));
    nightMats(THREE);
    _lampMat.emissiveIntensity = 0.25 + 1.8 * g;
    _tailMat.emissiveIntensity = 0.2 + 1.4 * g;
  }

  /** Player melee against a nearby rider — tip them like a hard brush. Same signature as pedestrians.strike. */
  function strike(x, z, dx, dz, range, damage, single = false) {
    const fl = Math.hypot(dx, dz) || 1;
    const fx = dx / fl;
    const fz = dz / fl;
    const hit = [];
    for (const v of vehicles) {
      if (v.crash) continue;
      const ox = v.pos.x - x;
      const oz = v.pos.z - z;
      const along = ox * fx + oz * fz;
      if (along < 0.2 || along > range) continue;
      const lat = Math.abs(ox * fz - oz * fx);
      if (lat > 0.7) continue;
      startCrash(v, {
        x,
        z,
        tx: fx,
        tz: fz,
        hl: 0.4,
        hw: 0.4,
        hard: true,
        speed: Math.max(2.5, Number(damage) || 2.5),
      });
      hit.push(v);
      if (single) break;
    }
    return hit;
  }

  return {
    update,
    dispose,
    vehicles,
    count: vehicles.length,
    mixamo: rideTemplates.length > 0 || scooterTemplates.length > 0,
    setNight,
    setCamera,
    streamVariety,
    setClock(h, d) {
      if (Number.isFinite(h)) gameHour = h;
      if (Number.isFinite(d)) gameDay = d;
    },
    strike,
  };
}
