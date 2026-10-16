/**
 * GTA-style city poster: title / pause, character carousel (De buren), and a tilted
 * postcode map of Antwerp (Maps) with a mini-map preview per district.
 * Full-screen plate covers the WebGL view; no login, no combat chrome.
 */
import { PLAYERS, getStoredPlayerId, setStoredPlayerId, playerById } from "./players.js";
import { buttonName, controlRows } from "./gamepad.js";
import { isUnlocked, loadPlay, lockReason } from "./district-progress.js";

const ATLAS_URL = "./menu/antwerp_postcodes.json";
const DISTRICT_ID = /^[0-9a-z][0-9a-z-]{0,40}$/;
const minimapUrl = (district) =>
  DISTRICT_ID.test(String(district)) ? `./menu/minimap-${district}.json` : null;
const SVG_NS = "http://www.w3.org/2000/svg";

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
        <button type="button" class="cm-item" data-action="about">About</button>
      </nav>
      <p class="cm-status" id="cm-status">Keyboard &amp; mouse ready</p>
    </div>
    <div class="cm-portrait-wrap" id="cm-portrait-wrap" aria-hidden="true">
      <img class="cm-portrait" id="cm-portrait" src="" alt="" />
    </div>
    <div class="cm-panel cm-maps-panel" id="cm-maps" hidden>
      <header class="cm-maps-bar">
        <button type="button" class="cm-back" id="cm-maps-back" aria-label="Back to menu">Back</button>
        <div class="cm-maps-heading">
          <p class="cm-eyebrow">Districts</p>
          <h2>Antwerp</h2>
        </div>
      </header>
      <div class="cm-maps-layout">
        <div class="cm-atlas" role="listbox" aria-label="Antwerp postcodes">
          <div class="cm-atlas-tilt" id="cm-atlas-tilt">
            <svg class="cm-atlas-svg" id="cm-atlas-svg" preserveAspectRatio="xMidYMid meet"></svg>
          </div>
          <div class="cm-atlas-labels" id="cm-atlas-labels"></div>
        </div>
        <aside class="cm-map-preview" id="cm-map-preview" aria-live="polite">
          <div class="cm-map-frame">
            <canvas class="cm-map-roads" id="cm-map-roads" width="640" height="640" aria-hidden="true"></canvas>
            <div class="cm-map-placeholder" id="cm-map-placeholder" hidden>
              <span class="cm-map-lock">Locked</span>
              <span class="cm-map-unlock" id="cm-map-unlock">Keep playing to unlock</span>
            </div>
            <div class="cm-map-caption">
              <strong id="cm-map-title">Antwerp</strong>
              <span id="cm-map-blurb">Pick a district on the map</span>
            </div>
          </div>
          <div class="cm-map-actions">
            <button type="button" class="cm-confirm" id="cm-map-play" disabled>Play</button>
            <button type="button" class="cm-back" id="cm-map-detail-back">Back</button>
          </div>
        </aside>
      </div>
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
      <div class="cm-quality" id="cm-quality">
        <p class="cm-eyebrow">Graphics</p>
        <button type="button" class="cm-confirm" id="cm-quality-btn" aria-pressed="false">Quality: High</button>
        <p class="cm-controls-note">High adds shadows, bloom and sky. Reloads the page.</p>
      </div>
      <div class="cm-pad-actions" id="cm-pad-actions" hidden>
        <button type="button" class="cm-hid" id="cm-connect" hidden>Connect</button>
        <button type="button" class="cm-hid" id="cm-disconnect" hidden>Disconnect</button>
      </div>
      <ul class="cm-controls-list" id="cm-controls-list"></ul>
      <button type="button" class="cm-back" data-back>Back</button>
    </div>
    <div class="cm-panel" id="cm-about" hidden>
      <p class="cm-eyebrow">About</p>
      <h2>Metropolis Antwerp</h2>
      <p class="cm-about-lead">I love Antwerp. It's just for fun.</p>
      <ul class="cm-about-sources">
        <li>
          Street survey (traffic poles, speeds, markings, parking bays, chargers, bike racks,
          shelters, city boards, quay / jetties, share-zones): ©
          <a href="https://www.antwerpen.be/info/gratis-open-data-licentie" target="_blank" rel="noopener noreferrer">Stad Antwerpen</a>
          — Team Data &amp; Digitaal Vlaanderen, gratis open-data licentie.
        </li>
        <li>
          Map data ©
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          contributors (ODbL).
        </li>
        <li>
          Velo occupancy:
          <a href="https://gbfs.smartbike.com/antwerp/1.0/gbfs.json" target="_blank" rel="noopener noreferrer">Clear Channel SmartBike GBFS</a>.
          Shared scooters: city drop zones; Dott GBFS when the feed is reachable.
        </li>
      </ul>
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
  const stage = root.querySelector("#cm-stage");
  const portrait = root.querySelector("#cm-portrait");
  const playBtn = root.querySelector('[data-action="play"]');
  const atlasSvg = root.querySelector("#cm-atlas-svg");
  const atlasLabels = root.querySelector("#cm-atlas-labels");
  const atlasRoot = root.querySelector(".cm-atlas");
  const mapsPanel = root.querySelector("#cm-maps");
  const mapsBack = root.querySelector("#cm-maps-back");
  const mapPreview = root.querySelector("#cm-map-preview");
  const mapRoads = root.querySelector("#cm-map-roads");
  const mapPlaceholder = root.querySelector("#cm-map-placeholder");
  const mapTitle = root.querySelector("#cm-map-title");
  const mapBlurb = root.querySelector("#cm-map-blurb");
  const mapUnlock = root.querySelector("#cm-map-unlock");
  const mapPlay = root.querySelector("#cm-map-play");
  const mapDetailBack = root.querySelector("#cm-map-detail-back");
  const mapsNarrow = window.matchMedia("(max-width: 720px)");

  const currentDistrict =
    (typeof window !== "undefined" && window.__DISTRICT && window.__DISTRICT.id) || "2018-harmonie";
  /** Selectable postcode areas in keyboard order; filled by loadAtlas(). */
  let areas = [];
  let mapIndex = -1;
  let atlasLoad = null;
  let waterEl = null;
  /** Mobile only: district confirm sheet open over the full-bleed map. */
  let mapDetailOpen = false;
  const minimaps = new Map();

  function isNarrowMaps() {
    return mapsNarrow.matches;
  }

  function setMapDetailOpen(open) {
    mapDetailOpen = !!open;
    mapsPanel.classList.toggle("detail-open", mapDetailOpen);
    if (mapPreview) {
      mapPreview.setAttribute("aria-hidden", !isNarrowMaps() || mapDetailOpen ? "false" : "true");
    }
    if (mapsBack) {
      // On narrow screens the header Back is for map → menu; hide it under the sheet.
      mapsBack.hidden = isNarrowMaps() && mapDetailOpen;
    }
  }

  /** Tilted SVG of every postcode; only the registry districts take input. */
  function loadAtlas() {
    if (atlasLoad) return atlasLoad;
    waterEl = null;
    atlasLoad = (async () => {
      const res = await fetch(ATLAS_URL);
      if (!res.ok) throw new Error(`atlas HTTP ${res.status}`);
      const doc = await res.json();
      const boot = typeof window !== "undefined" ? window.__DISTRICT : null;
      if (boot && boot.ready) await boot.ready;
      const live = new Map(((boot && boot.index && boot.index.districts) || []).map((d) => [d.id, d]));
      atlasSvg.setAttribute("viewBox", doc.viewBox.join(" "));
      atlasSvg.replaceChildren();
      atlasLabels.replaceChildren();
      const byPc = new Map();
      for (const a of doc.areas) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", a.path);
        path.setAttribute("class", a.selectable ? "cm-area" : "cm-area inert");
        atlasSvg.append(path);
        if (!a.selectable) continue;
        const meta = live.get(a.district) || {};
        const area = {
          ...a,
          packageOpen: meta.unlocked != null ? !!meta.unlocked : !!a.unlocked,
          summary: meta.summary || a.summary || "",
          el: path,
        };
        area.unlocked = area.packageOpen && isUnlocked(loadPlay(), a.district);
        path.dataset.pc = a.postcode;
        path.setAttribute("role", "option");
        path.classList.toggle("locked", !area.unlocked);
        path.classList.toggle("current", a.district === currentDistrict);
        const anchor = document.createElementNS(SVG_NS, "circle");
        anchor.setAttribute("cx", a.label[0]);
        anchor.setAttribute("cy", a.label[1]);
        anchor.setAttribute("r", "1");
        anchor.setAttribute("class", "cm-area-anchor");
        atlasSvg.append(anchor);
        const label = document.createElement("span");
        label.className = "cm-area-label" + (area.unlocked ? "" : " locked");
        label.textContent = a.name;
        atlasLabels.append(label);
        area.anchorEl = anchor;
        area.labelEl = label;
        byPc.set(a.postcode, area);
      }
      if (doc.water) {
        // The Scheldt and the docks sit over the postcode fills (rings include the river bed).
        waterEl = document.createElementNS(SVG_NS, "path");
        waterEl.setAttribute("d", doc.water);
        waterEl.setAttribute("class", "cm-water");
        atlasSvg.append(waterEl);
      }
      areas = (doc.order || []).map((pc) => byPc.get(pc)).filter(Boolean);
      const here = areas.findIndex((a) => a.district === currentDistrict);
      setMapSelected(here >= 0 ? here : 0, { openDetail: false });
      requestAnimationFrame(placeLabels);
    })().catch((err) => {
      atlasLoad = null;
      mapBlurb.textContent = "Map unavailable";
      console.warn("[menu] atlas", err);
    });
    return atlasLoad;
  }

  /** Flat labels over the tilted map, pinned to each area's projected anchor point. */
  function placeLabels() {
    if (!areas.length || atlasRoot.offsetParent === null) return;
    const box = atlasRoot.getBoundingClientRect();
    for (const a of areas) {
      // The port runs off the framed edge: keep its label inside the box.
      const r = a.anchorEl.getBoundingClientRect();
      const half = a.labelEl.offsetWidth / 2 + 6;
      const x = Math.min(box.width - half, Math.max(half, r.left + r.width / 2 - box.left));
      const y = Math.min(box.height - 14, Math.max(14, r.top + r.height / 2 - box.top));
      a.labelEl.style.left = `${x}px`;
      a.labelEl.style.top = `${y}px`;
    }
  }
  window.addEventListener("resize", () => requestAnimationFrame(placeLabels));

  async function loadMinimap(district) {
    if (!minimaps.has(district)) {
      const url = minimapUrl(district);
      minimaps.set(
        district,
        url
          ? fetch(url)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null),
      );
    }
    return minimaps.get(district);
  }

  /** District outline + streets on the preview canvas. */
  async function paintMinimap(area) {
    const data = await loadMinimap(area.district);
    if (areas[mapIndex] !== area) return;
    const W = mapRoads.width;
    const H = mapRoads.height;
    const ctx = mapRoads.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!data) return;
    const k = W / (data.size || 1000);
    ctx.save();
    ctx.scale(k, k);
    ctx.beginPath();
    data.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = area.unlocked ? "rgba(36, 70, 92, 0.85)" : "rgba(40, 48, 58, 0.7)";
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const rank of [1, 2, 3]) {
      ctx.strokeStyle = rank === 3 ? "rgba(255,255,255,0.8)" : rank === 2 ? "rgba(225,235,242,0.55)" : "rgba(190,210,225,0.3)";
      ctx.lineWidth = (rank === 3 ? 3.2 : rank === 2 ? 2 : 1.1) / k;
      ctx.beginPath();
      for (const road of data.roads) {
        if (road.r !== rank) continue;
        road.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      }
      ctx.stroke();
    }
    ctx.beginPath();
    data.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = area.unlocked ? "#ff2bd6" : "#8a96a3";
    ctx.lineWidth = 3 / k;
    ctx.stroke();
    ctx.restore();
  }

  function applyPlayLocks() {
    const play = loadPlay();
    for (const area of areas) {
      area.unlocked = area.packageOpen && isUnlocked(play, area.district);
      area.lockCopy = area.unlocked ? "" : lockReason(play, area.district);
      area.el.classList.toggle("locked", !area.unlocked);
      if (area.labelEl) area.labelEl.classList.toggle("locked", !area.unlocked);
    }
  }

  function setMapSelected(i, { openDetail = false } = {}) {
    if (!areas.length) return;
    applyPlayLocks();
    mapIndex = (i + areas.length) % areas.length;
    const a = areas[mapIndex];
    for (const other of areas) {
      other.el.classList.toggle("selected", other === a);
      other.labelEl.classList.toggle("selected", other === a);
      other.el.setAttribute("aria-selected", other === a ? "true" : "false");
    }
    // Draw the selection last so its outline sits above the neighbours' strokes.
    a.el.parentNode.append(a.el);
    if (waterEl) waterEl.parentNode.append(waterEl);
    mapTitle.textContent = `${a.name} · ${a.postcode}`;
    mapBlurb.textContent = a.unlocked ? a.summary : a.lockCopy || "Not reachable yet";
    if (mapUnlock) mapUnlock.textContent = a.lockCopy || "Keep playing to unlock";
    mapPlaceholder.hidden = a.unlocked;
    mapPlay.disabled = !a.unlocked;
    mapPlay.textContent = a.district === currentDistrict && hooks.hasStarted() ? "Resume" : "Play";
    void paintMinimap(a);
    if (openDetail && isNarrowMaps()) setMapDetailOpen(true);
  }

  function activateMap() {
    const a = areas[mapIndex];
    if (!a?.unlocked) return;
    if (a.district && a.district !== currentDistrict && typeof window.enterDistrict === "function") {
      window.enterDistrict(a.district);
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
    root.querySelector("#cm-about").hidden = next !== "about";
    const plate = root.querySelector("#cm-portrait-wrap");
    if (plate) plate.hidden = next !== "home";
    if (next === "cast") setCastView();
    if (next === "maps") {
      setMapDetailOpen(false);
      if (areas.length) {
        setMapSelected(Math.max(0, areas.findIndex((a) => a.district === currentDistrict)), {
          openDetail: false,
        });
        requestAnimationFrame(placeLabels);
      } else void loadAtlas();
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
    } else if (action === "about") {
      showView("about");
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

  mapsBack?.addEventListener("click", () => {
    // Map view → main menu (never skips past a closed sheet).
    setMapDetailOpen(false);
    showView("home");
  });
  mapDetailBack?.addEventListener("click", () => {
    if (isNarrowMaps()) {
      setMapDetailOpen(false);
      requestAnimationFrame(placeLabels);
      return;
    }
    showView("home");
  });
  mapsNarrow.addEventListener("change", () => {
    if (!isNarrowMaps()) setMapDetailOpen(false);
    else if (view === "maps") setMapDetailOpen(false);
    requestAnimationFrame(placeLabels);
  });

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

  // Click picks an area; on narrow screens that opens the play confirm sheet.
  atlasSvg.addEventListener("click", (e) => {
    const pc = e.target.closest?.("[data-pc]")?.dataset.pc;
    const i = areas.findIndex((a) => a.postcode === pc);
    if (i >= 0) setMapSelected(i, { openDetail: true });
  });
  atlasSvg.addEventListener("pointerover", (e) => {
    const pc = e.target.closest?.("[data-pc]")?.dataset.pc;
    for (const a of areas) a.el.classList.toggle("hover", a.postcode === pc);
  });
  atlasSvg.addEventListener("pointerleave", () => {
    for (const a of areas) a.el.classList.remove("hover");
  });
  mapPlay.addEventListener("click", () => activateMap());

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
      if (view === "maps" && isNarrowMaps() && mapDetailOpen) {
        setMapDetailOpen(false);
        requestAnimationFrame(placeLabels);
      } else if (view !== "home") showView("home");
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
      if (code === "ArrowDown" || code === "ArrowRight") {
        setMapSelected(mapIndex + 1, { openDetail: isNarrowMaps() && mapDetailOpen });
      } else if (code === "ArrowUp" || code === "ArrowLeft") {
        setMapSelected(mapIndex - 1, { openDetail: isNarrowMaps() && mapDetailOpen });
      } else if (code === "Enter") {
        if (isNarrowMaps() && !mapDetailOpen) setMapDetailOpen(true);
        else activateMap();
      }
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
    window.dispatchEvent(new CustomEvent("metropolis-sound", { detail: !on }));
  });
  syncSound();

  const qualityBtn = root.querySelector("#cm-quality-btn");
  function syncQuality() {
    const q = hooks.getQuality?.() === "low" ? "low" : "high";
    if (!qualityBtn) return;
    qualityBtn.textContent = q === "high" ? "Quality: High" : "Quality: Low";
    qualityBtn.setAttribute("aria-pressed", q === "high" ? "true" : "false");
  }
  qualityBtn?.addEventListener("click", () => {
    const cur = hooks.getQuality?.() === "low" ? "low" : "high";
    const next = cur === "high" ? "low" : "high";
    hooks.onQuality?.(next);
  });
  syncQuality();

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
