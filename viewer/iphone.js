/**
 * A handset parented to a Rocketbox hand bone.
 *
 * Bone translations in these glbs are centimetres (Bip01 scales them by 0.01),
 * so the phone is built in that same local space. Grips come from the retargeted
 * clips: fingers run along the hand's +X, and the head sits on a different axis
 * for texting, walking-while-texting, and a call.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const W = 7.15;
const H = 14.7;
const D = 0.78;

const FINISHES = [
  { frame: 0x1c1c1e, back: 0x2a2a2e, metal: 0.72 },
  { frame: 0xe4e5e8, back: 0xf2f2f4, metal: 0.86 },
  { frame: 0x2f4d73, back: 0x3d628f, metal: 0.62 },
  { frame: 0xf3f1ec, back: 0xf7f6f2, metal: 0.55 },
];

let geos = null;

function geometries() {
  if (geos) return geos;
  geos = {
    body: new RoundedBoxGeometry(W, H, D, 4, 0.32),
    screen: new THREE.PlaneGeometry(W - 0.72, H - 0.95),
    island: new RoundedBoxGeometry(2.35, 0.62, 0.06, 2, 0.18),
    bump: new RoundedBoxGeometry(2.55, 2.55, 0.22, 2, 0.28),
    lens: new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18),
    flash: new THREE.CircleGeometry(0.16, 12),
    button: new THREE.BoxGeometry(0.12, 1.15, 0.22),
  };
  return geos;
}

function finishFor(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return FINISHES[h % FINISHES.length];
}

const TEXT_BASIS = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0),
);

// Top of the phone toward the ear, screen into the cheek. Built once from the
// retargeted call pose (head sits on +Y/+Z of the right hand).
const CALL_BASIS = (() => {
  const y = new THREE.Vector3(0.21, 0.76, 0.61).normalize();
  const z = new THREE.Vector3().crossVectors(y, new THREE.Vector3(1, 0, 0)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  y.crossVectors(z, x).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
})();

/** One iPhone. Geometry is shared; the finish is this person's. */
export function createIphone(personId = "") {
  const g = geometries();
  const finish = finishFor(personId);
  const root = new THREE.Group();
  root.name = "iphone";
  root.visible = false;

  const frameMat = new THREE.MeshStandardMaterial({
    color: finish.frame,
    metalness: finish.metal,
    roughness: 0.32,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: finish.back,
    metalness: Math.max(0.35, finish.metal - 0.2),
    roughness: 0.18,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x05070c,
    emissive: 0x0c2748,
    emissiveIntensity: 0.15,
    roughness: 0.2,
    metalness: 0.05,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.4, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.12, metalness: 0.45 });
  const flashMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d2,
    emissive: 0xfff4d2,
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });

  const body = new THREE.Mesh(g.body, frameMat);
  body.castShadow = true;
  root.add(body);

  const back = new THREE.Mesh(g.screen, backMat);
  back.position.z = -D * 0.5 + 0.02;
  back.rotation.y = Math.PI;
  root.add(back);

  const screen = new THREE.Mesh(g.screen, screenMat);
  screen.position.z = D * 0.5 + 0.01;
  root.add(screen);

  const island = new THREE.Mesh(g.island, black);
  island.position.set(0, H * 0.5 - 1.15, D * 0.5 + 0.04);
  root.add(island);

  // Camera square on the back, in the corner you see when the screen faces the cheek.
  const bump = new THREE.Mesh(g.bump, frameMat);
  bump.position.set(W * 0.5 - 1.7, H * 0.5 - 1.7, -D * 0.5 - 0.08);
  root.add(bump);
  for (const [x, y] of [
    [0.48, 0.48],
    [-0.48, -0.42],
  ]) {
    const lens = new THREE.Mesh(g.lens, glass);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(bump.position.x + x, bump.position.y + y, bump.position.z - 0.08);
    root.add(lens);
  }
  const flash = new THREE.Mesh(g.flash, flashMat);
  flash.position.set(bump.position.x - 0.48, bump.position.y + 0.5, bump.position.z - 0.12);
  flash.rotation.y = Math.PI;
  root.add(flash);

  for (const y of [2.4, 0.7]) {
    const vol = new THREE.Mesh(g.button, frameMat);
    vol.position.set(-W * 0.5 - 0.02, y, 0);
    root.add(vol);
  }
  const side = new THREE.Mesh(g.button, frameMat);
  side.scale.y = 1.35;
  side.position.set(W * 0.5 + 0.02, 1.6, 0);
  root.add(side);

  root.traverse((o) => {
    o.frustumCulled = false;
  });
  root.userData.screenMat = screenMat;
  root.userData.ownMaterials = [frameMat, backMat, screenMat, black, glass, flashMat];
  return root;
}

/**
 * Park the handset for a clip, or hide it.
 * `kind` is "text", "textWalk", "call", or null (empty hand).
 */
export function gripIphone(phone, kind) {
  if (!phone) return;
  if (!kind) {
    phone.visible = false;
    return;
  }
  phone.visible = true;
  const screen = phone.userData.screenMat;
  const lit = kind === "text" || kind === "textWalk";
  if (screen) {
    screen.emissiveIntensity = lit ? 0.85 : 0.05;
    screen.color.setHex(lit ? 0x071018 : 0x05070c);
  }
  if (kind === "text") {
    // Standing text: screen toward the face (+Y), phone across the hands.
    phone.position.set(6.4, 2.8, 0.4);
    phone.quaternion.setFromRotationMatrix(TEXT_BASIS);
    return;
  }
  if (kind === "textWalk") {
    // Both hands in front. The face is along +Z; the other hand is along +Y.
    phone.position.set(6.4, 3.2, 2.4);
    phone.quaternion.identity();
    return;
  }
  // Speaker at the ear, mic hanging below the fist.
  phone.position.set(6.8, 7.5, 5.8);
  phone.quaternion.setFromRotationMatrix(CALL_BASIS);
}

export function disposeIphone(phone) {
  if (!phone) return;
  for (const m of phone.userData.ownMaterials || []) m.dispose();
  phone.removeFromParent();
}
