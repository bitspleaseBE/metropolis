/**
 * Trip follower helpers for pedestrians.js — A* path progress, crossing waits,
 * lifetime despawn. Keeps the big pedestrians module thinner.
 */

/**
 * Attach a trip to a household group. Leader follows the path; members keep formation.
 */
export function assignTrip(group, trip, pedGraph) {
  if (!trip?.path) return false;
  group.trip = trip;
  group.tripS = 0;
  group.tripGraph = pedGraph;
  group.state = "Walk";
  const sample = pedGraph.samplePath(trip.path, 0);
  for (const m of group.members) {
    m.tripS = 0;
    m.state = "Walk";
    m.routeX = sample.x;
    m.routeZ = sample.z;
  }
  return true;
}

/**
 * Advance the household along its A* path. Returns 'continue' | 'wait' | 'done'.
 */
export function advanceTrip(group, dt, { crossingOk = () => true, speed = 1.25 } = {}) {
  const trip = group.trip;
  const graph = group.tripGraph;
  if (!trip?.path || !graph) return "done";

  trip.age = (trip.age || 0) + dt;
  if (trip.age >= trip.lifetime) return "done";

  const lead = group.members[0];
  if (!lead || lead.down) return "continue";

  // Waiting at a signalised crossing kerb.
  const ahead = graph.samplePath(trip.path, group.tripS + 0.8);
  if (ahead.kind === "crossing" && ahead.signal && ahead.routeId != null) {
    const onKerb = graph.samplePath(trip.path, group.tripS);
    if (onKerb.kind !== "crossing" && !crossingOk(ahead.routeId)) {
      group.state = "WaitCrossing";
      for (const m of group.members) {
        m.state = "WaitCrossing";
        m.waiting = true;
      }
      return "wait";
    }
  }

  group.state = ahead.kind === "crossing" ? "Cross" : "Walk";
  const step = speed * dt;
  group.tripS += step;
  if (group.tripS >= trip.path.length - 0.3) {
    // Arrived.
    group.state = "Despawn";
    return "done";
  }

  for (let mi = 0; mi < group.members.length; mi++) {
    const m = group.members[mi];
    if (m.down) continue;
    m.waiting = false;
    m.state = group.state;
    // Formation: rows of two, second row a step behind.
    const row = mi >> 1;
    const lateral = Math.min(2, group.members.length - row * 2) === 2 ? ((mi & 1) - 0.5) * 0.5 : 0;
    const along = group.tripS - row * 0.95;
    const sample = graph.samplePath(trip.path, Math.max(0, along));
    const nx = -sample.tz;
    const nz = sample.tx;
    const side = (m.side || 0) + lateral * 0.15;
    m.routeX = sample.x + nx * side;
    m.routeZ = sample.z + nz * side;
    m.headingX = sample.tx;
    m.headingZ = sample.tz;
    m.onCrossing = sample.kind === "crossing";
    m.crossingId = sample.routeId;
  }
  return "continue";
}

/** Preferred velocity toward the next trip sample (for ORCA). */
export function preferredVelocity(m, speed = 1.25) {
  if (m.waiting || m.down) return { x: 0, z: 0 };
  const hx = m.headingX || 0;
  const hz = m.headingZ || 1;
  const len = Math.hypot(hx, hz) || 1;
  return { x: (hx / len) * speed, z: (hz / len) * speed };
}
