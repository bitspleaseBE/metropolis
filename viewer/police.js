/**
 * Patrol combis and the chase they start when they see a crime.
 * Faction cars use the same chase and only appear through startFactionPursuit.
 * One star is one identical unit: a police combi with two officers, or a black
 * sedan with four armed crew. Cap is 4.
 */

import { loadCarTemplates, cloneCarMesh, makeLampParts } from "./cars.js";

const PATROL_SPEED = 8;
const CHASE_SPEED = 16;
const SEE_M = 58;
const BAIL_M = 15;
const SHOT_M = 24;
const SHOT_DMG = 9;
const CREW = {
  police: 2,
  hassidic: 4,
  flemish: 4,
  arab: 4,
};

function samplePath(path, s, outPos, outTan) {
  const dist = Math.max(0, Math.min(path.length, s));
  const cum = path.cumulative;
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(path.points.length - 1, i);
  const seg = Math.max(1e-6, cum[i1] - cum[i0]);
  const t = (dist - cum[i0]) / seg;
  const a = path.points[i0];
  const b = path.points[i1];
  outPos.lerpVectors(a, b, t);
  outTan.subVectors(b, a);
  if (outTan.lengthSq() < 1e-8) outTan.set(0, 0, -1);
  else outTan.normalize();
  outPos.y = 0.02;
}

function applyLane(path, tan, outPos) {
  const lane = path.laneOffset ?? 1.15;
  outPos.x += -tan.z * lane;
  outPos.z += tan.x * lane;
}

function findBone(root, names) {
  for (const n of names) {
    const b = root.getObjectByName(n);
    if (b) return b;
  }
  return null;
}

