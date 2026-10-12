/**
 * GTA-style city poster: title / pause, character carousel (De buren), maps list.
 * Full-screen plate covers the WebGL view; no login, no combat chrome.
 */
import { PLAYERS, getStoredPlayerId, setStoredPlayerId, playerById } from "./players.js";
import { buttonName, controlRows } from "./gamepad.js";

const MAPS = [
  {
    id: "klein-antwerpen",
    district: "2018-harmonie",
    name: "Klein Antwerpen",
    playable: true,
    note: "Playable now",
    blurb: "Harmonie · Mechelsesteenweg · Velo docks",
    preview: "./menu/map-klein-antwerpen.jpg",
  },
  {
    id: "antwerpen-city",
    district: "2000-antwerpen",
    name: "Antwerpen · 2000",
    playable: true,
    note: "Playable now",
    blurb: "Historic core · Meir · Scheldt quays",
    preview: "./menu/map-2000-antwerpen.jpg",
  },
  {
    id: "borgerhout",
    name: "Borgerhout",
    playable: false,
    note: "Coming later",
    blurb: "East of the ring — coming in a later build",
    preview: null,
  },
  {
    id: "harbor",
    name: "Harbor",
    playable: false,
    note: "Coming later",
    blurb: "Port & quays along the Scheldt — coming in a later build",
    preview: null,
  },
];

/**
 * @param {{
 *   onPlay: () => void,
 *   onPause: () => void,
 *   onCharacter: (id: string) => void | Promise<void>,
 *   isPlaying: () => boolean,
 *   hasStarted: () => boolean,
 * }} hooks
 */
