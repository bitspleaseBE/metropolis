/**
 * High-tier visuals for the street viewer: shadows, composer (bloom / SSAO /
 * colour grade), HDRI + physical sky, selective PBR wetness, height fog.
 * Low quality leaves the classic single-pass Lambert path untouched.
 */

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const QUALITY_KEY = "metropolis-quality";
const SHADOW_EXTENT = 48;
const SHADOW_MAP = 1024;

/** @returns {"low"|"high"} */
export function resolveQuality() {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "low" || q === "high") return q;
  try {
    const stored = localStorage.getItem(QUALITY_KEY);
    if (stored === "low" || stored === "high") return stored;
  } catch {
    /* ignore */
  }
  const coarse = matchMedia("(pointer: coarse)").matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  return coarse || saveData || lowMem ? "low" : "high";
}

export function storeQuality(q) {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* ignore */
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: null },
    uGamma: { value: null },
    uGain: { value: null },
    uSat: { value: 1.05 },
    uVignette: { value: 0.22 },
    uSplitWarm: { value: null },
    uSplitCool: { value: null },
    uSplit: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift;
    uniform vec3 uGamma;
    uniform vec3 uGain;
    uniform float uSat;
    uniform float uVignette;
    uniform vec3 uSplitWarm;
    uniform vec3 uSplitCool;
    uniform float uSplit;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col = uGain * (pow(max(col + uLift, 0.0), uGamma));
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSat);
      float t = smoothstep(0.0, 1.0, luma);
      col *= mix(uSplitCool, uSplitWarm, mix(0.5, t, uSplit));
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, d);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

/**
 * Materials that stay MeshStandard on high (roads, metal, roofs) for sheen / wetness.
 * Keep in sync with keepCityPbr name tests in index.html.
 */
export function keepCityPbrHigh(mat) {
  const tag = mat.userData && mat.userData.cityview_shader;
  if (tag === "pbr") return true;
  if (tag === "lambert") return false;
  const n = (mat.name || "").toLowerCase();
  if (n.includes("glass") || n.includes("water") || n.includes("gold") || n.startsWith("car_")) {
    return true;
  }
  return (
    n.startsWith("road_") ||
    n.startsWith("park_path") ||
    n.includes("cobble") ||
    n.startsWith("sidewalk") ||
    n.startsWith("curb") ||
    n.startsWith("rail_") ||
    n.startsWith("tram_") ||
    n.startsWith("zebra") ||
    n.includes("roof") ||
    n.includes("metal") ||
    n.includes("asphalt")
  );
}

/**
 * @param {{
 *   THREE: typeof import("three"),
 *   renderer: import("three").WebGLRenderer,
 *   scene: import("three").Scene,
 *   camera: import("three").PerspectiveCamera,
 *   sun: import("three").DirectionalLight,
 *   sunMesh?: import("three").Mesh,
 *   sunHaze?: import("three").Mesh,
 *   skyBackground?: import("three").Texture,
 *   quality: "low"|"high",
 * }} opts
 */
