/**
 * Gunfire feedback: muzzle flash + light, tracers, impact dust, blood, bullet holes,
 * and synthesized WebAudio shots (no sound files to ship). Everything is pooled.
 */
const TRACERS = 48;
const PUFFS = 96;
const DECALS = 64;

function flashTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,240,1)");
  r.addColorStop(0.25, "rgba(255,210,120,0.95)");
  r.addColorStop(0.6, "rgba(255,120,30,0.35)");
  r.addColorStop(1, "rgba(255,80,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  // A few star spikes so the flash doesn't read as a ball.
  g.globalCompositeOperation = "lighter";
  g.strokeStyle = "rgba(255,230,160,0.7)";
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function holeTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  r.addColorStop(0, "rgba(10,8,6,1)");
  r.addColorStop(0.35, "rgba(30,26,22,0.9)");
  r.addColorStop(0.7, "rgba(60,55,50,0.35)");
  r.addColorStop(1, "rgba(60,55,50,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createWeaponFx(THREE, scene) {
  const flashTex = flashTexture(THREE);
  const dotTex = dotTexture(THREE);

  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  flash.visible = false;
  flash.renderOrder = 10;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffb060, 0, 7, 2);
  scene.add(flashLight);
  let flashT = 0;

  // Tracers: one line segment each, faded by vertex colour.
  const tPos = new Float32Array(TRACERS * 6);
  const tCol = new Float32Array(TRACERS * 6);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  const tracers = new THREE.LineSegments(
    tGeo,
    new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  );
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tLife = new Float32Array(TRACERS);
  const tSeg = Array.from({ length: TRACERS }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3() }));
  let tNext = 0;

  // Puffs: dust, sparks, blood. Points with per-particle size via a tiny shader.
  const pPos = new Float32Array(PUFFS * 3);
  const pCol = new Float32Array(PUFFS * 4);
  const pSize = new Float32Array(PUFFS);
  const pVel = new Float32Array(PUFFS * 3);
  const pLife = new Float32Array(PUFFS);
  const pMax = new Float32Array(PUFFS);
  const pGrow = new Float32Array(PUFFS);
  const pGrav = new Float32Array(PUFFS);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 4));
  pGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: dotTex }, scale: { value: 600 } },
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
      uniform float scale;
      void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vC;
      void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC.rgb,vC.a*t.a); if(gl_FragColor.a<0.01) discard; }`,
    transparent: true,
    depthWrite: false,
  });
  const puffs = new THREE.Points(pGeo, pMat);
  puffs.frustumCulled = false;
  puffs.renderOrder = 9;
  scene.add(puffs);
  const pBase = new Float32Array(PUFFS * 3);
  let pNext = 0;

  // Bullet holes on static surfaces.
  const decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
  const decalMat = new THREE.MeshBasicMaterial({
    map: holeTexture(THREE),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const decals = new THREE.InstancedMesh(decalGeo, decalMat, DECALS);
  decals.count = 0;
  decals.frustumCulled = false;
  scene.add(decals);
  let dNext = 0;
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3(1, 1, 1);
  const _z = new THREE.Vector3(0, 0, 1);

  function puff(p, n, opts) {
    for (let i = 0; i < n; i++) {
      const k = pNext;
      pNext = (pNext + 1) % PUFFS;
      pPos[k * 3] = p.x;
      pPos[k * 3 + 1] = p.y;
      pPos[k * 3 + 2] = p.z;
      const sp = opts.speed * (0.4 + Math.random() * 0.6);
      const nx = (opts.dir?.x ?? 0) + (Math.random() - 0.5) * opts.spread;
      const ny = (opts.dir?.y ?? 0.5) + (Math.random() - 0.5) * opts.spread;
      const nz = (opts.dir?.z ?? 0) + (Math.random() - 0.5) * opts.spread;
      pVel[k * 3] = nx * sp;
      pVel[k * 3 + 1] = ny * sp;
      pVel[k * 3 + 2] = nz * sp;
      pBase[k * 3] = opts.color[0];
      pBase[k * 3 + 1] = opts.color[1];
      pBase[k * 3 + 2] = opts.color[2];
      pLife[k] = pMax[k] = opts.life * (0.7 + Math.random() * 0.6);
      pSize[k] = opts.size * (0.7 + Math.random() * 0.6);
      pGrow[k] = opts.grow ?? 0;
      pGrav[k] = opts.gravity ?? 0;
    }
  }

  function decal(point, normal) {
    if (!normal) return;
    _q.setFromUnitVectors(_z, normal);
    const s = 0.7 + Math.random() * 0.6;
    _s.set(s, s, s);
    _m.compose(point.clone().addScaledVector(normal, 0.004), _q, _s);
    decals.setMatrixAt(dNext, _m);
    dNext = (dNext + 1) % DECALS;
    decals.count = Math.max(decals.count, dNext === 0 ? DECALS : dNext);
    decals.instanceMatrix.needsUpdate = true;
  }

  // --- Audio
  let ctx = null;
  let noise = null;
  let master = null;
  function audio() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const SOUND = {
    pistol: { f: 1600, body: 140, len: 0.22, gain: 0.9, crack: 0.5 },
    shotgun: { f: 900, body: 70, len: 0.5, gain: 1.2, crack: 0.3 },
    smg: { f: 2000, body: 160, len: 0.14, gain: 0.7, crack: 0.45 },
    rifle: { f: 2400, body: 110, len: 0.3, gain: 1, crack: 0.8 },
  };

  function burst(t, { f, len, gain, q = 0.8, type = "lowpass", decay = 3 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f * 0.25), t + len);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len * (decay / 3));
    src.connect(flt).connect(g).connect(master);
    src.start(t, Math.random() * 0.2, len + 0.05);
  }

  function thump(t, f, len, gain) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.35, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  function shotSound(id, distance = 0) {
    if (!audio()) return;
    if (ctx.state === "suspended") ctx.resume();
    const s = SOUND[id] || SOUND.pistol;
    const t = ctx.currentTime;
    const far = 1 / (1 + distance * 0.06);
    burst(t, { f: s.f * (0.92 + Math.random() * 0.16), len: s.len, gain: s.gain * far });
    burst(t, { f: 5200, len: 0.05, gain: s.crack * far, type: "highpass", q: 0.5 });
    thump(t, s.body, s.len * 0.8, 0.7 * s.gain * far);
    // Tail off the buildings.
    burst(t + 0.05, { f: 700, len: s.len * 2.2, gain: 0.12 * s.gain * far, decay: 4 });
  }

  function click(f = 3200, gain = 0.25, len = 0.03, delay = 0) {
    if (!audio()) return;
    const t = ctx.currentTime + delay;
    burst(t, { f, len, gain, type: "bandpass", q: 6 });
  }

  const v = new THREE.Vector3();

  return {
    /** Muzzle flash, tracer(s), and impacts for one trigger pull. */
    shot(def, from, dir, hits, opts = {}) {
      flash.position.copy(from).addScaledVector(dir, 0.06);
      const big = def.id === "shotgun" ? 0.34 : def.id === "pistol" ? 0.17 : 0.22;
      flash.scale.setScalar(big * (0.8 + Math.random() * 0.4));
      flash.material.rotation = Math.random() * Math.PI;
      flash.visible = true;
      flashLight.position.copy(flash.position);
      flashLight.intensity = def.id === "shotgun" ? 9 : 5;
      flashT = 0.045;
      for (const h of hits) {
        if (Math.random() < (def.pellets > 1 ? 0.35 : 0.7)) {
          const k = tNext;
          tNext = (tNext + 1) % TRACERS;
          tSeg[k].a.copy(h.from);
          tSeg[k].b.copy(h.point);
          tSeg[k].d.subVectors(h.point, h.from);
          tLife[k] = 0.07;
        }
        if (h.target) {
          v.copy(h.point);
          puff(v, h.head ? 10 : 6, {
            color: [0.55, 0.02, 0.02],
            speed: 2.2,
            spread: 1.2,
            dir: { x: dir.x, y: 0.4, z: dir.z },
            life: 0.45,
            size: 0.05,
            grow: 0.05,
            gravity: 7,
          });
        } else if (h.object) {
          const n = h.normal || v.copy(dir).negate();
          puff(h.point, 5, { color: [0.62, 0.58, 0.52], speed: 1.1, spread: 0.8, dir: n, life: 0.6, size: 0.07, grow: 0.25, gravity: 0.6 });
          puff(h.point, 3, { color: [1, 0.8, 0.4], speed: 4, spread: 1.5, dir: n, life: 0.12, size: 0.025, gravity: 8 });
          if (h.object !== "ground" || Math.random() < 0.5) decal(h.point, h.normal);
        }
      }
      if (!opts.silent) shotSound(def.id, opts.distance || 0);
    },
    /** A shot fired by someone else (police), heard from `distance` metres. */
    remoteShot(id, from, to, distance) {
      const k = tNext;
      tNext = (tNext + 1) % TRACERS;
      tSeg[k].a.copy(from);
      tSeg[k].b.copy(to);
      tSeg[k].d.subVectors(to, from);
      tLife[k] = 0.07;
      shotSound(id, distance);
    },
    blood(p, n = 8) {
      puff(p, n, { color: [0.5, 0.02, 0.02], speed: 1.6, spread: 1.4, life: 0.5, size: 0.06, grow: 0.06, gravity: 6 });
    },
    dry() {
      click(2400, 0.35, 0.025);
    },
    reload(dur = 1.5) {
      click(1800, 0.3, 0.04, dur * 0.25);
      click(2600, 0.35, 0.035, dur * 0.7);
      click(3400, 0.25, 0.03, dur * 0.85);
    },
    equip() {
      click(2200, 0.2, 0.03);
      click(3000, 0.18, 0.025, 0.08);
    },
    swish() {
      if (!audio()) return;
      burst(ctx.currentTime, { f: 3800, len: 0.16, gain: 0.25, type: "bandpass", q: 1.6 });
    },
    hitTick(kill) {
      if (!audio()) return;
      click(kill ? 1400 : 4200, kill ? 0.5 : 0.22, kill ? 0.08 : 0.025);
    },
    /** Call from a user gesture so the first shot isn't silent on Safari. */
    unlock() {
      if (audio() && ctx.state === "suspended") ctx.resume();
    },
    update(dt) {
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) {
          flash.visible = false;
          flashLight.intensity = 0;
        }
      }
      for (let k = 0; k < TRACERS; k++) {
        const o = k * 6;
        if (tLife[k] <= 0) {
          tCol.fill(0, o, o + 6);
          continue;
        }
        tLife[k] -= dt;
        const s = tSeg[k];
        // A short streak racing down the line, not a laser.
        const u = 1 - Math.max(0, tLife[k]) / 0.07;
        const head = Math.min(1, u * 1.4 + 0.15);
        const tail = Math.max(0, head - 0.35);
        tPos[o] = s.a.x + s.d.x * tail;
        tPos[o + 1] = s.a.y + s.d.y * tail;
        tPos[o + 2] = s.a.z + s.d.z * tail;
        tPos[o + 3] = s.a.x + s.d.x * head;
        tPos[o + 4] = s.a.y + s.d.y * head;
        tPos[o + 5] = s.a.z + s.d.z * head;
        const a = Math.max(0, tLife[k] / 0.07);
        tCol[o] = 0.2 * a;
        tCol[o + 1] = 0.16 * a;
        tCol[o + 2] = 0.08 * a;
        tCol[o + 3] = 1 * a;
        tCol[o + 4] = 0.85 * a;
        tCol[o + 5] = 0.55 * a;
      }
      tGeo.attributes.position.needsUpdate = true;
      tGeo.attributes.color.needsUpdate = true;
      for (let k = 0; k < PUFFS; k++) {
        if (pLife[k] <= 0) {
          pCol[k * 4 + 3] = 0;
          continue;
        }
        pLife[k] -= dt;
        pVel[k * 3 + 1] -= pGrav[k] * dt;
        const drag = Math.exp(-3 * dt);
        pVel[k * 3] *= drag;
        pVel[k * 3 + 2] *= drag;
        pPos[k * 3] += pVel[k * 3] * dt;
        pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt;
        pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
        pSize[k] += pGrow[k] * dt;
        const a = Math.max(0, pLife[k] / pMax[k]);
        pCol[k * 4] = pBase[k * 3];
        pCol[k * 4 + 1] = pBase[k * 3 + 1];
        pCol[k * 4 + 2] = pBase[k * 3 + 2];
        pCol[k * 4 + 3] = a * 0.9;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      pGeo.attributes.size.needsUpdate = true;
    },
    setViewportHeight(h) {
      pMat.uniforms.scale.value = h * 0.6;
    },
  };
}
