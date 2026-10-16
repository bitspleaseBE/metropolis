/**
 * District population mix and hour-of-day rules for NPC spawning.
 *
 * Jewish characters (the hasidic look) exist only in 2018-harmonie.
 * 2018 is half Jewish, a small Arab share, and the rest Flemish (european).
 * Every other district is half Flemish and half Black or Arab.
 * The Arab share uses the arab and muslim wardrobes — only a couple of
 * models are tagged arab. Published district.json mixes are not applied:
 * those files still name a Hasidic hotspot inside 2000.
 */

/** The only district that may spawn a Jewish character. */
export const JEWISH_DISTRICT = "2018-harmonie";

/** Flemish european, Black african, Arab arab+muslim. */
export const OTHER_MIX = {
  european: 0.5,
  african: 0.25,
  arab: 0.1,
  muslim: 0.15,
};

/** 2018: 50% Jewish, 5% Arab, 45% Flemish. */
export const HARMONIE_MIX = {
  hasidic: 0.5,
  arab: 0.03,
  muslim: 0.02,
  european: 0.45,
};

const DEFAULT_MIX = OTHER_MIX;

const BUCKET = {
  european: "flemish",
  african: "black",
  african_street: "black",
  arab: "arab",
  arab_young: "arab",
  muslim: "arab",
  hasidic: "jewish",
};

export function bucketOf(look) {
  return BUCKET[look] || "";
}

export function mixForDistrict(id) {
  const mix = id === JEWISH_DISTRICT ? { ...HARMONIE_MIX } : { ...OTHER_MIX };
  if (id !== JEWISH_DISTRICT) mix.hasidic = 0;
  return mix;
}

/**
 * Ids for a resident roster whose prefix already matches the district mix.
 * Jewish models are omitted everywhere except 2018. Staff are skipped.
 * @param {Array<{id: string, look: string, role?: string}>} people
 * @param {string} districtId
 * @param {number} count
 * @param {() => number} [rng]
 */
export function rosterIds(people, districtId, count, rng = Math.random) {
  const shares =
    districtId === JEWISH_DISTRICT
      ? { jewish: 0.5, arab: 0.05, flemish: 0.45 }
      : { black: 0.25, arab: 0.25, flemish: 0.5 };
  const pools = { jewish: [], arab: [], black: [], flemish: [] };
  for (const p of people) {
    if (p.role === "staff") continue;
    const b = bucketOf(p.look);
    if (!pools[b]) continue;
    if (b === "jewish" && districtId !== JEWISH_DISTRICT) continue;
    pools[b].push(p.id);
  }
  for (const list of Object.values(pools)) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const keys = Object.keys(shares);
  const parts = keys.map((k) => {
    const exact = shares[k] * count;
    return { k, exact, n: Math.floor(exact) };
  });
  let rem = count - parts.reduce((s, p) => s + p.n, 0);
  parts.sort((a, b) => b.exact - b.n - (a.exact - a.n));
  for (let i = 0; i < rem; i++) parts[i % parts.length].n++;
  const left = Object.fromEntries(parts.map((p) => [p.k, p.n]));
  const ids = [];
  while (ids.length < count) {
    let placed = false;
    for (const k of keys) {
      if (!left[k] || !pools[k].length) continue;
      ids.push(pools[k].pop());
      left[k]--;
      placed = true;
      if (ids.length >= count) break;
    }
    if (!placed) break;
  }
  return ids;
}

/** Cluster keys used by people.js households. Hasidic alone; eu/arab/african mix. */
export const LOOK_CLUSTER = {
  european: "eu",
  slavic: "eu",
  mediterranean: "eu",
  african: "african",
  african_street: "african",
  asian: "asian",
  muslim: "muslim",
  arab: "muslim",
  arab_young: "muslim",
  hasidic: "hasidic",
};

const DISTRICT_DEFAULTS = {
  "2018-harmonie": { looks: HARMONIE_MIX, hotspots: [] },
  "2000-antwerpen": { looks: OTHER_MIX, hotspots: [] },
};

