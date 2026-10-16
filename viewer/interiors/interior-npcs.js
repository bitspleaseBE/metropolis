/**
 * People inside a shop: the cashier behind the till, other staff at their posts, and customers
 * who walk between the layout's spots (interior-gen.js) and stand browsing at each one.
 * A restaurant (frituur, snack bar, dining room) seats them instead: they stay on the
 * chair, a plate sits on the table, and they either eat or talk.
 *
 * Staff wear the brand: Staff_Male_01 / Staff_Female_01 have a separate `<id>_uniform`
 * material (scripts/build_rocketbox_characters.py) tinted to the shop's fascia, and every staff
 * member gets a chest badge with the shop wordmark. Care staff are the medical models and a
 * restaurant kitchen gets the chef. Customers are clones of people the street pool already has
 * loaded, so a shop never pulls in new 10 MB characters.
 *
 * The crew lives under the interior root. When the interior is cached (the player left but it
 * is still one of the last three), its mixers simply stop being stepped: positions, poses and
 * walk plans stay as they were and resume on the next visit.
 */
import { ADULT_M } from "../person-scale.js";
import { mulberry32 } from "./rng.js";
import { findPath } from "./interior-gen.js";
import { wordmarkTexture } from "./furniture.js";
import { dinerMode, foodOnTable, hipDrop } from "./table-seat.js";
import { isUniform, staffToSpawn } from "./crew-plan.js";

const STAFF = ["Staff_Female_01", "Staff_Male_01"];
const MEDICAL = ["Medical_Female_01", "Medical_Male_02"];
const CHEF = "Chef_Female_01";
const MAX_CUSTOMERS = 10;
const TURN_RATE = 5; // rad/s
const PERSONAL_SPACE = 0.55;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _pose = {};

function bone(root, name) {
  return root.getObjectByName(name) || root.getObjectByName(name.replaceAll(" ", "_"));
}

/**
 * Fold the legs into a chair sit and play an eat or talk gesture on the idle.
 * Crowd bones run along local +X, so a local +Z turn swings the limb. Called
 * after the mixer step so the idle does not stand them back up.
 */
export function poseDiner(THREE, root, mode, t) {
  if (!_pose.e) {
    _pose.e = new THREE.Euler(0, 0, 0, "XYZ");
    _pose.q = new THREE.Quaternion();
  }
  const { e, q } = _pose;
  const bend = (name, angle) => {
    const b = bone(root, name);
    if (!b) return;
    e.set(0, 0, angle);
    q.setFromEuler(e);
    b.quaternion.multiply(q);
  };
  // Thigh forward, shin down. Measured on Male_Adult_01: knee to +Z, foot under it.
  bend("Bip01 L Thigh", 1.25);
  bend("Bip01 R Thigh", 1.25);
  bend("Bip01 L Calf", -1.15);
  bend("Bip01 R Calf", -1.15);
  bend("Bip01 Spine", 0.18);
  if (mode === "eat") {
    const bite = 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4));
    bend("Bip01 R UpperArm", -0.9);
    bend("Bip01 R Forearm", -0.7 - bite);
  } else {
    // Local +X on the head is world up: a turn toward the table, plus a small hand.
    const yaw = Math.sin(t * 1.4) * 0.35;
    const b = bone(root, "Bip01 Head");
    if (b) {
      e.set(yaw, 0, 0);
      q.setFromEuler(e);
      b.quaternion.multiply(q);
    }
    bend("Bip01 L Forearm", -0.45 - 0.2 * Math.sin(t * 1.8));
  }
}

/** Drop a standing Rocketbox so the pelvis lands on a chair. */
export function seatRootY(THREE, root) {
  const pelvis = bone(root, "Bip01 Pelvis");
  if (!pelvis) return hipDrop(null);
  root.updateMatrixWorld(true);
  const y = pelvis.getWorldPosition(new THREE.Vector3()).y - root.position.y;
  return hipDrop(y);
}

