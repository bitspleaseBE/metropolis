/**
 * Reloads as choreography rather than mocap: the Mixamo reload clips don't bring the
 * support hand anywhere near our guns, so the left hand follows key poses set in the
 * weapon's own frame (metres, +x is the gun's left, +z the muzzle), the firing hand
 * cants the gun, and the magazine is a real part that drops and is replaced.
 *
 * Pose fields: p palm centre, f finger direction, i index-to-pinky direction (the
 * index leads), grip finger table, frame "gun" | "belt" | "support". `slide` moves
 * the pistol slide back along -z.
 */

const BELT = { frame: "belt", p: [0, 0, 0], f: [0, -1, 0.15], i: [0, 0, 1], grip: "mag" };
const SUPPORT = { frame: "support" };

export const RELOADS = {
  rifle: {
    cant: { roll: 0.42, pitch: -0.3 },
    mag: { box: [[-0.012, -0.135, 0.1], [0.012, 0.052, 0.205]], axis: [0, -1, 0.18] },
    poses: {
      support: SUPPORT,
      mag: { p: [0.045, -0.06, 0.15], f: [-0.25, 0, 1], i: [0, 1, 0], grip: "mag" },
      magOut: { p: [0.05, -0.2, 0.18], f: [-0.25, -0.1, 1], i: [0, 1, 0], grip: "mag" },
      magTap: { p: [0.04, -0.045, 0.15], f: [-0.25, 0, 1], i: [0, 1, 0], grip: "mag" },
      belt: BELT,
      charge: { p: [0.035, 0.17, -0.01], f: [-0.6, -1, 0], i: [0, 0, 1], grip: "claw" },
      chargePulled: { p: [0.035, 0.17, -0.08], f: [-0.6, -1, 0], i: [0, 0, 1], grip: "claw" },
    },
    keys: [
      [0, "support"],
      [0.1, "mag"],
      [0.15, "mag"],
      [0.25, "magOut"],
      [0.42, "belt"],
      [0.48, "belt"],
      [0.64, "magOut"],
      [0.73, "mag"],
      [0.76, "magTap"],
      [0.8, "mag"],
      [0.86, "charge"],
      [0.91, "chargePulled"],
      [1, "support"],
    ],
    events: [
      [0.15, "grabOld"],
      [0.28, "dropOld"],
      [0.44, "takeNew"],
      [0.73, "seatNew"],
    ],
  },
  smg: {
    cant: { roll: 0.38, pitch: -0.28 },
    mag: { box: [[-0.012, -0.115, 0.098], [0.012, 0.034, 0.148]], axis: [0, -1, 0.05] },
    poses: {
      support: SUPPORT,
      mag: { p: [0.04, -0.06, 0.12], f: [-0.25, 0, 1], i: [0, 1, 0], grip: "mag" },
      magOut: { p: [0.045, -0.19, 0.13], f: [-0.25, -0.1, 1], i: [0, 1, 0], grip: "mag" },
      magTap: { p: [0.035, -0.045, 0.12], f: [-0.25, 0, 1], i: [0, 1, 0], grip: "mag" },
      belt: BELT,
    },
    keys: [
      [0, "support"],
      [0.12, "mag"],
      [0.17, "mag"],
      [0.28, "magOut"],
      [0.46, "belt"],
      [0.52, "belt"],
      [0.7, "magOut"],
      [0.8, "mag"],
      [0.84, "magTap"],
      [0.88, "mag"],
      [1, "support"],
    ],
    events: [
      [0.17, "grabOld"],
      [0.31, "dropOld"],
      [0.48, "takeNew"],
      [0.8, "seatNew"],
    ],
  },
  pistol: {
    cant: { roll: 0.35, pitch: 0.28 },
    // The magazine hides inside the grip; this is its outline.
    mag: { make: [0.021, 0.078, 0.03], at: [0, -0.034, -0.004], axis: [0, -1, -0.08] },
    slide: { box: [[-0.016, 0.035, -0.035], [0.016, 0.075, 0.16]] },
    poses: {
      support: SUPPORT,
      cup: { p: [0.046, -0.022, -0.01], f: [0, -0.3, 1], i: [0, 1, 0], grip: "cup" },
      magOut: { p: [0.03, -0.17, -0.01], f: [-0.2, 0.2, 1], i: [0, 1, 0], grip: "mag" },
      mag: { p: [0.03, -0.09, -0.01], f: [-0.2, 0.2, 1], i: [0, 1, 0], grip: "mag" },
      magTap: { p: [0.02, -0.08, -0.008], f: [-0.2, 0.2, 1], i: [0, 1, 0], grip: "mag" },
      belt: BELT,
      slide: { p: [0.02, 0.1, 0.02], f: [-1, -0.7, 0], i: [0, 0, 1], grip: "claw" },
      slidePulled: { p: [0.02, 0.1, -0.025], f: [-1, -0.7, 0], i: [0, 0, 1], grip: "claw", slide: 0.03 },
    },
    keys: [
      [0, "support"],
      [0.08, "cup"],
      [0.32, "belt"],
      [0.38, "belt"],
      [0.56, "magOut"],
      [0.65, "mag"],
      [0.69, "magTap"],
      [0.72, "mag"],
      [0.8, "slide"],
      [0.87, "slidePulled"],
      [0.9, "slide"],
      [1, "support"],
    ],
    events: [
      [0.1, "dropOld"],
      [0.34, "takeNew"],
      [0.66, "seatNew"],
    ],
  },
  shotgun: {
    cant: { roll: 0.75, pitch: -0.2 },
    shell: [0.0095, 0.068],
    poses: {
      support: SUPPORT,
      belt: { ...BELT, grip: "pinch" },
      port: { p: [0.03, -0.07, 0.09], f: [-0.3, 0.5, 1], i: [0, 1, 0], grip: "pinch" },
      pushed: { p: [0.025, -0.05, 0.1], f: [-0.3, 0.5, 1], i: [0, 1, 0], grip: "pinch" },
      pump: { frame: "support", pump: -0.07 },
    },
    keys: [
      [0, "support"],
      [0.1, "belt"],
      [0.2, "port"],
      [0.24, "pushed"],
      [0.34, "belt"],
      [0.44, "port"],
      [0.48, "pushed"],
      [0.58, "belt"],
      [0.68, "port"],
      [0.72, "pushed"],
      [0.82, "support"],
      [0.88, "pump"],
      [0.94, "support"],
      [1, "support"],
    ],
    events: [
      [0.12, "takeShell"],
      [0.24, "shellIn"],
      [0.36, "takeShell"],
      [0.48, "shellIn"],
      [0.6, "takeShell"],
      [0.72, "shellIn"],
    ],
  },
};

