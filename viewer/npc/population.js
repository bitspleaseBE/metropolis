/**
 * District population mix, hotspots, and hour-of-day rules for NPC spawning.
 *
 * Looks: european, slavic, mediterranean, african, african_street, asian,
 * muslim, arab, arab_young, hasidic.
 */

const DEFAULT_MIX = {
  european: 0.4,
  slavic: 0.05,
  mediterranean: 0.05,
  african: 0.08,
  african_street: 0.04,
  asian: 0.05,
  muslim: 0.1,
  arab: 0.05,
  arab_young: 0.05,
  hasidic: 0.13,
};

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
  "2018-harmonie": {
    looks: {
      european: 0.3,
      slavic: 0.03,
      mediterranean: 0.04,
      african: 0.06,
      african_street: 0.04,
      asian: 0.03,
      muslim: 0.12,
      arab: 0.04,
      arab_young: 0.04,
      hasidic: 0.28,
      other: 0.02,
    },
    hotspots: [
      // Centraal Station / Pelikaanstraat approach — more arab & african.
      {
        label: "centraal",
        lat: 51.2172,
        lon: 4.4211,
        radiusM: 280,
        looks: { arab: 1.8, arab_young: 2.2, african: 1.6, african_street: 1.8, hasidic: 0.7 },
      },
      // Diamond quarter / Hasidic belt.
      {
        label: "diamonds",
        lat: 51.2125,
        lon: 4.4185,
        radiusM: 220,
        looks: { hasidic: 2.4, muslim: 0.6, arab: 0.5, european: 0.7 },
      },
    ],
  },
  "2000-antwerpen": {
    looks: {
      european: 0.55,
      slavic: 0.08,
      mediterranean: 0.05,
      african: 0.08,
      african_street: 0.04,
      asian: 0.07,
      muslim: 0.06,
      arab: 0.03,
      arab_young: 0.03,
      hasidic: 0.01,
    },
    hotspots: [
      // Groenplaats — almost no Hasidic.
      {
        label: "groenplaats",
        lat: 51.2188,
        lon: 4.4019,
        radiusM: 180,
        looks: { hasidic: 0.05, european: 1.3, asian: 1.4, slavic: 1.3 },
      },
      // Near Centraal / Meir east — more diverse.
      {
        label: "meir-east",
        lat: 51.2185,
        lon: 4.415,
        radiusM: 200,
        looks: { arab: 1.5, african: 1.4, hasidic: 1.2 },
      },
    ],
  },
};

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Approximate Blender XY → lat/lon using district origin. */
function xzToLatLon(x, z, origin) {
  // Blender: x = easting (m), y = northing (m); Three z = -y.
  const lat0 = origin[0];
  const lon0 = origin[1];
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const north = -z;
  const east = x;
  return { lat: lat0 + north / mPerDegLat, lon: lon0 + east / mPerDegLon };
}

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
  const id = district.id || district.districtId || "2018-harmonie";
  const preset = DISTRICT_DEFAULTS[id] || { looks: DEFAULT_MIX, hotspots: [] };
  const pop = district.population || {};
  const looks = { ...(preset.looks || DEFAULT_MIX), ...(pop.looks || {}) };
  const hotspots = pop.hotspots || preset.hotspots || [];
  const origin = district.origin || [51.2017, 4.4114];

  function looksAt(x, z) {
    const weights = { ...looks };
    delete weights.other;
    if (hotspots.length && Number.isFinite(x) && Number.isFinite(z)) {
      const { lat, lon } = xzToLatLon(x, z, origin);
      for (const h of hotspots) {
        const d = haversineM(lat, lon, h.lat, h.lon);
        if (d > (h.radiusM || 200)) continue;
        const t = 1 - d / (h.radiusM || 200);
        for (const [k, m] of Object.entries(h.looks || {})) {
          if (weights[k] == null) weights[k] = 0.02;
          // Blend multiplier toward 1 at the edge.
          const mult = 1 + (m - 1) * t;
          weights[k] *= mult;
        }
      }
    }
    return weights;
  }

  function pickLook(x, z) {
    return pickWeighted(looksAt(x, z));
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
