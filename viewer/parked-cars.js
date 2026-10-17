/**
 * Kerbside cars as real fleet vehicles that stand still.
 *
 * The district GLB bakes a posed mesh per bay (`car_<n>_<model>`, nose along local +X).
 * That mesh is scenery: it cannot be entered. This module hides it and stands a runtime
 * fleet car (nose +Z, same models as traffic) in its place. `velocity` stays 0 and
 * `parked` stays true until a later step lets the player drive it away.
 *
 * E at the driver's door sits you in the seat. E again puts you back on the pavement.
 */

export const DOOR_REACH = 2.3;

/** Unit forward (fx, fz) and left (lx, lz) for a runtime car whose nose is +Z at `yaw`. */
export function carAxes(yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { fx, fz, lx: fz, lz: -fx };
}

/**
 * Baked kerb cars are built with the nose on local +X. A runtime fleet car faces +Z,
 * so this is the yaw that points that nose the same way.
 */
export function yawFromBakedNose(nx, nz) {
  return Math.atan2(nx, nz);
}

/** World XZ of a point `side` metres to the driver's left and `along` metres toward the nose. */
export function carPoint(car, side, along) {
  const a = carAxes(car.yaw);
  return {
    x: car.x + side * a.lx + along * a.fx,
    y: car.y || 0,
    z: car.z + side * a.lz + along * a.fz,
  };
}

/**
 * Height to stand a runtime fleet car on. Those meshes have their wheels on local
 * y=0. A baked kerb node does not: glTF keeps the pivot at the mesh centre and the
 * size in the node scale, so the node origin is about half a car up in the air.
 * The tyres touch `bottomY` (world min of the baked mesh).
 */
export function parkedStandY(bottomY, originY) {
  if (Number.isFinite(bottomY)) return bottomY;
  return Number.isFinite(originY) ? originY : 0;
}

/** World height of the lowest body vertex. Plates and the contact blob are not the tyres. */
function bakedBottomY(THREE, obj) {
  if (!THREE?.Box3 || !obj) return null;
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  let hit = false;
  obj.traverse((node) => {
    if (!node.isMesh) return;
    const n = node.name || "";
    if (n === "contact_shadow" || n.startsWith("plate_")) return;
    part.setFromObject(node);
    if (part.isEmpty()) return;
    if (!hit) box.copy(part);
    else box.union(part);
    hit = true;
  });
  return hit ? box.min.y : null;
}

/** Pavement just outside the driver's door. */
export function doorOf(car) {
  return carPoint(car, (car.hw || 0.9) + 0.55, 0.25);
}

/** Eye height in the driver's seat. */
export function seatOf(car) {
  const p = carPoint(car, 0.36, 0.12);
  p.y = (car.y || 0) + 1.05;
  return p;
}

/** A step clear of the door, so getting out does not leave you inside the body. */
export function exitOf(car) {
  return carPoint(car, (car.hw || 0.9) + 0.9, 0.25);
}

export function nearestParkedDoor(cars, x, z, reach = DOOR_REACH) {
  let best = null;
  let bestD = reach;
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (!car || car.occupied) continue;
    const d = doorOf(car);
    const dist = Math.hypot(d.x - x, d.z - z);
    if (dist <= bestD) {
      bestD = dist;
      best = car;
    }
  }
  return best;
}

export function parkedPrompt(inside, near) {
  if (inside) return "Press E to get out";
  if (near) return "Press E to enter";
  return null;
}

/**
 * Enter the nearest parked car, or get out of the one you are in.
 * Cars are plain records `{ x, y, z, yaw, hw, occupied }`. Getting in does not
 * move the car.
 */
export function parkedInteract(cars, player, inside) {
  if (inside) {
    inside.occupied = false;
    const drop = exitOf(inside);
    return { action: "exit", car: inside, x: drop.x, y: drop.y, z: drop.z, yaw: inside.yaw };
  }
  const car = nearestParkedDoor(cars, player.x, player.z);
  if (!car) return { action: "none" };
  car.occupied = true;
  const seat = seatOf(car);
  return { action: "enter", car, x: seat.x, y: seat.y, z: seat.z, yaw: car.yaw };
}