const smooth = (x) => x * x * (3 - 2 * x);

/** The two poses around `u` and the eased blend between them. */
export function poseAt(def, u) {
  const k = def.keys;
  let i = 0;
  while (i < k.length - 2 && u >= k[i + 1][0]) i++;
  const [u0, a] = k[i];
  const [u1, b] = k[i + 1];
  const s = u1 > u0 ? smooth(Math.min(1, Math.max(0, (u - u0) / (u1 - u0)))) : 1;
  return { a: def.poses[a], b: def.poses[b], s };
}

/**
 * Move the triangles of every connected piece that lies wholly inside `box`
 * (model metres) into a new mesh. The model's geometry is cloned first, so the
 * shared cached GLB is untouched. Returns a Group at the model origin, or null.
 */
export function splitPart(THREE, root, box) {
  const [lo, hi] = box.map((v) => new THREE.Vector3(...v));
  const part = new THREE.Group();
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const v = new THREE.Vector3();
  const meshes = [];
  root.traverse((o) => o.isMesh && meshes.push(o));
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const P = g.attributes.position;
    const I = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i);
    toRoot.multiplyMatrices(inv, mesh.matrixWorld);
    // Weld split vertices so each physical piece is one component.
    const weld = new Map();
    const ids = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const key = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
      if (!weld.has(key)) weld.set(key, weld.size);
      ids[i] = weld.get(key);
    }
    const par = Array.from({ length: weld.size }, (_, i) => i);
    const find = (x) => {
      while (par[x] !== x) x = par[x] = par[par[x]];
      return x;
    };
    for (let t = 0; t < I.length; t += 3) {
      for (const u of [1, 2]) {
        const a = find(ids[I[t]]);
        const b = find(ids[I[t + u]]);
        if (a !== b) par[a] = b;
      }
    }
    const inside = new Map();
    for (let i = 0; i < P.count; i++) {
      const r = find(ids[i]);
      v.fromBufferAttribute(P, i).applyMatrix4(toRoot);
      const ok = v.x >= lo.x && v.x <= hi.x && v.y >= lo.y && v.y <= hi.y && v.z >= lo.z && v.z <= hi.z;
      inside.set(r, (inside.get(r) ?? true) && ok);
    }
    const keep = [];
    const take = [];
    for (let t = 0; t < I.length; t += 3) (inside.get(find(ids[I[t]])) ? take : keep).push(I[t], I[t + 1], I[t + 2]);
    if (!take.length) continue;
    const rest = g.clone();
    rest.setIndex(keep);
    mesh.geometry = rest;
    const pg = g.clone();
    pg.setIndex(take);
    const pm = new THREE.Mesh(pg, mesh.material);
    pm.castShadow = true;
    pm.frustumCulled = false;
    pm.matrixAutoUpdate = false;
    pm.matrix.copy(toRoot);
    part.add(pm);
  }
  if (!part.children.length) return null;
  // Pivot on the part's own centre, so a dropped magazine tumbles about itself.
  const bb = new THREE.Box3();
  for (const pm of part.children) bb.union(new THREE.Box3().setFromBufferAttribute(pm.geometry.attributes.position).applyMatrix4(pm.matrix));
  const c = bb.getCenter(new THREE.Vector3());
  const back = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  for (const pm of part.children) pm.matrix.premultiply(back);
  part.position.copy(c);
  part.userData.seat = c.clone();
  root.add(part);
  return part;
}