function findBone(root, names) {
  for (const n of names) {
    const b = root.getObjectByName(n);
    if (b) return b;
  }
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.isBone && /spine2$/i.test(o.name)) hit = o;
  });
  return hit;
}

export function createInteriorNpcs({ THREE, people }) {
  const badgeGeo = new THREE.PlaneGeometry(0.15, 0.0375);
  const plateGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.012, 10);
  const fryGeo = new THREE.BoxGeometry(0.09, 0.045, 0.07);
  const bunGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8);
  const cupGeo = new THREE.CylinderGeometry(0.028, 0.022, 0.09, 8);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 });
  const fryMat = new THREE.MeshStandardMaterial({ color: 0xe2b23a, roughness: 0.7 });
  const bunMat = new THREE.MeshStandardMaterial({ color: 0xc48a3a, roughness: 0.75 });
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xc43b2c, roughness: 0.45 });

  /** A plate of fries or a burger, plus a drink, on the table in front of a sitter. */
  function placeMeal(seat, fries) {
    const at = foodOnTable(seat.seatX, seat.seatZ, seat.face);
    const meal = new THREE.Group();
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = 0.006;
    meal.add(plate);
    if (fries) {
      const box = new THREE.Mesh(fryGeo, fryMat);
      box.position.y = 0.03;
      meal.add(box);
    } else {
      const bun = new THREE.Mesh(bunGeo, bunMat);
      bun.position.y = 0.028;
      meal.add(bun);
    }
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(0.14, 0.05, 0.02);
    meal.add(cup);
    meal.position.set(at.x, at.y, at.z);
    return meal;
  }
  const _v = new THREE.Vector3();
  const _f = new THREE.Vector3();
  const _l = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  /** Brand the uniform and pin a wordmark badge on the chest. Returns what to dispose. */
  function dress(inst, rec, badgeTex) {
    const owned = [];
    const fascia = Array.isArray(rec.fascia) && rec.fascia.length >= 3 ? rec.fascia : null;
    inst.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = [].concat(o.material);
      let changed = false;
      const next = mats.map((m) => {
        if (!fascia || !/_uniform$/.test(m.name || "")) return m;
        const c = m.clone();
        c.color.setRGB(fascia[0], fascia[1], fascia[2], THREE.SRGBColorSpace);
        owned.push(c);
        changed = true;
        return c;
      });
      if (changed) o.material = Array.isArray(o.material) ? next : next[0];
    });
    const spine = findBone(inst.root, ["Bip01_Spine2", "Bip01 Spine2", "Spine2", "mixamorigSpine2"]);
    if (spine) {
      // Place the badge in the character's own frame (standalone root = its world), then hand
      // it to the spine bone with attach() so it rides the idle without inheriting bone axes.
      inst.root.updateMatrixWorld(true);
      spine.getWorldPosition(_v);
      _f.set(0, 0, 1).applyQuaternion(inst.root.getWorldQuaternion(_q)).normalize();
      _l.set(1, 0, 0).applyQuaternion(_q).normalize();
      const s = inst.height / ADULT_M;
      const mat = new THREE.MeshStandardMaterial({ map: badgeTex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
      owned.push(mat);
      const badge = new THREE.Mesh(badgeGeo, mat);
      badge.position.copy(_v).addScaledVector(_f, 0.13 * s).addScaledVector(_l, 0.075 * s);
      badge.position.y += 0.06 * s;
      badge.quaternion.copy(_q);
      badge.scale.setScalar(s);
      spine.attach(badge);
    }
    return owned;
  }

  /**
   * Spawn the crew for one interior under `parent` (the interior root, interior frame).
   * Resolves to a crew handle once every character is posed.
   */
  async function populate(layout, rec, parent) {
    const R = mulberry32(((Number(rec.seed) || 1) ^ 0x5eed1e) >>> 0);
    const group = new THREE.Group();
    group.name = "interior_crew";
    parent.add(group);
    const badgeTex = wordmarkTexture(THREE, rec.name, rec.fascia, rec.accent, 256, 64);
    const owned = [];
    const members = [];

    const care = layout.template === "care";
    const spots = staffToSpawn(layout.staffSpots, layout.template, Number(rec.staff) || 1);
    let alt = Math.floor(R() * 2);
    const staffJobs = spots.map((s) => {
      const id = s.role === "chef" ? CHEF : care ? MEDICAL[alt++ % 2] : STAFF[alt++ % 2];
      if (!people) return Promise.resolve({ inst: null, spot: s });
      return people
        .acquireStanding(id)
        .then((inst) => ({ inst, spot: s }))
        .catch(() => ({ inst: null, spot: s }));
    });

    const used = new Set();
    const dining = layout.template === "restaurant";
    const seatSpots = dining ? layout.spots.filter((s) => s.kind === "sit" && Number.isFinite(s.seatX)) : [];
    const freeSpots = dining && seatSpots.length ? seatSpots : layout.spots.filter((s) => s.kind !== "queue" || R() < 0.5);
    const nCust = people ? Math.min(Number(rec.customers) || 0, MAX_CUSTOMERS, freeSpots.length) : 0;
    const custJobs = [];
    const seen = new Map();
    let want = R() < 0.5 ? "f" : "m";
    const civilian = (p) => !isUniform(p) && (p.age !== "child" || R() < 0.25);
    for (let i = 0; i < nCust; i++) {
      const t =
        people.pickTemplate((p) => civilian(p) && p.sex === want && (seen.get(p.id) || 0) < 2) ||
        people.pickTemplate((p) => civilian(p) && (seen.get(p.id) || 0) < 2) ||
        people.pickTemplate(civilian);
      if (!t) break;
      seen.set(t.person.id, (seen.get(t.person.id) || 0) + 1);
      want = want === "f" ? "m" : "f";
      const inst = people.instance(t);
      if (!inst) break;
      custJobs.push(people.loadIdle(t).then(() => inst, () => inst));
    }

    for (const { inst, spot } of await Promise.all(staffJobs)) {
      if (!inst) continue;
      inst.root.position.set(spot.x, 0, spot.z);
      inst.root.rotation.y = spot.face;
      owned.push(...dress(inst, rec, badgeTex));
      inst.root.userData.role = spot.role;
      group.add(inst.root);
      members.push({ inst, role: spot.role, staff: true, home: spot, yaw: spot.face });
    }
    for (const inst of await Promise.all(custJobs)) {
      let k = Math.floor(R() * freeSpots.length);
      for (let n = 0; n < freeSpots.length && used.has(k); n++) k = (k + 1) % freeSpots.length;
      if (used.has(k)) {
        people.release(inst);
        continue;
      }
      used.add(k);
      const s = freeSpots[k];
      people.setIdle(inst, true, 0);
      const seated = dining && Number.isFinite(s.seatX);
      if (seated) {
        inst.root.position.set(s.seatX, seatRootY(THREE, inst.root), s.seatZ);
        inst.root.rotation.y = s.face;
        const meal = placeMeal(s, R() < 0.5);
        group.add(meal);
        poseDiner(THREE, inst.root, dinerMode(k), R() * 4);
      } else {
        inst.root.position.set(s.x, 0, s.z);
        inst.root.rotation.y = s.face;
      }
      group.add(inst.root);
      members.push({
        inst,
        role: "customer",
        staff: false,
        spot: k,
        yaw: s.face,
        wait: 2 + R() * 8,
        path: null,
        leg: 0,
        seated,
        mode: dinerMode(k),
        t: R() * 4,
      });
    }
    const cashier = members.find((m) => m.role === "cashier") || null;

    function turnToward(m, yaw, dt) {
      const d = wrap(yaw - m.yaw);
      m.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
      m.inst.root.rotation.y = m.yaw;
    }

    function pickSpot(m) {
      for (let tries = 0; tries < 6; tries++) {
        const k = Math.floor(R() * freeSpots.length);
        if (used.has(k)) continue;
        const s = freeSpots[k];
        const p = m.inst.root.position;
        const path = findPath(layout.nav, [p.x, p.z], [s.x, s.z]);
        if (!path || path.length < 2) continue;
        used.delete(m.spot);
        used.add(k);
        m.spot = k;
        m.path = path;
        m.leg = 1;
        people.setIdle(m.inst, false);
        return;
      }
      m.wait = 2 + R() * 3;
    }

    function blocked(m, nx, nz, player) {
      if (player && (player.x - nx) ** 2 + (player.z - nz) ** 2 < PERSONAL_SPACE * PERSONAL_SPACE) return true;
      for (const o of members) {
        if (o === m) continue;
        const q = o.inst.root.position;
        if ((q.x - nx) ** 2 + (q.z - nz) ** 2 < PERSONAL_SPACE * PERSONAL_SPACE) {
          // Only yield to someone ahead, so two people never wait on each other forever.
          const p = m.inst.root.position;
          if ((q.x - p.x) * (nx - p.x) + (q.z - p.z) * (nz - p.z) > 0) return true;
        }
      }
      return false;
    }

    /** `player` is the player's feet in the interior frame, or null. */
    function update(dt, player) {
      for (const m of members) {
        const root = m.inst.root;
        if (m.seated) {
          m.t += dt;
          m.inst.mixer.update(dt);
          poseDiner(THREE, root, m.mode, m.t);
          continue;
        }
        if (m.staff) {
          // Staff keep their post; whoever is behind the till turns to a nearby player.
          let want = m.home.face;
          if (player && m.role === "cashier") {
            const dx = player.x - root.position.x;
            const dz = player.z - root.position.z;
            if (dx * dx + dz * dz < 16) want = Math.atan2(dx, dz);
          }
          turnToward(m, want, dt);
        } else if (!m.path) {
          turnToward(m, freeSpots[m.spot].face, dt);
          if ((m.wait -= dt) <= 0) pickSpot(m);
        } else {
          const [tx, tz] = m.path[m.leg];
          const dx = tx - root.position.x;
          const dz = tz - root.position.z;
          const dist = Math.hypot(dx, dz);
          const step = m.inst.naturalSpeed * dt;
          if (dist <= step) {
            root.position.x = tx;
            root.position.z = tz;
            if (++m.leg >= m.path.length) {
              m.path = null;
              const s = freeSpots[m.spot];
              m.wait = (s.kind === "sit" ? 8 : 3) + R() * 7;
              if (m.inst.walk) m.inst.walk.timeScale = 1;
              people.setIdle(m.inst, true);
            }
          } else {
            const nx = root.position.x + (dx / dist) * step;
            const nz = root.position.z + (dz / dist) * step;
            if (blocked(m, nx, nz, player)) {
              m.inst.action.timeScale = 0.15;
            } else {
              m.inst.action.timeScale = 1;
              root.position.x = nx;
              root.position.z = nz;
            }
            turnToward(m, Math.atan2(dx, dz), dt);
          }
        }
        m.inst.mixer.update(dt);
      }
    }

    return {
      group,
      members,
      cashier,
      update,
      /** Where the cashier stands (interior frame) for the talk prompt. */
      cashierAt() {
        return cashier ? cashier.inst.root.position : null;
      },
      dispose() {
        for (const m of members) {
          if (m.inst.action) m.inst.action.timeScale = 1;
          people.release(m.inst);
        }
        members.length = 0;
        for (const o of owned) o.dispose();
        badgeTex.dispose();
        group.removeFromParent();
      },
    };
  }

  return { populate };
}
