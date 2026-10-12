/**
 * Lightweight ORCA-style pedestrian avoidance (JS fallback when recast WASM
 * is unavailable). Neighbours come from a cell grid; each agent gets a preferred
 * velocity toward its next waypoint and a corrected velocity that avoids others.
 */

const TAU = 1.1; // time horizon (s)
const MAX_SPEED = 1.8;
const EPS = 1e-5;

/**
 * @param {{ x, z, vx, vz, r, prefX, prefZ, maxSpeed? }} agent
 * @param {Array<{ x, z, vx, vz, r }>} neighbours
 * @returns {{ vx: number, vz: number }}
 */
export function orcaVelocity(agent, neighbours) {
  const maxSpeed = agent.maxSpeed ?? MAX_SPEED;
  let prefX = agent.prefX;
  let prefZ = agent.prefZ;
  const prefLen = Math.hypot(prefX, prefZ);
  if (prefLen > maxSpeed && prefLen > EPS) {
    prefX = (prefX / prefLen) * maxSpeed;
    prefZ = (prefZ / prefLen) * maxSpeed;
  }

  // Half-planes: each neighbour forbids velocities that collide within TAU.
  const planes = [];
  for (const o of neighbours) {
    const dx = o.x - agent.x;
    const dz = o.z - agent.z;
    const relVx = agent.vx - o.vx;
    const relVz = agent.vz - o.vz;
    const distSq = dx * dx + dz * dz;
    const combined = (agent.r || 0.3) + (o.r || 0.3);
    const combinedSq = combined * combined;

    let nx;
    let nz;
    let u;
    if (distSq > combinedSq) {
      // No overlap yet — cut velocities that would hit within TAU.
      const wX = relVx * TAU - dx;
      const wZ = relVz * TAU - dz;
      const wLenSq = wX * wX + wZ * wZ;
      const wLen = Math.sqrt(wLenSq) || EPS;
      const dot = wX * dx + wZ * dz;
      if (dot < 0 && dot * dot > combinedSq * wLenSq) {
        // Project on cut-off circle.
        const wUnitX = wX / wLen;
        const wUnitZ = wZ / wLen;
        nx = wUnitX;
        nz = wUnitZ;
        u = (combined / TAU - wLen) ;
        // Velocity obstacle half-plane relative to preferred: u * n on relative vel.
        planes.push({
          px: agent.vx + 0.5 * (u * nx - relVx + (relVx - u * nx)),
          pz: agent.vz + 0.5 * (u * nz - relVz + (relVz - u * nz)),
          // Simpler: push preferred velocity away from neighbour.
          nx: dx / (Math.sqrt(distSq) || 1),
          nz: dz / (Math.sqrt(distSq) || 1),
          // Distance into the forbidden cone.
          offset: Math.max(0, combined + 0.05 - Math.sqrt(distSq)) / TAU,
        });
        continue;
      }
      // Leg of VO.
      const leg = Math.sqrt(Math.max(0, distSq - combinedSq)) || EPS;
      if (dx * wZ - dz * wX > 0) {
        nx = (dx * leg + dz * combined) / distSq;
        nz = (dz * leg - dx * combined) / distSq;
      } else {
        nx = -(dx * leg - dz * combined) / distSq;
        nz = -(dz * leg + dx * combined) / distSq;
      }
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      u = relVx * nx + relVz * nz;
      planes.push({
        nx,
        nz,
        offset: Math.max(0, -u) * 0.5,
      });
    } else {
      // Already overlapping — push hard apart.
      const d = Math.sqrt(distSq) || EPS;
      nx = dx / d;
      nz = dz / d;
      planes.push({ nx, nz, offset: (combined - d) / 0.2 });
    }
  }

  let vx = prefX;
  let vz = prefZ;
  for (const p of planes) {
    const viol = vx * p.nx + vz * p.nz - (p.offset || 0);
    // Preferred already points toward goal; if it violates, slide along the plane.
    if (viol < 0) {
      vx -= viol * p.nx;
      vz -= viol * p.nz;
    }
  }
  // Soft separation: nudge away from close neighbours.
  for (const o of neighbours) {
    const dx = agent.x - o.x;
    const dz = agent.z - o.z;
    const d = Math.hypot(dx, dz) || EPS;
    const combined = (agent.r || 0.3) + (o.r || 0.3) + 0.15;
    if (d < combined) {
      const push = ((combined - d) / combined) * 0.6;
      vx += (dx / d) * push;
      vz += (dz / d) * push;
    }
  }
  const sp = Math.hypot(vx, vz);
  if (sp > maxSpeed) {
    vx = (vx / sp) * maxSpeed;
    vz = (vz / sp) * maxSpeed;
  }
  return { vx, vz };
}

/**
 * Step every agent one frame.
 * agents: [{ x, z, vx, vz, r, prefX, prefZ, maxSpeed }]
 * Returns same array with updated vx/vz (caller integrates position).
 */
export function stepOrca(agents, dt, cellQuery) {
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.frozen) continue;
    const near = cellQuery ? cellQuery(a.x, a.z, 4.0) : agents;
    const neighbours = [];
    for (const o of near) {
      if (o === a || o.frozen) continue;
      const d2 = (o.x - a.x) ** 2 + (o.z - a.z) ** 2;
      if (d2 < 16) neighbours.push(o);
    }
    const v = orcaVelocity(a, neighbours);
    // Smooth a little so they don't jitter.
    const k = Math.min(1, dt * 6);
    a.vx += (v.vx - a.vx) * k;
    a.vz += (v.vz - a.vz) * k;
  }
  return agents;
}
