/**
 * GTA-style inventory and trigger logic. No three.js here, so it runs under node.
 *
 * You start unarmed. Pickups add weapons and ammo; each gun keeps its own magazine
 * and reserve. Hold the trigger on an automatic, tap a semi-auto (taps faster than
 * the fire rate are buffered, not lost). An empty magazine reloads itself if there is
 * reserve, otherwise the trigger clicks. Spread blooms per shot and recovers;
 * aiming tightens it, moving widens it.
 */
import { SLOTS, SLOT_LABEL, WEAPONS } from "./weapons.js";

const FISTS = [
  { kind: "punch", range: 1.55, damage: 16 },
  { kind: "punch", range: 1.55, damage: 16 },
  { kind: "punch", range: 1.45, damage: 26 },
];
const KICK = { kind: "kick", range: 1.85, damage: 32 };
// GTA's knife alternates a swing and a thrust; `hit` is when the blade arrives (s).
const KNIFE_MOVES = [
  { move: "slash", hit: 0.24 },
  { move: "stab", hit: 0.18 },
];
const FIST_RATE = 0.34;
const EQUIP_S = 0.32;
const BUFFER_S = 0.22;
const BLOOM_RECOVER = 4.5; // deg/s
const BLOOM_HOLD_S = 0.2; // bloom only settles once you ease off the trigger
const AIM_RATE = 9;

