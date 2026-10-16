/**
 * The five weapons, their GTA-like handling, and their models.
 *
 * Models are CC0 Quaternius guns baked by scripts/build_weapon_glbs.py: origin on the
 * firing palm, barrel along +Z, up +Y, real size, with `Muzzle` and `Support` empties.
 * Angles are degrees of cone half-angle; damage is per pellet. `stock` is grip to butt
 * in metres, for shouldering long guns.
 */
/** A gun can be fired from a bike or scooter. Fists and the knife cannot. */
export function canFireWhileRiding(weaponId) {
  const w = WEAPONS[weaponId];
  return !!w && !w.melee;
}

export const WEAPONS = {
  knife: {
    id: "knife",
    label: "Knife",
    hold: "knife",
    melee: true,
    damage: 45,
    backstab: 2,
    rate: 0.6,
    range: 1.8,
  },
  pistol: {
    id: "pistol",
    label: "Pistol",
    hold: "pistol",
    auto: false,
    damage: 26,
    rate: 0.17,
    mag: 12,
    reserve: 36,
    maxReserve: 250,
    pellets: 1,
    spreadAim: 0.35,
    spreadHip: 2.2,
    bloom: 0.55,
    bloomMax: 2.5,
    range: 90,
    falloff: 40,
    kick: 1.5,
    kickYaw: 0.35,
    reload: 1.45,
    shake: 0.15,
  },
  shotgun: {
    id: "shotgun",
    label: "Pump Shotgun",
    hold: "rifle",
    auto: false,
    damage: 13,
    rate: 0.85,
    mag: 8,
    reserve: 16,
    maxReserve: 80,
    pellets: 8,
    spreadAim: 3.4,
    spreadHip: 5.5,
    bloom: 0,
    bloomMax: 0,
    range: 38,
    falloff: 12,
    kick: 5.2,
    kickYaw: 0.9,
    reload: 2.6,
    shake: 0.6,
    stock: 0.25,
  },
  smg: {
    id: "smg",
    label: "Machine Gun",
    hold: "rifle",
    auto: true,
    damage: 18,
    rate: 0.072,
    mag: 30,
    reserve: 90,
    maxReserve: 360,
    pellets: 1,
    spreadAim: 0.9,
    spreadHip: 3.2,
    bloom: 0.28,
    bloomMax: 3,
    range: 70,
    falloff: 25,
    kick: 0.8,
    kickYaw: 0.45,
    reload: 1.9,
    shake: 0.12,
    stock: 0.22,
  },
  rifle: {
    id: "rifle",
    label: "Carbine Rifle",
    hold: "rifle",
    auto: true,
    damage: 32,
    rate: 0.115,
    mag: 30,
    reserve: 60,
    maxReserve: 300,
    pellets: 1,
    spreadAim: 0.25,
    spreadHip: 2.6,
    bloom: 0.32,
    bloomMax: 2.2,
    range: 160,
    falloff: 70,
    kick: 1.15,
    kickYaw: 0.4,
    reload: 2.2,
    shake: 0.2,
    stock: 0.25,
  },
};

/** Wheel order. `unarmed` is always owned. */
export const SLOTS = ["unarmed", "knife", "pistol", "shotgun", "smg", "rifle"];
export const SLOT_LABEL = { unarmed: "Unarmed", knife: "Knife", pistol: "Pistol", shotgun: "Shotgun", smg: "Machine Gun", rifle: "Rifle" };

/** Headshots kill almost anyone; legs are not modelled. */
export const HEADSHOT = 3;

/** Damage after range falloff (full to `falloff` m, half at `range`). */
export function damageAt(w, dist) {
  if (!w.falloff || dist <= w.falloff) return w.damage;
  const k = Math.min(1, (dist - w.falloff) / Math.max(1, w.range - w.falloff));
  return w.damage * (1 - 0.5 * k);
}

const base = new URL("./weapons/", import.meta.url);
const cache = new Map();
let loader = null;

/**
 * A fresh copy of the weapon's model: { root, muzzle, support } where muzzle and
 * support are Object3Ds inside root (null for the knife's support).
 */
export async function loadWeaponModel(THREE, id) {
  if (!WEAPONS[id]) return null;
  let p = cache.get(id);
  if (!p) {
    // Imported on first use so the stats table loads without three.js (node tests).
    p = (async () => {
      loader ??= new (await import("three/addons/loaders/GLTFLoader.js")).GLTFLoader();
      return loader.loadAsync(new URL(`${id}.glb`, base).href);
    })();
    cache.set(id, p);
  }
  const gltf = await p;
  const root = gltf.scene.clone(true);
  root.name = `weapon-${id}`;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return {
    root,
    muzzle: root.getObjectByName("Muzzle"),
    support: root.getObjectByName("Support"),
  };
}

export function preloadWeapons(THREE) {
  return Promise.allSettled(Object.keys(WEAPONS).map((id) => loadWeaponModel(THREE, id)));
}