/** A plain magazine block for guns whose magazine lives inside the grip. */
export function makeMag(THREE, [w, h, d], at, material) {
  const group = new THREE.Group();
  group.position.fromArray(at);
  group.userData.seat = group.position.clone();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 1.25, h * 0.08, d * 1.15), material);
  base.position.y = -h * 0.5;
  for (const m of [body, base]) {
    m.castShadow = true;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

/** A 12-gauge shell: red hull, brass head. Its long axis is local +y. */
export function makeShell(THREE, [r, len]) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len * 0.78, 10),
    new THREE.MeshStandardMaterial({ color: 0xa3201b, roughness: 0.6 }),
  );
  hull.position.y = len * 0.11;
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.06, r * 1.06, len * 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.35 }),
  );
  head.position.y = -len * 0.39;
  group.add(hull, head);
  return group;
}

const GRAVITY = 9.81;
const LIFETIME = 8;
const MAX_DROPPED = 6;

/** Spent magazines on the ground: a little gravity, one bounce, then rest. */
export function createDrops(THREE) {
  const list = [];
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _y = new THREE.Vector3(0, 1, 0);
  const _a = new THREE.Vector3();
  return {
    add(obj, velocity, groundY) {
      obj.userData.drop = {
        v: velocity.clone(),
        spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9),
        ground: groundY,
        age: 0,
        rest: false,
      };
      list.push(obj);
      while (list.length > MAX_DROPPED) list.shift().removeFromParent();
    },
    update(dt) {
      for (let n = list.length - 1; n >= 0; n--) {
        const obj = list[n];
        const d = obj.userData.drop;
        d.age += dt;
        if (d.age > LIFETIME) {
          obj.removeFromParent();
          list.splice(n, 1);
          continue;
        }
        if (d.rest) continue;
        d.v.y -= GRAVITY * dt;
        obj.position.addScaledVector(d.v, dt);
        obj.quaternion.premultiply(_q.setFromEuler(_e.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)));
        if (obj.position.y < d.ground + 0.012) {
          obj.position.y = d.ground + 0.012;
          if (Math.abs(d.v.y) < 1.2) {
            d.rest = true;
            // Lie flat: long axis level, pointing wherever it was tumbling.
            _a.copy(_y).applyQuaternion(obj.quaternion).setY(0);
            if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
            obj.quaternion.setFromUnitVectors(_y, _a.normalize());
          } else {
            d.v.y *= -0.25;
            d.v.x *= 0.4;
            d.v.z *= 0.4;
            d.spin.multiplyScalar(0.4);
          }
        }
      }
    },
  };
}
