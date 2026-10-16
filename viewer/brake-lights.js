/**
 * Brake lights for one car. Idle tails follow day/night; the pedal paints them red.
 * The shared night lamp stays dull so a whole queue doesn't glow at once.
 */

const TAIL_DAY = [0.12, 0.02, 0.02];
const TAIL_NIGHT = [0.42, 0.05, 0.04];
const BRAKE = [1.0, 0.05, 0.03];

export function isBraking(velocity, desire, wait) {
  if (wait) return true;
  return desire + 0.35 < velocity;
}

/** @returns {[number, number, number]} linear-ish RGB for a MeshBasicMaterial */
export function tailRGB(night, braking) {
  if (braking) return BRAKE;
  const t = Math.max(0, Math.min(1, Number(night) || 0));
  return [
    TAIL_DAY[0] + (TAIL_NIGHT[0] - TAIL_DAY[0]) * t,
    TAIL_DAY[1] + (TAIL_NIGHT[1] - TAIL_DAY[1]) * t,
    TAIL_DAY[2] + (TAIL_NIGHT[2] - TAIL_DAY[2]) * t,
  ];
}
