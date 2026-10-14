/**
 * Where in its lane a crowd rider rides. Riders hold their line but drift sideways, a little
 * past the paved edge if they must, to get by a slower rider, someone standing in the lane,
 * a wreck, or an oncoming rider on the same line. They pass on the left and keep right for
 * oncoming traffic. No Three dependency, so scripts/test_ride_line.mjs drives it headless.
 */

export const HALF_W = 0.35; // m: a rider's half width at the bars and shoulders
const CLEAR = 0.3; // m of side gap a rider wants when going by
const TOUCH = 0.1; // m of side gap below which riding on would hit them
const STOP_GAP = 0.7; // m nose to tail when queued
const HEADWAY = 0.5; // s behind a rider being followed
const PASS_MAX = 1.5; // m: furthest a rider pulls out to get by
const OFF_EDGE = 0.25; // m a rider's centre may leave the paved edge
const STEP = 0.25; // m between candidate lines
const COST_NEAR = 0.5; // m/s given up per m off the line on the usual side (left to pass, right for oncoming)
const COST_FAR = 0.9; // m/s per m on the other side
const SWITCH = 0.15; // m/s a new line has to beat the current aim by
const BEHIND = 1; // m past someone before cutting back in
const REAR = 3; // m: a faster rider this close behind blocks pulling across
const MEET_MIN = 1.5; // s: an oncoming rider on the line this soon means stop
const MEET_FREE = 6; // s: one further out leaves time to finish a pass
const LAT_MIN = 0.5; // m/s sideways at a standstill (a shuffle)
const LAT_PER = 0.4; // extra m/s sideways per m/s of speed
const LAT_EASE = 2.5; // 1/s

/** How far a rider may leave its line on each side of a cycle path ({ width, bikeOffset }). */
export function lineRoom(path) {
  const half = (path.width || 2.4) / 2;
  const off = path.bikeOffset || 0;
  const side = (edge) => Math.max(0.3, Math.min(PASS_MAX, edge - HALF_W + OFF_EDGE));
  return { left: side(half + off), right: side(half - off) };
}

// Nearby things in the rider's frame, reused between calls.
const A = []; // along the rider's heading, centre to centre
const L = []; // sideways from the rider's lane line (+ = right)
const EA = []; // half extent along the heading
const EL = []; // half extent sideways
const U = []; // speed along the rider's heading (< 0 = oncoming)

function speedOn(me, n, k, line, margin) {
  let v = me.speed;
  for (let i = 0; i < n; i++) {
    if (A[i] <= 0) continue;
    if (Math.abs(L[i] - line) >= EL[i] + HALF_W + margin) continue;
    const gap = A[i] - EA[i] - me.hl;
    const u = U[i];
    let free;
    if (u >= 0) free = u + k * (gap - STOP_GAP - HEADWAY * u);
    else {
      // Oncoming: the stopping distance, and how soon we would meet on this line.
      const meet = Math.max(0, gap - STOP_GAP) / (Math.max(me.cur, me.speed * 0.5) - u);
      const soon = me.speed * Math.min(1, Math.max(0, (meet - MEET_MIN) / (MEET_FREE - MEET_MIN)));
      free = Math.min(k * (gap - STOP_GAP) + u, soon);
    }
    if (free < v) v = Math.max(0, free);
  }
  return v;
}

/** False when someone beside (or a faster rider just behind) is in the way of sliding to `line`. */
function reachable(me, n, line) {
  const from = me.line;
  if (Math.abs(line - from) < 1e-3) return true;
  for (let i = 0; i < n; i++) {
    const a = A[i];
    const span = EA[i] + me.hl;
    if (a > span + TOUCH * 3) continue;
    if (a < -(span + BEHIND) && !(a > -(span + REAR) && U[i] > me.cur + 0.5)) continue;
    const need = EL[i] + HALF_W + TOUCH;
    const l = L[i];
    if (line > from ? l > from && l - need < line : l < from && l + need > line) return false;
  }
  return true;
}

