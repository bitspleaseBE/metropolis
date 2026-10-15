/**
 * People inside a shop: the cashier behind the till, other staff at their posts, and customers
 * who walk between the layout's spots (interior-gen.js) and stand browsing at each one.
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
import { mulberry32 } from "./rng.js";
import { findPath } from "./interior-gen.js";
import { wordmarkTexture } from "./furniture.js";

const STAFF = ["Staff_Female_01", "Staff_Male_01"];
const MEDICAL = ["Medical_Female_01", "Medical_Male_02"];
const CHEF = "Chef_Female_01";
const MAX_CUSTOMERS = 10;
const TURN_RATE = 5; // rad/s
const PERSONAL_SPACE = 0.55;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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
      const s = inst.height / 1.75;
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
    const spots = [...layout.staffSpots].sort((a, b) => (a.role === "cashier" ? -1 : b.role === "cashier" ? 1 : 0));
    const nStaff = Math.max(1, Math.min(Number(rec.staff) || 1, spots.length));
    let alt = Math.floor(R() * 2);
    const staffJobs = spots.slice(0, nStaff).map((s) => {
      const id = s.role === "chef" ? CHEF : care ? MEDICAL[alt++ % 2] : STAFF[alt++ % 2];
      if (!people) return Promise.resolve({ inst: null, spot: s });
      return people
        .acquireStanding(id)
        .then((inst) => ({ inst, spot: s }))
        .catch(() => ({ inst: null, spot: s }));
    });

    const used = new Set();
    const freeSpots = layout.spots.filter((s) => s.kind !== "queue" || R() < 0.5);
    const nCust = people ? Math.min(Number(rec.customers) || 0, MAX_CUSTOMERS, freeSpots.length) : 0;
    const custJobs = [];
    for (let i = 0; i < nCust; i++) {
      const t = people.pickTemplate((p) => p.age !== "child" || R() < 0.25);
      if (!t) break;
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
      inst.root.position.set(s.x, 0, s.z);
      inst.root.rotation.y = s.face;
      group.add(inst.root);
      members.push({ inst, role: "customer", staff: false, spot: k, yaw: s.face, wait: 2 + R() * 8, path: null, leg: 0 });
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
