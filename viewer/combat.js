/**
 * Fists and a pistol. Click cycles a four-hit combo; the pistol is hitscan and
 * falls back to fists when the magazine is empty. Tab holds a two-slot wheel.
 */

const COMBO = [
  { id: "left", range: 1.55, damage: 16 },
  { id: "right", range: 1.55, damage: 16 },
  { id: "hook", range: 1.45, damage: 26 },
  { id: "kick", range: 1.85, damage: 32 },
];
const MAG = 12;
const SHOT = 34;
const SHOT_RANGE = 42;

export function createCombat(THREE, opts = {}) {
  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let weapon = "fists";
  let owned = false;
  let ammo = 0;
  let combo = 0;
  let swing = 0;
  let swingId = "left";
  let open = false;
  let cooldown = 0;

  function hud() {
    opts.onHud?.({
      weapon: ammo > 0 && owned ? weapon : "fists",
      hasPistol: owned,
      ammo,
      open,
      slots: [
        { id: "fists", label: "Fists" },
        { id: "pistol", label: "Pistol", locked: !owned },
      ],
    });
  }

  function select(id) {
    if (id === "pistol" && (!owned || ammo <= 0)) id = "fists";
    weapon = id;
    hud();
  }

  function givePistol(rounds = MAG) {
    const had = owned;
    owned = true;
    ammo += rounds;
    weapon = "pistol";
    hud();
    return had ? "ammo" : "gun";
  }

  function cycle(dir) {
    if (!owned) return;
    select(weapon === "fists" ? "pistol" : "fists");
    if (dir < 0 && weapon === "fists" && ammo > 0) select("pistol");
  }

  function pose(k) {
    const bones = opts.bones?.();
    const legs = opts.legs?.();
    if (!bones) return;
    const a = k * k * (3 - 2 * k);
    const punch = (upper, fore, sign) => {
      if (upper) {
        q.setFromAxisAngle(axis.set(1, 0, 0), -1.15 * a * sign);
        upper.quaternion.premultiply(q);
      }
      if (fore) {
        q.setFromAxisAngle(axis.set(1, 0, 0), -0.55 * a);
        fore.quaternion.premultiply(q);
      }
    };
    if (swingId === "left") punch(bones.lUpper, bones.lFore, 1);
    else if (swingId === "right") punch(bones.rUpper, bones.rFore, 1);
    else if (swingId === "hook") punch(bones.rUpper, bones.rFore, 1);
    else if (swingId === "kick" && legs?.rThigh) {
      q.setFromAxisAngle(axis.set(1, 0, 0), -1.2 * a);
      legs.rThigh.quaternion.premultiply(q);
      if (legs.rCalf) {
        q.setFromAxisAngle(axis.set(1, 0, 0), 0.7 * a);
        legs.rCalf.quaternion.premultiply(q);
      }
    }
  }

  function attack() {
    if (cooldown > 0 || opts.blocked?.()) return;
    const using = owned && weapon === "pistol" && ammo > 0 ? "pistol" : "fists";
    if (using === "pistol") {
      ammo -= 1;
      if (ammo <= 0) weapon = "fists";
      cooldown = 0.28;
      opts.onShot?.(SHOT, SHOT_RANGE);
      hud();
      return;
    }
    const hit = COMBO[combo % COMBO.length];
    combo = (combo + 1) % COMBO.length;
    swingId = hit.id;
    swing = 0.32;
    cooldown = 0.34;
    opts.onMelee?.(hit.range, hit.damage);
    hud();
  }

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (swing > 0) {
      swing = Math.max(0, swing - dt);
      pose(swing / 0.32);
    }
  }

  hud();

  return {
    attack,
    update,
    givePistol,
    cycle,
    setOpen(v) {
      open = !!v;
      hud();
    },
    get open() {
      return open;
    },
    get weapon() {
      return weapon;
    },
    get ammo() {
      return ammo;
    },
  };
}
