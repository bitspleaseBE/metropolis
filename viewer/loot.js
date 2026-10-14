/**
 * What a kill leaves behind, GTA style: cash bundles, the victim's weapon (spinning,
 * with a coloured ring), and body armour. Walk over a pickup to take it; a weapon you
 * can't carry more ammo for stays on the ground.
 */
import { cashAmount, createCashDrops } from "./cash.js";
import { loadWeaponModel, WEAPONS } from "./weapons.js";

const PICKUP_R = 1.2;
const LIFETIME_S = 90;
const HOVER_Y = 0.35;
export const ARMOR_MAX = 100;

/**
 * Drop tables per victim kind. Each row is rolled independently.
 * Rounds are what's left in the victim's gun, not a full loadout.
 */
export const DROPS = {
  pedestrian: [
    { p: 0.75, cash: true },
    { p: 0.07, weapon: "knife" },
    { p: 0.06, weapon: "pistol", rounds: [6, 18] },
    { p: 0.04, armor: 25 },
  ],
  police: [
    { p: 0.5, cash: true },
    { p: 0.75, weapon: "pistol", rounds: [12, 36] },
    { p: 0.2, weapon: "shotgun", rounds: [6, 16] },
    { p: 0.12, weapon: "smg", rounds: [30, 60] },
    { p: 0.45, armor: 50 },
  ],
  dummy: [
    { p: 1, cash: true },
    { p: 0.5, armor: 50 },
    { p: 0.6, weapon: "any" },
  ],
};

const RING = { knife: 0xd9d9d9, pistol: 0x68c4ff, shotgun: 0xffa646, smg: 0xffe25a, rifle: 0xff5a5a, armor: 0x3c8cff };

function randInt([a, b]) {
  return Math.round(a + Math.random() * (b - a));
}

export function createLoot(THREE, scene, opts = {}) {
  const cash = createCashDrops(scene, THREE);
  const root = new THREE.Group();
  root.name = "Loot";
  scene.add(root);

  const ringGeo = new THREE.RingGeometry(0.32, 0.4, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMats = {};
  const ringMat = (hex) =>
    (ringMats[hex] ??= new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75, depthWrite: false }));

  const vestMat = new THREE.MeshStandardMaterial({ color: 0x1d2a3d, roughness: 0.7, emissive: 0x0b2850, emissiveIntensity: 0.5 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x3c8cff, emissive: 0x1a4c99, emissiveIntensity: 0.6 });
  function makeVest() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.1), vestMat);
    g.add(body);
    for (const x of [-0.11, 0.11]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.11), vestMat);
      s.position.set(x, 0.24, 0);
      g.add(s);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.05, 0.105), strapMat);
    band.position.y = -0.05;
    g.add(band);
    g.traverse((o) => (o.castShadow = !!o.isMesh));
    return g;
  }

  const items = [];
  let clock = 0;

  function place(item, mesh, x, y, z) {
    const ring = new THREE.Mesh(ringGeo, ringMat(RING[item.weapon || "armor"] ?? 0xffffff));
    ring.position.set(x, y + 0.03, z);
    root.add(ring);
    mesh.position.set(x, y + HOVER_Y, z);
    root.add(mesh);
    items.push({ item, mesh, ring, groundY: y, age: 0, phase: Math.random() * 6.28 });
  }

  /** Put a single pickup down. `item` is { cash } | { weapon, rounds } | { armor }. */
  async function spawn(item, x, y, z) {
    if (item.cash) {
      cash.drop(x, y, z, item.cash);
      return;
    }
    if (item.armor) {
      place(item, makeVest(), x, y, z);
      return;
    }
    if (item.weapon) {
      const m = await loadWeaponModel(THREE, item.weapon);
      if (!m) return;
      // Lay guns on their side so they read as a silhouette while spinning.
      const g = new THREE.Group();
      m.root.rotation.z = Math.PI / 2;
      m.root.position.z = -0.15;
      g.add(m.root);
      place(item, g, x, y, z);
    }
  }

  /** Roll the drop table for `kind` and scatter the results around x/z. */
  function drop(kind, x, y, z) {
    const table = DROPS[kind] || DROPS.pedestrian;
    const out = [];
    for (const row of table) {
      if (Math.random() >= row.p) continue;
      if (row.cash) out.push({ cash: kind === "dummy" ? 20 + Math.round(Math.random() * 80) : cashAmount() });
      else if (row.armor) out.push({ armor: row.armor });
      else if (row.weapon) {
        const id = row.weapon === "any" ? Object.keys(WEAPONS)[Math.floor(Math.random() * 5)] : row.weapon;
        const w = WEAPONS[id];
        out.push({ weapon: id, rounds: w.melee ? 0 : row.rounds ? randInt(row.rounds) : w.mag + Math.round(w.reserve / 2) });
      }
    }
    out.forEach((it, i) => {
      const a = (i / Math.max(1, out.length)) * Math.PI * 2 + Math.random();
      const r = out.length > 1 ? 0.55 : 0;
      spawn(it, x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    });
    return out;
  }

  /** Spin pickups and collect what the player at px/pz walks over. */
  function update(dt, px, pz) {
    clock += dt;
    const euros = cash.update(dt, px, pz);
    if (euros > 0) opts.onPickup?.({ cash: euros });
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      it.mesh.rotation.y += dt * 2;
      it.mesh.position.y = it.groundY + HOVER_Y + Math.sin(clock * 3 + it.phase) * 0.05;
      it.ring.material.opacity = 0.5 + 0.3 * Math.sin(clock * 4 + it.phase);
      const near = (it.mesh.position.x - px) ** 2 + (it.mesh.position.z - pz) ** 2 < PICKUP_R * PICKUP_R;
      const taken = near && opts.onPickup?.(it.item) !== false;
      if (taken || it.age > LIFETIME_S) {
        root.remove(it.mesh, it.ring);
        items.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const it of items) root.remove(it.mesh, it.ring);
    items.length = 0;
  }

  return {
    drop,
    spawn,
    update,
    clear,
    get count() {
      return items.length + cash.count;
    },
  };
}

/**
 * Armour soaks most of a hit, GTA style. Returns { health, armor } damage split.
 */
export function absorb(armor, damage) {
  if (armor <= 0) return { armor: 0, health: damage };
  const soak = Math.min(armor, damage * 0.8);
  return { armor: soak, health: damage - soak };
}
