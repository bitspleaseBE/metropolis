/**
 * A nearby gunshot splits the crowd. Most people run directly away from it.
 * A stable fraction of those close enough come in with a knife instead.
 * No extra meshes: both use the walk they already have.
 */

export const FLEE_RADIUS = 45;
export const KNIFE_RADIUS = 14;
export const KNIFE_CHANCE = 0.18;
export const KNIFE_REACH = 1.35;
export const KNIFE_DAMAGE = 14;
export const KNIFE_COOLDOWN = 1.15;

/** Stable 0..1 from an integer id, so the same person always draws or runs. */
export function reactRoll(id) {
  let h = (Number(id) || 0) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {{ id: number, x: number, z: number, down?: boolean }[]} people
 * @param {{ x: number, z: number }} shot
 * @returns {{ flee: number[], knife: number[] }}
 */
export function classifyShot(people, shot, radius = FLEE_RADIUS) {
  const flee = [];
  const knife = [];
  const fleeR = radius > 0 ? radius : FLEE_RADIUS;
  const knifeR = Math.min(KNIFE_RADIUS, fleeR);
  const flee2 = fleeR * fleeR;
  const knife2 = knifeR * knifeR;
  const sx = shot?.x || 0;
  const sz = shot?.z || 0;
  for (const p of people) {
    if (!p || p.down) continue;
    const dx = p.x - sx;
    const dz = p.z - sz;
    const d2 = dx * dx + dz * dz;
    if (d2 > flee2) continue;
    if (d2 <= knife2 && reactRoll(p.id) < KNIFE_CHANCE) knife.push(p.id);
    else flee.push(p.id);
  }
  return { flee, knife };
}

/** Unit vector from the shot toward the person. Standing on the shot runs +X. */
export function fleeVector(person, shot) {
  const dx = (person?.x || 0) - (shot?.x || 0);
  const dz = (person?.z || 0) - (shot?.z || 0);
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return { x: 1, z: 0 };
  return { x: dx / d, z: dz / d };
}

/**
 * Step `from` toward `to` at `speed` m/s, stopping short of the blade reach.
 * `strike` is true while still inside reach.
 */
export function approach(from, to, dt, speed, reach = KNIFE_REACH) {
  const dx = (to?.x || 0) - (from?.x || 0);
  const dz = (to?.z || 0) - (from?.z || 0);
  const dist = Math.hypot(dx, dz);
  const ux = dist > 1e-4 ? dx / dist : 0;
  const uz = dist > 1e-4 ? dz / dist : 1;
  const room = Math.max(0, dist - reach * 0.55);
  const step = Math.min(room, Math.max(0, speed) * Math.max(0, dt));
  return {
    x: (from?.x || 0) + ux * step,
    z: (from?.z || 0) + uz * step,
    dirX: ux,
    dirZ: uz,
    dist,
    strike: dist <= reach && dist > 0,
  };
}
