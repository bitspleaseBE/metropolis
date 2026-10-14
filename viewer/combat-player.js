/**
 * Glue for on-foot combat, shared by index.html and shooting.html: inventory
 * (combat.js), the aim camera, the avatar's gun layer, bullets (hitscan.js), effects,
 * and the combat HUD. Pages supply what can be shot and what happens when it is.
 *
 *   const cp = createCombatPlayer(THREE, { scene, camera, avatar, thirdPerson, ... });
 *   per frame: cp.update(dt, playerPos, moving); avatar.update(..., cp.bodyYaw(yaw), ..., cp.fight)
 */
import { createCombat } from "./combat.js";
import { createCombatHud } from "./combat-hud.js";
import { createHitscan } from "./hitscan.js";
import { createWeaponFx } from "./weapon-fx.js";
import { damageAt, HEADSHOT, WEAPONS } from "./weapons.js";

const WHEEL_SLOWMO = 0.3;

/**
 * @param {object} o
 * @param {() => Iterable<object>} [o.targets]   characters: { x, y, z, r, h, kind, ref, dead }
 * @param {() => object[]} [o.occluders]          meshes bullets stop on (and can report)
 * @param {(x:number,y:number,z:number)=>boolean} [o.solidAt]
 * @param {(x:number,z:number)=>number} [o.groundY]
 * @param {(hit:object)=>("kill"|"hit"|null|void)} [o.onHit]  one call per target per trigger pull
 * @param {(m:object)=>void} [o.onMelee]
 * @param {(pos:object, weapon:string)=>void} [o.onGunfire]
 * @param {()=>boolean} [o.blocked]
 */
