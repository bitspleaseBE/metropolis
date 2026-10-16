/**
 * Aerial perspective and the twilight sky.
 *
 * One painted equirectangular gradient plus the existing fog — no extra
 * render targets, no volumetrics. Distance fades into the horizon colour so
 * the district edge reads as air. Around 18:00 the air goes gold; from about
 * 19:45 to 20:45 the sky is the pink hour between daylight and night.
 * Morning is the same pair, reversed: pink around 06:15 while the lamps are
 * still on, then gold from about 07:15 until the sun is well up.
 */

const DAY = {
  zenith: "3d96ff",
  high: "6eb6ff",
  mid: "b7dcff",
  horizon: "e7f0f8",
  ground: "7f96a8",
  fog: "c5d8ea",
  sun: "fff2d6",
  glow: 0.16,
  disc: 1,
  fogGain: 1,
  falloff: 0.02,
  sunStrength: 0.22,
};

// Low sun, the whole distance washed gold (trees gone past a few hundred metres).
const GOLDEN = {
  zenith: "c47a32",
  high: "e09040",
  mid: "f0b060",
  horizon: "ffe0a8",
  ground: "8a6238",
  fog: "e8b56a",
  sun: "fff0c8",
  glow: 0.95,
  disc: 1,
  fogGain: 1.72,
  falloff: 0.011,
  sunStrength: 0.75,
};

// Between light and dark: indigo zenith, magenta, coral horizon. Lights come on under it.
const PINK = {
  zenith: "1c1038",
  high: "6a3878",
  mid: "e06090",
  horizon: "ff8d6a",
  ground: "5c3040",
  fog: "e8a090",
  sun: "ffc4a8",
  glow: 0.72,
  disc: 0.35,
  fogGain: 1.38,
  falloff: 0.016,
  sunStrength: 0.55,
};

const NIGHT = {
  zenith: "2a4468",
  high: "4a627c",
  mid: "8a8478",
  horizon: "e0c4a0",
  ground: "2c3238",
  fog: "6d7d8e",
  sun: "d0dcf0",
  glow: 0.06,
  disc: 0.45,
  fogGain: 1.1,
  falloff: 0.02,
  sunStrength: 0.1,
};

const KINDS = [DAY, GOLDEN, PINK, NIGHT];
const COLOR_KEYS = ["zenith", "high", "mid", "horizon", "ground", "fog", "sun"];
const NUMBER_KEYS = ["glow", "disc", "fogGain", "falloff", "sunStrength"];

function smoothstep(e0, e1, x) {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

function srgbToLin(u) {
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function linToSrgb(u) {
  return u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055;
}

function hexToLin(hex) {
  const n = parseInt(hex, 16);
  return [srgbToLin(((n >> 16) & 255) / 255), srgbToLin(((n >> 8) & 255) / 255), srgbToLin((n & 255) / 255)];
}

function linToHex(rgb) {
  const ch = (u) => {
    const s = Math.round(Math.min(1, Math.max(0, linToSrgb(u))) * 255);
    return s.toString(16).padStart(2, "0");
  };
  return ch(rgb[0]) + ch(rgb[1]) + ch(rgb[2]);
}

const LIN = KINDS.map((p) => {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = hexToLin(p[k]);
  return o;
});

/** @returns {{ day: number, golden: number, pink: number, night: number }} */
export function skyWeights(hour) {
  const h = ((hour % 24) + 24) % 24;
  // Evening: gold, then the pink hour. Morning is that pair in reverse.
  const golden =
    smoothstep(16.55, 17.75, h) * (1 - smoothstep(19.05, 19.85, h)) +
    (h < 12 ? smoothstep(6.45, 7.2, h) * (1 - smoothstep(8.2, 9.0, h)) : 0);
  const pink =
    smoothstep(18.7, 19.45, h) * (1 - smoothstep(20.7, 21.45, h)) +
    (h < 12 ? smoothstep(5.35, 6.05, h) * (1 - smoothstep(6.55, 7.25, h)) : 0);
  let night = 0;
  if (h >= 20.6 || h < 5.7) {
    night = h >= 20.6 ? smoothstep(20.6, 21.5, h) : 1 - smoothstep(5.4, 6.15, h);
  }
  const day = Math.max(0, 1 - golden - pink - night);
  const w = { day, golden, pink, night };
  const s = w.day + w.golden + w.pink + w.night;
  if (s > 1) {
    w.day /= s;
    w.golden /= s;
    w.pink /= s;
    w.night /= s;
  }
  return w;
}

/**
 * Sky and haze at `hour`. Colours are CSS hex (no leading #).
 * `warm` is how far the sunlight should leave noon white.
 */
export function sampleAtmosphere(hour) {
  const w = skyWeights(hour);
  const weights = [w.day, w.golden, w.pink, w.night];
  const out = { weights: w };
  for (const k of COLOR_KEYS) {
    const acc = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const c = LIN[i][k];
      acc[0] += c[0] * weights[i];
      acc[1] += c[1] * weights[i];
      acc[2] += c[2] * weights[i];
    }
    out[k] = linToHex(acc);
  }
  for (const k of NUMBER_KEYS) {
    let v = 0;
    for (let i = 0; i < 4; i++) v += KINDS[i][k] * weights[i];
    out[k] = v;
  }
  out.warm = Math.min(1, w.golden * 0.72 + w.pink * 0.45);
  return out;
}

/**
 * FogExp2 density. A few blocks out the air softens; by ~1 km the city has
 * melted into the horizon. Large districts share one pedestrian distance —
 * scaling haze down so the whole map stays sharp is what left the far edge bare.
 */
export function aerialDensity(spanM, fogGain = 1) {
  const edge = Math.max(520, Math.min(spanM, 900)) * 1.05;
  const k = 1.35 / edge;
  return Math.min(0.0024, Math.max(0.00115, k)) * fogGain;
}

/** 1 at eye height. The overview camera climbs out of the ground haze. */
export function cameraFogScale(cameraY) {
  const above = Math.max(0, cameraY - 4);
  return Math.max(0.04, Math.exp(-above * 0.0055));
}

/**
 * Elevation (radians) of the visible sun disc. The lighting arc stays put;
 * the disc drops onto the horizon through the golden hour and under it for the pink hour.
 * At dawn it climbs back out of that same dip.
 */
export function skySunElevation(hour, lightEl) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 16.0 && h < 22.5) {
    const set = smoothstep(16.4, 19.55, h);
    return lightEl * (1 - set) + -0.09 * set;
  }
  if (h < 9.5) {
    const rise = smoothstep(6.5, 9.0, h);
    return -0.09 * (1 - rise) + lightEl * rise;
  }
  return lightEl;
}

/** FogExp2 factor at `distance` metres. Exported for tests. */
export function fogFactor(density, distance) {
  const x = density * distance;
  return 1 - Math.exp(-x * x);
}
