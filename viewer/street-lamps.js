/**
 * The district packages ship no lamp posts (the build skipped them when it
 * thought OSM already had lanterns). Place a short row on the pavement,
 * instanced, and hand the head positions to the night lights.
 */

export const LAMP_SPACING = 32;
export const LAMP_REACH = 170;
export const LAMP_MAX = 64;
export const HEAD_Y = 4.52;

function tooClose(list, x, z, gap) {
  const g2 = gap * gap;
  for (let i = 0; i < list.length; i++) {
    const dx = list[i].x - x;
    const dz = list[i].z - z;
    if (dx * dx + dz * dz < g2) return true;
  }
  return false;
}

/**
 * Pavement sites beside road centrelines. `roads[].points` are Blender XY.
 * `spawn` is the roads.json spawn, also Blender XY. Returned positions are Three.js.
 */
export function lampSites(roads, opts = {}) {
  const spacing = opts.spacing ?? LAMP_SPACING;
  const inset = opts.inset ?? 10;
  const curb = opts.curb ?? 0.95;
  const minGap = opts.minGap ?? 14;
  const reach = opts.reach ?? LAMP_REACH;
  const max = opts.max ?? LAMP_MAX;
  const spawn = opts.spawn;
  const ox = spawn ? spawn.x : null;
  const oz = spawn ? -spawn.y : null;
  const sites = [];
  for (const road of roads || []) {
    const pts = road.points || [];
    if (pts.length < 2) continue;
    const half = (Number(road.width) || 6) * 0.5;
    const off = half + curb;
    let carry = spacing * 0.45;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0];
      const az = -pts[i][1];
      const bx = pts[i + 1][0];
      const bz = -pts[i + 1][1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;
      const nz = ux;
      let d = spacing - carry;
      if (d < 0) d = 0;
      while (d <= len) {
        const endPad = Math.min(inset, len * 0.2);
        if (d >= endPad && d <= len - endPad) {
          const x = ax + ux * d + nx * off;
          const z = az + uz * d + nz * off;
          const far = ox != null && Math.hypot(x - ox, z - oz) > reach;
          if (!far && !tooClose(sites, x, z, minGap)) {
            sites.push({ x, z, yaw: Math.atan2(uz, ux), nx, nz, y: HEAD_Y });
          }
        }
        d += spacing;
      }
      carry = (carry + len) % spacing;
    }
  }
  if (ox != null && sites.length > max) {
    sites.sort((p, q) => (p.x - ox) ** 2 + (p.z - oz) ** 2 - ((q.x - ox) ** 2 + (q.z - oz) ** 2));
    sites.length = max;
  }
  return sites;
}

/** Two instanced meshes. Heads are named for the night-glow pass. */
export function attachStreetLamps(THREE, parent, sites) {
  if (!THREE || !parent || !sites || !sites.length) return { count: 0, heads: [], material: null };
  const poleGeo = new THREE.BoxGeometry(0.1, 4.6, 0.1);
  const headGeo = new THREE.BoxGeometry(0.48, 0.14, 0.26);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2e30 });
  poleMat.name = "lamp_pole";
  const headMat = new THREE.MeshLambertMaterial({
    color: 0xc8c2b4,
    emissive: new THREE.Color(1, 0.9, 0.62),
    emissiveIntensity: 0,
  });
  headMat.name = "lamp_head";
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, sites.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, sites.length);
  poles.name = "street_lamp_poles";
  heads.name = "street_lamp_heads";
  poles.castShadow = false;
  heads.castShadow = false;
  poles.receiveShadow = false;
  heads.receiveShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    pos.set(s.x, 2.3, s.z);
    m.makeTranslation(pos.x, pos.y, pos.z);
    poles.setMatrixAt(i, m);
    q.setFromAxisAngle(up, s.yaw);
    const hx = s.x - s.nx * 0.32;
    const hz = s.z - s.nz * 0.32;
    pos.set(hx, s.y, hz);
    m.compose(pos, q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m);
    out.push({ x: hx, y: s.y, z: hz });
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (poles.computeBoundingSphere) poles.computeBoundingSphere();
  if (heads.computeBoundingSphere) heads.computeBoundingSphere();
  parent.add(poles, heads);
  return { count: sites.length, heads: out, material: headMat };
}