export function createMenu(hooks) {
  const root = document.createElement("div");
  root.id = "city-menu";
  root.hidden = true;
  root.innerHTML = `
    <div class="cm-poster" aria-hidden="true">
      <img class="cm-bg" data-src="./menu/poster-antwerp.jpg" alt="" />
      <div class="cm-scrim"></div>
    </div>
    <div class="cm-home">
      <div class="cm-brand">
        <img class="cm-logo" src="./menu/wordmark.svg" alt="Metropolis Antwerp" />
      </div>
      <nav class="cm-nav" aria-label="Main menu">
        <button type="button" class="cm-item" data-action="play">Play</button>
        <button type="button" class="cm-item" data-action="maps">Maps</button>
        <button type="button" class="cm-item" data-action="characters">Characters</button>
        <button type="button" class="cm-item" data-action="controls">Controls</button>
      </nav>
      <p class="cm-status" id="cm-status">Keyboard &amp; mouse ready</p>
    </div>
    <div class="cm-portrait-wrap" id="cm-portrait-wrap" aria-hidden="true">
      <img class="cm-portrait" id="cm-portrait" src="" alt="" />
    </div>
    <div class="cm-panel cm-maps-panel" id="cm-maps" hidden>
      <p class="cm-eyebrow">Districts</p>
      <h2>Antwerp</h2>
      <div class="cm-maps-layout">
        <ul class="cm-maps" role="listbox" aria-label="Districts"></ul>
        <aside class="cm-map-preview" aria-live="polite">
          <div class="cm-map-frame">
            <img class="cm-map-img" id="cm-map-img" alt="" />
            <canvas class="cm-map-roads" id="cm-map-roads" width="640" height="640" aria-hidden="true"></canvas>
            <div class="cm-map-placeholder" id="cm-map-placeholder" hidden>
              <span class="cm-map-lock">Coming later</span>
            </div>
            <div class="cm-map-caption">
              <strong id="cm-map-title">Klein Antwerpen</strong>
              <span id="cm-map-blurb"></span>
            </div>
          </div>
        </aside>
      </div>
      <button type="button" class="cm-back" data-back>Back</button>
    </div>
    <div class="cm-panel cm-cast" id="cm-cast" hidden>
      <p class="cm-eyebrow">— De buren —</p>
      <h2>Choose your neighbour</h2>
      <div class="cm-carousel" role="listbox" aria-label="Characters">
        <button type="button" class="cm-arrow" data-dir="-1" aria-label="Previous">‹</button>
        <div class="cm-stage" id="cm-stage"></div>
        <button type="button" class="cm-arrow" data-dir="1" aria-label="Next">›</button>
      </div>
      <p class="cm-index" id="cm-index">01 / 03</p>
      <h3 class="cm-name" id="cm-name">Pieter</h3>
      <p class="cm-blurb" id="cm-blurb"></p>
      <div class="cm-cast-actions">
        <button type="button" class="cm-confirm" data-confirm>Select</button>
        <button type="button" class="cm-back" data-back>Back</button>
      </div>
    </div>
    <div class="cm-panel" id="cm-controls" hidden>
      <p class="cm-eyebrow">Controls</p>
      <h2 id="cm-controls-title">Keyboard</h2>
      <p class="cm-controls-live" id="cm-controls-live"></p>
      <p class="cm-controls-note" id="cm-controls-note"></p>
      <div class="cm-pad-actions" id="cm-pad-actions" hidden>
        <button type="button" class="cm-hid" id="cm-connect" hidden>Connect</button>
        <button type="button" class="cm-hid" id="cm-disconnect" hidden>Disconnect</button>
      </div>
      <ul class="cm-controls-list" id="cm-controls-list"></ul>
      <button type="button" class="cm-back" data-back>Back</button>
    </div>
    <footer class="cm-footer">
      <span data-hint="nav"><kbd>↑↓</kbd> Navigate</span>
      <span data-hint="select"><kbd>Enter</kbd> Select</span>
      <span data-hint="back"><kbd>Esc</kbd> Back</span>
      <button type="button" class="cm-sound" id="cm-sound" aria-pressed="false" title="Sound">Sound on</button>
    </footer>
  `;
  document.body.append(root);

  const navItems = [...root.querySelectorAll(".cm-nav .cm-item")];
  const mapsUl = root.querySelector(".cm-maps");
  const stage = root.querySelector("#cm-stage");
  const portrait = root.querySelector("#cm-portrait");
  const playBtn = root.querySelector('[data-action="play"]');
  const mapImg = root.querySelector("#cm-map-img");
  const mapRoads = root.querySelector("#cm-map-roads");
  const mapPlaceholder = root.querySelector("#cm-map-placeholder");
  const mapTitle = root.querySelector("#cm-map-title");
  const mapBlurb = root.querySelector("#cm-map-blurb");

  const currentDistrict =
    (typeof window !== "undefined" && window.__DISTRICT && window.__DISTRICT.id) || "2018-harmonie";
  let mapIndex = MAPS.findIndex((m) => m.district === currentDistrict);
  if (mapIndex < 0) mapIndex = 0;
  /** @type {string | null} */
  let roadsPaintedFor = null;

  for (const m of MAPS) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="cm-map${m.playable ? "" : " locked"}" data-map="${m.id}" role="option" aria-disabled="${m.playable ? "false" : "true"}">
      <span class="cm-map-text"><strong>${m.name}</strong><em>${m.blurb}</em></span>
      <span class="cm-map-note">${m.note}</span>
    </button>`;
    mapsUl.append(li);
  }
  const mapButtons = [...mapsUl.querySelectorAll(".cm-map")];

  /** The default district always plays (legacy city); others need their local GLB build. */
  async function lockUnbuiltMaps() {
    const boot = typeof window !== "undefined" ? window.__DISTRICT : null;
    if (!boot || typeof window.districtBuilt !== "function") return;
    await boot.ready;
    const fallback = (boot.index && boot.index.default) || "2018-harmonie";
    MAPS.forEach(async (m, i) => {
      if (!m.playable || !m.district || m.district === fallback) return;
      if (await window.districtBuilt(m.district)) return;
      m.playable = false;
      m.note = "Local build only";
      const btn = mapButtons[i];
      btn.classList.add("locked");
      btn.setAttribute("aria-disabled", "true");
      btn.querySelector(".cm-map-note").textContent = m.note;
      if (i === mapIndex) setMapSelected(i);
    });
  }
  void lockUnbuiltMaps();

  /** Stroke a district's roads.json onto the preview canvas. */
  async function paintRoadsOverlay(map) {
    if (!mapRoads || !map?.playable) return;
    const key = map.district || map.id;
    if (roadsPaintedFor === key) return;
    const roadsUrl = map.district
      ? `./districts/${map.district}/roads.json`
      : (typeof window !== "undefined" && typeof window.districtUrl === "function" && window.districtUrl("roads.json")) ||
        "./roads.json";
    try {
      const res = await fetch(roadsUrl);
      if (!res.ok) return;
      const data = await res.json();
      const roads = data.roads || [];
      const W = mapRoads.width;
      const H = mapRoads.height;
      const ctx = mapRoads.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      // Only paint a dark plate when there is no aerial underlay (locked / missing jpg).
      // With mix-blend-mode:screen a dark fill would wash out the Digitaal Vlaanderen plate.
      if (!map.preview) {
        ctx.fillStyle = "rgba(12, 18, 28, 0.92)";
        ctx.fillRect(0, 0, W, H);
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const r of roads) {
        for (const p of r.points || []) {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
      }
      if (!Number.isFinite(minX)) return;
      const pad = 0.06;
      const spanX = (maxX - minX) * (1 + pad * 2) || 1;
      const spanY = (maxY - minY) * (1 + pad * 2) || 1;
      const ox = minX - (maxX - minX) * pad;
      const sx = W / spanX;
      const sy = H / spanY;
      const s = Math.min(sx, sy);
      const offU = (W - spanX * s) / 2;
      const offV = (H - spanY * s) / 2;
      const toU = (x, y) => ({ u: offU + (x - ox) * s, v: offV + (maxY + (maxY - minY) * pad - y) * s });

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const r of roads) {
        const pts = r.points || [];
        if (pts.length < 2) continue;
        const kind = r.kind || "";
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const { u, v } = toU(pts[i][0], pts[i][1]);
          if (i === 0) ctx.moveTo(u, v);
          else ctx.lineTo(u, v);
        }
        if (kind === "tram" || r.tramShared) {
          ctx.strokeStyle = "rgba(255, 43, 214, 0.55)";
          ctx.lineWidth = 1.6;
        } else if (kind === "primary" || kind === "secondary") {
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 2.2;
        } else {
          ctx.strokeStyle = "rgba(200,220,235,0.28)";
          ctx.lineWidth = 1.1;
        }
        ctx.stroke();
      }
      const spawn = data.spawn;
      if (spawn) {
        const { u, v } = toU(spawn.x, spawn.y);
        ctx.beginPath();
        ctx.arc(u, v, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#ff2bd6";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      roadsPaintedFor = key;
    } catch {
      /* preview still works from aerial alone */
    }
  }

  function setMapSelected(i) {
    mapIndex = Math.max(0, Math.min(MAPS.length - 1, i));
    mapButtons.forEach((btn, j) => btn.classList.toggle("selected", j === mapIndex));
    const m = MAPS[mapIndex];
    mapTitle.textContent = m.name;
    mapBlurb.textContent = m.blurb;
    if (m.playable) {
      mapPlaceholder.hidden = true;
      mapRoads.hidden = false;
      if (m.preview) {
        mapImg.hidden = false;
        mapImg.src = m.preview;
        mapImg.alt = `Map of ${m.name}`;
      } else {
        mapImg.hidden = true;
        mapImg.removeAttribute("src");
      }
      paintRoadsOverlay(m);
    } else {
      mapImg.hidden = true;
      mapImg.removeAttribute("src");
      mapRoads.hidden = true;
      mapPlaceholder.hidden = false;
    }
  }

  function activateMap() {
    const m = MAPS[mapIndex];
    if (!m?.playable) return;
    const target = m.district;
    const here =
      (typeof window !== "undefined" && window.__DISTRICT && window.__DISTRICT.id) || "2018-harmonie";
    if (target && target !== here && typeof window.enterDistrict === "function") {
      window.enterDistrict(target);
      return;
    }
    hide();
    hooks.onPlay();
  }

  for (const p of PLAYERS) {
    const fig = document.createElement("figure");
    fig.className = "cm-card";
    fig.dataset.id = p.id;
    fig.innerHTML = `<img data-src="./menu/portrait-${p.id}-full.png" alt="${p.name}" /><figcaption>${p.name}</figcaption>`;
    stage.append(fig);
  }

  let open = false;
  let view = "home"; // home | maps | cast
  let navIndex = 0;
  let castIndex = Math.max(0, PLAYERS.findIndex((p) => p.id === getStoredPlayerId()));
  // Poster and portraits stay unloaded until the city file has finished, so they
  // don't sit on the same connection as the 56 MB streets download.
  let artReady = false;

  function refreshPortrait() {
    const p = playerById(getStoredPlayerId());
    portrait.dataset.src = `./menu/portrait-${p.id}.png`;
    portrait.alt = p.name;
    if (artReady) portrait.src = portrait.dataset.src;
  }

  function loadArt() {
    if (artReady) return;
    artReady = true;
    for (const img of root.querySelectorAll("img[data-src]")) {
      if (!img.getAttribute("src")) img.src = img.dataset.src;
    }
    refreshPortrait();
  }

  function setNavSelected() {
    navItems.forEach((btn, i) => btn.classList.toggle("selected", i === navIndex));
  }

  function setCastView() {
    const cards = [...stage.querySelectorAll(".cm-card")];
    const n = cards.length;
    cards.forEach((card, i) => {
      let d = i - castIndex;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      card.dataset.offset = String(d);
      card.classList.toggle("focus", d === 0);
      card.style.setProperty("--off", String(d));
      card.style.opacity = String(Math.max(0.25, 1 - Math.abs(d) * 0.35));
      card.style.transform = `translateX(calc(var(--off) * 42%)) scale(${1 - Math.abs(d) * 0.18})`;
      card.style.zIndex = String(10 - Math.abs(d));
    });
    const p = PLAYERS[castIndex];
    root.querySelector("#cm-index").textContent = `${String(castIndex + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
    root.querySelector("#cm-name").textContent = p.name;
    root.querySelector("#cm-blurb").textContent = p.blurb;
    hooks.onBrowse?.(p.id);
  }

  const controlsTitle = root.querySelector("#cm-controls-title");
  const controlsLive = root.querySelector("#cm-controls-live");
  const controlsList = root.querySelector("#cm-controls-list");
  const controlsNote = root.querySelector("#cm-controls-note");
  const padActions = root.querySelector("#cm-pad-actions");
  const connectBtn = root.querySelector("#cm-connect");
  const disconnectBtn = root.querySelector("#cm-disconnect");
  const controlsBack = root.querySelector("#cm-controls .cm-back");
  let controlsLayout = undefined;
  let controlsFocus = 0;
  let menuRaf = 0;
  let menuNav = { code: "", at: 0 };
  let padButtons = { cross: false, circle: false, options: false };

  function renderControlList() {
    const pad = hooks.gamepad;
    const layout = pad && pad.connected() ? pad.layout : null;
    const rows = controlRows(layout);
    controlsTitle.textContent = layout === "playstation" ? pad.label : layout === "xbox" ? "Xbox" : layout ? "Controller" : "Keyboard";
    controlsList.replaceChildren();
    for (const [button, action] of rows) {
      const li = document.createElement("li");
      const kbd = document.createElement("kbd");
      kbd.textContent = button;
      const act = document.createElement("span");
      act.textContent = action;
      li.append(kbd, act);
      controlsList.append(li);
    }
    controlsLayout = layout;
  }

  function controlsTargets() {
    const items = [];
    if (!connectBtn.hidden) items.push(connectBtn);
    if (!disconnectBtn.hidden) items.push(disconnectBtn);
    items.push(controlsBack);
    return items;
  }

  function syncControlsFocus() {
    const items = controlsTargets();
    if (!items.length) return;
    if (controlsFocus >= items.length) controlsFocus = 0;
    for (const el of [connectBtn, disconnectBtn, controlsBack]) {
      el.classList.toggle("selected", el === items[controlsFocus]);
    }
  }

  function setHint(name, key, label) {
    const span = root.querySelector(`[data-hint="${name}"]`);
    if (!span) return;
    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    span.replaceChildren(kbd, document.createTextNode(` ${label}`));
  }

  let footerLayout = undefined;
  function syncFooter() {
    const layout = hooks.gamepad?.connected() ? hooks.gamepad.layout : null;
    if (layout === footerLayout) return;
    footerLayout = layout;
    const hints =
      layout === "playstation"
        ? [
            ["Stick", "Navigate"],
            ["Cross", "Select"],
            ["Circle", "Back"],
          ]
        : layout === "xbox" || layout === "generic"
          ? [
              ["Stick", "Navigate"],
              ["A", "Select"],
              ["B", "Back"],
            ]
          : [
              ["↑↓", "Navigate"],
              ["Enter", "Select"],
              ["Esc", "Back"],
            ];
    ["nav", "select", "back"].forEach((name, i) => setHint(name, hints[i][0], hints[i][1]));
  }

  function syncPadChrome() {
    const pad = hooks.gamepad;
    const on = !!pad?.connected?.();
    const found = !!pad?.detected?.();
    connectBtn.hidden = !(found && !on);
    disconnectBtn.hidden = !on;
    padActions.hidden = connectBtn.hidden && disconnectBtn.hidden;
    syncControlsFocus();
    syncFooter();
  }

  function paintControls() {
    const pad = hooks.gamepad;
    const g = pad ? pad.sample() : null;
    syncPadChrome();
    if (!g || !g.layout) {
      if (pad?.detected?.()) {
        controlsLive.textContent = `${pad.detectedLabel()} plugged in`;
        controlsNote.textContent = "Connect it to move the menu with the stick.";
      } else {
        controlsLive.textContent = "No controller detected";
        controlsNote.textContent = "Plug one in. This page updates when the computer sees it.";
      }
      if (controlsLayout) renderControlList();
      return;
    }
    if (g.layout !== controlsLayout) {
      controlsFocus = 0;
      renderControlList();
      syncControlsFocus();
    }
    const held = Object.entries(g.down || [])
      .filter(([, on]) => on)
      .map(([name]) => buttonName(g.layout, name));
    const n = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
    const s = g.sticks || { lx: 0, ly: 0, rx: 0, ry: 0 };
    controlsLive.textContent = `${g.label} connected · L ${n(s.lx)} ${n(s.ly)} · R ${n(s.rx)} ${n(s.ry)}${held.length ? " · " + held.join(" ") : ""}`;
    const idle = Math.abs(s.lx) < 0.02 && Math.abs(s.ly) < 0.02 && Math.abs(s.rx) < 0.02 && Math.abs(s.ry) < 0.02 && !held.length;
    controlsNote.textContent = idle
      ? "Push a stick. If the numbers stay at 0.00, press the PS button in the middle of the controller."
      : "Left stick and D-pad move the highlight. Cross selects. Circle goes back.";
  }

  function stopMenuLoop() {
    cancelAnimationFrame(menuRaf);
    menuRaf = 0;
  }

  function steerFromPad(sample) {
    const g = sample || hooks.gamepad?.sample?.();
    if (!open || !g?.layout) return;
    const now = performance.now();
    const vertical = g.pressed.down ? "ArrowDown" : g.pressed.up ? "ArrowUp" : g.move.s ? "ArrowDown" : g.move.w ? "ArrowUp" : "";
    const horizontal = g.pressed.right ? "ArrowRight" : g.pressed.left ? "ArrowLeft" : g.move.d ? "ArrowRight" : g.move.a ? "ArrowLeft" : "";
    const code = vertical || horizontal;
    const edge = !!(g.pressed.up || g.pressed.down || g.pressed.left || g.pressed.right);
    if (!code) menuNav.code = "";
    else if (edge || code !== menuNav.code || now - menuNav.at > 180) {
      menuNav = { code, at: now };
      command(code);
    }
    if (!open) return;
    if (g.pressed.cross && !padButtons.cross) command("Enter");
    if (!open) return;
    if ((g.pressed.circle || g.pressed.options) && !(padButtons.circle || padButtons.options)) command("Escape");
    padButtons = {
      cross: !!g.pressed.cross,
      circle: !!g.pressed.circle,
      options: !!g.pressed.options,
    };
  }

  function ensureMenuLoop() {
    if (menuRaf) return;
    const step = () => {
      if (!open) {
        menuRaf = 0;
        return;
      }
      steerFromPad();
      if (!open) {
        menuRaf = 0;
        return;
      }
      if (view === "controls") paintControls();
      menuRaf = requestAnimationFrame(step);
    };
    menuRaf = requestAnimationFrame(step);
  }

  function openControls() {
    controlsFocus = 0;
    renderControlList();
    paintControls();
  }

  function showView(next) {
    view = next;
    root.querySelector(".cm-home").hidden = next !== "home";
    root.querySelector("#cm-maps").hidden = next !== "maps";
    root.querySelector("#cm-cast").hidden = next !== "cast";
    root.querySelector("#cm-controls").hidden = next !== "controls";
    const plate = root.querySelector("#cm-portrait-wrap");
    if (plate) plate.hidden = next !== "home";
    if (next === "cast") setCastView();
    if (next === "maps") {
      setMapSelected(mapIndex);
    }
    if (next === "controls") openControls();
  }

  function syncPlayLabel() {
    playBtn.textContent = hooks.hasStarted() ? "Resume" : "Play";
  }

  function show() {
    loadArt();
    open = true;
    root.hidden = false;
    document.body.classList.add("menu-open");
    syncPlayLabel();
    refreshPortrait();
    showView("home");
    setNavSelected();
    syncPadChrome();
    ensureMenuLoop();
    hooks.onPause();
  }

  function hide() {
    open = false;
    root.hidden = true;
    document.body.classList.remove("menu-open");
    stopMenuLoop();
  }

  async function chooseCharacter(id) {
    setStoredPlayerId(id);
    refreshPortrait();
    await hooks.onCharacter(id);
    // Mid-session swap: drop straight back into the world. Title screen still
    // returns home so the player can hit Play.
    if (hooks.hasStarted()) {
      hide();
      hooks.onPlay();
    } else {
      showView("home");
    }
  }

  function activateNav() {
    const action = navItems[navIndex]?.dataset.action;
    if (action === "play") {
      hide();
      hooks.onPlay();
    } else if (action === "maps") {
      showView("maps");
    } else if (action === "characters") {
      castIndex = Math.max(0, PLAYERS.findIndex((p) => p.id === getStoredPlayerId()));
      showView("cast");
    } else if (action === "controls") {
      showView("controls");
    }
  }

  root.querySelector(".cm-nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".cm-item");
    if (!btn) return;
    navIndex = navItems.indexOf(btn);
    setNavSelected();
    activateNav();
  });

  root.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => showView("home")),
  );

  root.querySelector("[data-confirm]")?.addEventListener("click", () => {
    chooseCharacter(PLAYERS[castIndex].id);
  });

  root.querySelectorAll("[data-dir]").forEach((b) =>
    b.addEventListener("click", () => {
      const dir = Number(b.dataset.dir);
      castIndex = (castIndex + dir + PLAYERS.length) % PLAYERS.length;
      setCastView();
    }),
  );

  mapsUl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-map]");
    if (!btn) return;
    const i = mapButtons.indexOf(btn);
    if (i < 0) return;
    setMapSelected(i);
    if (MAPS[i].playable) activateMap();
  });

  mapsUl.addEventListener("mousemove", (e) => {
    const btn = e.target.closest("[data-map]");
    if (!btn) return;
    const i = mapButtons.indexOf(btn);
    if (i >= 0) setMapSelected(i);
  });

  stage.addEventListener("click", (e) => {
    const card = e.target.closest(".cm-card");
    if (!card) return;
    const i = PLAYERS.findIndex((p) => p.id === card.dataset.id);
    if (i < 0) return;
    castIndex = i;
    setCastView();
  });

  function command(code) {
    if (!open || !code) return;
    if (code === "Escape") {
      if (view !== "home") showView("home");
      else if (hooks.hasStarted()) {
        hide();
        hooks.onPlay();
      }
      return;
    }
    if (view === "home") {
      if (code === "ArrowDown") {
        navIndex = Math.min(navItems.length - 1, navIndex + 1);
        setNavSelected();
      } else if (code === "ArrowUp") {
        navIndex = Math.max(0, navIndex - 1);
        setNavSelected();
      } else if (code === "Enter") {
        activateNav();
      }
    } else if (view === "maps") {
      if (code === "ArrowDown") setMapSelected(mapIndex + 1);
      else if (code === "ArrowUp") setMapSelected(mapIndex - 1);
      else if (code === "Enter") activateMap();
    } else if (view === "cast") {
      if (code === "ArrowLeft") {
        castIndex = (castIndex - 1 + PLAYERS.length) % PLAYERS.length;
        setCastView();
      } else if (code === "ArrowRight") {
        castIndex = (castIndex + 1) % PLAYERS.length;
        setCastView();
      } else if (code === "Enter") {
        chooseCharacter(PLAYERS[castIndex].id);
      }
    } else if (view === "controls") {
      const items = controlsTargets();
      if (!items.length) return;
      if (code === "ArrowDown" || code === "ArrowRight") {
        controlsFocus = (controlsFocus + 1) % items.length;
        syncControlsFocus();
      } else if (code === "ArrowUp" || code === "ArrowLeft") {
        controlsFocus = (controlsFocus - 1 + items.length) % items.length;
        syncControlsFocus();
      } else if (code === "Enter") {
        items[controlsFocus]?.click();
      }
    }
  }

  function onKey(e) {
    if (!open) return;
    if (!["Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"].includes(e.code)) return;
    e.preventDefault();
    command(e.code);
  }

  window.addEventListener("keydown", onKey);

  const soundBtn = root.querySelector("#cm-sound");
  const SOUND_KEY = "metropolis-sound";
  function syncSound() {
    let on = true;
    try {
      on = localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      /* ignore */
    }
    soundBtn.setAttribute("aria-pressed", on ? "false" : "true");
    soundBtn.textContent = on ? "Sound on" : "Sound off";
  }
  connectBtn.addEventListener("click", async () => {
    try {
      const ok = await hooks.gamepad?.connect?.();
      if (ok === false) {
        controlsLive.textContent = "Couldn't open the controller";
        controlsNote.textContent = "Unplug it and try again.";
      }
    } catch (err) {
      if (err?.name !== "NotAllowedError") {
        controlsLive.textContent = "Couldn't open the controller";
        controlsNote.textContent = "Unplug it and try again.";
      }
    }
    controlsFocus = 0;
    syncPadChrome();
  });
  disconnectBtn.addEventListener("click", async () => {
    await hooks.gamepad?.disconnectPad?.();
    controlsFocus = 0;
    syncPadChrome();
    paintControls();
  });

  soundBtn?.addEventListener("click", () => {
    let on = true;
    try {
      on = localStorage.getItem(SOUND_KEY) !== "0";
      localStorage.setItem(SOUND_KEY, on ? "0" : "1");
    } catch {
      /* ignore */
    }
    syncSound();
  });
  syncSound();

  refreshPortrait();
  setNavSelected();

  return {
    show,
    hide,
    get open() {
      return open;
    },
    setStatus(text) {
      const el = root.querySelector("#cm-status");
      if (el) el.textContent = text;
      syncPadChrome();
    },
    command,
    steer: steerFromPad,
    refreshPortrait,
    loadArt,
  };
}
