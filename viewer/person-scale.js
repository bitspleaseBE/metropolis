/**
 * The only body size in the game.
 *
 * ADULT_M is standing height: shoe sole to the top of the head, hair included.
 * The player, shop staff, riders, and every grown pedestrian are fitted to it.
 * CHILD_M is a child, not a shrunk adult. EYE_M is the walk camera, CROWN_TO_EYE
 * under the top of the head. HEIGHT_JITTER is the only allowed drift, so a
 * pavement is not one clone.
 *
 * Change the numbers here. Do not hard-code another person height.
 */
export const ADULT_M = 1.75;
export const CHILD_M = 1.43;
export const CROWN_TO_EYE = 0.12;
export const EYE_M = ADULT_M - CROWN_TO_EYE;
export const HEIGHT_JITTER = 0.03;

export function heightFor(age) {
  return age === "child" ? CHILD_M : ADULT_M;
}
