/**
 * One wanted meter, 0–4 pips, one active pursuer.
 * Police heat is the only thing the player can trigger. A faction chase starts
 * only through startFactionPursuit — nothing in the street selects a clan.
 */

export const SIGNS = {
  police: "signs/heat-police.svg",
  hassidic: "signs/clan-hassidic.svg",
  flemish: "signs/clan-flemish.svg",
  arab: "signs/clan-arab.svg",
};

const FACTIONS = new Set(["hassidic", "flemish", "arab"]);
const DECAY_S = 30;

export function createWanted() {
  let level = 0;
  let clan = null;
  let hiddenFor = 0;
  let onChange = null;

  function emit() {
    if (onChange) onChange({ level, clan, sign: clan ? SIGNS[clan] : null });
  }

  function clear() {
    if (level === 0 && !clan) return;
    level = 0;
    clan = null;
    hiddenFor = 0;
    emit();
  }

  /** A police unit saw a crime. Starts police heat at 1 if the meter is empty. */
  function witnessPolice() {
    if (clan && clan !== "police") return false;
    if (level > 0) return true;
    clan = "police";
    level = 1;
    hiddenFor = 0;
    emit();
    return true;
  }

  /** Killing an officer or a crew member. Uses the active pursuer, or police if none. */
  function addStar(from) {
    const next = clan || (from === "police" || FACTIONS.has(from) ? from : null);
    if (!next || !SIGNS[next]) return;
    clan = next;
    level = Math.min(4, level + 1);
    hiddenFor = 0;
    emit();
  }

  /**
   * Mission hook. Unknown clans do nothing. Never called by a player action.
   * @param {{ clan?: string, stars?: number }} opts
   */
  function startFactionPursuit(opts = {}) {
    const id = opts.clan;
    if (!FACTIONS.has(id)) return false;
    const stars = Number(opts.stars);
    clan = id;
    level = Math.max(1, Math.min(4, Number.isFinite(stars) ? stars : 1));
    hiddenFor = 0;
    emit();
    return true;
  }

  /** `seen` is true while any unit of the active pursuer has line of sight. */
  function tick(dt, seen) {
    if (level <= 0) return;
    if (seen) {
      hiddenFor = 0;
      return;
    }
    hiddenFor += dt;
    if (hiddenFor < DECAY_S) return;
    hiddenFor = 0;
    level -= 1;
    if (level <= 0) {
      level = 0;
      clan = null;
    }
    emit();
  }

  return {
    witnessPolice,
    addStar,
    startFactionPursuit,
    tick,
    clear,
    setOnChange(fn) {
      onChange = typeof fn === "function" ? fn : null;
    },
    get level() {
      return level;
    },
    get clan() {
      return clan;
    },
    get sign() {
      return clan ? SIGNS[clan] : null;
    },
  };
}
