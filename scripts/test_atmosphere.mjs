/**
 * Twilight weights and aerial-perspective density.
 *   node scripts/test_atmosphere.mjs
 */
import assert from "node:assert/strict";
import {
  aerialDensity,
  cameraFogScale,
  fogFactor,
  sampleAtmosphere,
  skySunElevation,
  skyWeights,
} from "../viewer/atmosphere.js";

{
  const w = skyWeights(12);
  assert.ok(w.day > 0.9, `noon day ${w.day}`);
  assert.ok(w.golden < 0.05 && w.pink < 0.05);
}

{
  const w = skyWeights(18);
  assert.ok(w.golden > 0.85, `18:00 golden ${w.golden}`);
  assert.ok(w.pink < 0.05, `18:00 pink ${w.pink}`);
}

{
  const w = skyWeights(20);
  assert.ok(w.pink > 0.85, `20:00 pink ${w.pink}`);
  assert.ok(w.golden < 0.05, `20:00 golden ${w.golden}`);
}

{
  const w = skyWeights(23);
  assert.ok(w.night > 0.85, `23:00 night ${w.night}`);
}

{
  const w = skyWeights(5);
  assert.ok(w.night > 0.9, `05:00 night ${w.night}`);
}

{
  const w = skyWeights(6.25);
  assert.ok(w.pink > 0.8, `06:15 pink ${w.pink}`);
  assert.ok(w.golden < 0.1, `06:15 golden ${w.golden}`);
  assert.ok(w.day < 0.1, `06:15 day ${w.day}`);
}

{
  const w = skyWeights(7.7);
  assert.ok(w.golden > 0.8, `07:42 golden ${w.golden}`);
  assert.ok(w.pink < 0.1, `07:42 pink ${w.pink}`);
}

{
  const w = skyWeights(7.0);
  assert.ok(w.day < 0.08, `07:00 day leaked ${w.day}`);
  assert.ok(w.golden + w.pink > 0.9);
}

{
  // The handoff from gold to pink must not fall back to noon blue.
  const w = skyWeights(19.3);
  assert.ok(w.day < 0.05, `19:18 day leaked ${w.day}`);
  assert.ok(w.golden + w.pink > 0.9);
}

{
  const k = aerialDensity(1200, 1);
  assert.ok(fogFactor(k, 80) < 0.05, `near fog ${fogFactor(k, 80)}`);
  assert.ok(fogFactor(k, 450) > 0.25, `mid fog ${fogFactor(k, 450)}`);
  assert.ok(fogFactor(k, 1400) > 0.85, `far fog ${fogFactor(k, 1400)}`);
  const gold = aerialDensity(1200, sampleAtmosphere(18).fogGain);
  assert.ok(fogFactor(gold, 500) > 0.4, "golden hour thickens the air");
  assert.ok(fogFactor(gold, 80) < 0.08, "the street in front stays readable");
}

{
  assert.ok(cameraFogScale(3) > 0.95);
  assert.ok(cameraFogScale(600) < 0.08);
}

{
  const light = (20 * Math.PI) / 180;
  assert.equal(skySunElevation(12, light), light);
  assert.ok(skySunElevation(19.4, light) < 0.02, "disc is on the horizon at the pink hour");
  assert.ok(skySunElevation(6.2, light) < 0, "dawn disc is still below the horizon");
  const morning = skySunElevation(7.7, light);
  assert.ok(morning > 0.02 && morning < light * 0.75, `morning sun should be low, got ${morning}`);
}

console.log("atmosphere ok");
