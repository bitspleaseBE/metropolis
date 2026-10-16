/**
 * Play-time gates for the district map.
 *
 * Antwerpen (2000) and Klein Antwerpen (2018) are always open. The belt
 * (Kiel, Noord, Borgerhout) opens after a few minutes in each of those.
 * Linkeroever, the port, and any later district open after a few minutes
 * in one belt district. Packages stay `unlocked: true` in districts/index.json
 * so a rebuild does not wipe the campaign; this module is the lock.
 */

export const STORAGE_KEY = "metropolis.districtPlay.v1";
export const HOME = "2018-harmonie";
export const STARTER = ["2000-antwerpen", "2018-harmonie"];
export const BELT = ["2020-kiel", "2060-noord", "2140-borgerhout"];
/** Seconds of walking in each starter district before the belt opens. */
export const STARTER_GATE_S = 180;
/** Seconds in any one belt district before the rest of the city opens. */
export const BELT_GATE_S = 180;

const NAME = {
  "2000-antwerpen": "Antwerpen",
  "2018-harmonie": "Klein Antwerpen",
  "2020-kiel": "'t Kiel",
  "2060-noord": "Noord",
  "2140-borgerhout": "Borgerhout",
  "2050-linkeroever": "Linkeroever",
  "2030-haven": "the port",
};

export function emptyPlay() {
  return { seconds: {} };
}

export function played(play, id) {
  const n = play && play.seconds ? play.seconds[id] : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function defaultStorage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

export function loadPlay(storage = defaultStorage()) {
  if (!storage) return emptyPlay();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyPlay();
    const doc = JSON.parse(raw);
    const seconds = {};
    if (doc && typeof doc.seconds === "object" && doc.seconds) {
      for (const [id, value] of Object.entries(doc.seconds)) {
        if (typeof id !== "string" || id.length > 64) continue;
        if (!Number.isFinite(value) || value < 0 || value > 1e7) continue;
        seconds[id] = value;
      }
    }
    return { seconds };
  } catch {
    return emptyPlay();
  }
}

export function savePlay(play, storage = defaultStorage()) {
  if (!storage || !play) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ seconds: play.seconds || {} }));
  } catch {
    /* quota / private mode */
  }
}

/** Add played time. One call never counts more than a second, so a stalled tab cannot unlock a district. */
export function recordPlay(play, id, dt) {
  const step = Number(dt);
  if (!id || !(step > 0)) return play || emptyPlay();
  const base = play && play.seconds ? play.seconds : {};
  const prev = played({ seconds: base }, id);
  if (prev >= 1e7) return { seconds: base };
  return { seconds: { ...base, [id]: Math.min(1e7, prev + Math.min(step, 1)) } };
}

/** Set played seconds directly (saves, tests). Frame ticks go through recordPlay. */
export function setPlayed(play, id, seconds) {
  const n = Number(seconds);
  if (!id || !Number.isFinite(n) || n < 0) return play || emptyPlay();
  const base = play && play.seconds ? play.seconds : {};
  return { seconds: { ...base, [id]: Math.min(1e7, n) } };
}

export function startersReady(play) {
  return STARTER.every((id) => played(play, id) >= STARTER_GATE_S);
}

export function beltReady(play) {
  return BELT.some((id) => played(play, id) >= BELT_GATE_S);
}

/** "starter" | "belt" | "city" — how far the map has opened. */
export function gateName(play) {
  if (beltReady(play)) return "city";
  if (startersReady(play)) return "belt";
  return "starter";
}

export function isUnlocked(play, id) {
  if (!id || STARTER.includes(id)) return true;
  if (!startersReady(play)) return false;
  if (BELT.includes(id)) return true;
  return beltReady(play);
}

/** Neighbour chunk streams. Locked districts stay off so the belt does not cost frames. */
export function streamableNeighbours(ids, play) {
  return (ids || []).filter((id) => isUnlocked(play, id));
}

function formatRemain(seconds) {
  const sec = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min <= 0) return `${sec}s`;
  if (rem === 0) return `${min} min`;
  return `${min} min ${rem}s`;
}

export function lockReason(play, id) {
  if (isUnlocked(play, id)) return "";
  if (!startersReady(play)) {
    const left = STARTER.map((sid) => {
      const need = STARTER_GATE_S - played(play, sid);
      return need > 0 ? `${formatRemain(need)} in ${NAME[sid] || sid}` : null;
    }).filter(Boolean);
    return left.length ? `Play ${left.join(" and ")}` : "Play Antwerpen and Klein Antwerpen";
  }
  let best = BELT_GATE_S;
  for (const bid of BELT) best = Math.min(best, Math.max(0, BELT_GATE_S - played(play, bid)));
  return `Spend ${formatRemain(best)} in 't Kiel, Noord, or Borgerhout`;
}

/**
 * Session clock. Saves every few seconds and when a gate opens.
 * `tick` returns the new gate name when the map just opened, otherwise null.
 */
export function createPlayClock(storage = defaultStorage()) {
  let play = loadPlay(storage);
  let pending = 0;
  return {
    get play() {
      return play;
    },
    tick(id, dt) {
      const before = gateName(play);
      play = recordPlay(play, id, dt);
      const after = gateName(play);
      pending += Number(dt) > 0 ? Math.min(Number(dt), 1) : 0;
      if (after !== before || pending >= 5) {
        savePlay(play, storage);
        pending = 0;
      }
      return after !== before ? after : null;
    },
    flush() {
      savePlay(play, storage);
      pending = 0;
    },
  };
}
