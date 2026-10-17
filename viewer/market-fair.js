/**
 * The dressed market: one instanced table, awning and crate per stall, plus a
 * few sellers cloned from people already in the crowd. Sellers play the Mixamo
 * idle (baked onto Rocketbox). Talk / pay / bag are a coin and a paper bag
 * passed across the counter — no extra skeleton clips.
 */
import { STALL_LOOK, marketIsOpen } from "./npc/market.js";

const SHOW_M = 150;
const SELLER_M = 48;
const SELLER_MAX = 6;
const Y = 0.12;

function stallYaw(stall) {
  return Math.atan2(stall.faceX, stall.faceZ);
}

function nearestOpen(markets, x, z, hour, day) {
  let best = null;
  let bestD = SHOW_M;
  for (const market of markets || []) {
    if (!marketIsOpen(market, hour, day) || !market.stalls?.length) continue;
    const d = Math.hypot(market.stalls[0].tx - x, market.stalls[0].tz - z);
    let near = d;
    for (const s of market.stalls) {
      const dd = Math.hypot(s.tx - x, s.tz - z);
      if (dd < near) near = dd;
    }
    if (near < bestD) {
      bestD = near;
      best = market;
    }
  }
  return best;
}

export function createMarketFair(scene, THREE, opts = {}) {
  const markets = opts.markets || [];
  const people = opts.people || null;
  const sellerMax = opts.sellerMax ?? SELLER_MAX;
  const root = new THREE.Group();
  root.name = "MarketFair";
  scene.add(root);

  const cloth = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a6244 });
  const goodsMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tableGeo = new THREE.BoxGeometry(2.15, 0.72, 0.86);
  tableGeo.translate(0, 0.36 + Y, 0);
  const awningGeo = new THREE.BoxGeometry(2.35, 0.05, 1.35);
  awningGeo.translate(0, 2.15 + Y, -0.15);
  const crateGeo = new THREE.BoxGeometry(0.42, 0.22, 0.32);
  crateGeo.translate(0, 0.83 + Y, 0.05);

  const tables = new THREE.InstancedMesh(tableGeo, wood, 14);
  const awnings = new THREE.InstancedMesh(awningGeo, cloth, 14);
  const crates = new THREE.InstancedMesh(crateGeo, goodsMat, 28);
  tables.count = 0;
  awnings.count = 0;
  crates.count = 0;
  tables.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(14 * 3), 3);
  awnings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(14 * 3), 3);
  crates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(28 * 3), 3);
  root.add(tables, awnings, crates);

  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.012, 8),
    new THREE.MeshLambertMaterial({ color: 0xe6c35c }),
  );
  coin.visible = false;
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.2, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xd7c4a3 }),
  );
  bag.visible = false;
  root.add(coin, bag);

  const sellers = [];
  let dressed = null;
  let dressing = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function writeStall(mesh, i, stall, yShift, tint) {
    dummy.position.set(stall.tx, yShift, stall.tz);
    dummy.rotation.set(0, stallYaw(stall), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(tint);
    mesh.setColorAt(i, color);
  }

  function dress(market) {
    const stalls = market.stalls;
    tables.count = stalls.length;
    awnings.count = stalls.length;
    crates.count = stalls.length * 2;
    stalls.forEach((stall, i) => {
      const look = STALL_LOOK[stall.kind] || STALL_LOOK.food;
      writeStall(tables, i, stall, 0, 0x8d6a45);
      writeStall(awnings, i, stall, 0, look.cloth);
      writeStall(crates, i * 2, stall, 0, look.goods);
      dummy.position.x += Math.cos(stallYaw(stall)) * 0.45;
      dummy.position.z += -Math.sin(stallYaw(stall)) * 0.45;
      dummy.updateMatrix();
      crates.setMatrixAt(i * 2 + 1, dummy.matrix);
      crates.setColorAt(i * 2 + 1, color);
    });
    tables.instanceMatrix.needsUpdate = true;
    awnings.instanceMatrix.needsUpdate = true;
    crates.instanceMatrix.needsUpdate = true;
    if (tables.instanceColor) tables.instanceColor.needsUpdate = true;
    if (awnings.instanceColor) awnings.instanceColor.needsUpdate = true;
    if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
    dressed = market;
  }

  function hideFair() {
    tables.count = 0;
    awnings.count = 0;
    crates.count = 0;
    coin.visible = false;
    bag.visible = false;
    for (const s of sellers) s.root.visible = false;
    dressed = null;
  }

  async function ensureSellers() {
    if (!people || dressing || sellers.length >= sellerMax) return;
    dressing = true;
    try {
      while (sellers.length < sellerMax) {
        const inst = await people.acquireMatching?.((p) => p.age === "adult");
        if (!inst) break;
        await people.loadIdle?.(inst.template);
        people.setIdle?.(inst, true, 0);
        inst.root.visible = false;
        root.add(inst.root);
        sellers.push(inst);
      }
    } finally {
      dressing = false;
    }
  }

  function placeSellers(market, camX, camZ) {
    const stalls = market.stalls;
    sellers.forEach((inst, i) => {
      const stall = stalls[i];
      if (!stall) {
        inst.root.visible = false;
        return;
      }
      const d = Math.hypot(stall.tx - camX, stall.tz - camZ);
      if (d > SELLER_M) {
        inst.root.visible = false;
        return;
      }
      inst.root.visible = true;
      inst.root.position.set(stall.tx - stall.faceX * 0.72, Y, stall.tz - stall.faceZ * 0.72);
      inst.root.rotation.y = stallYaw(stall);
    });
  }

  function showExchange(market) {
    let stall = null;
    for (const s of market.stalls) {
      if (s.dealing && (s.phase === "pay" || s.phase === "bag")) {
        stall = s;
        break;
      }
    }
    if (!stall) {
      coin.visible = false;
      bag.visible = false;
      return;
    }
    const px = stall.tx + stall.faceX * 0.35;
    const pz = stall.tz + stall.faceZ * 0.35;
    if (stall.phase === "pay") {
      coin.visible = true;
      coin.position.set(px, 0.95 + Y, pz);
      bag.visible = false;
    } else {
      coin.visible = false;
      bag.visible = true;
      bag.position.set(stall.tx + stall.faceX * 0.95, 0.9 + Y, stall.tz + stall.faceZ * 0.95);
    }
  }

  function update(dt, x, z, hour, day) {
    const market = nearestOpen(markets, x, z, hour, day);
    if (!market) {
      if (dressed) hideFair();
      return;
    }
    if (dressed !== market) dress(market);
    if (sellers.length < Math.min(sellerMax, market.stalls.length)) ensureSellers();
    placeSellers(market, x, z);
    showExchange(market);
    for (const inst of sellers) {
      if (inst.root.visible) inst.mixer.update(dt);
    }
  }

  function dispose() {
    scene.remove(root);
    for (const inst of sellers) people?.release?.(inst);
    sellers.length = 0;
  }

  return { update, dispose, root };
}
