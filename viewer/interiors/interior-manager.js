/**
 * Enterable shops (interiors.json from cityview/interiors.py).
 *
 * An interior is a "pocket" built at the shop's real address: its street wall sits on the
 * façade, so the door the player walks through outside is the door they walk out of inside.
 * While inside, everything else in the scene is hidden (never unloaded), the walker collides
 * with the room instead of the city, and the street simulation is paused by index.html.
 *
 * Pressing E at a door plays a short walk-in: step up to the door, the leaf swings open, walk
 * through, and the branded loading veil covers the cut while the room is built (or restored).
 * The last three interiors stay in memory with their people, so walking back into a shop you
 * just left finds the same customers where they were. The fourth evicts the oldest.
 */
import { generateInterior, roomFrame } from "./interior-gen.js";
import { createFurnitureKit } from "./furniture.js";
import { createInteriorNpcs } from "./interior-npcs.js";
import { createDoorGlow } from "./door-glow.js";
import { createPropCollider } from "../props-collide.js";
import { cloneCarMesh, loadCarTemplates, makeLampParts, pickCarPaint, STARTER_CARS } from "../cars.js";
import { hoursLine } from "../shops.js";

const CACHE_SIZE = 3;
const REACH = 2.6; // m from the door for the enter prompt
const WALK = 1.45; // m/s, scripted walk in and out
const OPEN = -1.3; // rad, the leaf swings out toward the street
const PLAYER_R = 0.34;
const GRID = 24;

const KICKER = {
  supermarket: "Supermarket",
  grocery: { counter: "Bakery & deli", greengrocer: "Greengrocer", default: "Grocery" },
  restaurant: { fastfood: "Fast food", frituur: "Frituur", default: "Restaurant" },
  bar_coffee: { coffee: "Café", cocktail: "Cocktail bar", default: "Brown café" },
  bank: "Bank",
  care: { pharmacy: "Pharmacy", hospital: "Hospital", default: "Practice" },
  garage: { showroom: "Showroom", default: "Garage" },
};
const FLAVOUR = {
  supermarket: "Fluorescent light, a queue at every till.",
  grocery: "Open early, closes late, knows your name.",
  restaurant: "Somebody always orders the stoofvlees.",
  bar_coffee: "One more, then home. Probably.",
  bank: "Mind the cameras. Mind the queue.",
  care: "Take a number. Take a seat.",
  garage: "It's the transmission. It's always the transmission.",
};

function kickerFor(rec) {
  const k = KICKER[rec.template];
  if (!k) return "Shop";
  return typeof k === "string" ? k : k[rec.variant] || k.default;
}

/**
 * @param opts.player playerRoot (eye height above the floor)
 * @param opts.eye () → eye height while walking
 * @param opts.keep scene children that stay visible inside (player, avatar, lights are kept)
 * @param opts.overlay interior loading veil (interior-loading.js)
 * @param opts.lighting (inside: boolean) → re-light the scene for indoors / outdoors
 * @param opts.snapCamera (yaw) → put the third-person boom behind the player at `yaw`
 */
