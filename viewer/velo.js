/**
 * Velo Antwerpen: take/return city bikes at GBFS stations (E).
 *
 * Dock rails + static bikes are baked into the district GLB. This module only
 * spawns the bike you ride, so stations are not doubled with runtime meshes.
 */

const VELO_URL =
  (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("velo.json")) ||
  "./velo.json";
const BOARD_DIST = 4.0; // m to the rail (not only the centre point)
const CAPTION_DIST = 6.0; // slightly wider for GTA-style area captions
const BIKE_SPEED = 8.6; // ~31 km/h cruise (MOVE.velo.speed); the viewer owns acceleration
// Built by scripts/build_velo_glb.py at real size. Rebuild it there, not here.
const MODEL_URL = new URL("./vehicles/velo.glb", import.meta.url).href;

/**
 * Ride points in the bike's own frame: metres, front −Z, origin on the ground
 * under the bottom bracket. velo.glb overwrites these from its seat_* nodes, so
 * the rider IK (players.js, movement.html) always follows the model.
 */
export const VELO_RIDE = {
  saddle: { x: 0, y: 0.962, z: 0.29 },
  crank: { x: 0, y: 0.28, z: 0 },
  crankR: 0.17,
  pedalX: 0.125,
  bar: { x: 0, y: 1.02, z: -0.32 },
  grip: 0.272,
  wheelR: 0.335,
};

let _model = null;
let _loading = null;

function readRide(scene) {
  const root = scene.getObjectByName("velo") || scene;
  const at = (name) => root.getObjectByName(name)?.position;
  const copy = (key, p) => {
    if (p) VELO_RIDE[key] = { x: p.x, y: p.y, z: p.z };
  };
  copy("saddle", at("seat_saddle"));
  copy("crank", at("seat_crank"));
  const gl = at("grip_L");
  const gr = at("grip_R");
  if (gl && gr) {
    VELO_RIDE.bar = { x: (gl.x + gr.x) / 2, y: (gl.y + gr.y) / 2, z: (gl.z + gr.z) / 2 };
    VELO_RIDE.grip = Math.abs(gr.x - gl.x) / 2;
  }
  for (const key of ["crankR", "pedalX", "wheelR"]) {
    const v = Number(root.userData?.[key]);
    if (Number.isFinite(v) && v > 0) VELO_RIDE[key] = v;
  }
}

/** Load velo.glb once. Resolves to null when it can't load (headless sims). */
export function preloadVeloModel() {
  if (!_loading) {
    _loading = (async () => {
      try {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
        _model = gltf.scene;
        readRide(_model);
      } catch (e) {
        console.warn("[metropolis] velo: could not load", MODEL_URL, e);
      }
      return _model;
    })();
  }
  return _loading;
}

/** Shared so every ride / street-parked Velo brightens together at night. */
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

/**
 * Ride Velo from velo.glb. Front wheel toward local −Z, origin on the ground
 * under the bottom bracket, real size. Call preloadVeloModel() first.
 * Geometry and materials are shared between bikes, so never dispose them.
 */
export function makeVeloBike(THREE) {
  const g = _model ? _model.clone(true) : new THREE.Group();
  if (!_model) console.warn("[metropolis] velo: model not loaded yet");
  const { lamp, tail } = nightMats(THREE);
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material?.name === "velo_lamp") o.material = lamp;
    else if (o.material?.name === "velo_tail") o.material = tail;
  });
  const crank = g.getObjectByName("velo_crank") || null;
  g.userData.shared = true;
  g.userData.wheels = ["velo_wheel_front", "velo_wheel_rear"].map((n) => g.getObjectByName(n)).filter(Boolean);
  g.userData.crank = crank;
  // The left crank points up at rest: phase 0 swings it forward, and a growing phase pushes it down.
  g.userData.setPedal = (phase) => {
    if (crank) crank.rotation.x = -Math.PI / 2 - phase;
  };
  const v = (p) => new THREE.Vector3(p.x, p.y, p.z);
  g.userData.seat = {
    saddle: v(VELO_RIDE.saddle),
    crank: v(VELO_RIDE.crank),
    crankR: VELO_RIDE.crankR,
    pedalX: VELO_RIDE.pedalX,
    bar: v(VELO_RIDE.bar),
    grip: VELO_RIDE.grip,
  };
  return g;
}

/** The ridden Velo sits this far ahead of the player root. players.js seats the rider on it. */
export const VELO_FWD = 0.15;