function hashUnit(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * World poses of baked kerb cars, then hide those nodes so the runtime fleet
 * is the only copy. `y` is the tyre contact, not the node pivot. Skips cars
 * already hidden (Velo rails, bike racks).
 * @returns {{ name: string, model: string, x: number, y: number, z: number, yaw: number }[]}
 */
export function readBakedParkedPoses(THREE, root) {
  if (!root) return [];
  root.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const nose = new THREE.Vector3();
  const poses = [];
  root.traverse((obj) => {
    const name = obj.name || "";
    if (!/^car_\d+_/.test(name) || /_body$/.test(name)) return;
    if (obj.parent && /^car_\d+_/.test(obj.parent.name || "")) return;
    let node = obj;
    while (node) {
      if (node.visible === false) return;
      node = node.parent;
    }
    obj.updateWorldMatrix(true, false);
    obj.getWorldPosition(pos);
    obj.getWorldQuaternion(quat);
    nose.set(1, 0, 0).applyQuaternion(quat);
    const flat = Math.hypot(nose.x, nose.z) || 1;
    poses.push({
      name,
      model: name.replace(/^car_\d+_/, ""),
      x: pos.x,
      y: parkedStandY(bakedBottomY(THREE, obj), pos.y),
      z: pos.z,
      yaw: yawFromBakedNose(nose.x / flat, nose.z / flat),
    });
    obj.visible = false;
  });
  return poses;
}

/**
 * @param {import('three').Scene} scene
 * @param {typeof import('three')} THREE
 */
export async function createParkedCars(scene, THREE) {
  const { cloneCarMesh, loadCarTemplates, makeLampParts, pickCarPaint } = await import("./cars.js");
  const templates = (await loadCarTemplates(THREE)) || [];
  const byId = new Map(templates.map((t) => [t.id, t]));
  const parts = makeLampParts(THREE, [0xc45c48, 0x3d5a80, 0xd4a373, 0x4a5568, 0xb8b0a4, 0x2f6f5e]);
  const root = new THREE.Group();
  root.name = "ParkedCars";
  scene.add(root);

  /** @type {object[]} */
  const cars = [];
  const solids = [];
  let inside = null;

  function meshFor(pose) {
    const template = byId.get(pose.model) || null;
    if (template) {
      return cloneCarMesh(THREE, parts, template, { paint: pickCarPaint(hashUnit(pose.name)) });
    }
    const group = new THREE.Group();
    const shade = parts.bodyMats[Math.floor(hashUnit(pose.name) * parts.bodyMats.length)] || parts.bodyMats[0];
    const body = new THREE.Mesh(parts.bodyGeo, shade);
    body.position.y = 0.7;
    group.add(body);
    group.userData.halfL = 2.1;
    group.userData.halfW = 0.9;
    group.userData.carId = pose.model || "box";
    return group;
  }

  function place(car) {
    car.mesh.position.set(car.x, car.y, car.z);
    car.mesh.rotation.y = car.yaw;
    const a = carAxes(car.yaw);
    car.tan.x = a.fx;
    car.tan.z = a.fz;
    car.solid.pos.x = car.x;
    car.solid.pos.z = car.z;
    car.solid.tan.x = a.fx;
    car.solid.tan.z = a.fz;
  }

  function addPose(pose, src) {
    const mesh = meshFor(pose);
    const hl = mesh.userData.halfL || 2.1;
    const hw = mesh.userData.halfW || 0.9;
    const car = {
      name: pose.name,
      model: mesh.userData.carId || pose.model,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      hl,
      hw,
      velocity: 0,
      parked: true,
      occupied: false,
      src: src || null,
      mesh,
      tan: { x: 0, z: 1 },
      solid: { pos: { x: pose.x, z: pose.z }, tan: { x: 0, z: 1 }, hl, hw, velocity: 0 },
    };
    place(car);
    root.add(mesh);
    cars.push(car);
    return car;
  }

  function addPoses(poses, src) {
    const out = [];
    for (let i = 0; i < poses.length; i++) out.push(addPose(poses[i], src));
    if (out.length) console.info(`[metropolis] parked cars: ${cars.length} standing`);
    return out;
  }

  function addRoot(bakedRoot) {
    return addPoses(readBakedParkedPoses(THREE, bakedRoot), bakedRoot);
  }

  function removeRoot(bakedRoot) {
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      if (car.src !== bakedRoot) continue;
      if (inside === car) {
        car.occupied = false;
        inside = null;
      }
      root.remove(car.mesh);
      cars.splice(i, 1);
    }
  }

  function solidList(opts) {
    solids.length = 0;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (opts?.skipOccupied && car.occupied) continue;
      solids.push(car.solid);
    }
    return solids;
  }

  function seat() {
    return inside ? seatOf(inside) : null;
  }

  return {
    get cars() {
      return cars;
    },
    addPoses,
    addRoot,
    removeRoot,
    solids: solidList,
    isInside() {
      return !!inside;
    },
    /** Drop the player out of the seat without moving them (respawn, bust). */
    vacate() {
      if (!inside) return;
      inside.occupied = false;
      inside = null;
    },
    seat,
    prompt(player) {
      return parkedPrompt(inside, player ? nearestParkedDoor(cars, player.x, player.z) : null);
    },
    tryInteract(player) {
      const result = parkedInteract(cars, player, inside);
      if (result.action === "enter") inside = result.car;
      else if (result.action === "exit") inside = null;
      return result;
    },
    setNight(t) {
      const u = Math.max(0, Math.min(1, Number(t) || 0));
      const head = parts.headMat.color;
      const tail = parts.tailMat.color;
      head.setRGB(0.81 + (1 - 0.81) * u, 0.82 + (0.94 - 0.82) * u, 0.8 + (0.72 - 0.8) * u);
      tail.setRGB(0.12 + (1 - 0.12) * u, 0.02 + (0.1 - 0.02) * u, 0.02 + (0.08 - 0.02) * u);
    },
  };
}
