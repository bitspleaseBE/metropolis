/**
 * GTA-style city poster: title / pause, character carousel (De buren), maps list.
 * Full-screen plate covers the WebGL view; no login, no combat chrome.
 */
import { PLAYERS, getStoredPlayerId, setStoredPlayerId, playerById } from "./players.js";
import { buttonName, controlRows } from "./gamepad.js";

const MAPS = [
  {
    id: "klein-antwerpen",
    name: "Klein Antwerpen",
    playable: true,
    note: "Playable now",
    blurb: "Harmonie · Mechelsesteenweg · Velo docks",
    preview: "./menu/map-klein-antwerpen.jpg",
  },
  {
    id: "antwerpen-city",
    name: "Antwerpen City",
    playable: false,
    note: "Coming later",
    blurb: "Centrum to the Scheldt — mapped, not open yet",
    preview: null,
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
      <button type="button" class="cm-hid" hidden>Connect controller</button>
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
      <button type="button" class="cm-hid" hidden>Connect controller</button>
      <ul class="cm-controls-list" id="cm-controls-list"></ul>
      <button type="button" class="cm-back" data-back>Back</button>
    </div>
    <footer class="cm-footer">
      <span><kbd>↑↓</kbd> Navigate</span>
      <span><kbd>Enter</kbd> Select</span>
      <span><kbd>Esc</kbd> Back</span>
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

  let mapIndex = 0;
  let roadsPainted = false;

  for (const m of MAPS) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="cm-map${m.playable ? "" : " locked"}" data-map="${m.id}" role="option" aria-disabled="${m.playable ? "false" : "true"}">
      <span class="cm-map-text"><strong>${m.name}</strong><em>${m.blurb}</em></span>
      <span class="cm-map-note">${m.note}</span>
    </button>`;
    mapsUl.append(li);
  }
  const mapButtons = [...mapsUl.querySelectorAll(".cm-map")];

  /** Stroke roads.json onto the preview canvas (once). */
  async function paintRoadsOverlay() {
    if (roadsPainted || !mapRoads) return;
    try {
      const res = await fetch("./roads.json");
      if (!res.ok) return;
      const data = await res.json();
      const roads = data.roads || [];
      const W = mapRoads.width;
      const H = mapRoads.height;
      const ctx = mapRoads.getContext("2d");
      ctx.clearRect(0, 0, W, H);
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
      const oy = minY - (maxY - minY) * pad;
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
      roadsPainted = true;
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
    if (m.preview) {
      mapImg.hidden = false;
      mapImg.src = m.preview;
      mapImg.alt = `Map of ${m.name}`;
      mapRoads.hidden = false;
      mapPlaceholder.hidden = true;
      paintRoadsOverlay();
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
  let controlsRaf = 0;
  let controlsLayout = undefined;

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

  function paintControls() {
    const pad = hooks.gamepad;
    const g = pad ? pad.sample() : null;
    if (!g || !g.layout) {
      controlsLive.textContent = pad?.canConnectHid?.()
        ? "Connect controller once. After that the sticks show up here and stay on."
        : "Plug in a controller, then press any button. The sticks show up on this line.";
      if (controlsLayout) renderControlList();
      return;
    }
    if (g.layout !== controlsLayout) renderControlList();
    const held = Object.entries(g.down || [])
      .filter(([, on]) => on)
      .map(([name]) => buttonName(g.layout, name));
    const n = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
    const s = g.sticks || { lx: 0, ly: 0, rx: 0, ry: 0 };
    controlsLive.textContent = `${g.label} · L ${n(s.lx)} ${n(s.ly)} · R ${n(s.rx)} ${n(s.ry)}${held.length ? " · " + held.join(" ") : ""}`;
  }

  function stopControls() {
    cancelAnimationFrame(controlsRaf);
    controlsRaf = 0;
  }

  function openControls() {
    renderControlList();
    syncHidButton();
    paintControls();
    stopControls();
    const step = () => {
      if (view !== "controls") return;
      paintControls();
      controlsRaf = requestAnimationFrame(step);
    };
    controlsRaf = requestAnimationFrame(step);
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
      mapIndex = 0;
      setMapSelected(0);
    }
    if (next === "controls") openControls();
    else stopControls();
  }

  function syncPlayLabel() {
    playBtn.textContent = hooks.hasStarted() ? "Resume" : "Play";
  }

  function syncHidButton() {
    const showBtn = !!(hooks.gamepad?.canConnectHid?.() && !hooks.gamepad.connected());
    root.querySelectorAll(".cm-hid").forEach((b) => {
      b.hidden = !showBtn;
    });
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
    syncHidButton();
    hooks.onPause();
  }

  function hide() {
    open = false;
    root.hidden = true;
    document.body.classList.remove("menu-open");
    stopControls();
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

  function onKey(e) {
    if (!open) return;
    if (e.code === "Escape") {
      e.preventDefault();
      if (view !== "home") showView("home");
      else if (hooks.hasStarted()) {
        hide();
        hooks.onPlay();
      }
      return;
    }
    if (view === "home") {
      if (e.code === "ArrowDown") {
        e.preventDefault();
        navIndex = Math.min(navItems.length - 1, navIndex + 1);
        setNavSelected();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        navIndex = Math.max(0, navIndex - 1);
        setNavSelected();
      } else if (e.code === "Enter") {
        e.preventDefault();
        activateNav();
      }
    } else if (view === "maps") {
      if (e.code === "ArrowDown") {
        e.preventDefault();
        setMapSelected(mapIndex + 1);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setMapSelected(mapIndex - 1);
      } else if (e.code === "Enter") {
        e.preventDefault();
        activateMap();
      }
    } else if (view === "cast") {
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        castIndex = (castIndex - 1 + PLAYERS.length) % PLAYERS.length;
        setCastView();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        castIndex = (castIndex + 1) % PLAYERS.length;
        setCastView();
      } else if (e.code === "Enter") {
        e.preventDefault();
        chooseCharacter(PLAYERS[castIndex].id);
      }
    }
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
  root.querySelectorAll(".cm-hid").forEach((b) => {
    b.addEventListener("click", async () => {
      const status = root.querySelector("#cm-status");
      try {
        const ok = await hooks.gamepad?.connectHid?.();
        if (ok === false && status && !hooks.gamepad?.connected()) {
          status.textContent = "Choose the Wireless controller in the browser prompt.";
        }
      } catch (err) {
        if (err?.name !== "NotAllowedError" && status) {
          status.textContent = "Couldn't open the controller. Unplug it and try again.";
        }
      }
      syncHidButton();
    });
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
      syncHidButton();
    },
    refreshPortrait,
    loadArt,
  };
}