export function createCombatPlayer(THREE, o) {
  const { scene, camera, avatar, thirdPerson } = o;
  const hud = createCombatHud({ armorHost: o.armorHost });
  const fx = createWeaponFx(THREE, scene);
  const hitscan = createHitscan(THREE, {
    occluders: o.occluders,
    solidAt: o.solidAt,
    groundY: o.groundY,
  });

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const barrel = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const playerAt = new THREE.Vector3();
  let enemy = false;
  let timeScale = 1;
  const fight = { aim: 0, aimPoint, moveYaw: 0, dead: false };
  let stats = { shots: 0, hits: 0, heads: 0, kills: 0 };

  function muzzleWorld() {
    if (avatar.muzzle(muzzle, barrel)) return muzzle;
    // No model yet: right shoulder height, a little ahead.
    const y = thirdPerson.yaw();
    return muzzle.set(
      playerAt.x - Math.sin(y) * 0.5 + Math.cos(y) * 0.25,
      playerAt.y + 1.35,
      playerAt.z - Math.cos(y) * 0.5 - Math.sin(y) * 0.25,
    );
  }

  /** GTA melee lock: the nearest living target ahead and within a step of reach. */
  function meleeTarget(range) {
    const y = avatar.facing;
    const fx = -Math.sin(y);
    const fz = -Math.cos(y);
    let best = null;
    let bestD = range + 0.9;
    for (const t of o.targets?.() || []) {
      if (!t || t.dead) continue;
      const dx = t.x - playerAt.x;
      const dz = t.z - playerAt.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && d > 1e-3 && (dx * fx + dz * fz) / d > 0.5) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  const combat = createCombat({
    blocked: o.blocked,
    onHud: (info) => hud.set(info),
    onEquip(id) {
      avatar.setWeapon(id);
      if (id !== "unarmed") fx.equip();
    },
    onReload(id, dur) {
      avatar.reload(dur);
      fx.reload(dur);
    },
    onDry: () => fx.dry(),
    onMelee(m) {
      m.target = meleeTarget(m.range);
      if (m.kind === "knife") {
        avatar.stab(m.move);
        fx.swish();
      } else {
        avatar.strike(m.kind);
      }
      o.onMelee?.(m);
    },
    onFire(shot) {
      const def = shot.def;
      thirdPerson.aimRay(camPos, camDir);
      const from = muzzleWorld().clone();
      const hits = hitscan.shoot({
        camPos,
        camDir,
        muzzle: from,
        spread: shot.spread,
        pellets: def.pellets,
        range: def.range,
        targets: o.targets?.() || [],
      });
      stats.shots++;
      // Pellets on one body add up into one hit, so a point-blank shotgun blast kills.
      const per = new Map();
      for (const h of hits) {
        if (h.target) {
          const dmg = damageAt(def, h.dist) * (h.head ? HEADSHOT : 1);
          const e = per.get(h.target);
          if (e) {
            e.damage += dmg;
            e.head ||= h.head;
          } else per.set(h.target, { ...h, damage: dmg, def });
        } else if (h.object && typeof h.object === "object") {
          o.onHit?.({ ...h, damage: damageAt(def, h.dist), def, dir: camDir.clone() });
        }
      }
      let any = false;
      let kill = false;
      for (const h of per.values()) {
        const r = o.onHit?.({ ...h, dir: camDir.clone() });
        if (r === "hit" || r === "kill") any = true;
        if (r === "kill") kill = true;
        if (h.head) stats.heads++;
      }
      if (any) {
        stats.hits++;
        hud.hit(kill);
        fx.hitTick(kill);
      }
      if (kill) stats.kills++;
      avatar.fire(def);
      thirdPerson.recoil(def.kick, (Math.random() - 0.5) * 2 * def.kickYaw, def.shake);
      fx.shot(def, from, camDir, hits);
      o.onGunfire?.(from, def.id);
    },
  });

  function pxSpread(deg) {
    const h = innerHeight / 2;
    return (Math.tan((deg * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360)) * h;
  }

  return {
    combat,
    hud,
    fx,
    hitscan,
    fight,
    aimPoint,
    get stats() {
      return stats;
    },
    resetStats() {
      stats = { shots: 0, hits: 0, heads: 0, kills: 0 };
    },
    get timeScale() {
      return timeScale;
    },
    get enemyUnder() {
      return enemy;
    },
    /** Raised (aiming or just fired) and holding a gun. */
    get raised() {
      return combat.armed && combat.aimBlend > 0.35;
    },
    /** While aiming the body turns with the camera; otherwise it faces travel so a
     *  post-shot aim blend does not leave you walking sideways. */
    bodyYaw(travelYaw) {
      return combat.armed && combat.aiming ? thirdPerson.yaw() : travelYaw;
    },
    /** Walking pace multiplier while aiming (GTA slows you to an aimed walk). */
    get footScale() {
      return combat.armed && combat.aiming ? 0.55 : 1;
    },
    give(id, rounds) {
      return combat.give(id, rounds);
    },
    /**
     * @param {number} dt  real seconds (the wheel's slow-mo is applied by the page)
     * @param {{x:number,y:number,z:number}} pos  player feet
     * @param {{ moving?: number, moveYaw?: number, dead?: boolean }} [s]
     */
    update(dt, pos, s = {}) {
      playerAt.set(pos.x, pos.y, pos.z);
      combat.update(dt, { moving: s.moving ?? 0 });
      timeScale += ((combat.wheelOpen ? WHEEL_SLOWMO : 1) - timeScale) * (1 - Math.exp(-12 * dt));
      thirdPerson.aimRay(camPos, camDir);
      const def = combat.def;
      const range = def && !def.melee ? def.range : 60;
      if (combat.armed) {
        const lead = Math.max(0, muzzleWorld().clone().sub(camPos).dot(camDir));
        const probeFrom = camPos.clone().addScaledVector(camDir, lead);
        const p = hitscan.cast(probeFrom, camDir, range, o.targets?.() || []);
        aimPoint.copy(p.point);
        enemy = !!p.target;
      } else {
        aimPoint.copy(camPos).addScaledVector(camDir, 40);
        enemy = false;
      }
      fight.aim = combat.armed ? combat.aimBlend : 0;
      fight.moveYaw = s.moveYaw ?? thirdPerson.yaw();
      fight.dead = !!s.dead;
      hud.frame({ spreadPx: pxSpread(combat.spread), enemy, aiming: combat.aiming || combat.sinceShot < 0.5 });
      fx.update(dt);
    },
    /** Weapons in WEAPONS order, for menus and tests. */
    weapons: Object.keys(WEAPONS),
  };
}