/**
 * Put the ridden Velo under the player: position, yaw, crank, and wheels.
 * The game and viewer/movement.html both call this, so the gallery shows the game's bike.
 * `player` is { x, z, yaw, pedal (0–1), moving, speed }.
 */
export function placeRideVelo(mesh, dt, player) {
  const yaw = player.yaw ?? 0;
  mesh.position.set(player.x - Math.sin(yaw) * VELO_FWD, 0, player.z - Math.cos(yaw) * VELO_FWD);
  mesh.rotation.set(0, yaw, 0);
  if (mesh.userData.setPedal && Number.isFinite(player.pedal)) {
    mesh.userData.setPedal(player.pedal * Math.PI * 2);
  }
  if (player.moving && mesh.userData.wheels) {
    const spin = (player.speed || 0) / VELO_RIDE.wheelR;
    for (const w of mesh.userData.wheels) w.rotation.x -= dt * spin;
  }
}

/** Closest point on the station rail segment (Blender local X after yaw → Three XZ). */
function distToRail(st, px, pz) {
  const half = (st.railLength || 8) * 0.5;
  const cos = Math.cos(st.yaw);
  const sin = Math.sin(st.yaw);
  // Rail endpoints in Three.js
  const ax = st.x + cos * -half;
  const az = st.z - sin * -half;
  const bx = st.x + cos * half;
  const bz = st.z - sin * half;
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1e-6;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

export async function createVelo(scene, THREE) {
  let doc = { stations: [] };
  const model = preloadVeloModel();
  try {
    const res = await fetch(VELO_URL);
    if (res.ok) doc = await res.json();
  } catch (e) {
    console.warn("[metropolis] velo: could not load", VELO_URL, e);
  }
  await model;

  const stations = (doc.stations || []).map((raw) => ({
    id: String(raw.id),
    name: raw.name || raw.id,
    x: Number(raw.x),
    z: Number(raw.z),
    yaw: Number(raw.yaw) || 0,
    capacity: Math.max(1, Number(raw.capacity) || 20),
    bikesAvailable: Math.max(0, Number(raw.bikesAvailable) || 0),
    railLength: Number(raw.railLength) || 8,
    slotSpacing: Number(raw.slotSpacing) || 0.95,
  }));

  // Street-parked bikes after a mid-ride hop-off (remount with E).
  const parked = [];
  let ride = null;
  let toast = "";
  let toastT = 0;

  function nearestStation(px, pz, reach = BOARD_DIST) {
    let best = null;
    for (const st of stations) {
      const d = distToRail(st, px, pz);
      if (d <= reach && (best == null || d < best.d)) best = { st, d };
    }
    return best;
  }

  let captionId = null;
  /** Nearest dock for area captions; `{ station, changed }`. */
  function locateStation(px, pz) {
    const hit = nearestStation(px, pz, CAPTION_DIST);
    const st = hit?.st ?? null;
    const id = st ? st.id : null;
    const changed = id !== captionId;
    captionId = id;
    return { station: st, changed };
  }

  function nearestParked(px, pz, reach = 2.8) {
    let best = null;
    for (let i = 0; i < parked.length; i++) {
      const b = parked[i];
      const d = Math.hypot(b.mesh.position.x - px, b.mesh.position.z - pz);
      if (d <= reach && (best == null || d < best.d)) best = { bike: b, index: i, d };
    }
    return best;
  }

  function freeSlots(st) {
    return st.capacity - st.bikesAvailable;
  }

  function disposeMesh(mesh) {
    if (!mesh || mesh.userData.shared) return;
    mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }

  function takeFromStation(st) {
    if (st.bikesAvailable <= 0) return false;
    st.bikesAvailable -= 1;
    const mesh = makeVeloBike(THREE);
    scene.add(mesh);
    ride = { stationId: st.id, mesh, name: st.name };
    return true;
  }

  function mountParked(entry, index) {
    parked.splice(index, 1);
    ride = { stationId: entry.stationId, mesh: entry.mesh, name: entry.name || "Velo" };
    return true;
  }

  function returnToStation(st) {
    if (!ride || freeSlots(st) <= 0) return false;
    st.bikesAvailable += 1;
    scene.remove(ride.mesh);
    disposeMesh(ride.mesh);
    ride = null;
    return true;
  }

  /** Hop off anywhere: leave the bike on the pavement (remountable). */
  function dismount(player) {
    if (!ride) return false;
    const yaw = player.yaw != null ? player.yaw : 0;
    // Step the bike a little to the rider's right so you don't stand inside it.
    const side = 0.85;
    ride.mesh.position.set(
      player.x + Math.cos(yaw) * side,
      0,
      player.z - Math.sin(yaw) * side
    );
    ride.mesh.rotation.y = yaw;
    parked.push({
      mesh: ride.mesh,
      stationId: ride.stationId,
      name: ride.name,
    });
    ride = null;
    return true;
  }

  function isRiding() {
    return !!ride;
  }

  function bikeSpeed() {
    return BIKE_SPEED;
  }

  function tryInteract(player) {
    const near = nearestStation(player.x, player.z);
    if (ride) {
      // Prefer docking when at a station with a free slot.
      if (near && freeSlots(near.st) > 0 && returnToStation(near.st)) {
        return {
          action: "return",
          name: near.st.name,
          bikes: near.st.bikesAvailable,
          capacity: near.st.capacity,
        };
      }
      // Otherwise always allow a sidewalk hop-off.
      if (dismount(player)) {
        return { action: "dismount" };
      }
      return { action: "none" };
    }

    // Remount a street-parked bike first if close.
    const pk = nearestParked(player.x, player.z);
    if (pk && mountParked(pk.bike, pk.index)) {
      return { action: "take", name: pk.bike.name || "Velo", bikes: "—", capacity: "—" };
    }

    if (!near) return { action: "none" };
    if (near.st.bikesAvailable <= 0) {
      toast = "No bikes left here";
      toastT = 2.2;
      return { action: "empty" };
    }
    if (takeFromStation(near.st)) {
      return {
        action: "take",
        name: near.st.name,
        bikes: near.st.bikesAvailable,
        capacity: near.st.capacity,
      };
    }
    return { action: "none" };
  }

  function getRideHud() {
    if (ride) {
      return { riding: true, name: ride.name, toast: toastT > 0 ? toast : "" };
    }
    return { riding: false, toast: toastT > 0 ? toast : "" };
  }

  function getPrompt(player) {
    if (ride) {
      const near = nearestStation(player.x, player.z);
      if (near && freeSlots(near.st) > 0) {
        return `Press E to return Velo · ${near.st.name}`;
      }
      if (near && freeSlots(near.st) <= 0) {
        return `Station full · Press E to hop off`;
      }
      return "Press E to hop off";
    }
    const pk = nearestParked(player.x, player.z);
    if (pk) return "Press E to take parked Velo";
    const near = nearestStation(player.x, player.z);
    if (!near) return null;
    if (near.st.bikesAvailable <= 0) return `No bikes · ${near.st.name}`;
    return `Press E to take a Velo · ${near.st.name} (${near.st.bikesAvailable} left)`;
  }

  function update(dt, player) {
    if (toastT > 0) toastT -= dt;
    if (!ride || !player) return;
    placeRideVelo(ride.mesh, dt, { ...player, speed: player.speed ?? BIKE_SPEED });
  }

  function dispose() {
    if (ride?.mesh) {
      scene.remove(ride.mesh);
      disposeMesh(ride.mesh);
    }
    for (const b of parked) {
      scene.remove(b.mesh);
      disposeMesh(b.mesh);
    }
    parked.length = 0;
    ride = null;
  }

  console.info(
    `[metropolis] velo: ${stations.length} stations,` +
      ` ${stations.reduce((n, s) => n + s.bikesAvailable, 0)} bikes available`
  );

  // Rails with their docked bikes as solid boxes, same shape as the vehicle solids.
  const solids = stations.map((st) => ({
    pos: { x: st.x, z: st.z },
    tan: { x: Math.cos(st.yaw), z: -Math.sin(st.yaw) },
    hl: (st.railLength || 8) * 0.5 + 0.3,
    hw: 1.0,
  }));

  function setNight(glow) {
    if (!_lampMat || !_tailMat) return;
    _lampMat.emissiveIntensity = 0.3 + 1.6 * glow;
    _tailMat.emissiveIntensity = 0.3 + 1.2 * glow;
  }

  return {
    stations,
    solids,
    isRiding,
    bikeSpeed,
    tryInteract,
    getRideHud,
    getPrompt,
    locateStation,
    update,
    setNight,
    dispose,
    count: stations.length,
  };
}
