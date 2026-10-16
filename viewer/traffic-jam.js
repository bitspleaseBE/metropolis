/**
 * What a stopped driver does in a jam. Red lights are not a jam.
 * A restless driver, about two in five, gives up on a blocked exit.
 */

export const HONK_AFTER_S = 2.4;
export const HONK_GAP_S = 3.6;
export const DETOUR_AFTER_S = 4;
export const BAIL_AFTER_S = 5;

const JAM = new Set(["queue", "car", "cross"]);

/** Stable per car: the lower fraction look for another way out. */
export function isRestless(unit) {
  return unit < 0.4;
}

/**
 * @param {{ wait?: string, blocked?: number, queued?: number, holdEntry?: boolean, next?: unknown, restless?: boolean, lastHonk?: number }} car
 * @param {number} now simulation time in seconds
 */
export function jamReaction(car, now) {
  const none = { honk: false, detour: false, bail: false };
  if (!JAM.has(car.wait || "")) return none;
  const held = Math.max(car.blocked || 0, car.queued || 0);
  if (held < HONK_AFTER_S) return none;
  const honk = now - (car.lastHonk || -1e9) >= HONK_GAP_S;
  const detour = !!(car.restless && car.holdEntry && car.next && held >= DETOUR_AFTER_S);
  const bail = !!(
    car.restless &&
    !car.holdEntry &&
    (car.wait === "car" || car.wait === "cross") &&
    (car.blocked || 0) >= BAIL_AFTER_S
  );
  return { honk, detour, bail };
}