/**
 * Pick the line to steer for and the speed allowed on the way there.
 *
 * me: { x, z, tx, tz, line, aim, speed, cur, hl, look }
 *   x, z: centre of the rider's footprint; tx, tz: unit heading; line: sideways offset from
 *   the lane line now (+ = right); aim: the line picked last frame; speed: cruising speed;
 *   cur: speed now; hl: half length; look: how far ahead to plan (m).
 * things: [{ x, z, tx, tz, hl, hw, v, line }]: other riders, people, wrecks, vehicles. Things
 *   with no heading (tx = tz = 0) are round, radius max(hl, hw). v: speed along their own
 *   heading; line: a rider's own offset from its lane line (+ = its right), 0 for the rest.
 * room: { left, right } from lineRoom().
 */
export function chooseLine(me, things, room, out = { aim: 0, speed: 0 }) {
  const tx = me.tx;
  const tz = me.tz;
  const nx = -tz;
  const nz = tx;
  let n = 0;
  let oncoming = false;
  for (let i = 0; i < things.length; i++) {
    const o = things[i];
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    const a = dx * tx + dz * tz;
    const otx = o.tx || 0;
    const otz = o.tz || 0;
    const cos = otx * tx + otz * tz;
    let ea;
    let el;
    if (otx || otz) {
      const sin = Math.abs(otx * nx + otz * nz);
      ea = o.hl * Math.abs(cos) + o.hw * sin;
      el = o.hl * sin + o.hw * Math.abs(cos);
    } else {
      ea = el = Math.max(o.hl, o.hw);
    }
    const u = (o.v || 0) * cos;
    // Oncoming riders count from as far off as a pass would take to finish.
    const range = u < 0 ? Math.max(me.look, (me.speed - u) * MEET_FREE) : me.look;
    if (a > range + ea || a < -(ea + me.hl + REAR)) continue;
    let l = dx * nx + dz * nz + me.line;
    if (u < 0 && o.line < 0) {
      // An oncoming rider out passing will cut back in: it fills the gap to its own line too.
      l += o.line / 2;
      el -= o.line / 2;
    }
    if (l < -room.left - el - 1 || l > room.right + el + 1) continue;
    A[n] = a;
    L[n] = l;
    EA[n] = ea;
    EL[n] = el;
    U[n] = u;
    n++;
    if (u < -0.5 && a > 0) oncoming = true;
  }

  if (!n) {
    out.aim = 0;
    out.speed = me.speed;
    return out;
  }

  const lo = -room.left;
  const hi = room.right;
  const k = me.speed / Math.max(1, me.look - STOP_GAP);
  const score = (line) => {
    const cost = line < 0 !== oncoming ? COST_NEAR : COST_FAR;
    return 0.5 * (speedOn(me, n, k, line, CLEAR) + speedOn(me, n, k, line, TOUCH)) - Math.abs(line) * cost;
  };

  let best = me.line;
  let bestScore = score(me.line);
  const aim = Math.max(lo, Math.min(hi, me.aim || 0));
  if (reachable(me, n, aim)) {
    const s = score(aim) + SWITCH;
    if (s >= bestScore) {
      best = aim;
      bestScore = s;
    }
  }
  const first = Math.ceil(lo / STEP - 1e-6);
  const last = Math.floor(hi / STEP + 1e-6);
  for (let j = first - 1; j <= last + 1; j++) {
    const line = j < first ? lo : j > last ? hi : j * STEP;
    if (!reachable(me, n, line)) continue;
    const s = score(line);
    if (s > bestScore) {
      bestScore = s;
      best = line;
    }
  }

  out.aim = best;
  const ahead = 0.5 * (speedOn(me, n, k, best, CLEAR) + speedOn(me, n, k, best, TOUCH));
  out.speed = Math.min(ahead, speedOn(me, n, k, me.line, TOUCH));
  return out;
}

/** Slide `line` toward `aim` for one frame: brisk at speed, a shuffle when stopped. */
export function stepLine(line, aim, speed, dt) {
  const rate = (LAT_MIN + LAT_PER * Math.max(0, speed)) * dt;
  const want = (aim - line) * Math.min(1, dt * LAT_EASE);
  return line + Math.max(-rate, Math.min(rate, want));
}