function pickWeighted(weights) {
  let total = 0;
  for (const w of Object.values(weights)) total += Math.max(0, w);
  if (total <= 0) return "european";
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

/**
 * @param {object} district district.json (or { id, origin, population })
 */
export function createPopulation(district = {}) {
  const id = district.id || district.districtId || "";
  // District-wide. A published hotspot must not put a Jewish character in 2000
  // or pull the 2018 mix off 50 / 5 / 45.
  const looks = mixForDistrict(id);
  const hotspots = [];

  function looksAt() {
    const weights = { ...looks };
    if (id !== JEWISH_DISTRICT) weights.hasidic = 0;
    return weights;
  }

  function pickLook() {
    const look = pickWeighted(looksAt());
    if (look === "hasidic" && id !== JEWISH_DISTRICT) return "european";
    return look;
  }

  /**
   * Hour rules for who may spawn.
   * @returns {{ allowChildren, femaleShare, bakfietsMult, density, youngMaleBias }}
   */
  function hourRules(hour) {
    const h = ((hour % 24) + 24) % 24;
    const day = h >= 6 && h < 17;
    const evening = h >= 17 && h < 22;
    const night = h >= 22 || h < 6;
    const schoolRun = h >= 15 && h < 17;
    let density = 1;
    if (h >= 7 && h < 9) density = 1.15;
    else if (h >= 11 && h < 14) density = 1.05;
    else if (schoolRun) density = 1.25;
    else if (evening) density = 0.7;
    else if (night) density = 0.35;
    else if (h >= 5 && h < 7) density = 0.45;

    return {
      allowChildren: day, // 06:00–17:00
      femaleShare: day ? 0.5 : evening ? 0.35 : 0.25,
      bakfietsMult: schoolRun ? 3.0 : h >= 17 && h < 18 ? 0.4 : 1.0,
      density,
      youngMaleBias: night ? 1.6 : evening ? 1.2 : 1.0,
      schoolRun,
    };
  }

  /**
   * Mode weights for a person (walk / bike / bakfiets / step).
   */
  function modeWeights(look, age, sex, hour) {
    const rules = hourRules(hour);
    const w = { walk: 1, bike: 0.35, bakfiets: 0.08, step: 0.18 };
    if (age === "senior") {
      w.bike = 0.08;
      w.step = 0.02;
      w.bakfiets = 0.02;
    }
    if (age === "child") {
      return { walk: 1, bike: 0.05, bakfiets: 0, step: 0 }; // kids walk or ride in a box
    }
    if (look === "hasidic") {
      w.bike = sex === "m" ? 0.55 : 0.1;
      w.step = 0.02;
      w.bakfiets = sex === "f" && rules.allowChildren ? 0.25 : 0.05;
      w.walk = sex === "f" ? 1.2 : 0.7;
    }
    if (look === "arab_young" || look === "african_street") {
      w.step = 0.55;
      w.bike = 0.35;
      w.walk = 0.7;
    }
    if (look === "arab" || look === "muslim") {
      w.bike = 0.4;
      w.step = 0.25;
    }
    w.bakfiets *= rules.bakfietsMult;
    if (!rules.allowChildren) w.bakfiets *= 0.15;
    return w;
  }

  function pickMode(look, age, sex, hour) {
    return pickWeighted(modeWeights(look, age, sex, hour));
  }

  /**
   * Household kind weights given look + hour.
   */
  function householdWeights(look, hour) {
    const rules = hourRules(hour);
    const cluster = LOOK_CLUSTER[look] || look;
    if (cluster === "hasidic") {
      return {
        hasidic: rules.allowChildren ? 40 : 18,
        couple: 12,
        single: 20,
        seniors: 8,
        friends: 6,
      };
    }
    if (cluster === "muslim") {
      return {
        muslimFamily: rules.allowChildren ? 28 : 10,
        couple: 14,
        single: 22,
        friends: 16,
        parentChild: rules.allowChildren ? 10 : 0,
        seniors: 4,
      };
    }
    const w = {
      single: 28,
      couple: 16,
      family: rules.allowChildren ? 14 : 0,
      parentChild: rules.allowChildren ? 9 : 0,
      friends: 12,
      seniors: 6,
      kids: rules.allowChildren ? 3 : 0,
    };
    // Night: fewer couples/families, more singles/friends (young men).
    if (!rules.allowChildren) {
      w.single *= 1.4 * rules.youngMaleBias;
      w.friends *= 1.3 * rules.youngMaleBias;
      w.couple *= 0.7;
    }
    return w;
  }

  return {
    id,
    looks,
    hotspots,
    looksAt,
    pickLook,
    hourRules,
    modeWeights,
    pickMode,
    householdWeights,
    cluster: (look) => LOOK_CLUSTER[look] || look,
  };
}

export { DEFAULT_MIX, DISTRICT_DEFAULTS };
