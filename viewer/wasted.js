/**
 * GTA-style game-over cards. Wasted is red, Busted is blue. The world greys out,
 * the word slams in, the frame fades to black, and `onBlack` runs while it is
 * black (respawn). The black then fades off.
 */

const CSS = `
#wasted {
  position: fixed;
  inset: 0;
  z-index: 880;
  pointer-events: none;
  visibility: hidden;
  --wasted-fade: 1100ms;
}
#wasted.on {
  visibility: visible;
  pointer-events: auto;
}
#wasted .wasted-dim {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.08) 18%, rgba(0,0,0,0.62) 100%);
  transition: opacity 0.55s ease;
}
#wasted.show .wasted-dim { opacity: 1; }
#wasted .wasted-word {
  position: absolute;
  left: 50%;
  top: 46%;
  margin: 0;
  transform: translate(-50%, -50%) scale(1.16);
  opacity: 0;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-weight: 400;
  font-size: clamp(4.8rem, 14vw, 15rem);
  line-height: 0.78;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  -webkit-text-stroke: clamp(4px, 0.7vw, 10px) var(--card-ink, #140004);
  paint-order: stroke fill;
  color: var(--card-ink, #e10600);
  text-shadow: 0.055em 0.07em 0 var(--card-ink, #140004), 0 0 28px rgba(0,0,0,0.55);
  user-select: none;
}
#wasted.tone-wasted { --card-ink: #140004; --card-fill: #e10600; }
#wasted.tone-busted { --card-ink: #071428; --card-fill: #3d7dff; }
#wasted .wasted-word { color: var(--card-fill, #e10600); }
#wasted.show .wasted-word {
  animation: wasted-in 2.6s cubic-bezier(0.16, 0.84, 0.28, 1) forwards;
}
@keyframes wasted-in {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(1.16); }
  16% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1.045); }
}
#wasted .wasted-black {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition: opacity var(--wasted-fade) linear;
}
#wasted.black .wasted-black { opacity: 1; }
body.wasted canvas {
  filter: grayscale(1) contrast(1.06) brightness(0.82) !important;
}
body.wasted #hud,
body.wasted #hud-tr,
body.wasted #hud-feed,
body.wasted #hud-speed,
body.wasted #hud-help,
body.wasted #hud-stats,
body.wasted #hud-wanted,
body.wasted #hud-ammo,
body.wasted #weapon-wheel,
body.wasted #prompt,
body.wasted #ride,
body.wasted #click-cue,
body.wasted #crosshair,
body.wasted #touch-ui,
body.wasted #hurt,
body.wasted #hurt-flash,
body.wasted .hud-radar,
body.wasted .hud-map,
body.wasted .hud-street {
  visibility: hidden !important;
}
@media (prefers-reduced-motion: reduce) {
  #wasted .wasted-dim,
  #wasted .wasted-black { transition: none; }
  #wasted.show .wasted-word {
    animation: none;
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
`;

const TONES = {
  wasted: "WASTED",
  busted: "BUSTED",
};

let root = null;
let wordEl = null;
let playing = false;
let timers = [];

function ensure() {
  if (root) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement("div");
  root.id = "wasted";
  root.setAttribute("role", "alert");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = '<div class="wasted-dim"></div><p class="wasted-word"></p><div class="wasted-black"></div>';
  wordEl = root.querySelector(".wasted-word");
  document.body.appendChild(root);
}

function later(ms, fn) {
  const id = setTimeout(fn, ms);
  timers.push(id);
}

function clearTimers() {
  for (const id of timers) clearTimeout(id);
  timers = [];
}

/**
 * Play a card. `onBlack` runs once the frame is fully black. `onDone` runs
 * after the fade back up.
 */
function playCard(tone, { onBlack, onDone } = {}) {
  if (playing || !TONES[tone]) return false;
  playing = true;
  ensure();
  clearTimers();

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hold = reduce ? 700 : 2100;
  const toBlack = reduce ? 160 : 1150;
  const blackHold = reduce ? 80 : 420;
  const fromBlack = reduce ? 180 : 1050;

  wordEl.textContent = TONES[tone];
  root.classList.remove("tone-wasted", "tone-busted", "show", "black");
  root.classList.add(`tone-${tone}`);
  root.setAttribute("aria-hidden", "false");
  root.style.setProperty("--wasted-fade", `${toBlack}ms`);
  root.classList.add("on");
  document.body.classList.add("wasted");
  void root.offsetWidth;
  root.classList.add("show");

  later(hold, () => root.classList.add("black"));
  later(hold + toBlack, () => {
    try {
      if (typeof onBlack === "function") onBlack();
    } catch (err) {
      console.error(err);
    }
  });
  later(hold + toBlack + blackHold, () => {
    document.body.classList.remove("wasted");
    root.style.setProperty("--wasted-fade", `${fromBlack}ms`);
    root.classList.remove("black");
    root.classList.remove("show");
  });
  later(hold + toBlack + blackHold + fromBlack, () => {
    root.classList.remove("on");
    root.setAttribute("aria-hidden", "true");
    playing = false;
    try {
      if (typeof onDone === "function") onDone();
    } catch (err) {
      console.error(err);
    }
  });
  return true;
}

export function playWasted(opts) {
  return playCard("wasted", opts);
}

export function playBusted(opts) {
  return playCard("busted", opts);
}
