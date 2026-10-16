/**
 * A snack-house customer sits on the chair, with a plate on the table in front of them.
 * The layout's spot stays in the aisle so pathfinding still reaches it; seatX/seatZ is the chair.
 */

/** Hip height above the floor once the person is on the chair (seat top is 0.47). */
export const HIP_Y = 0.52;
/** Table top (tableRound / table surface sits at 0.75). */
export const TABLE_Y = 0.76;
/** Metres from the chair origin toward the table, onto the tabletop. */
export const PLATE_REACH = 0.42;

export function facing(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Where the plate sits, in the interior frame. */
export function foodOnTable(seatX, seatZ, face) {
  const f = facing(face);
  return {
    x: seatX + f.x * PLATE_REACH,
    y: TABLE_Y,
    z: seatZ + f.z * PLATE_REACH,
  };
}

/** Root Y so a standing skeleton's hips land on the chair. */
export function hipDrop(hipsY) {
  const hip = Number.isFinite(hipsY) ? hipsY : 0.92;
  return HIP_Y - hip;
}

/** Eat and talk alternate, so a table is not a row of the same gesture. */
export function dinerMode(index) {
  return index % 2 === 0 ? "eat" : "talk";
}
