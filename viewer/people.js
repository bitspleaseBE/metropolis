/**
 * Rocketbox pedestrians (scripts/build_rocketbox_characters.py → characters/people/).
 *
 * 79 people ship, far more than fit in GPU memory at once (~10 MB of textures each), so a
 * pool keeps a share resident: a balanced first batch for the opening spawns, then the rest
 * streams in behind it and replaces walkers once they are out of sight. Households are put
 * together from the manifest's `look` tags so families, couples and friends look plausible.
 *
 * Walk-clip changes also update viewer/movement.html.
 * See .cursor/rules/movement-gallery.mdc.
 */
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { fitHumanoid } from "./humanoid-fit.js";
import { HEIGHT_JITTER, heightFor } from "./person-scale.js";

const DIR = new URL("./characters/people/", import.meta.url);
const loader = new GLTFLoader();

/** Identity scale keys on a centimetre armature pin the skin to the bind pose. */
function dropScaleTracks(THREE, clip) {
  if (!clip?.tracks?.length) return clip || null;
  const tracks = clip.tracks.filter((t) => !t.name.endsWith(".scale"));
  if (tracks.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// Look → household bucket. Hasidic only walks with Hasidic; Flemish/european,
// arab/muslim, and african may share a couple or friends group.
const CLUSTER = {
  european: "eu",
  slavic: "eu",
  mediterranean: "eu",
  african: "african",
  african_street: "african",
  asian: "asian",
  muslim: "muslim",
  arab: "muslim",
  arab_young: "muslim",
  hasidic: "hasidic",
};

/** Flemish, arab, and african mix; Hasidic never mixes with anyone else. */
const STREET_MIX = new Set(["eu", "african", "muslim"]);

function sharesHousehold(personOrCluster, withPersonOrCluster) {
  const a = typeof personOrCluster === "string" ? personOrCluster : CLUSTER[personOrCluster.look] || personOrCluster.look;
  const b =
    typeof withPersonOrCluster === "string"
      ? withPersonOrCluster
      : CLUSTER[withPersonOrCluster.look] || withPersonOrCluster.look;
  if (a === "hasidic" || b === "hasidic") return a === b;
  if (STREET_MIX.has(a) && STREET_MIX.has(b)) return true;
  return a === b;
}

// Always in the first batch, so the opening streets already show these households.
const SERVICE = new Set(["Police_Male_03", "Police_Male_04"]);
/** Police and shop staff (manifest role "staff") are only ever requested by id. */
const reserved = (p) => SERVICE.has(p.id) || p.role === "staff";

const FIRST = [
  "Hasidic_Father", "Hasidic_Mother", "Hasidic_Boy", "Hasidic_Girl",
  "Male_Adult_15", "Female_Adult_06", "Female_Child_02", "Male_Child_02_grey",
];

const HOUSEHOLDS = [
  { kind: "single", w: 30 },
  { kind: "couple", w: 16 },
  { kind: "family", w: 14 },
  { kind: "parentChild", w: 9 },
  { kind: "friends", w: 9 },
  { kind: "seniors", w: 6 },
  { kind: "kids", w: 4 },
  { kind: "hasidic", w: 6 },
  { kind: "muslimFamily", w: 6 },
];

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (a) => a[(Math.random() * a.length) | 0];
const cluster = (p) => CLUSTER[p.look] || p.look;

/**
 * @param THREE three namespace
 * @param opts.initial people loaded before the first spawn
 * @param opts.resident cap on loaded people (GPU memory); unused ones are evicted to make room
 */
export async function createPeoplePool(THREE, { initial = 8, resident = 14, rotate = false } = {}) {
  const res = await fetch(new URL("manifest.json", DIR));
  if (!res.ok) throw new Error(`people manifest: HTTP ${res.status}`);
  const people = (await res.json()).people;
  const byId = new Map(people.map((p) => [p.id, p]));
  const loaded = new Map(); // id → { person, scene, clip, users, lastUsed }
  const loading = new Map();

  async function load(id) {
    if (loaded.has(id)) return loaded.get(id);
    if (loading.has(id)) return loading.get(id);
    const person = byId.get(id);
    // Optional clips: get-up (scripts/bake_rocketbox_getup.py), ride/step
    // (scripts/bake_rocketbox_riders.py). Missing files leave stiff tip-up / Mixamo fallback.
    const getUpGltf = loader.loadAsync(new URL(`getup/${id}.glb`, DIR).href).catch(() => null);
    const rideGltf = loader.loadAsync(new URL(`ride/${id}.glb`, DIR).href).catch(() => null);
    const stepGltf = loader.loadAsync(new URL(`step/${id}.glb`, DIR).href).catch(() => null);
    const p = Promise.all([loader.loadAsync(new URL(person.file, DIR).href), getUpGltf, rideGltf, stepGltf])
      .then(([gltf, getUpGltf, rideGltf, stepGltf]) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          for (const m of [o.material].flat()) {
            if (m.alphaTest > 0) m.alphaToCoverage = true; // hair and lash cards
          }
        });
        const t = {
          person,
          scene: gltf.scene,
          // Scale tracks are identity and, on a 0.01 armature, fight the skin so
          // the body stays in the bind pose (arms out, legs straight).
          clip: dropScaleTracks(THREE, gltf.animations[0]),
          getUp: dropScaleTracks(THREE, getUpGltf?.animations[0]),
          ride: dropScaleTracks(THREE, rideGltf?.animations[0]),
          step: dropScaleTracks(THREE, stepGltf?.animations[0]),
          users: 0,
          lastUsed: 0,
          since: performance.now(),
        };
        loaded.set(id, t);
        return t;
      })
      .catch((err) => {
        console.warn(`[cityview] person load failed: ${id}`, err);
        return null;
      })
      .finally(() => loading.delete(id));
    loading.set(id, p);
    return p;
  }

  function evictOne() {
    let victim = null;
    for (const t of loaded.values()) {
      if (t.users === 0 && (!victim || t.lastUsed < victim.lastUsed)) victim = t;
    }
    if (!victim) return null;
    loaded.delete(victim.person.id);
    victim.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [o.material].flat()) {
        for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
        m.dispose();
      }
    });
    return victim.person.id;
  }

  // First batch: the fixed households, then a spread over ages and looks.
  const first = new Set(FIRST.filter((id) => byId.has(id) && !reserved(byId.get(id))));
  const rest = shuffle(people.filter((p) => !first.has(p.id) && !reserved(p)));
  const need = { child: 4, senior: 2 };
  for (const p of rest) {
    if (first.size >= initial) break;
    if (need[p.age] > 0) {
      need[p.age]--;
      first.add(p.id);
    }
  }
  const seenLook = new Set([...first].map((id) => byId.get(id).look));
  for (const p of rest) {
    if (first.size >= initial) break;
    if (!seenLook.has(p.look) || Math.random() < 0.5) {
      seenLook.add(p.look);
      first.add(p.id);
    }
  }
  for (const p of rest) if (first.size < initial) first.add(p.id);
  await Promise.all([...first].map(load));
  if (!loaded.size) throw new Error("no people loaded");

  // Optional stream-in: fill up to `resident`, then stop. Continuous rotate/evict was uploading
  // ~10 MB textures every few seconds for the whole session and made the tab unplayable.
  const queue = shuffle(people.filter((p) => !loaded.has(p.id) && !reserved(p)).map((p) => p.id));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let retiring = null;
  (async () => {
    while (loaded.size < resident && queue.length) {
      await load(queue.shift());
      if (loaded.size < resident) await sleep(800);
    }
    if (!rotate) return;
    for (;;) {
      if (!queue.length) {
        await sleep(5000);
        continue;
      }
      if (loaded.size >= resident) {
        const out = evictOne();
        if (!out) {
          if (!retiring || !loaded.has(retiring.person.id)) {
            retiring = null;
            for (const t of loaded.values()) if (!retiring || t.since < retiring.since) retiring = t;
          }
          await sleep(3000);
          continue;
        }
        retiring = null;
        queue.push(out);
      }
      await load(queue.shift());
      if (loaded.size >= resident) await sleep(8000);
    }
  })();

  const avail = (filter) => [...loaded.values()].filter((t) => filter(t.person));
  /** Prefer people nobody is wearing right now, so streamed-in models actually show up. */
  function choose(filter, exclude) {
    let all = avail((p) => filter(p) && !exclude.has(p.id) && !reserved(p));
    if (all.length > 1) all = all.filter((t) => t !== retiring);
    if (!all.length) return null;
    const least = Math.min(...all.map((t) => t.users));
    return pick(all.filter((t) => t.users <= least + 1));
  }

  const adult = (p) => p.age === "adult";
  const grown = (p) => p.age !== "child";
  const child = (p) => p.age === "child";

  /**
   * Templates for one household walking together.
   * @param {{ look?: string, weights?: Record<string, number> }} [opts]
   *   `look` biases the first adult; `weights` overrides HOUSEHOLDS kind weights
   *   (from population.householdWeights).
   */
  function household(opts = {}) {
    const used = new Set();
    const take = (filter) => {
      const t = choose(filter, used);
      if (t) used.add(t.person.id);
      return t;
    };
    const wantLook = opts.look || null;
    const wantCluster = wantLook ? CLUSTER[wantLook] || wantLook : null;
    const kind = (() => {
      const table = opts.weights
        ? Object.entries(opts.weights)
            .filter(([, w]) => w > 0)
            .map(([k, w]) => ({ kind: k, w }))
        : HOUSEHOLDS;
      if (!table.length) return "single";
      let r = Math.random() * table.reduce((s, h) => s + h.w, 0);
      for (const h of table) if ((r -= h.w) < 0) return h.kind;
      return table[0].kind;
    })();
    const out = [];
    const pair = (look) => {
      const prefer = look || wantCluster;
      const a =
        take((p) => adult(p) && (!prefer || cluster(p) === prefer)) ||
        take((p) => adult(p) && (!prefer || sharesHousehold(p, prefer)));
      if (!a) return null;
      out.push(a);
      const b = take((p) => adult(p) && p.sex !== a.person.sex && sharesHousehold(p, a.person));
      if (b) out.push(b);
      return a.person;
    };
    const kids = (anchor, n) => {
      if (!anchor) return;
      for (let i = 0; i < n; i++) {
        const k = take((p) => child(p) && sharesHousehold(p, anchor));
        if (k) out.push(k);
      }
    };
    switch (kind) {
      case "hasidic":
      case "muslimFamily": {
        const look = kind === "hasidic" ? "hasidic" : "muslim";
        const parent = pair(look);
        kids(parent, 1 + ((Math.random() * (kind === "hasidic" ? 3 : 2)) | 0));
        break;
      }
      case "family":
        kids(pair(null), 1 + (Math.random() < 0.45 ? 1 : 0));
        break;
      case "couple":
        pair(null);
        break;
      case "parentChild": {
        const a = take(adult);
        if (a) {
          out.push(a);
          kids(a.person, 1);
        }
        break;
      }
      case "friends": {
        const a = take(grown);
        if (a) out.push(a);
        for (let i = 0; a && i < 1 + (Math.random() < 0.4 ? 1 : 0); i++) {
          const b = take((p) => p.age === a.person.age && sharesHousehold(p, a.person));
          if (b) out.push(b);
        }
        break;
      }
      case "seniors": {
        const a = take((p) => p.age === "senior");
        if (a) out.push(a);
        const b =
          a &&
          Math.random() < 0.6 &&
          take(
            (p) =>
              sharesHousehold(p, a.person) &&
              (p.age === "senior" || (adult(p) && p.sex !== a.person.sex)),
          );
        if (b) out.push(b);
        break;
      }
      case "kids": {
        const k0 = take(child);
        if (k0) out.push(k0);
        const k1 = k0 && take((p) => child(p) && sharesHousehold(p, k0.person));
        if (k1) out.push(k1);
        break;
      }
    }
    if (!out.length) out.push(take(grown) || pick([...loaded.values()]));
    // A household with children but no grown-up gets one who can walk with them.
    if (kind !== "kids" && out.every((t) => t.person.age === "child")) {
      const a = take((p) => adult(p) && sharesHousehold(p, out[0].person)) || take(adult);
      if (a) out.unshift(a);
    }
    return { kind, members: out };
  }

  /**
   * A walking clone of `t`: { root, mixer, action, getUp, height, naturalSpeed, hipsY }.
   * naturalSpeed is the pace (m/s) at which the clip's feet do not slide, after scaling
   * to `height`. getUp (null without a baked clip) is a stopped, play-once scramble from
   * lying face down to standing.
   */
  function instance(t) {
    const p = t.person;
    const jitter = 1 + (Math.random() * 2 - 1) * HEIGHT_JITTER;
    const height = heightFor(p.age) * jitter;
    const root = cloneSkeleton(t.scene);
    const hipsY = fitHumanoid(THREE, root, height);
    const mixer = new THREE.AnimationMixer(root);
    let action = null;
    if (t.clip) {
      action = mixer.clipAction(t.clip);
      action.play();
      action.time = Math.random() * t.clip.duration;
      // Apply a walk frame now. Until the mixer steps, the skin sits in the bind pose.
      mixer.update(0);
    }
    let getUp = null;
    if (t.getUp) {
      getUp = mixer.clipAction(t.getUp);
      getUp.setLoop(THREE.LoopOnce, 1);
      getUp.clampWhenFinished = true;
    }
    t.users++;
    t.lastUsed = performance.now();
    return {
      root,
      mixer,
      action,
      walk: action,
      getUp,
      height,
      hipsY,
      naturalSpeed: p.walkSpeed * (height / (p.height || height)),
      template: t,
    };
  }

  /** Sync pick among loaded templates (micromobility spawn). */
  function pickTemplate(filter = () => true) {
    return choose(filter, new Set());
  }

  function templateHas(id, kind) {
    const t = loaded.get(id);
    if (!t) return false;
    if (kind === "ride") return !!t.ride;
    if (kind === "step") return !!t.step;
    if (kind === "getUp") return !!t.getUp;
    return !!t.clip;
  }

  /**
   * Clone seated/standing on a bike or step. Plays the baked ride/step clip when present;
   * otherwise falls back to the walk clip (Mixamo path in micromobility is preferred then).
   */
  function instanceRide(t, kind = "ride") {
    const inst = instance(t);
    const clip = kind === "step" ? t.step : t.ride;
    if (!clip) return inst;
    if (inst.action) {
      inst.action.stop();
      inst.action.setEffectiveWeight(0);
    }
    const action = inst.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    action.time = Math.random() * clip.duration;
    inst.mixer.update(0);
    inst.action = action;
    inst.rideKind = kind;
    return inst;
  }

  async function acquire(id) {
    if (!byId.has(id)) return null;
    const t = await load(id);
    return t ? instance(t) : null;
  }

  /** First loaded match, otherwise load one person who passes `filter`. */
  async function acquireMatching(filter) {
    const ready = choose(filter, new Set());
    if (ready) return instance(ready);
    const person = people.find((p) => filter(p) && !reserved(p));
    if (!person) return null;
    const t = await load(person.id);
    return t ? instance(t) : null;
  }

  // Idle (scripts/bake_rocketbox_idle.py) loads on first use: only interiors stand people still.
  const idleLoads = new Map();
  function loadIdle(t) {
    if (t.idle !== undefined) return Promise.resolve(t.idle);
    const id = t.person.id;
    if (!idleLoads.has(id)) {
      idleLoads.set(
        id,
        loader
          .loadAsync(new URL(`idle/${id}.glb`, DIR).href)
          .then((g) => dropScaleTracks(THREE, g.animations[0]), () => null)
          .then((clip) => {
            t.idle = clip;
            idleLoads.delete(id);
            return clip;
          }),
      );
    }
    return idleLoads.get(id);
  }

  /**
   * Cross-fade an instance between its walk and the standing idle. Returns false when the
   * person has no idle clip loaded (call loadIdle first); `fade` 0 snaps.
   */
  function setIdle(inst, on, fade = 0.35) {
    const clip = inst.template.idle;
    if (!clip) return false;
    if (!!inst.idling === on) return true;
    if (!inst.idleAction) {
      inst.idleAction = inst.mixer.clipAction(clip);
      inst.idleAction.time = Math.random() * clip.duration;
    }
    const [from, to] = on ? [inst.walk, inst.idleAction] : [inst.idleAction, inst.walk];
    if (to) {
      to.enabled = true;
      to.setEffectiveWeight(1);
      to.play();
    }
    if (from && to && fade > 0) to.crossFadeFrom(from, fade, false);
    else if (from) from.stop();
    inst.action = to || inst.action;
    inst.idling = on;
    inst.mixer.update(0);
    return true;
  }

  /** A clone of person `id` already standing in the idle (walk pose without a baked idle). */
  async function acquireStanding(id) {
    const inst = await acquire(id);
    if (!inst) return null;
    await loadIdle(inst.template);
    setIdle(inst, true, 0);
    return inst;
  }

  function release(inst) {
    inst.mixer.stopAllAction();
    inst.mixer.uncacheRoot(inst.root);
    inst.template.users--;
    inst.template.lastUsed = performance.now();
  }

  return {
    household,
    instance,
    instanceRide,
    pickTemplate,
    templateHas,
    acquire,
    acquireMatching,
    acquireStanding,
    loadIdle,
    setIdle,
    release,
    /** Manifest entries (read-only), e.g. to pick staff by role or customers by age. */
    people,
    get residentCount() {
      return loaded.size;
    },
    get pending() {
      return queue.length;
    },
    /** Person being phased out to make room; redress groups wearing them first. */
    get retiring() {
      return retiring;
    },
    total: people.length,
  };
}