export function createCombat(opts = {}) {
  /** id -> { mag, reserve } */
  const owned = new Map();
  let weapon = "unarmed";
  let aiming = false;
  let aimBlend = 0;
  let trigger = false;
  let pressed = false;
  let buffered = 0;
  let cooldown = 0;
  let equipT = 0;
  let reloadT = 0;
  let bloom = 0;
  let combo = 0;
  let knifeCombo = 0;
  let lastSwingT = 99;
  let dryLatch = false;
  let wheelOpen = false;
  let hover = null;
  let moving = 0;
  let lastShotT = 99;

  const def = () => WEAPONS[weapon] || null;
  const gun = () => {
    const w = def();
    return w && !w.melee ? w : null;
  };

  function hud() {
    const w = def();
    const a = owned.get(weapon);
    opts.onHud?.({
      weapon,
      label: SLOT_LABEL[weapon],
      melee: !w || !!w.melee,
      mag: a?.mag ?? 0,
      reserve: a?.reserve ?? 0,
      reloading: reloadT > 0,
      aiming,
      open: wheelOpen,
      hover,
      slots: SLOTS.map((id) => ({
        id,
        label: SLOT_LABEL[id],
        owned: id === "unarmed" || owned.has(id),
        ammo: owned.has(id) && !WEAPONS[id].melee ? owned.get(id).mag + owned.get(id).reserve : null,
      })),
    });
  }

  function has(id) {
    return id === "unarmed" || owned.has(id);
  }

  function equip(id, quiet = false) {
    if (!has(id) || id === weapon) return false;
    weapon = id;
    reloadT = 0;
    equipT = id === "unarmed" ? 0 : EQUIP_S;
    bloom = 0;
    dryLatch = false;
    opts.onEquip?.(id);
    if (!quiet) hud();
    return true;
  }

  /** Pick up a weapon. Returns "new", "ammo", or "full" (nothing taken). */
  function give(id, rounds) {
    const w = WEAPONS[id];
    if (!w) return "full";
    if (w.melee) {
      if (owned.has(id)) return "full";
      owned.set(id, { mag: 0, reserve: 0 });
      if (weapon === "unarmed") equip(id, true);
      hud();
      return "new";
    }
    const n = rounds ?? w.mag + w.reserve;
    const a = owned.get(id);
    if (!a) {
      const mag = Math.min(w.mag, n);
      owned.set(id, { mag, reserve: Math.min(w.maxReserve, n - mag) });
      // GTA switches to a better gun on pickup only when you're not holding one.
      if (!gun()) equip(id, true);
      hud();
      return "new";
    }
    const room = w.maxReserve - a.reserve;
    if (room <= 0) return "full";
    a.reserve += Math.min(room, n);
    hud();
    return "ammo";
  }

  function cycle(dir) {
    const list = SLOTS.filter(has);
    const i = list.indexOf(weapon);
    equip(list[(i + (dir > 0 ? 1 : -1) + list.length) % list.length]);
  }

  function reload() {
    const w = gun();
    const a = owned.get(weapon);
    if (!w || !a || reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return false;
    reloadT = w.reload;
    opts.onReload?.(weapon, w.reload);
    hud();
    return true;
  }

  function spreadDeg() {
    const w = gun();
    if (!w) return 0;
    const base = w.spreadHip + (w.spreadAim - w.spreadHip) * aimBlend;
    return base * (1 + 0.6 * moving) + bloom;
  }

  function fireGun(w, a) {
    a.mag -= 1;
    cooldown = w.rate;
    lastShotT = 0;
    const spread = spreadDeg();
    bloom = Math.min(w.bloomMax, bloom + w.bloom);
    opts.onFire?.({ weapon: w.id, def: w, spread, pellets: w.pellets, mag: a.mag });
    if (a.mag <= 0 && a.reserve > 0) reload();
    hud();
  }

  function swing() {
    if (cooldown > 0) return false;
    const w = def();
    if (w?.melee) {
      cooldown = w.rate;
      // A pause resets the chain, so a fresh attack always opens with the slash.
      if (lastSwingT > 1.2) knifeCombo = 0;
      const m = KNIFE_MOVES[knifeCombo];
      knifeCombo = (knifeCombo + 1) % KNIFE_MOVES.length;
      lastSwingT = 0;
      opts.onMelee?.({ kind: "knife", ...m, range: w.range, damage: w.damage, backstab: w.backstab });
    } else {
      const hit = FISTS[combo % FISTS.length];
      combo = (combo + 1) % FISTS.length;
      cooldown = FIST_RATE;
      opts.onMelee?.({ ...hit });
    }
    return true;
  }

  function tryFire() {
    if (opts.blocked?.() || wheelOpen) return false;
    if (equipT > 0 || reloadT > 0 || cooldown > 0) return false;
    const w = gun();
    if (!w) return swing();
    const a = owned.get(weapon);
    if (a.mag > 0) {
      fireGun(w, a);
      return true;
    }
    if (!reload() && !dryLatch) {
      dryLatch = true;
      opts.onDry?.(weapon);
    }
    return false;
  }

  function setTrigger(v) {
    v = !!v;
    if (v && !trigger) {
      pressed = true;
      buffered = BUFFER_S;
    }
    if (!v) dryLatch = false;
    trigger = v;
  }

  function update(dt, ctx = {}) {
    moving = Math.max(0, Math.min(1, ctx.moving ?? 0));
    cooldown = Math.max(0, cooldown - dt);
    equipT = Math.max(0, equipT - dt);
    lastShotT += dt;
    lastSwingT += dt;
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) {
        reloadT = 0;
        const w = gun();
        const a = owned.get(weapon);
        if (w && a) {
          const take = Math.min(w.mag - a.mag, a.reserve);
          a.mag += take;
          a.reserve -= take;
        }
        hud();
      }
    }
    if (lastShotT > BLOOM_HOLD_S) bloom = Math.max(0, bloom - BLOOM_RECOVER * dt * (aiming ? 1.4 : 1));
    // Firing from the hip still raises the gun.
    const want = gun() && (aiming || lastShotT < 0.6) ? 1 : 0;
    aimBlend += (want - aimBlend) * (1 - Math.exp(-AIM_RATE * dt));

    const w = def();
    if (pressed || buffered > 0) {
      if (tryFire()) {
        pressed = false;
        buffered = 0;
      } else {
        buffered = Math.max(0, buffered - dt);
        pressed = false;
      }
    } else if (trigger && w && !w.melee && w.auto) {
      tryFire();
    }
  }

  /** Unarmed right-click is a kick; armed it aims. */
  function kick() {
    if (gun() || opts.blocked?.() || cooldown > 0) return false;
    cooldown = FIST_RATE * 1.3;
    opts.onMelee?.({ ...KICK });
    return true;
  }

  hud();

  return {
    give,
    equip,
    cycle,
    reload,
    kick,
    has,
    setTrigger,
    update,
    /** Fire once now (touch button, pad tap). */
    attack() {
      setTrigger(true);
      update(0);
      setTrigger(false);
    },
    setAim(v) {
      if (!!v === aiming) return;
      aiming = !!v;
      hud();
    },
    setWheel(v) {
      v = !!v;
      if (v === wheelOpen) return;
      wheelOpen = v;
      if (!v && hover && hover !== weapon) equip(hover, true);
      if (v) hover = weapon;
      hud();
    },
    /** Slot under the wheel cursor (only owned slots stick). */
    setHover(id) {
      if (!has(id) || id === hover) return;
      hover = id;
      hud();
    },
    /** Drop everything (busted). */
    clear() {
      owned.clear();
      const was = weapon;
      weapon = "unarmed";
      reloadT = 0;
      aiming = false;
      trigger = false;
      if (was !== "unarmed") opts.onEquip?.("unarmed");
      hud();
    },
    ammoOf(id) {
      return owned.get(id) || null;
    },
    get weapon() {
      return weapon;
    },
    get def() {
      return def();
    },
    get armed() {
      return !!gun();
    },
    get aiming() {
      return aiming;
    },
    /** 0 = hip, 1 = fully raised. */
    get aimBlend() {
      return aimBlend;
    },
    get reloading() {
      return reloadT > 0;
    },
    get reloadLeft() {
      return reloadT;
    },
    get equipping() {
      return equipT > 0;
    },
    get spread() {
      return spreadDeg();
    },
    get wheelOpen() {
      return wheelOpen;
    },
    get open() {
      return wheelOpen;
    },
    get sinceShot() {
      return lastShotT;
    },
  };
}