export function createVisualQuality(opts) {
  const { THREE, renderer, scene, camera, sun } = opts;
  let quality = opts.quality === "high" ? "high" : "low";
  const high = () => quality === "high";

  let composer = null;
  let bloomPass = null;
  let gtaoPass = null;
  let gradePass = null;
  let outputPass = null;
  let dayEnv = null;
  let nightEnv = null;
  let cityTilesCast = false;
  /** @type {import("three").MeshStandardMaterial[]} */
  const wetMats = [];
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const _shadowCenter = new THREE.Vector3();
  /** Stable world-space sun/moon aim — never derived from the shadow-offset light position. */
  const _sunAim = new THREE.Vector3(220, 320, -160);
  const _sunDir = new THREE.Vector3();
  const _lift = new THREE.Vector3(0.02, 0.015, 0.01);
  const _gamma = new THREE.Vector3(0.95, 0.97, 1.02);
  const _gain = new THREE.Vector3(1.05, 1.02, 0.98);
  const _warm = new THREE.Vector3(1.06, 1.02, 0.96);
  const _cool = new THREE.Vector3(0.96, 0.99, 1.06);
  let lastEnvKey = "";
  let lastTodBucket = -1;
  let lastExposure = -1;

  function enableShadows() {
    if (!high()) return;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.intensity = 1;
    const cam = sun.shadow.camera;
    cam.near = 1;
    cam.far = 420;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.updateProjectionMatrix();
  }

  /** Call whenever the day/night aim changes — NOT the shadow-offset sun.position. */
  function setSunAim(x, y, z) {
    if (typeof x === "object" && x != null) _sunAim.set(x.x, x.y, x.z);
    else _sunAim.set(x, y, z);
  }

  function updateShadowFrustum(playerPos, dayAmt) {
    if (!high() || !renderer.shadowMap.enabled) return;
    // Soft moon shadows at night so the street still grounds — dimmer than day.
    sun.castShadow = true;
    sun.shadow.intensity = Math.max(0.25, Math.min(1, 0.35 + 0.65 * dayAmt));
    _shadowCenter.set(playerPos.x, 0, playerPos.z);
    // Snap to texel size so shadows don't shimmer while walking.
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    _shadowCenter.x = Math.floor(_shadowCenter.x / texel) * texel;
    _shadowCenter.z = Math.floor(_shadowCenter.z / texel) * texel;
    sun.target.position.copy(_shadowCenter);
    sun.target.updateMatrixWorld();
    // Aim is world-space direction to the sun disc — never renormalize the offset light pos
    // (that was drifting the light every frame and flickering the whole street).
    _sunDir.copy(_sunAim).normalize();
    if (_sunDir.lengthSq() < 1e-8) _sunDir.set(0.4, 0.8, -0.3).normalize();
    sun.position.copy(_shadowCenter).addScaledVector(_sunDir, 280);
  }

  /**
   * @param {import("three").Object3D} root
   * @param {{ castBuildings?: boolean }} [cfg]
   */
  function applyCityShadows(root, cfg = {}) {
    if (!high()) {
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = false;
        obj.receiveShadow = false;
      });
      return;
    }
    cityTilesCast = !!cfg.castBuildings;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      // Merged tiles are named merged_<original>; strip the prefix for classification.
      let n = (obj.name || "").toLowerCase();
      if (n.startsWith("merged_")) n = n.slice("merged_".length);
      const isGround =
        n === "ground" ||
        n.startsWith("road_") ||
        n.startsWith("sidewalk") ||
        n.startsWith("park_") ||
        n.startsWith("curb") ||
        n.startsWith("tram_") ||
        n.startsWith("zebra") ||
        n.startsWith("dash") ||
        n.includes("cobble");
      obj.receiveShadow = true;
      // Actor meshes (people/cars) set cast themselves; city tiles cast only when enabled.
      if (cityTilesCast && !isGround && !n.includes("facade")) {
        obj.castShadow = true;
      } else {
        obj.castShadow = false;
      }
    });
  }

  function applyAnisotropy(root) {
    const max = renderer.capabilities.getMaxAnisotropy();
    const seen = new Set();
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"]) {
          const tex = m[key];
          if (!tex || seen.has(tex.uuid)) continue;
          seen.add(tex.uuid);
          tex.anisotropy = max;
          tex.needsUpdate = true;
        }
      }
    });
  }

  function patchHeightFog(mat) {
    if (!high() || !mat || mat.userData._heightFog) return;
    mat.userData._heightFog = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      if (typeof prev === "function") prev(shader);
      shader.uniforms.fogHeightFalloff = { value: 0.035 };
      shader.uniforms.fogSunDir = { value: new THREE.Vector3(0.4, 0.7, -0.3) };
      shader.uniforms.fogSunColor = { value: new THREE.Color(0xffe2b0) };
      mat.userData.fogUniforms = shader.uniforms;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        /* glsl */ `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogDepth = vFogDepth;
            float hFade = exp(-max(0.0, (fogHeightFalloff) * max(0.0, vFogWorldPos.y)));
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth * hFade);
            vec3 look = normalize(vFogWorldPos - cameraPosition);
            float sunAmt = pow(max(0.0, dot(look, fogSunDir)), 8.0);
            vec3 fogCol = mix(fogColor, fogSunColor, sunAmt * 0.45);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
          #else
            #include <fog_fragment>
          #endif
        #endif
        `,
      );
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vFogWorldPos;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying vec3 vFogWorldPos;\nuniform float fogHeightFalloff;\nuniform vec3 fogSunDir;\nuniform vec3 fogSunColor;`,
        );
    };
    mat.needsUpdate = true;
  }

  function tunePbrMaterial(mat, meshName = "") {
    if (!mat || !mat.isMeshStandardMaterial) return;
    const n = `${mat.name || ""} ${meshName}`.toLowerCase();
    if (n.includes("glass") || n.includes("water") || n.includes("gold") || n.startsWith("car_")) {
      return;
    }
    if (
      n.includes("road_") ||
      n.includes("asphalt") ||
      n.includes("cobble") ||
      n.includes("park_path")
    ) {
      mat.roughness = Math.min(mat.roughness ?? 1, 0.72);
      mat.metalness = Math.max(mat.metalness ?? 0, 0.05);
      mat.envMapIntensity = mat.envMapIntensity ?? 0.55;
      mat.userData.dayRoughness = mat.roughness;
      mat.userData.dayEnv = mat.envMapIntensity;
      wetMats.push(mat);
      patchHeightFog(mat);
    } else if (n.includes("sidewalk") || n.includes("curb") || n.includes("tram_") || n.includes("rail_")) {
      mat.roughness = Math.min(mat.roughness ?? 1, 0.85);
      mat.metalness = Math.max(mat.metalness ?? 0, 0.02);
      mat.envMapIntensity = mat.envMapIntensity ?? 0.4;
      mat.userData.dayRoughness = mat.roughness;
      mat.userData.dayEnv = mat.envMapIntensity;
      wetMats.push(mat);
      patchHeightFog(mat);
    } else if (n.includes("roof") || n.includes("metal")) {
      mat.roughness = Math.min(mat.roughness ?? 1, 0.55);
      mat.metalness = Math.max(mat.metalness ?? 0, 0.35);
      mat.envMapIntensity = mat.envMapIntensity ?? 0.7;
      patchHeightFog(mat);
    }
  }

  function varyWindowGlow(mat) {
    if (!high() || !mat || !mat.emissiveMap) return;
    // Mild per-material jitter so night façades don't glow uniformly.
    const h = hashStr(mat.name || mat.uuid);
    mat.userData.glowJitter = 0.65 + (h % 1000) / 1000 * 0.7;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function buildComposer() {
    if (!high()) return;
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // GTAO is expensive; start disabled and enable via enableAO() after the gate passes.
    gtaoPass = new GTAOPass(scene, camera, Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.blendIntensity = 0.65;
    gtaoPass.enabled = false;
    gtaoPass.updateGtaoMaterial({
      radius: 0.3,
      distanceExponent: 1.5,
      thickness: 0.45,
      scale: 0.75,
      samples: 6,
      distanceFallOff: 0.85,
    });
    composer.addPass(gtaoPass);

    // Quarter-res bloom keeps night glow without filling the GPU.
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1)),
      0.25,
      0.35,
      0.9,
    );
    bloomPass.threshold = 0.92;
    bloomPass.strength = 0.22;
    bloomPass.radius = 0.28;
    composer.addPass(bloomPass);

    gradePass = new ShaderPass(GradeShader);
    gradePass.uniforms.uLift.value = _lift.clone();
    gradePass.uniforms.uGamma.value = _gamma.clone();
    gradePass.uniforms.uGain.value = _gain.clone();
    gradePass.uniforms.uSplitWarm.value = _warm.clone();
    gradePass.uniforms.uSplitCool.value = _cool.clone();
    // Mild grade — heavy lift/gain washed the street out in playtest.
    gradePass.uniforms.uSat.value = 1.04;
    gradePass.uniforms.uVignette.value = 0.14;
    gradePass.uniforms.uSplit.value = 0.22;
    composer.addPass(gradePass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);
    // Keep ACES on the renderer — OutputPass reads renderer.toneMapping / exposure.
  }

  async function loadHdris() {
    if (!high()) return;
    const loader = new RGBELoader();
    try {
      const [dayTex, nightTex] = await Promise.all([
        loader.loadAsync("./env/day.hdr"),
        loader.loadAsync("./env/night.hdr"),
      ]);
      dayTex.mapping = THREE.EquirectangularReflectionMapping;
      nightTex.mapping = THREE.EquirectangularReflectionMapping;
      dayEnv = pmrem.fromEquirectangular(dayTex).texture;
      nightEnv = pmrem.fromEquirectangular(nightTex).texture;
      dayTex.dispose();
      nightTex.dispose();
      scene.environment = dayEnv;
    } catch (err) {
      console.warn("[visual-quality] HDRI load failed, keeping RoomEnvironment", err);
    }
  }

  function installPhysicalSky() {
    // Preetham Sky + EffectComposer was blowing the backdrop to pure white.
    // Keep the painted canvas gradient (index.html) and the sun disc; HDRI handles IBL.
    if (opts.sunMesh) opts.sunMesh.visible = true;
    if (opts.sunHaze) opts.sunHaze.visible = true;
  }

  function bakeSkyEnv(_hour, _force = false) {
    // IBL comes from the day/night HDRIs — no live Sky bake.
  }

  function updateSky(_tod, _hour) {
    // Never touch scene.background on high — index.html owns the zenith→horizon canvas.
    if (opts.sunMesh) opts.sunMesh.visible = true;
    if (opts.sunHaze) opts.sunHaze.visible = true;
  }

  function updateGrade(tod) {
    if (!gradePass) return;
    const night = tod;
    const dusk = Math.max(0, 1 - Math.abs(tod - 0.45) / 0.45);
    gradePass.uniforms.uSat.value = 1.06 - 0.05 * night;
    gradePass.uniforms.uVignette.value = 0.16 + 0.12 * night;
    gradePass.uniforms.uSplit.value = 0.22 + 0.25 * dusk;
    _warm.set(1.05 + 0.06 * dusk, 1.02, 0.95 - 0.03 * night);
    _cool.set(0.96, 0.99 + 0.03 * night, 1.05);
    gradePass.uniforms.uSplitWarm.value.copy(_warm);
    gradePass.uniforms.uSplitCool.value.copy(_cool);
    _gain.set(1.03 - 0.05 * night, 1.01, 0.98 + 0.03 * night);
    gradePass.uniforms.uGain.value.copy(_gain);
    _lift.set(0.008, 0.006, 0.004);
    gradePass.uniforms.uLift.value.copy(_lift);
  }

  function updateBloom(tod) {
    if (!bloomPass) return;
    const night = Math.max(0, (tod - 0.35) / 0.65);
    // High threshold so bloom only catches lamps/windows — avoids sparkle flicker on facades.
    bloomPass.strength = 0.1 + 0.45 * night;
    bloomPass.threshold = 0.96 - 0.12 * night;
  }

  function updateWetness(tod) {
    const night = Math.max(0, (tod - 0.4) / 0.6);
    const wet = 0.15 + 0.55 * night; // night streets get wetter look
    for (const m of wetMats) {
      const baseR = m.userData.dayRoughness ?? 0.75;
      const baseE = m.userData.dayEnv ?? 0.5;
      m.roughness = Math.max(0.18, baseR * (1 - 0.55 * wet));
      m.envMapIntensity = baseE * (1 + 1.4 * wet);
    }
  }

  function updateEnv(tod) {
    if (!high()) return;
    const night = Math.max(0, (tod - 0.35) / 0.65);
    // Discrete slots only — never reassign the env texture every frame.
    let key = "day";
    if (tod >= 0.7) key = "night";
    else if (tod >= 0.45) key = "dusk";
    if (key !== lastEnvKey) {
      lastEnvKey = key;
      if (key === "night" && nightEnv) scene.environment = nightEnv;
      else if (dayEnv) scene.environment = dayEnv;
    }
    const intensity = key === "night" ? 0.7 : key === "dusk" ? 0.85 : 1.0;
    scene.environmentIntensity = intensity;
    // Fog sun from the stable aim, not the shadow-offset light.
    _sunDir.copy(_sunAim).normalize();
    for (const m of wetMats) {
      const u = m.userData.fogUniforms;
      if (!u) continue;
      if (u.fogSunDir) u.fogSunDir.value.copy(_sunDir);
      if (u.fogSunColor) u.fogSunColor.value.setRGB(1, 0.88 - 0.2 * night, 0.65 - 0.25 * night);
    }
  }

  function setPixelRatio(pr) {
    if (composer) composer.setPixelRatio(pr);
  }

  function resize(w, h) {
    if (!composer) return;
    composer.setSize(w, h);
    if (gtaoPass) gtaoPass.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    if (bloomPass) bloomPass.resolution.set(w, h);
  }

  function render() {
    if (composer && high()) composer.render();
    else renderer.render(scene, camera);
  }

  /**
   * @param {{
   *   tod: number,
   *   hour: number,
   *   dayAmt: number,
   *   playerPos: { x: number, y?: number, z: number },
   *   exposure: number,
   *   sunAim?: { x: number, y: number, z: number },
   * }} state
   */
  function update(state) {
    if (!high()) return;
    if (state.sunAim) setSunAim(state.sunAim);
    // Shadows follow the player every frame; the rest only when tod moves a notch.
    updateShadowFrustum(state.playerPos, state.dayAmt);
    const bucket = Math.round(state.tod * 40); // ~0.025 steps
    if (bucket !== lastTodBucket) {
      lastTodBucket = bucket;
      updateBloom(state.tod);
      updateGrade(state.tod);
      updateWetness(state.tod);
      updateEnv(state.tod);
      updateSky(state.tod, state.hour);
    }
    if (Math.abs(state.exposure - lastExposure) > 0.002) {
      lastExposure = state.exposure;
      renderer.toneMappingExposure = state.exposure;
    }
  }

  function setBuildingCast(on) {
    cityTilesCast = !!on;
  }

  /** Flip GTAO on after the playtest gate clears; stays off by default on high. */
  function enableAO(on = true) {
    if (gtaoPass) gtaoPass.enabled = !!on && high();
  }

  async function init() {
    if (!high()) {
      // Keep classic tone mapping on the low path.
      return { quality };
    }
    enableShadows();
    buildComposer();
    await loadHdris();
    installPhysicalSky();
    if (dayEnv) {
      scene.environment = dayEnv;
      lastEnvKey = "day";
    }
    return { quality };
  }

  function setQuality(q) {
    quality = q === "high" ? "high" : "low";
    storeQuality(quality);
  }

  return {
    get quality() {
      return quality;
    },
    high,
    init,
    setQuality,
    applyCityShadows,
    applyAnisotropy,
    tunePbrMaterial,
    varyWindowGlow,
    patchHeightFog,
    keepCityPbr: keepCityPbrHigh,
    setBuildingCast,
    setSunAim,
    enableAO,
    update,
    render,
    resize,
    setPixelRatio,
    get composer() {
      return composer;
    },
  };
}
