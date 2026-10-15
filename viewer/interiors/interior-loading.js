/**
 * The veil over the cut between street and shop: the boot loader's GTA-style card, re-used.
 *
 * A first visit gets the full splash (category key art, kicker, shop name, a bar in the
 * shop's colours) for at least 0.7 s while the room is built. Walking back into a remembered
 * shop, or out onto the street, only gets a short dark veil (0.25 s) with the name on it.
 * Art comes from menu/splash/manifest.json, picked per shop id so a shop always shows the same
 * scene; categories without art fall back to the generic pool.
 */
const FADE_MS = 260;
const MIN_FULL_MS = 700;
const MIN_VEIL_MS = 250;
const FALLBACK = "./menu/poster-antwerp.jpg";

const CSS = `
#interior-loading {
  position: fixed; inset: 0; z-index: 900;
  display: flex; align-items: flex-end; justify-content: center;
  overflow: hidden; background: #06080c;
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity ${FADE_MS}ms ease, visibility 0s linear ${FADE_MS}ms;
  --brand: #ff2bd6; --accent: #ffffff;
}
#interior-loading.on { opacity: 1; visibility: visible; transition: opacity ${FADE_MS}ms ease; }
#interior-loading .il-art {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; object-position: center 45%;
  transform: scale(1.04); opacity: 0; transition: opacity 0.3s ease;
}
#interior-loading.full .il-art { opacity: 1; animation: il-ken 9s ease-out forwards; }
@keyframes il-ken {
  from { transform: scale(1.04) translate3d(0, 0, 0); }
  to { transform: scale(1.12) translate3d(-1.6%, -1%, 0); }
}
#interior-loading .il-veil {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, #06080c88 0%, transparent 30%, transparent 50%, #06080cee 86%, #06080c 100%),
    linear-gradient(90deg, #06080c55 0%, transparent 35%, transparent 65%, #06080c44 100%);
}
#interior-loading .il-card {
  position: relative; z-index: 1; width: min(36rem, 92vw);
  margin: 0 0 max(4.5vh, 28px); padding: 0 8px; box-sizing: border-box; text-align: center;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
}
#interior-loading .il-kicker {
  margin: 0 0 8px; font: 700 0.72rem/1.3 system-ui, sans-serif;
  letter-spacing: 0.28em; text-transform: uppercase; color: var(--brand);
  text-shadow: 0 1px 8px #000c;
}
#interior-loading h2 {
  margin: 0 0 16px; font-size: clamp(1.9rem, 6.5vw, 3.2rem); font-weight: 400;
  line-height: 0.95; letter-spacing: 0.02em; text-transform: uppercase; color: #fff;
  -webkit-text-stroke: 3px #080a0d; paint-order: stroke fill;
  text-shadow: 3px 4px 0 #080a0d, 0 0 28px #000a;
}
#interior-loading .il-track {
  height: 10px; border: 2px solid #080a0d; background: #ffffff22;
  overflow: hidden; box-shadow: 3px 3px 0 #080a0d;
}
#interior-loading .il-fill {
  height: 100%; width: 100%;
  background: linear-gradient(90deg, var(--brand), var(--brand) 60%, var(--accent));
  transform-origin: left center; transform: scaleX(0.04);
}
#interior-loading.full.on .il-fill { transition: transform ${MIN_FULL_MS + 400}ms cubic-bezier(.2,.7,.3,1); transform: scaleX(0.92); }
#interior-loading.full.on.ready .il-fill { transition: transform 0.2s ease-out; transform: scaleX(1); }
#interior-loading .il-sub {
  margin: 12px 0 0; font: 600 0.82rem/1.35 system-ui, sans-serif;
  color: #e8eef4; text-shadow: 0 1px 6px #000c;
}
#interior-loading:not(.full) .il-track,
#interior-loading:not(.full) .il-sub { display: none; }
#interior-loading:not(.full) .il-card { margin-bottom: 40vh; }
#interior-loading:not(.full) h2 { font-size: clamp(1.4rem, 4vw, 2.2rem); margin: 0; }
@media (prefers-reduced-motion: reduce) {
  #interior-loading, #interior-loading .il-fill { transition: none !important; }
  #interior-loading .il-art { animation: none !important; transform: none; }
}
`;

