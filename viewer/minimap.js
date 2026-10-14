/**
 * Mini map: a fixed canvas overlay showing the district from above with
 * the player position, vehicles, transit, and click-to-teleport in free mode.
 * Uses a simple cached road map rendering.
 */

import { fetchJsonCached } from "./json-cache.js";

export function createMinimap(THREE, opts = {}) {
  const SIZE = 200; // px
  const MARGIN = 12;
  const SPAWN = opts.spawnCenter || { x: -218.5, z: -432.1 };
  const ROADS_URL = opts.roadsUrl || "./roads.json";
  const TRANSIT_URL = opts.transitUrl || "./transit.json";

  const width = opts.width || SIZE;
  const height = opts.height || SIZE;

  // Canvas state
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.position = "fixed";
  canvas.style.bottom = "22px";
  canvas.style.left = "22px";
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.style.zIndex = "500";
  canvas.style.border = "1px solid rgba(255,255,255,0.25)";
  canvas.style.borderRadius = "8px";
  canvas.style.pointerEvents = "auto";
  canvas.style.background = "rgba(0,0,0,0.35)";
  canvas.style.cursor = "pointer";
  canvas.className = "hud-map";
  document.body.appendChild(canvas);

  /** 0 = day palette, 1 = night — synced from applyTimeOfDay. */
  let nightGlow = 0;

  // Street name label resting above the mini map
  const streetLabel = document.createElement("div");
  streetLabel.className = "hud-street";
  streetLabel.setAttribute("aria-live", "polite");
  // GTA-style area caption: big outlined street name bottom-right, district underneath.
  streetLabel.style.cssText = [
    "position:fixed",
    "right:28px",
    "bottom:26px",
    "max-width:46vw",
    "color:#fff",
    "font:700 1.7rem/1.05 'Helvetica Neue',Arial,sans-serif",
    "letter-spacing:0.01em",
    "text-shadow:0 0 3px #000,0 2px 2px #000,0 0 8px rgba(0,0,0,0.6)",
    "pointer-events:none",
    "z-index:500",
    "text-align:right",
    "opacity:0",
    "transform:translateY(4px)",
    "transition:opacity 280ms ease, transform 280ms ease",
    "white-space:nowrap",
  ].join(";");
  document.body.appendChild(streetLabel);

  let streetHideTimer = 0;
  const STREET_HOLD_MS = 3200;

  function showStreetName(name, subtitle, holdMs) {
    if (!name) return;
    streetLabel.innerHTML = "";
    const sub = document.createElement("div");
    sub.textContent = subtitle || opts.districtName || "Klein Antwerpen";
    sub.style.cssText = "font-size:0.95rem;font-weight:600;opacity:0.85;margin-top:4px;text-transform:uppercase;letter-spacing:0.12em";
    streetLabel.append(name, sub);
    if (streetHideTimer) clearTimeout(streetHideTimer);
    // Retrigger enter animation
    streetLabel.style.opacity = "0";
    streetLabel.style.transform = "translateY(4px)";
    // Force reflow so the transition restarts
    void streetLabel.offsetWidth;
    streetLabel.style.opacity = "1";
    streetLabel.style.transform = "translateY(0)";
    const hold = Number.isFinite(holdMs) && holdMs > 0 ? holdMs : STREET_HOLD_MS;
    streetHideTimer = setTimeout(() => {
      streetLabel.style.opacity = "0";
      streetLabel.style.transform = "translateY(4px)";
      streetHideTimer = 0;
    }, hold);
  }

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  let BOUNDS = { ...(opts.playBounds || { minX: -500, maxX: 200, minZ: -800, maxZ: 100 }) };
  let scale = 1;
  let ox = 0;
  let oy = 0;
  function fitOverview() {
    const sx = W / (BOUNDS.maxX - BOUNDS.minX);
    const sz = H / (BOUNDS.maxZ - BOUNDS.minZ);
    scale = Math.min(sx, sz) * 0.92;
    ox = (W - (BOUNDS.maxX - BOUNDS.minX) * scale) / 2;
    oy = (H - (BOUNDS.maxZ - BOUNDS.minZ) * scale) / 2;
  }
  fitOverview();

  function toPixel(x, z) {
    return { u: ox + (x - BOUNDS.minX) * scale, v: oy + (z - BOUNDS.minZ) * scale };
  }

  // ---- Map data: every source is stored in Three XZ (z = -y) with its district offset ----
  const CELL_M = 128;
  /** @type {Map<string, object[]>} */
  const grid = new Map();
  const features = [];
  const pins = [];
  const shopDots = [];
  const stops = [];
  let stamp = 0;

  function toXZ(points, dx, dz, sx = 1) {
    const out = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      out[i * 2] = (Array.isArray(p) ? p[0] : p.x || 0) * sx + dx;
      out[i * 2 + 1] = -(Array.isArray(p) ? p[1] : p.y || 0) + dz;
    }
    return out;
  }

  function addFeature(layer, xz, extra) {
    if (xz.length < 4) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < xz.length; i += 2) {
      if (xz[i] < minX) minX = xz[i];
      if (xz[i] > maxX) maxX = xz[i];
      if (xz[i + 1] < minZ) minZ = xz[i + 1];
      if (xz[i + 1] > maxZ) maxZ = xz[i + 1];
    }
    const f = { layer, xz, minX, maxX, minZ, maxZ, seen: 0, ...extra };
    features.push(f);
    for (let cx = Math.floor(minX / CELL_M); cx <= Math.floor(maxX / CELL_M); cx++) {
      for (let cz = Math.floor(minZ / CELL_M); cz <= Math.floor(maxZ / CELL_M); cz++) {
        const key = cx + "," + cz;
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(f);
      }
    }
  }

  function query(minX, minZ, maxX, maxZ) {
    stamp += 1;
    const out = [];
    for (let cx = Math.floor(minX / CELL_M); cx <= Math.floor(maxX / CELL_M); cx++) {
      for (let cz = Math.floor(minZ / CELL_M); cz <= Math.floor(maxZ / CELL_M); cz++) {
        const list = grid.get(cx + "," + cz);
        if (!list) continue;
        for (const f of list) {
          if (f.seen === stamp) continue;
          f.seen = stamp;
          if (f.maxX < minX || f.minX > maxX || f.maxZ < minZ || f.minZ > maxZ) continue;
          out.push(f);
        }
      }
    }
    return out;
  }

  const LAYER_ORDER = { park: 0, water: 1, building: 2, road: 3, walk: 4, rail: 5 };

  async function loadJson(url) {
    try {
      const res = await fetchJsonCached(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /**
   * Ingest one district package. `base` is "" for the current district (districtUrl resolves),
   * or "./districts/<id>/" for a neighbour; `t` = { x, z, sx } maps its local frame into ours.
   */
  async function addSource(base, t = null) {
    const dx = t ? Number(t.x) || 0 : 0;
    const dz = t ? Number(t.z) || 0 : 0;
    const tsx = t ? Number(t.sx) || 1 : 1;
    const [map, bdoc, lms, shops] = await Promise.all([
      loadJson(base ? base + "map.json" : opts.mapUrl || "./map.json"),
      loadJson(base ? base + "buildings.json" : "./buildings.json"),
      loadJson(base ? base + "landmarks.json" : opts.landmarksUrl || "./landmarks.json"),
      base ? null : opts.shopsUrl ? loadJson(opts.shopsUrl) : null,
    ]);
    for (const b of (bdoc && bdoc.buildings) || []) {
      if ((b.ring || []).length >= 3) addFeature("building", toXZ(b.ring, dx, dz, tsx));
    }
    if (map) {
      for (const ring of map.parks || []) addFeature("park", toXZ(ring, dx, dz, tsx));
      for (const ring of map.water || []) addFeature("water", toXZ(ring, dx, dz, tsx));
      for (const r of map.roads || []) {
        const walk = (r.rank || 2) >= 4;
        addFeature(walk ? "walk" : "road", toXZ(r.points || [], dx, dz, tsx), {
          width: Number(r.width) || 6,
          rank: r.rank || 2,
          name: r.name || "",
        });
      }
      for (const r of map.rails || []) {
        addFeature("rail", toXZ(r.points || [], dx, dz, tsx), { mode: r.mode || "rail" });
      }
    } else {
      // Pre-map.json packages: spawn-limited roads.json is all we have.
      const roads = await loadJson(base ? base + "roads.json" : ROADS_URL);
        for (const r of (roads && roads.roads) || []) {
        addFeature("road", toXZ(r.points || [], dx, dz, tsx), { width: Number(r.width) || 7, rank: 2 });
      }
      for (const w of (roads && roads.walks) || []) {
        addFeature("walk", toXZ(w.points || [], dx, dz, tsx), { width: 1.4, rank: 4, crossing: w.kind === "crossing" });
      }
    }
    for (const lm of (lms && lms.landmarks) || []) {
      if (Number.isFinite(lm.x) && Number.isFinite(lm.y)) pins.push({ x: lm.x * tsx + dx, z: -lm.y + dz });
    }
    for (const s of (shops && shops.shops) || []) {
      if (Number.isFinite(s.x) && Number.isFinite(s.y)) shopDots.push({ x: s.x * tsx + dx, z: -s.y + dz });
    }
    if (!base) {
      const transitDoc = await loadJson(TRANSIT_URL);
      for (const p of (transitDoc && transitDoc.paths) || []) {
        // map.json rails already cover OSM track geometry; GTFS paths fill the rest.
        if (!map) addFeature("rail", toXZ(p.points || [], dx, dz, tsx), { mode: p.mode || "bus" });
      }
      for (const st of (transitDoc && transitDoc.stops) || []) {
        if (Number.isFinite(st.x) && Number.isFinite(st.y)) {
          stops.push({ x: st.x + dx, z: -st.y + dz, mode: st.mode || "bus" });
        }
      }
    }
    dirty = true;
  }

  // ---- Painting -----------------------------------------------------------------------------
  const PALETTE = {
    land: "#56645a",
    park: "#5f7d55",
    water: "#3d6f96",
    building: "#8d978e",
    roadCasing: "#2e3530",
    road: "#e9ece6",
    walk: "rgba(214,226,204,0.75)",
    tram: "rgba(255,216,0,0.8)",
    bus: "rgba(0,159,227,0.55)",
    rail: "rgba(60,48,40,0.9)",
  };

  function tracePath(c, xz, map, close) {
    c.beginPath();
    for (let i = 0; i < xz.length; i += 2) {
      const [u, v] = map(xz[i], xz[i + 1]);
      if (i) c.lineTo(u, v);
      else c.moveTo(u, v);
    }
    if (close) c.closePath();
  }

  /** Paint features into `c` where map(x, z) → [u, v] and pxPerM scales widths. */
  function paintFeatures(c, list, map, pxPerM, { detail = true } = {}) {
    list.sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || (b.rank || 0) - (a.rank || 0));
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const f of list) {
      if (f.layer === "park" || f.layer === "water" || f.layer === "building") {
        if (f.layer === "building" && !detail) continue;
        c.fillStyle = PALETTE[f.layer];
        tracePath(c, f.xz, map, true);
        c.fill();
      }
    }
    const roads = list.filter((f) => f.layer === "road");
    for (const pass of [0, 1]) {
      for (const f of roads) {
        const w = Math.max(detail ? 1.2 : 0.8, f.width * pxPerM);
        c.strokeStyle = pass ? PALETTE.road : PALETTE.roadCasing;
        c.lineWidth = pass ? w : w + Math.max(1, 2.5 * pxPerM);
        tracePath(c, f.xz, map, false);
        c.stroke();
      }
    }
    if (detail) {
      for (const f of list) {
        if (f.layer !== "walk") continue;
        c.strokeStyle = f.crossing ? "rgba(230,215,150,0.75)" : PALETTE.walk;
        c.lineWidth = Math.max(1, (f.crossing ? 1.8 : 1.6) * pxPerM);
        tracePath(c, f.xz, map, false);
        c.stroke();
      }
    }
    for (const f of list) {
      if (f.layer !== "rail") continue;
      const m = f.mode;
      c.strokeStyle = m === "tram" ? PALETTE.tram : m === "bus" ? PALETTE.bus : PALETTE.rail;
      c.lineWidth = Math.max(1, (m === "tram" ? 2.4 : 1.6) * pxPerM);
      if (m !== "tram" && m !== "bus") c.setLineDash([3 * pxPerM, 2 * pxPerM]);
      tracePath(c, f.xz, map, false);
      c.stroke();
      c.setLineDash([]);
    }
  }

  function paintPins(c, map, size, inBox) {
    for (const st of stops) {
      if (inBox && !inBox(st.x, st.z)) continue;
      const [u, v] = map(st.x, st.z);
      c.fillStyle = st.mode === "tram" ? "#ffd800" : "#009fe3";
      c.beginPath();
      c.arc(u, v, size * 0.6, 0, Math.PI * 2);
      c.fill();
    }
    for (const lm of pins) {
      if (inBox && !inBox(lm.x, lm.z)) continue;
      const [u, v] = map(lm.x, lm.z);
      c.fillStyle = "#d4a017";
      c.strokeStyle = "rgba(20,12,0,0.55)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(u, v - size);
      c.lineTo(u + size * 0.75, v);
      c.lineTo(u, v + size);
      c.lineTo(u - size * 0.75, v);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  // Overview (free / drive mode): whole district fitted to the canvas.
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = W;
  bgCanvas.height = H;
  const bgCtx = bgCanvas.getContext("2d");
  let dirty = true;

  function paintOverview() {
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.fillStyle = "rgba(10,14,24,0.7)";
    bgCtx.fillRect(0, 0, W, H);
    const list = query(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ);
    const map = (x, z) => {
      const p = toPixel(x, z);
      return [p.u, p.v];
    };
    paintFeatures(bgCtx, list, map, scale, { detail: scale > 0.5 });
    bgCtx.fillStyle = "rgba(255, 180, 90, 0.55)";
    for (const s of shopDots) {
      const p = toPixel(s.x, s.z);
      bgCtx.fillRect(p.u - 1.5, p.v - 1.5, 3, 3);
    }
    paintPins(bgCtx, map, 4);
    const sp = toPixel(SPAWN.x, SPAWN.z);
    bgCtx.fillStyle = "#ffffff";
    bgCtx.beginPath();
    bgCtx.arc(sp.u, sp.v, 4.5, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.strokeStyle = "#1a1a1a";
    bgCtx.lineWidth = 1.5;
    bgCtx.stroke();
  }

  // Radar (walk mode): a sliding window around the player, repainted as they walk.
  const WIN_M = 640;
  const WIN_PX_PER_M = 2;
  const REPAINT_M = 150;
  const win = {
    canvas: document.createElement("canvas"),
    cx: NaN,
    cz: NaN,
  };
  win.canvas.width = win.canvas.height = WIN_M * WIN_PX_PER_M;
  const wctx = win.canvas.getContext("2d");

  function paintWindow(cx, cz) {
    win.cx = cx;
    win.cz = cz;
    const minX = cx - WIN_M / 2;
    const minZ = cz - WIN_M / 2;
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.fillStyle = PALETTE.land;
    wctx.fillRect(0, 0, win.canvas.width, win.canvas.height);
    const k = WIN_PX_PER_M;
    const map = (x, z) => [(x - minX) * k, (z - minZ) * k];
    paintFeatures(wctx, query(minX, minZ, minX + WIN_M, minZ + WIN_M), map, k);
    paintPins(wctx, map, 2.4 * k, (x, z) => x >= minX && x <= minX + WIN_M && z >= minZ && z <= minZ + WIN_M);
  }

  function ensureWindow(x, z) {
    if (dirty || !(Math.abs(x - win.cx) < REPAINT_M && Math.abs(z - win.cz) < REPAINT_M)) {
      if (dirty) paintOverview();
      dirty = false;
      paintWindow(x, z);
    }
  }

  function consumeTeleport() {
    const t = teleportTarget;
    teleportTarget = null;
    return t;
  }

  let visible = true;
  let teleportTarget = null;
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const u = ((e.clientX - rect.left) / rect.width) * W;
    const v = ((e.clientY - rect.top) / rect.height) * H;
    teleportTarget = { x: (u - ox) / scale + BOUNDS.minX, z: (v - oy) / scale + BOUNDS.minZ };
  });

  // ---- Draw dynamic elements each frame ----
  function draw(playerPos, traffic, transit, pedestrians, mode, micromobility, velo) {
    if (!visible) return;
    if (dirty) {
      paintOverview();
      dirty = false;
      win.cx = NaN;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgCanvas, 0, 0);
    if (nightGlow > 0.01) {
      ctx.fillStyle = `rgba(5,8,18,${0.42 * nightGlow})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (velo && velo.stations) {
      for (const st of velo.stations) {
        const p = toPixel(st.x, st.z);
        ctx.fillStyle = "#c8102e";
        ctx.beginPath();
        ctx.arc(p.u, p.v, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (transit && transit.vehicles) {
      for (const v of transit.vehicles) {
        if (v.phase === "gone" || !v.pos) continue;
        const p = toPixel(v.pos.x, v.pos.z);
        ctx.fillStyle = v.mode === "tram" ? "#ffd800" : "#009fe3";
        const size = v.mode === "tram" ? 5 : 3.5;
        const ang = Math.atan2(v.tan.x, v.tan.z);
        ctx.save();
        ctx.translate(p.u, p.v);
        ctx.rotate(ang);
        ctx.fillRect(-size * 0.8, -size * 0.3, size, size * 0.6);
        ctx.restore();
      }
    }

    if (traffic && traffic.cars) {
      for (const c of traffic.cars) {
        const p = toPixel(c.pos.x, c.pos.z);
        ctx.fillStyle = "#88aacc";
        ctx.fillRect(p.u - 1.5, p.v - 1, 3, 2);
      }
    }

    // Bikes / scooters / cargo bikes (tipped wrecks = static hazard, not a moving rider)
    if (micromobility && micromobility.vehicles) {
      for (const v of micromobility.vehicles) {
        if (!v.pos) continue;
        const p = toPixel(v.pos.x, v.pos.z);
        if (v.crash) {
          ctx.fillStyle = "#c45a3a";
          ctx.fillRect(p.u - 1.5, p.v - 1.5, 3, 3);
          continue;
        }
        ctx.fillStyle = v.kind === "scooter" ? "#00c2a8" : v.kind === "cargo" ? "#d4a020" : "#3a8a5a";
        ctx.fillRect(p.u - 1, p.v - 1, 2, 2);
      }
    }

    if (pedestrians && pedestrians.groups) {
      for (const g of pedestrians.groups) {
        for (const m of g.members) {
          const p = toPixel(m.mesh.position.x, m.mesh.position.z);
          ctx.fillStyle = "#aabb88";
          ctx.fillRect(p.u - 0.5, p.v - 0.5, 1, 1);
        }
      }
    }

    if (playerPos) {
      const p = toPixel(playerPos.x, playerPos.z);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(p.u, p.v, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.u, p.v, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);
  }

  // ---- Radar (walk mode): GTA-style, heading-up, centred a little below the middle ----
  const RW = 248;
  const RH = 156;
  const RADAR_PX_PER_M = 1.15; // radar shows ~215 m x 135 m
  const radar = document.createElement("canvas");
  radar.width = RW * 2;
  radar.height = RH * 2;
  radar.className = "hud-radar";
  radar.style.cssText = `position:fixed;left:22px;bottom:22px;width:${RW}px;height:${RH}px;z-index:500;pointer-events:none;border-radius:6px;box-shadow:0 0 0 3px rgba(0,0,0,0.55),0 6px 18px rgba(0,0,0,0.35)`;
  document.body.appendChild(radar);
  const rctx = radar.getContext("2d");
  let heading = 0;
  let blipSource = null;

  let baseWarmed = false;
  function warmBase() {
    if (baseWarmed) return;
    baseWarmed = true;
    addSource("");
  }

  function drawRadar(playerPos, traffic, transit, micromobility) {
    ensureWindow(playerPos.x, playerPos.z);
    const W2 = radar.width;
    const H2 = radar.height;
    const k = 2 * RADAR_PX_PER_M; // canvas px per metre (canvas is 2x CSS)
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = nightGlow;
    const landR = (0x3c + (0x1c - 0x3c) * g) | 0;
    const landG = (0x47 + (0x24 - 0x47) * g) | 0;
    const landB = (0x40 + (0x20 - 0x40) * g) | 0;
    rctx.fillStyle = `rgb(${landR},${landG},${landB})`;
    rctx.fillRect(0, 0, W2, H2);
    rctx.save();
    rctx.translate(W2 / 2, H2 * 0.6);
    rctx.rotate(heading);
    rctx.scale(k, k);
    rctx.translate(-playerPos.x, -playerPos.z);
    rctx.imageSmoothingEnabled = true;
    const wx = win.cx - WIN_M / 2;
    const wz = win.cz - WIN_M / 2;
    rctx.drawImage(win.canvas, wx, wz, WIN_M, WIN_M);
    if (g > 0.01) {
      rctx.fillStyle = `rgba(5,10,22,${0.5 * g})`;
      rctx.fillRect(wx, wz, WIN_M, WIN_M);
    }
    const box = (x, z, tx, tz, len, wid, color) => {
      rctx.save();
      rctx.translate(x, z);
      rctx.rotate(Math.atan2(tz, tx));
      rctx.fillStyle = color;
      rctx.fillRect(-len / 2, -wid / 2, len, wid);
      rctx.restore();
    };
    if (traffic && traffic.cars) for (const c of traffic.cars) if (c.pos) box(c.pos.x, c.pos.z, c.tan?.x ?? 1, c.tan?.z ?? 0, 4.4, 2, "#9aa7b4");
    if (transit && transit.vehicles) {
      for (const v of transit.vehicles) {
        if (v.phase === "gone" || !v.pos) continue;
        const tram = v.mode === "tram";
        box(v.pos.x, v.pos.z, v.tan.x, v.tan.z, tram ? 30 : 12, 2.8, tram ? "#ffd800" : "#009fe3");
      }
    }
    if (micromobility && micromobility.vehicles) {
      for (const v of micromobility.vehicles) {
        if (!v.pos) continue;
        if (v.crash) {
          // Static hazard diamond — no travel heading.
          rctx.fillStyle = "#c45a3a";
          rctx.beginPath();
          rctx.moveTo(v.pos.x, v.pos.z - 1.4);
          rctx.lineTo(v.pos.x + 1.4, v.pos.z);
          rctx.lineTo(v.pos.x, v.pos.z + 1.4);
          rctx.lineTo(v.pos.x - 1.4, v.pos.z);
          rctx.closePath();
          rctx.fill();
          continue;
        }
        box(v.pos.x, v.pos.z, v.tan.x, v.tan.z, 2, 1.2, "#2fbf71");
      }
    }
    const blips = blipSource ? blipSource() : [];
    for (const b of blips) {
      rctx.fillStyle = "rgba(0,0,0,0.6)";
      rctx.beginPath();
      rctx.arc(b.x, b.z, 3.2, 0, Math.PI * 2);
      rctx.fill();
      rctx.fillStyle = b.color;
      rctx.beginPath();
      rctx.arc(b.x, b.z, 2.3, 0, Math.PI * 2);
      rctx.fill();
    }
    rctx.restore();
    // Player arrow (always points up: the map turns, not you).
    rctx.save();
    rctx.translate(W2 / 2, H2 * 0.6);
    rctx.fillStyle = "#ffffff";
    rctx.strokeStyle = "rgba(0,0,0,0.75)";
    rctx.lineWidth = 3;
    rctx.beginPath();
    rctx.moveTo(0, -13);
    rctx.lineTo(9, 10);
    rctx.lineTo(0, 5);
    rctx.lineTo(-9, 10);
    rctx.closePath();
    rctx.stroke();
    rctx.fill();
    rctx.restore();
    // North marker on the rim.
    const nx = Math.sin(heading);
    const nz = -Math.cos(heading);
    const cx = W2 / 2;
    const cy = H2 * 0.6;
    const t = Math.min((W2 / 2 - 16) / Math.max(1e-6, Math.abs(nx)), (nz < 0 ? cy - 16 : H2 - cy - 16) / Math.max(1e-6, Math.abs(nz)));
    rctx.fillStyle = "rgba(0,0,0,0.7)";
    rctx.beginPath();
    rctx.arc(cx + nx * t, cy + nz * t, 13, 0, Math.PI * 2);
    rctx.fill();
    rctx.fillStyle = "#fff";
    rctx.font = "bold 17px 'Helvetica Neue', Arial, sans-serif";
    rctx.textAlign = "center";
    rctx.textBaseline = "middle";
    rctx.fillText("N", cx + nx * t, cy + nz * t + 1);
  }

  const drawFullMap = draw;
  function drawAny(playerPos, traffic, transit, pedestrians, mode, micromobility, ...rest) {
    const radarMode = mode === "walk";
    if (!visible) return;
    canvas.style.display = radarMode ? "none" : "block";
    radar.style.display = radarMode ? "block" : "none";
    if (radarMode) drawRadar(playerPos, traffic, transit, micromobility);
    else drawFullMap(playerPos, traffic, transit, pedestrians, mode, micromobility, ...rest);
  }

  function setVisible(v) {
    visible = v;
    canvas.style.display = v ? "block" : "none";
    radar.style.display = v ? "block" : "none";
    streetLabel.style.display = v ? "block" : "none";
    if (!v && streetHideTimer) {
      clearTimeout(streetHideTimer);
      streetHideTimer = 0;
      streetLabel.style.opacity = "0";
    }
  }

  function setNight(t) {
    nightGlow = Math.max(0, Math.min(1, Number(t) || 0));
    canvas.style.background = `rgba(0,0,0,${0.35 + 0.35 * nightGlow})`;
    canvas.style.border = `1px solid rgba(255,255,255,${0.25 - 0.08 * nightGlow})`;
    radar.style.boxShadow = `0 0 0 3px rgba(0,0,0,${0.55 + 0.25 * nightGlow}),0 6px 18px rgba(0,0,0,${0.35 + 0.25 * nightGlow})`;
    // Stronger outline so white street captions stay readable on dark façades at night.
    const bloom = 8 + 14 * nightGlow;
    const soft = 0.55 + 0.4 * nightGlow;
    streetLabel.style.textShadow = `0 0 3px #000,0 2px 3px #000,0 0 ${bloom}px rgba(0,0,0,${soft})`;
  }

  return {
    draw: drawAny,
    consumeTeleport,
    setVisible,
    showStreetName,
    setNight,
    canvas,
    radar,
    /** Camera yaw (0 = looking north / −Z); the radar turns so your heading is up. */
    setHeading(yaw) {
      heading = yaw;
    },
    /** () => [{ x, z, color }] extra radar blips (rentable scooters, stations, ...). */
    setBlips(fn) {
      blipSource = fn;
    },
    warmBase,
    /** Refit the overview map (the radar window follows the player on its own). */
    setBounds(b) {
      if (!b || !(b.maxX > b.minX) || !(b.maxZ > b.minZ)) return;
      BOUNDS = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
      fitOverview();
      dirty = true;
    },
    /** Merge a neighbour package ("./districts/<id>/") shifted by (dx, dz) into the map. */
    addSource,
  };
}