function lineBlocked(ax, az, bx, bz, inside) {
  if (typeof inside !== "function") return false;
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (inside(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
  }
  return false;
}

export async function createPolice(scene, THREE, opts = {}) {
  const paths = opts.paths || [];
  const wanted = opts.wanted;
  const people = opts.people;
  const inside = opts.inside;
  const root = new THREE.Group();
  root.name = "police";
  scene.add(root);

  const parts = makeLampParts(THREE, [0xffffff]);
  let policeCar = null;
  let sedan = null;
  try {
    const templates = await loadCarTemplates(THREE, {
      only: ["politie_transporter.glb", "bmw_5.glb"],
    });
    policeCar = templates.find((t) => t.id === "politie_transporter") || null;
    sedan = templates.find((t) => t.id === "bmw_5") || null;
  } catch (err) {
    console.warn("[cityview] pursuit cars failed", err);
  }

  const units = [];
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(1, 0, 0);
  let flashT = 0;

  function canSee(x, z, fromX, fromZ, fx, fz) {
    const dx = x - fromX;
    const dz = z - fromZ;
    const dist = Math.hypot(dx, dz);
    if (dist > SEE_M || dist < 0.4) return false;
    const fl = Math.hypot(fx, fz) || 1;
    if ((dx * fx + dz * fz) / (dist * fl) < 0.15) return false;
    return !lineBlocked(fromX, fromZ, x, z, inside);
  }

  function anySees(px, pz) {
    const clan = wanted?.clan;
    if (!clan) return false;
    for (const u of units) {
      if (!u.responding || u.clan !== clan) continue;
      if (canSee(px, pz, u.pos.x, u.pos.z, Math.sin(u.yaw), Math.cos(u.yaw))) return true;
      for (const m of u.crew) {
        if (m.state !== "foot") continue;
        const mp = m.root.position;
        if (canSee(px, pz, mp.x, mp.z, Math.sin(m.yaw), -Math.cos(m.yaw))) return true;
      }
    }
    return false;
  }

  function nearestPath(x, z, minD, maxD) {
    let best = null;
    let bestScore = Infinity;
    for (const path of paths) {
      if (path.length < 20) continue;
      const mid = path.points[(path.points.length / 2) | 0];
      const d = Math.hypot(mid.x - x, mid.z - z);
      if (d < minD || d > maxD) continue;
      const score = Math.abs(d - 80) + Math.random() * 20;
      if (score < bestScore) {
        bestScore = score;
        best = path;
      }
    }
    return best || paths.find((p) => p.length > 30) || paths[0] || null;
  }

  function handoff(path, reverse, target) {
    const exit = reverse ? path.start : path.end;
    let best = null;
    let bestScore = Infinity;
    for (const p of paths) {
      if (p === path || p.length < 12) continue;
      for (const rev of [false, true]) {
        if (p.dir !== 0 && p.dir !== (rev ? -1 : 1)) continue;
        const entry = rev ? p.end : p.start;
        if (entry.distanceTo(exit) > 16) continue;
        const far = rev ? p.start : p.end;
        const score = target
          ? Math.hypot(far.x - target.x, far.z - target.z)
          : Math.random();
        if (score < bestScore) {
          bestScore = score;
          best = { path: p, reverse: rev };
        }
      }
    }
    return best;
  }

  function attachBeacons(mesh, template) {
    const left = new THREE.MeshBasicMaterial({ color: 0x071018, toneMapped: false });
    const right = new THREE.MeshBasicMaterial({ color: 0x071018, toneMapped: false });
    let wired = false;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = [].concat(o.material);
      let changed = false;
      const next = list.map((m) => {
        const name = m?.name || "";
        if (/beacon_l/i.test(name)) {
          wired = true;
          changed = true;
          return left;
        }
        if (/beacon_r/i.test(name)) {
          wired = true;
          changed = true;
          return right;
        }
        return m;
      });
      if (changed) o.material = Array.isArray(o.material) ? next : next[0];
    });
    const height = template?.height || 2;
    const nose = (template?.length || 4.9) * 0.08;
    if (!wired) {
      const geo = new THREE.BoxGeometry(0.42, 0.06, 0.22);
      const podL = new THREE.Mesh(geo, left);
      const podR = new THREE.Mesh(geo, right);
      podL.position.set(-0.4, height - 0.04, nose);
      podR.position.set(0.4, height - 0.04, nose);
      mesh.add(podL, podR);
    }
    const glow = new THREE.PointLight(0x3a8cff, 0, 18, 1.4);
    glow.position.set(0, height + 0.2, nose);
    mesh.add(glow);
    return { left, right, glow };
  }

  function standIn(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.85, 4, 6),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);
    return g;
  }

  async function makePerson(clan, index) {
    let inst = null;
    if (people?.acquire) {
      if (clan === "police") inst = await people.acquire("Police_Male_03");
      else if (clan === "hassidic") inst = await people.acquireMatching((p) => p.look === "hasidic" && p.age !== "child");
      else if (clan === "arab") inst = await people.acquireMatching((p) => p.look === "arab" && p.age === "adult");
      else inst = await people.acquireMatching((p) => p.look === "european" && p.age === "adult" && !String(p.id).startsWith("Police_"));
    }
    if (!inst) {
      const color = clan === "police" ? 0x1d3f86 : 0x161616;
      return { root: standIn(color), mixer: null, action: null, borrowed: false };
    }
    if (clan === "police" && index === 1) {
      inst.root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = [].concat(o.material).map((m) => {
          const c = m.clone();
          if (c.color) c.color.offsetHSL(0.03, 0.04, -0.12);
          return c;
        });
        o.material = Array.isArray(o.material) ? mats : mats[0];
      });
    }
    const hand = findBone(inst.root, ["Bip01_R_Hand", "Bip01 R Hand", "RightHand", "mixamorigRightHand"]);
    if (hand) {
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.08, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45 }),
      );
      gun.position.set(0, 0.06, 0.04);
      hand.add(gun);
    }
    return { root: inst.root, mixer: inst.mixer, action: inst.action, borrowed: true, releaseInst: inst };
  }

  function sit(member) {
    const rig = member.root;
    for (const name of ["Bip01_L_Thigh", "Bip01_R_Thigh", "LeftUpLeg", "RightUpLeg", "mixamorigLeftUpLeg", "mixamorigRightUpLeg"]) {
      const bone = rig.getObjectByName(name);
      if (!bone) continue;
      q.setFromAxisAngle(axis, -1.25);
      bone.quaternion.premultiply(q);
    }
    for (const name of ["Bip01_L_Calf", "Bip01_R_Calf", "LeftLeg", "RightLeg", "mixamorigLeftLeg", "mixamorigRightLeg"]) {
      const bone = rig.getObjectByName(name);
      if (!bone) continue;
      q.setFromAxisAngle(axis, 1.15);
      bone.quaternion.premultiply(q);
    }
  }

  async function spawn(clan, responding) {
    const template = clan === "police" ? policeCar : sedan;
    if (!template || !paths.length) return null;
    const path = nearestPath(opts.player?.().x ?? 0, opts.player?.().z ?? 0, 40, 160);
    if (!path) return null;
    const mesh = cloneCarMesh(THREE, parts, template, clan === "police" ? {} : { paint: 0x0c0d0f });
    mesh.name = clan === "police" ? "politie" : `crew-${clan}`;
    root.add(mesh);
    const count = CREW[clan] || 2;
    const crew = [];
    const seats = [
      new THREE.Vector3(-0.38, 0.15, 0.35),
      new THREE.Vector3(0.38, 0.15, 0.35),
      new THREE.Vector3(-0.38, 0.15, -0.55),
      new THREE.Vector3(0.38, 0.15, -0.55),
    ];
    for (let i = 0; i < count; i++) {
      const person = await makePerson(clan, i);
      mesh.add(person.root);
      person.root.position.copy(seats[i]);
      person.root.rotation.set(0, Math.PI, 0);
      if (person.action) person.action.setEffectiveTimeScale(0);
      crew.push({
        ...person,
        state: "seat",
        health: 100,
        cool: Math.random(),
        yaw: 0,
        seat: seats[i].clone(),
        deadFor: 0,
        looted: false,
      });
    }
    const unit = {
      clan,
      kind: clan === "police" ? "police" : "faction",
      mesh,
      beacons: clan === "police" ? attachBeacons(mesh, template) : null,
      crew,
      path,
      reverse: path.dir < 0,
      s: Math.random() * Math.max(2, path.length - 4),
      responding: !!responding,
      bailed: false,
      pos: new THREE.Vector3(),
      yaw: 0,
      emptyFor: 0,
    };
    place(unit);
    units.push(unit);
    return unit;
  }

  function place(unit) {
    const s = unit.reverse ? unit.path.length - unit.s : unit.s;
    samplePath(unit.path, s, pos, tan);
    if (unit.reverse) tan.multiplyScalar(-1);
    applyLane(unit.path, tan, pos);
    unit.mesh.position.copy(pos);
    unit.pos.copy(pos);
    unit.yaw = Math.atan2(tan.x, tan.z);
    unit.mesh.rotation.y = unit.yaw;
  }

  function releaseMember(m) {
    if (m.released) return;
    m.released = true;
    m.root.removeFromParent();
    if (m.borrowed && people?.release && m.releaseInst) {
      try {
        people.release(m.releaseInst);
      } catch (err) {
        console.warn("[cityview] officer release failed", err);
      }
    }
  }

  function despawn(unit) {
    const i = units.indexOf(unit);
    if (i >= 0) units.splice(i, 1);
    for (const m of unit.crew) releaseMember(m);
    unit.mesh.removeFromParent();
  }

  function bail(unit) {
    if (unit.bailed) return;
    unit.bailed = true;
    for (const m of unit.crew) {
      if (m.state === "dead") continue;
      const world = new THREE.Vector3();
      m.root.getWorldPosition(world);
      root.attach(m.root);
      m.root.position.copy(world);
      m.root.position.y = 0;
      m.state = "foot";
      if (m.action) m.action.setEffectiveTimeScale(2.4);
    }
  }

  function reseat(unit) {
    unit.bailed = false;
    for (const m of unit.crew) {
      if (m.state === "dead") continue;
      unit.mesh.attach(m.root);
      m.root.position.copy(m.seat);
      m.root.rotation.set(0, Math.PI, 0);
      m.state = "seat";
      if (m.action) m.action.setEffectiveTimeScale(0);
    }
  }

  async function sync(px, pz) {
    const clan = wanted?.clan;
    const level = wanted?.level || 0;
    if (!clan || level <= 0) {
      for (const u of [...units]) {
        if (u.kind === "faction") despawn(u);
        else {
          u.responding = false;
          if (u.bailed) reseat(u);
        }
      }
    } else {
      let live = units.filter((u) => u.clan === clan);
      for (const u of live) u.responding = true;
      while (live.length < level) {
        const born = await spawn(clan, true);
        if (!born) break;
        live = units.filter((u) => u.clan === clan);
      }
      while (live.length > level) {
        const extra = live.pop();
        if (extra.kind === "police") {
          extra.responding = false;
          if (extra.bailed) reseat(extra);
        } else despawn(extra);
      }
    }
    const patrols = units.filter((u) => u.kind === "police" && !u.responding);
    const wantPatrol = wanted?.clan === "police" ? 0 : 2;
    while (patrols.length < wantPatrol) {
      const born = await spawn("police", false);
      if (!born) break;
      patrols.push(born);
    }
    while (patrols.length > Math.max(wantPatrol, 2) && wanted?.clan !== "police") {
      despawn(patrols.pop());
    }
    void px;
    void pz;
  }

  function drive(unit, dt, target) {
    const speed = unit.responding && !unit.bailed ? CHASE_SPEED : PATROL_SPEED;
    if (unit.bailed) return;
    unit.s += speed * dt;
    if (unit.s >= unit.path.length - 1.5) {
      const next = handoff(unit.path, unit.reverse, unit.responding ? target : null);
      if (next) {
        unit.path = next.path;
        unit.reverse = next.reverse;
        unit.s = 1.2;
      } else {
        unit.reverse = !unit.reverse;
        unit.s = 1.2;
      }
    }
    place(unit);
  }

  function stepCrew(unit, dt, player) {
    for (const m of unit.crew) {
      if (m.state === "gone") continue;
      if (m.state === "dead") {
        m.deadFor += dt;
        m.root.rotation.x = Math.max(m.root.rotation.x, -Math.PI / 2);
        if (!m.looted && Math.hypot(m.root.position.x - player.x, m.root.position.z - player.z) < 1.7) {
          m.looted = true;
          const got = opts.onLoot?.();
          opts.notify?.(got === "gun" ? "You took a pistol" : "You took a magazine");
        }
        if (m.deadFor > 22) {
          releaseMember(m);
          m.state = "gone";
        }
        continue;
      }
      if (m.mixer) m.mixer.update(m.state === "seat" ? 0 : dt);
      if (m.state === "seat") {
        sit(m);
        continue;
      }
      const dx = player.x - m.root.position.x;
      const dz = player.z - m.root.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const step = Math.min(4.6 * dt, dist);
      const nx = m.root.position.x + (dx / dist) * step;
      const nz = m.root.position.z + (dz / dist) * step;
      if (!inside?.(nx, nz)) {
        m.root.position.x = nx;
        m.root.position.z = nz;
      }
      m.root.position.y = 0;
      m.yaw = Math.atan2(dx, -dz);
      m.root.rotation.set(0, m.yaw, 0);
      m.cool -= dt;
      if (m.cool <= 0 && dist < SHOT_M && !player.dead && canSee(player.x, player.z, m.root.position.x, m.root.position.z, Math.sin(m.yaw), -Math.cos(m.yaw))) {
        m.cool = 0.85;
        player.hurt?.(SHOT_DMG);
      }
    }
  }

  function hurtMember(m, unit, damage) {
    if (m.state === "dead" || m.state === "gone") return false;
    m.health -= damage;
    if (m.health > 0) return false;
    m.state = "dead";
    m.deadFor = 0;
    if (m.action) m.action.setEffectiveTimeScale(0);
    const world = new THREE.Vector3();
    m.root.getWorldPosition(world);
    if (m.root.parent !== root) root.attach(m.root);
    m.root.position.copy(world);
    m.root.position.y = 0;
    wanted?.addStar(unit.clan);
    return true;
  }

  let syncWait = 0;
  let syncing = false;
  let forceSync = false;

  function update(dt, player) {
    if (!player) return;
    flashT += dt;
    const crime = player.ranRed || player.harmed;
    if (crime) {
      for (const u of units) {
        if (u.kind !== "police") continue;
        const seen =
          canSee(player.x, player.z, u.pos.x, u.pos.z, Math.sin(u.yaw), Math.cos(u.yaw)) ||
          u.crew.some((m) => m.state === "foot" && canSee(player.x, player.z, m.root.position.x, m.root.position.z, Math.sin(m.yaw), -Math.cos(m.yaw)));
        if (!seen) continue;
        if (wanted?.witnessPolice()) u.responding = true;
      }
    }
    syncWait -= dt;
    if (!syncing && (forceSync || syncWait <= 0)) {
      syncing = true;
      forceSync = false;
      syncWait = 0.45;
      sync(player.x, player.z)
        .catch((err) => console.warn("[cityview] pursuit sync failed", err))
        .finally(() => {
          syncing = false;
        });
    }
    const target = { x: player.x, z: player.z };
    for (const u of units) {
      const dx = player.x - u.pos.x;
      const dz = player.z - u.pos.z;
      const dist = Math.hypot(dx, dz);
      const side = Math.abs(dx * Math.cos(u.yaw) - dz * Math.sin(u.yaw));
      if (u.responding && !player.dead && (dist < BAIL_M || side > 9)) bail(u);
      drive(u, dt, target);
      stepCrew(u, dt, player);
      if (u.beacons) {
        const chasing = u.responding && !player.dead;
        const leftOn = chasing && Math.floor(flashT * 8) % 2 === 0;
        const rightOn = chasing && !leftOn;
        u.beacons.left.color.setHex(leftOn ? 0xd7ecff : 0x071018);
        u.beacons.right.color.setHex(rightOn ? 0xd7ecff : 0x071018);
        u.beacons.glow.intensity = chasing ? 7 : 0;
        u.beacons.glow.color.setHex(leftOn ? 0x6eb6ff : 0x2f6bff);
      }
      const alive = u.crew.some((m) => m.state !== "dead" && m.state !== "gone");
      if (!alive) {
        u.emptyFor += dt;
        if (u.emptyFor > 8) despawn(u);
      }
    }
    wanted?.tick(dt, anySees(player.x, player.z));
  }

  function hit(x, z, dx, dz, range, damage, single = false) {
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const found = [];
    for (const u of units) {
      for (const m of u.crew) {
        if (m.state === "dead" || m.state === "gone") continue;
        const p = m.root.position;
        const px = p.x - x;
        const pz = p.z - z;
        const along = px * ux + pz * uz;
        const side = Math.abs(px * uz - pz * ux);
        if (along < 0.15 || along > range || side > (single ? 0.45 : 0.85)) continue;
        found.push({ m, u, along });
      }
    }
    if (single) found.sort((a, b) => a.along - b.along);
    const take = single ? found.slice(0, 1) : found;
    for (const row of take) hurtMember(row.m, row.u, damage);
    return take.length;
  }

  function blips() {
    const out = [];
    for (const u of units) {
      if (!u.responding) continue;
      out.push({ x: u.pos.x, z: u.pos.z, color: u.kind === "police" ? "#3d7dff" : "#f4f4f4" });
      for (const m of u.crew) {
        if (m.state !== "foot") continue;
        out.push({ x: m.root.position.x, z: m.root.position.z, color: u.kind === "police" ? "#9ec2ff" : "#444" });
      }
    }
    return out;
  }

  if (paths.length) await sync(0, 0);

  return {
    update,
    hit,
    blips,
    startFactionPursuit: (spec) => wanted?.startFactionPursuit(spec) || false,
    onPlayerDown() {
      wanted?.clear();
      forceSync = true;
    },
    dispose() {
      for (const u of [...units]) despawn(u);
      scene.remove(root);
    },
  };
}
