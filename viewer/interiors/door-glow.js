/**
 * Warm light leaking under and through the doors of enterable shops after dark.
 *
 * One InstancedMesh for every enterable door in the district (not tied to the shopfront
 * detail radius): a bright sliver along the threshold and a soft fan on the pavement in front.
 * Open shops glow at night; closed and locked ones stay dark. Additive with no depth write, so
 * it lies on the pavement without z-fighting or shadow cost.
 */
import { PAVEMENT_Y } from "../pavement-frontage.js";

const SPILL_W = 1.5;
const SPILL_D = 1.2;
const DOOR_Z = 0.3; // the shopfront door plane (shops.js GLASS_OUT ~ 0.28)

function spillTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // v: 0 at the threshold → 1 at the far edge; u across the door.
      const u = (x + 0.5) / 64 - 0.5;
      const v = (y + 0.5) / 64;
      const fan = Math.max(0, 1 - Math.abs(u) / (0.28 + 0.22 * v));
      const a = Math.pow(fan, 1.2) * Math.pow(1 - v, 1.5) + (v < 0.06 ? (1 - v / 0.06) * Math.max(0, 1 - Math.abs(u) * 3) : 0);
      const k = (y * 64 + x) * 4;
      const val = Math.round(Math.min(1, a) * 255);
      img.data[k] = val;
      img.data[k + 1] = val;
      img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param entries interior entries ({ fx, fz, gy, theta, doorX, shop, rec }) from interior-manager
 */
export function createDoorGlow(THREE, scene, entries) {
  const list = entries.filter((e) => !e.rec.locked);
  if (!list.length) return { update() {}, setNight() {}, mesh: null };
  const geo = new THREE.PlaneGeometry(SPILL_W, SPILL_D);
  geo.rotateX(-Math.PI / 2);
  // Canvas row 0 (the threshold) lands on v=1, which rotateX puts at −z: shift that edge to
  // the door so the fan runs out into the street (+z).
  geo.translate(0, 0, SPILL_D / 2);
  const tex = spillTexture(THREE);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffc27a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.name = "interior_door_glow";
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  list.forEach((e, i) => {
    q.setFromAxisAngle(up, e.theta);
    const lx = e.doorX;
    const lz = DOOR_Z;
    p.set(e.fx + lx * e.cos + lz * e.sin, Math.max(e.gy, PAVEMENT_Y) + 0.02, e.fz - lx * e.sin + lz * e.cos);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.setScalar(0));
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  const lit = new Uint8Array(list.length);
  let glow = 0;

  return {
    mesh,
    /** Re-read open hours (shops.update keeps shop.open current). Cheap; call a few times a second. */
    update() {
      let dirty = false;
      for (let i = 0; i < list.length; i++) {
        const on = list[i].shop.open !== false ? 1 : 0;
        if (on === lit[i]) continue;
        lit[i] = on;
        mesh.setColorAt(i, col.setScalar(on));
        dirty = true;
      }
      if (dirty) mesh.instanceColor.needsUpdate = true;
    },
    setNight(g) {
      glow = g;
      mat.opacity = glow;
      mesh.visible = glow > 0.03;
    },
    get glow() {
      return glow;
    },
  };
}