export async function createInteriors(opts) {
  const { THREE, scene, people, shops, player } = opts;
  const groundAt = opts.groundAt || (() => 0);
  const eye = opts.eye || (() => 1.7);
  const overlay = opts.overlay || { show: async () => {}, hide: async () => {} };
  const lighting = opts.lighting || (() => {});
  const snapCamera = opts.snapCamera || (() => {});
  const clock = opts.clock || (() => ({ hour: 12, day: 1 }));
  const wantedLevel = opts.wantedLevel || (() => 0);

  let data = null;
  try {
    const url = new URL(
      (typeof window.districtUrl === "function" && window.districtUrl("interiors.json")) || "./interiors.json",
      location.href,
    );
    // Same-origin package file only.
    if (url.origin === location.origin && url.pathname.endsWith("/interiors.json")) {
      const res = await fetch(url.href);
      if (res.ok) data = await res.json();
    }
  } catch {
    // no interiors for this district
  }
  const records = data?.interiors || [];
  const shopById = new Map((shops?.records || []).map((r) => [r.id, r]));

  /** Façade frame per enterable shop: origin on the sign point, +z the façade normal. */
  const entries = [];
  const grid = new Map();
  for (const rec of records) {
    const shop = shopById.get(rec.id);
    if (!shop) continue;
    const theta = Math.atan2(shop.nx, shop.nz);
    const frame = roomFrame(rec);
    let gy = shop.gy;
    if (!Number.isFinite(gy) || gy === 0) {
      const g = groundAt(shop.fx + shop.nx * 1.2, shop.fz + shop.nz * 1.2);
      gy = Number.isFinite(g) ? Math.max(0, g) : 0;
    }
    const e = { rec, shop, fx: shop.fx, fz: shop.fz, cos: Math.cos(theta), sin: Math.sin(theta), theta, gy, ...frame };
    e.door = toWorld(e, frame.doorX, 0.3, {});
    entries.push(e);
    const k = `${Math.floor(e.door.x / GRID)},${Math.floor(e.door.z / GRID)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(e);
  }
  const byId = new Map(entries.map((e) => [e.rec.id, e]));
  const doorGlow = createDoorGlow(THREE, scene, entries);
  doorGlow.update();
  let glowClock = 0;

  function toWorld(e, lx, lz, out) {
    out.x = e.fx + lx * e.cos + lz * e.sin;
    out.z = e.fz - lx * e.sin + lz * e.cos;
    return out;
  }
  function toLocal(e, wx, wz, out) {
    const dx = wx - e.fx;
    const dz = wz - e.fz;
    out.x = dx * e.cos - dz * e.sin;
    out.z = dx * e.sin + dz * e.cos;
    return out;
  }
  /** Walker yaw (third-person convention: faces (−sin, −cos)) into the shop and out of it. */
  const yawInto = (e) => e.theta;
  const yawOut = (e) => Math.atan2(-e.sin, -e.cos);

  const kit = createFurnitureKit(THREE);
  const npcs = createInteriorNpcs({ THREE, people });
  let carParts = null;
  let carTemplates = null;
  const cars = () => {
    if (!carTemplates) {
      carParts = makeLampParts(THREE, []);
      carTemplates = loadCarTemplates(THREE, { only: STARTER_CARS }).catch(() => []);
    }
    return carTemplates;
  };

  // ---- door leaf: one hinged glass door, moved to whichever shop is being entered ----
  const leafHolder = new THREE.Group();
  leafHolder.name = "interior_door";
  leafHolder.visible = false;
  const pivot = new THREE.Group();
  leafHolder.add(pivot);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa9c4d4, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [w, h, x, y] of [[0.06, 2.2, 0.03, 1.1], [0.06, 2.2, 0.97, 1.1], [1.0, 0.08, 0.5, 2.16], [1.0, 0.14, 0.5, 0.07]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
    m.position.set(x, y, 0);
    pivot.add(m);
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.96), glassMat);
  pane.position.set(0.5, 1.12, 0);
  pivot.add(pane);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.06), frameMat);
  handle.position.set(0.88, 1.05, 0.05);
  pivot.add(handle);
  // Seen from the street while the door stands open: a warm, lit room behind it.
  const openingMat = new THREE.MeshBasicMaterial({ color: 0xe8c99a });
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.2), openingMat);
  opening.position.set(0, 1.1, -0.02);
  leafHolder.add(opening);
  scene.add(leafHolder);
  let leafAngle = 0;

  function placeLeaf(e) {
    leafHolder.position.set(e.fx, e.gy, e.fz);
    leafHolder.rotation.y = e.theta;
    pivot.position.set(e.doorX - 0.5, 0, 0.3);
    opening.position.set(e.doorX, 1.1, 0.285);
  }
  function setLeaf(a) {
    leafAngle = a;
    pivot.rotation.y = a;
  }

  // ---- LRU of built interiors ----
  const cache = new Map(); // id → built
  const keep = new Set(opts.keep || []);
  keep.add(leafHolder);
  const hidden = new Set();

  async function build(e) {
    const rec = e.rec;
    const layout = generateInterior(rec);
    const root = new THREE.Group();
    root.name = `interior_${rec.id}`;
    root.position.set(e.fx, e.gy, e.fz);
    root.rotation.y = e.theta;
    root.visible = false;
    const palette = { brand: rec.fascia, accent: rec.accent };
    const shell = kit.buildShell(layout, palette, rec.name);
    const furn = kit.build(layout.placements, palette);
    root.add(shell.group, furn.group);
    const collider = await createPropCollider({
      data: {
        trunks: furn.circles.map(([x, z, r]) => [x, -z, r]),
        boxes: [
          ...furn.boxes.map(([x, z, ax, az, hl, hw]) => [x, -z, Math.atan2(-az, ax), hl, hw]),
          ...layout.solids.map(([x0, z0, x1, z1]) => [(x0 + x1) / 2, -(z0 + z1) / 2, 0, (x1 - x0) / 2, (z1 - z0) / 2]),
        ],
        segments: layout.segments.map(([x0, z0, x1, z1, t]) => [x0, -z0, x1, -z1, t]),
      },
    });
    const carProps = layout.props.filter((p) => p.model === "car");
    if (carProps.length) {
      const templates = await cars();
      for (const p of carProps) {
        if (!templates.length) break;
        const t = templates[p.paint % templates.length];
        const car = cloneCarMesh(THREE, carParts, t, { paint: pickCarPaint((p.paint % 1000) / 1000) });
        car.position.set(p.x, p.y || 0, p.z);
        car.rotation.y = p.yaw || 0;
        root.add(car);
      }
    }
    scene.add(root);
    root.updateMatrixWorld(true);
    const crew = await npcs.populate(layout, rec, root);
    return { e, root, shell, furn, collider, crew, layout };
  }

  function dispose(b) {
    b.crew.dispose();
    b.furn.dispose();
    b.shell.dispose();
    b.root.removeFromParent();
  }

  /** Built (or cached) interior for `e`, marked most recent; evicts beyond CACHE_SIZE. */
  async function obtain(e) {
    const id = e.rec.id;
    if (cache.has(id)) {
      const b = cache.get(id);
      cache.delete(id);
      cache.set(id, b);
      return { b, hit: true };
    }
    const b = await build(e);
    cache.set(id, b);
    for (const [k, old] of cache) {
      if (cache.size <= CACHE_SIZE) break;
      if (old === current || k === id) continue;
      cache.delete(k);
      dispose(old);
    }
    return { b, hit: false };
  }

  function hideOutdoor(root) {
    hidden.clear();
    for (const o of scene.children) {
      if (o === root || o.isLight || o.isCamera || keep.has(o)) continue;
      if (o.visible) {
        hidden.add(o);
        o.visible = false;
      }
    }
  }
  function showOutdoor() {
    for (const o of hidden) o.visible = true;
    hidden.clear();
  }

  // ---- state machine ----
  let state = "out";
  let target = null; // entry being entered / occupied
  let current = null; // built interior while inside
  let phaseT = 0;
  let pending = null; // promise of { b, hit } while the veil is up
  let ready = null;
  let cut = null; // { speed, yaw } for the avatar while scripted
  const _p = { x: 0, z: 0 };
  const _w = { x: 0, z: 0 };

  function isOpen(e) {
    return e.shop.open !== false;
  }

  function refusal(e) {
    if (e.rec.locked) return "locked";
    if (!isOpen(e)) return "closed";
    if (wantedLevel() > 0) return "wanted";
    return null;
  }

  /** Nearest enterable door in front of the walker, facing it. */
  function findEnterable(pos, yaw) {
    if (state !== "out") return null;
    const gx = Math.floor(pos.x / GRID);
    const gz = Math.floor(pos.z / GRID);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let best = null;
    let bestD = REACH;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const e of grid.get(`${gx + i},${gz + j}`) || []) {
          const dx = e.door.x - pos.x;
          const dz = e.door.z - pos.z;
          const d = Math.hypot(dx, dz);
          if (d > bestD) continue;
          toLocal(e, pos.x, pos.z, _p);
          if (_p.z < 0.05) continue; // behind the façade line
          if (d > 0.9 && (dx * fx + dz * fz) / d < 0.35) continue;
          best = e;
          bestD = d;
        }
      }
    }
    return best;
  }

  function moveToward(e, lx, lz, dt, faceYaw) {
    toLocal(e, player.position.x, player.position.z, _p);
    const dx = lx - _p.x;
    const dz = lz - _p.z;
    const d = Math.hypot(dx, dz);
    const step = WALK * dt;
    if (d <= step) {
      _p.x = lx;
      _p.z = lz;
    } else {
      _p.x += (dx / d) * step;
      _p.z += (dz / d) * step;
    }
    toWorld(e, _p.x, _p.z, _w);
    player.position.x = _w.x;
    player.position.z = _w.z;
    player.position.y = e.gy + eye();
    // Heading in world terms: local direction (dx, dz) rotated by theta.
    let yaw = faceYaw;
    if (d > 0.05) {
      const wx = dx * e.cos + dz * e.sin;
      const wz = -dx * e.sin + dz * e.cos;
      yaw = Math.atan2(-wx, -wz);
    }
    cut = { speed: d > step ? WALK : 0, yaw };
    return d <= step;
  }

  function overlayInfo(e, full) {
    const rec = e.rec;
    return {
      full,
      kicker: kickerFor(rec),
      title: rec.name || kickerFor(rec),
      sub: FLAVOUR[rec.template] || "",
      fascia: rec.fascia,
      accent: rec.accent,
      category: rec.template,
      seed: rec.id,
    };
  }

  /** Start the walk-in at `e`. Returns false (with the reason) when the door stays shut. */
  function enter(e, { skipApproach = false } = {}) {
    if (state !== "out" || !e) return { ok: false, reason: "busy" };
    const why = refusal(e);
    if (why) return { ok: false, reason: why };
    target = e;
    placeLeaf(e);
    setLeaf(0);
    leafHolder.visible = true;
    opening.visible = false;
    state = skipApproach ? "enterOpen" : "enterApproach";
    phaseT = 0;
    ready = null;
    e.hit = cache.has(e.rec.id);
    pending = obtain(e).then((r) => (ready = r));
    pending.catch((err) => {
      console.warn("[metropolis] interior build failed", err);
      ready = { failed: true };
    });
    return { ok: true };
  }

  function startExit() {
    if (state !== "in" || !current) return false;
    state = "exitApproach";
    phaseT = 0;
    return true;
  }

  function swapIn(b) {
    current = b;
    hideOutdoor(b.root);
    b.root.visible = true;
    leafHolder.visible = true;
    opening.visible = false;
    lighting(true);
    const e = b.e;
    toWorld(e, e.doorX, -0.35, _w);
    player.position.set(_w.x, e.gy + eye(), _w.z);
    snapCamera(yawInto(e));
  }

  function swapOut() {
    const b = current;
    const e = b.e;
    b.root.visible = false;
    showOutdoor();
    lighting(false);
    current = null;
    toWorld(e, e.doorX, 0.6, _w);
    player.position.set(_w.x, e.gy + eye(), _w.z);
    // Behind the walker would be inside the façade: frame them from the pavement instead.
    snapCamera(yawOut(e) + 2.0);
  }

  /** Leave instantly (free camera, respawn): no walk, no veil. */
  function leaveNow() {
    if (state === "out") return;
    if (current) swapOut();
    leafHolder.visible = false;
    state = "out";
    target = null;
    cut = null;
    overlay.hide(true);
  }

  function update(dt) {
    cut = null;
    phaseT += dt;
    if ((glowClock -= dt) <= 0) {
      glowClock = 0.5;
      doorGlow.update();
    }
    const e = target;
    switch (state) {
      case "out":
      case "in":
        break;
      case "enterApproach":
        if (moveToward(e, e.doorX, 1.0, dt, yawInto(e)) || phaseT > 1.6) {
          state = "enterOpen";
          phaseT = 0;
        }
        break;
      case "enterOpen": {
        const u = Math.min(1, phaseT / 0.35);
        setLeaf(OPEN * u * u * (3 - 2 * u));
        opening.visible = true;
        cut = { speed: 0, yaw: yawInto(e) };
        if (u >= 1) {
          state = "enterWalk";
          phaseT = 0;
          overlay.show(overlayInfo(e, !e.hit));
        }
        break;
      }
      case "enterWalk":
        if (moveToward(e, e.doorX, 0.05, dt, yawInto(e)) && phaseT > 0.3) {
          state = "enterLoad";
          phaseT = 0;
        }
        break;
      case "enterLoad":
        cut = { speed: 0, yaw: yawInto(e) };
        if (ready?.failed) {
          leafHolder.visible = false;
          state = "out";
          target = null;
          overlay.hide();
        } else if (ready && overlay.covered()) {
          swapIn(ready.b);
          overlay.hide();
          state = "enterSettle";
          phaseT = 0;
        }
        break;
      case "enterSettle": {
        const done = moveToward(e, e.doorX, -1.5, dt, yawInto(e));
        setLeaf(OPEN * Math.max(0, 1 - phaseT / 0.6));
        if (done && phaseT > 0.6) {
          setLeaf(0);
          state = "in";
          phaseT = 0;
        }
        break;
      }
      case "exitApproach":
        if (moveToward(e, e.doorX, -0.9, dt, yawOut(e))) {
          state = "exitOpen";
          phaseT = 0;
        }
        break;
      case "exitOpen": {
        const u = Math.min(1, phaseT / 0.3);
        setLeaf(OPEN * u * u * (3 - 2 * u));
        cut = { speed: 0, yaw: yawOut(e) };
        if (u >= 1) {
          state = "exitWalk";
          phaseT = 0;
          overlay.show(overlayInfo(e, false));
        }
        break;
      }
      case "exitWalk":
        if (moveToward(e, e.doorX, -0.1, dt, yawOut(e)) && overlay.covered()) {
          swapOut();
          opening.visible = true;
          overlay.hide();
          state = "exitSettle";
          phaseT = 0;
        }
        break;
      case "exitSettle": {
        const done = moveToward(e, e.doorX, 1.5, dt, yawOut(e));
        setLeaf(OPEN * Math.max(0, 1 - phaseT / 0.6));
        if (phaseT > 0.45) opening.visible = false;
        if (done && phaseT > 0.6) {
          setLeaf(0);
          leafHolder.visible = false;
          state = "out";
          target = null;
        }
        break;
      }
    }
    if (current && state !== "out") {
      const feet = state === "in" || state.startsWith("exit") ? toLocal(current.e, player.position.x, player.position.z, { x: 0, z: 0 }) : null;
      current.crew.update(dt, feet);
      // Walking into the doorway leaves, like pressing E there.
      if (state === "in" && feet && feet.z > -0.75 && Math.abs(feet.x - current.e.doorX) < 0.65) startExit();
    }
  }

  const _crowd = [];
  /** Slide the walker out of walls, furniture and people. Returns true on contact. */
  function collide(pos) {
    if (!current) return false;
    const e = current.e;
    toLocal(e, pos.x, pos.z, _p);
    let hit = current.collider.resolveStatic(_p, PLAYER_R);
    _crowd.length = 0;
    for (const m of current.crew.members) _crowd.push([m.inst.root.position.x, m.inst.root.position.z, 0.24]);
    hit = current.collider.resolveCircles(_p, PLAYER_R, _crowd) || hit;
    // Never through the walls, whatever the push order did.
    _p.x = Math.max(-e.w / 2 + PLAYER_R, Math.min(e.w / 2 - PLAYER_R, _p.x));
    _p.z = Math.max(-e.d + PLAYER_R, Math.min(-PLAYER_R * 0.5, _p.z));
    toWorld(e, _p.x, _p.z, _w);
    pos.x = _w.x;
    pos.z = _w.z;
    return hit;
  }

  /** Stand-in for outdoors.insideBuilding while inside: anywhere outside the room is solid. */
  const cameraBlocker = {
    insideBuilding(x, z) {
      if (!current) return false;
      const e = current.e;
      toLocal(e, x, z, _w);
      return !(Math.abs(_w.x) < e.w / 2 - 0.12 && _w.z < -0.12 && _w.z > -e.d + 0.12);
    },
  };

  /** HUD prompt for the walker at `pos` facing `yaw`, or null. */
  function prompt(pos, yaw) {
    if (state === "in" && current) {
      const e = current.e;
      toLocal(e, pos.x, pos.z, _p);
      const c = current.crew.cashierAt();
      if (c && Math.hypot(c.x - _p.x, c.z - _p.z) < 2.2) return "E · talk (coming soon)";
      if (_p.z > -1.8 && Math.abs(_p.x - e.doorX) < 1.1) return `E · leave ${e.rec.name || "the shop"}`;
      return null;
    }
    if (state !== "out") return null;
    const e = findEnterable(pos, yaw);
    if (!e) return null;
    const name = e.rec.name || kickerFor(e.rec);
    const why = refusal(e);
    if (!why && !cache.has(e.rec.id)) overlay.preload?.(e.rec.template, e.rec.id);
    if (why === "locked") return `${name} · locked`;
    if (why === "closed") {
      const { hour, day } = clock();
      return `${name} · closed\n${hoursLine(e.shop.hours, day, hour)}`;
    }
    if (why === "wanted") return `${name}\nLose the heat before you go in`;
    return `E · enter ${name}`;
  }

  /** E pressed. Returns { action } — "enter", "leave", "talk", "refused" — or null. */
  function interact(pos, yaw) {
    if (state === "in" && current) {
      const e = current.e;
      toLocal(e, pos.x, pos.z, _p);
      const c = current.crew.cashierAt();
      if (c && Math.hypot(c.x - _p.x, c.z - _p.z) < 2.2) return { action: "talk", name: e.rec.name };
      if (_p.z > -1.8 && Math.abs(_p.x - e.doorX) < 1.1 && startExit()) return { action: "leave" };
      return null;
    }
    if (state !== "out") return state === "in" ? null : { action: "busy" };
    const e = findEnterable(pos, yaw);
    if (!e) return null;
    const r = enter(e);
    return r.ok ? { action: "enter", name: e.rec.name } : { action: "refused", reason: r.reason, name: e.rec.name };
  }

  /** ?interior=<shop id | template | variant>: walk straight into a matching shop. */
  function debugEnter(key) {
    const k = String(key || "").trim();
    let e = byId.get(Number(k));
    if (!e) {
      const pool = entries.filter((x) => x.rec.template === k || x.rec.variant === k || x.rec.kind === k);
      e = pool.find((x) => x.rec.curated) || pool[0];
    }
    if (!e) return null;
    if (e.shop) e.shop.open = true;
    toWorld(e, e.doorX, 1.0, _w);
    player.position.set(_w.x, e.gy + eye(), _w.z);
    snapCamera(yawInto(e));
    enter(e, { skipApproach: true });
    return e.rec;
  }

  return {
    count: entries.length,
    entries,
    findEnterable,
    prompt,
    interact,
    enter,
    exit: startExit,
    leaveNow,
    update,
    collide,
    cameraBlocker,
    debugEnter,
    /** Inside a shop (including the walk-in once past the veil, and the walk-out before it). */
    get active() {
      return !!current;
    },
    /** Player input is scripted (walking in or out). */
    get busy() {
      return state !== "out" && state !== "in";
    },
    /** { speed, yaw } for the avatar while scripted, else null. */
    get cutscene() {
      return cut;
    },
    get floorY() {
      return current ? current.e.gy : null;
    },
    get current() {
      return current ? current.e.rec : null;
    },
    get cached() {
      return [...cache.keys()];
    },
    setNight(glow) {
      kit.setNight(glow);
      doorGlow.setNight(glow);
      openingMat.color.setHex(glow > 0.5 ? 0xffd9a0 : 0xe8c99a);
    },
  };
}