const hex = (c, fb) => {
  if (!Array.isArray(c) || c.length < 3) return fb;
  return "#" + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
};
/** Brand colours on the dark card: lift very dark fascias so the kicker stays readable. */
const readable = (c, fb) => {
  if (!Array.isArray(c)) return fb;
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  if (lum > 0.18) return hex(c, fb);
  const k = 0.18 / Math.max(lum, 0.02);
  return hex(c.map((v) => Math.min(1, v * k + 0.15)), fb);
};

export function createInteriorLoading({ base = "./menu/splash/", doc = document } = {}) {
  const style = doc.createElement("style");
  style.textContent = CSS;
  doc.head.appendChild(style);
  const root = doc.createElement("div");
  root.id = "interior-loading";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <img class="il-art" alt="" decoding="async" />
    <div class="il-veil" aria-hidden="true"></div>
    <div class="il-card">
      <p class="il-kicker"></p>
      <h2></h2>
      <div class="il-track"><div class="il-fill"></div></div>
      <p class="il-sub"></p>
    </div>`;
  doc.body.appendChild(root);
  const art = root.querySelector(".il-art");
  const kicker = root.querySelector(".il-kicker");
  const title = root.querySelector("h2");
  const sub = root.querySelector(".il-sub");
  art.addEventListener("error", () => {
    if (!art.src.endsWith(FALLBACK.slice(1))) art.src = FALLBACK;
  });

  let manifest = null;
  const manifestUrl = new URL("manifest.json", new URL(base, doc.baseURI));
  const manifestReady = (manifestUrl.origin === location.origin ? fetch(manifestUrl.href) : Promise.reject())
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (manifest = m))
    .catch(() => null);

  function pick(category, seed) {
    const pool = manifest?.[category]?.length ? manifest[category] : manifest?.generic;
    if (!pool?.length) return FALLBACK;
    const n = Math.abs(Math.floor(Number(seed) || 0));
    const u = new URL(String(pool[n % pool.length]), manifestUrl);
    return u.origin === location.origin ? u.href : FALLBACK;
  }

  let shownAt = 0;
  let minMs = 0;
  let on = false;
  let hideTimer = 0;

  const warmed = new Set();

  return {
    ready: manifestReady,
    /** Fetch a shop's splash ahead of time (door prompt showing) so it's there on entry. */
    preload(category, seed) {
      if (!manifest) return;
      const src = pick(category, seed);
      if (warmed.has(src)) return;
      warmed.add(src);
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    },
    /** Fade the card in. `info.full` picks the splash over the short veil. */
    show(info = {}) {
      clearTimeout(hideTimer);
      const full = !!info.full;
      root.classList.toggle("full", full);
      root.classList.remove("ready");
      root.style.setProperty("--brand", readable(info.fascia, "#ff2bd6"));
      root.style.setProperty("--accent", hex(info.accent, "#ffffff"));
      kicker.textContent = info.kicker || "";
      title.textContent = info.title || "";
      sub.textContent = info.sub || "";
      if (full) {
        art.style.animation = "none";
        void art.offsetWidth;
        art.style.animation = "";
        art.src = pick(info.category, info.seed);
      }
      void root.offsetWidth;
      root.classList.add("on");
      on = true;
      shownAt = performance.now();
      minMs = full ? FADE_MS + MIN_FULL_MS : Math.max(FADE_MS, MIN_VEIL_MS);
    },
    /** True once the screen is fully covered (safe to swap the scene). */
    covered() {
      return on && performance.now() - shownAt >= FADE_MS;
    },
    /** Fade out once the minimum time has passed (`now` skips the wait). */
    hide(now = false) {
      if (!on) return;
      root.classList.add("ready");
      const wait = now ? 0 : Math.max(0, minMs - (performance.now() - shownAt));
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        root.classList.remove("on");
        on = false;
      }, wait);
    },
    get visible() {
      return on;
    },
  };
}
