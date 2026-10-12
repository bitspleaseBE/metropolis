/**
 * Keeps a target count of walkers / riders from an hourly density curve.
 * Spawns only out of camera view (or >40 m away). Despawn on goal → replace.
 */

import { planTrip } from "./trips.js";

const BASE_WALKERS = 40;
const BASE_RIDERS = 28;

export function createNpcSpawner({
  population,
  pedGraph,
  pois,
  getHour = () => 12,
  getDay = () => 5,
  getCamera = () => null,
  walkCount = BASE_WALKERS,
  rideCount = BASE_RIDERS,
} = {}) {
  function targets() {
    const hour = getHour();
    const rules = population?.hourRules?.(hour) || { density: 1 };
    return {
      walkers: Math.max(4, Math.round(walkCount * rules.density)),
      riders: Math.max(2, Math.round(rideCount * (0.55 + 0.45 * rules.density))),
      bakfietsShare: Math.min(0.45, 0.08 * (rules.bakfietsMult || 1)),
      rules,
      hour,
    };
  }

  function spawnSpec({ mode = "walk", at = null } = {}) {
    const hour = getHour();
    const day = getDay();
    const camera = getCamera();
    const look = population
      ? population.pickLook(at?.x ?? camera?.x ?? 0, at?.z ?? camera?.z ?? 0)
      : "european";
    // Sex / age bias from hour rules.
    const rules = population?.hourRules?.(hour) || { femaleShare: 0.5, allowChildren: true };
    const sex = Math.random() < rules.femaleShare ? "f" : "m";
    let age = "adult";
    if (rules.allowChildren && Math.random() < 0.12) age = "child";
    else if (Math.random() < 0.1) age = "senior";

    let chosenMode = mode;
    if (mode === "auto") {
      chosenMode = population?.pickMode?.(look, age, sex, hour) || "walk";
    }
    // No children on bikes alone.
    if (age === "child" && (chosenMode === "bike" || chosenMode === "step")) chosenMode = "walk";

    const trip = planTrip({
      pedGraph,
      pois,
      hour,
      day,
      mode: chosenMode === "bakfiets" || chosenMode === "step" || chosenMode === "bike" ? chosenMode : "walk",
      from: at,
      camera,
    });
    if (!trip) return null;

    return {
      look,
      sex,
      age,
      mode: chosenMode,
      trip,
      householdKind: null, // filled by people.household with look hint
      rules,
    };
  }

  return { targets, spawnSpec };
}

export { BASE_WALKERS, BASE_RIDERS };
