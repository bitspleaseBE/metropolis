/**
 * Combat HUD, GTA V style: a small dot reticle that turns red over a target and opens
 * with spread, hit / kill markers, a radial weapon wheel (Tab / LB) steered by the mouse
 * or right stick, and the ammo counter bottom-right.
 */
import { SLOTS, SLOT_LABEL } from "./weapons.js";

const CSS = `
#cb-reticle { position: fixed; left: 50%; top: 50%; width: 0; height: 0; z-index: 620; pointer-events: none; display: none; }
body.cb-armed #cb-reticle, body.cb-aim #cb-reticle { display: block; }
body.cb-armed #crosshair, body.cb-aim #crosshair { display: none !important; }
body.menu-open #cb-reticle, body.free-view #cb-reticle, body.on-transit #cb-reticle { display: none !important; }
#cb-reticle .dot { position: absolute; left: -2.5px; top: -2.5px; width: 5px; height: 5px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.75), 0 0 3px rgba(0,0,0,0.6); transition: background .06s, transform .08s; }
#cb-reticle.enemy .dot { background: #ff3b30; }
#cb-reticle.idle .dot { opacity: 0.55; transform: scale(0.8); }
#cb-reticle .t { position: absolute; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.55); opacity: 0; transition: opacity .1s; }
#cb-reticle.spread .t { opacity: 0.85; }
#cb-reticle.enemy .t { background: #ff3b30; }
#cb-reticle .t.l, #cb-reticle .t.r { width: 7px; height: 2px; top: -1px; }
#cb-reticle .t.u, #cb-reticle .t.d { width: 2px; height: 7px; left: -1px; }
#cb-hit { position: absolute; left: -11px; top: -11px; width: 22px; height: 22px; opacity: 0; }
#cb-hit i { position: absolute; left: 10px; width: 2px; height: 7px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.6); }
#cb-hit i:nth-child(1) { top: 0; transform-origin: 1px 11px; transform: rotate(45deg); }
#cb-hit i:nth-child(2) { top: 0; transform-origin: 1px 11px; transform: rotate(135deg); }
#cb-hit i:nth-child(3) { top: 0; transform-origin: 1px 11px; transform: rotate(225deg); }
#cb-hit i:nth-child(4) { top: 0; transform-origin: 1px 11px; transform: rotate(315deg); }
#cb-hit.kill i { background: #ff3b30; }
#cb-hit.on { animation: cb-hit .26s ease-out; }
#cb-hit.on.kill { animation: cb-kill .5s ease-out; }
@keyframes cb-hit { 0% { opacity: 1; transform: scale(0.8); } 100% { opacity: 0; transform: scale(1.15); } }
@keyframes cb-kill { 0% { opacity: 1; transform: scale(0.7); } 60% { opacity: 1; transform: scale(1.25); } 100% { opacity: 0; transform: scale(1.3); } }

#cb-ammo { position: fixed; right: 28px; bottom: 28px; z-index: 600; pointer-events: none; text-align: right; display: none;
  font-family: "Helvetica Neue", Arial, sans-serif; color: #fff; text-shadow: 0 0 2px #000, 0 1px 2px #000; }
#cb-ammo.on { display: block; }
#cb-ammo img { height: 34px; filter: drop-shadow(0 1px 2px #000); display: block; margin: 0 0 4px auto; }
#cb-ammo .n { font-weight: 800; font-size: 1.9rem; line-height: 1; font-variant-numeric: tabular-nums; }
#cb-ammo .r { font-weight: 600; font-size: 1.05rem; opacity: 0.8; margin-left: 6px; }
#cb-ammo .s { font-weight: 700; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.85; margin-top: 3px; }
#cb-ammo.empty .n { color: #ff6b5a; }

#cb-wheel { position: fixed; inset: 0; z-index: 680; display: none; pointer-events: none;
  background: radial-gradient(circle at center, rgba(0,0,0,0.25), rgba(0,0,0,0.55)); }
#cb-wheel.on { display: block; }
#cb-wheel .ring { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#cb-wheel .slot { position: absolute; width: 132px; height: 92px; margin: -46px 0 0 -66px; border-radius: 10px;
  background: rgba(12,14,18,0.72); border: 2px solid rgba(255,255,255,0.14); display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: #fff; font: 700 0.78rem/1.2 "Helvetica Neue", Arial, sans-serif;
  letter-spacing: 0.08em; text-transform: uppercase; text-shadow: 0 1px 2px #000; transition: transform .08s, border-color .08s, background .08s; }
#cb-wheel .slot img { height: 40px; margin-bottom: 6px; filter: drop-shadow(0 1px 2px #000); }
#cb-wheel .slot .a { font-weight: 600; font-size: 0.72rem; opacity: 0.75; margin-top: 2px; letter-spacing: 0.04em; }
#cb-wheel .slot.lock { opacity: 0.25; }
#cb-wheel .slot.cur { border-color: rgba(255,255,255,0.45); }
#cb-wheel .slot.on { border-color: #ffd800; background: rgba(40,36,8,0.82); transform: scale(1.08); }
#cb-wheel .center { position: absolute; width: 170px; margin-left: -85px; top: -18px; text-align: center; color: #fff;
  font: 800 1.05rem/1.2 "Helvetica Neue", Arial, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; text-shadow: 0 1px 3px #000; }
#cb-wheel .center small { display: block; font-weight: 600; font-size: 0.72rem; opacity: 0.75; letter-spacing: 0.06em; margin-top: 3px; }
#cb-armor { width: 150px; height: 6px; margin: 4px 0 0 auto; background: rgba(0,0,0,0.55); border-radius: 3px; overflow: hidden; display: none; }
#cb-armor.on { display: block; }
#cb-armor i { display: block; height: 100%; background: #3c8cff; transition: width .25s; }
`;

const RADIUS = 175;
const icon = (id) => new URL(`./weapons/icons/${id}.png`, import.meta.url).href;

export function createCombatHud(opts = {}) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const reticle = document.createElement("div");
  reticle.id = "cb-reticle";
  reticle.innerHTML = '<i class="dot"></i><i class="t l"></i><i class="t r"></i><i class="t u"></i><i class="t d"></i><div id="cb-hit"><i></i><i></i><i></i><i></i></div>';
  document.body.appendChild(reticle);
  const ticks = {
    l: reticle.querySelector(".t.l"),
    r: reticle.querySelector(".t.r"),
    u: reticle.querySelector(".t.u"),
    d: reticle.querySelector(".t.d"),
  };
  const hitEl = reticle.querySelector("#cb-hit");

  const ammo = document.createElement("div");
  ammo.id = "cb-ammo";
  ammo.innerHTML = '<img alt=""><div><span class="n"></span><span class="r"></span></div><div class="s"></div>';
  document.body.appendChild(ammo);
  const ammoImg = ammo.querySelector("img");
  const ammoN = ammo.querySelector(".n");
  const ammoR = ammo.querySelector(".r");
  const ammoS = ammo.querySelector(".s");
  ammoImg.onerror = () => (ammoImg.style.display = "none");

  const wheel = document.createElement("div");
  wheel.id = "cb-wheel";
  wheel.innerHTML = '<div class="ring"><div class="center"></div></div>';
  document.body.appendChild(wheel);
  const ring = wheel.querySelector(".ring");
  const center = wheel.querySelector(".center");
  const slotEls = new Map();
  SLOTS.forEach((id, i) => {
    const a = (i / SLOTS.length) * Math.PI * 2 - Math.PI / 2;
    const d = document.createElement("div");
    d.className = "slot";
    d.style.left = `${Math.cos(a) * RADIUS}px`;
    d.style.top = `${Math.sin(a) * RADIUS}px`;
    if (id !== "unarmed") {
      const img = document.createElement("img");
      img.alt = "";
      img.src = icon(id);
      img.onerror = () => img.remove();
      d.appendChild(img);
    }
    d.appendChild(document.createTextNode(SLOT_LABEL[id]));
    const a2 = document.createElement("span");
    a2.className = "a";
    d.appendChild(a2);
    ring.appendChild(d);
    slotEls.set(id, { el: d, ammo: a2 });
  });

  let armorEl = null;
  const host = opts.armorHost || document.getElementById("hud-tr");
  if (host) {
    armorEl = document.createElement("div");
    armorEl.id = "cb-armor";
    armorEl.innerHTML = "<i></i>";
    const health = document.getElementById("hud-health");
    if (health?.parentNode === host) health.after(armorEl);
    else host.appendChild(armorEl);
  }

  let last = null;
  const cursor = { x: 0, y: 0 };

  function set(info) {
    last = info;
    const armed = !info.melee || info.weapon === "knife";
    document.body.classList.toggle("cb-armed", info.weapon !== "unarmed");
    document.body.classList.toggle("cb-aim", !!info.aiming && info.weapon !== "unarmed");
    ammo.classList.toggle("on", info.weapon !== "unarmed");
    if (armed) {
      ammoImg.style.display = "";
      if (!ammoImg.src.endsWith(`${info.weapon}.png`)) ammoImg.src = icon(info.weapon);
      ammoN.textContent = info.melee ? "" : String(info.mag);
      ammoR.textContent = info.melee ? "" : String(info.reserve);
      ammoS.textContent = info.reloading ? "Reloading" : info.label;
      ammo.classList.toggle("empty", !info.melee && info.mag === 0);
    }
    wheel.classList.toggle("on", !!info.open);
    for (const s of info.slots) {
      const e = slotEls.get(s.id);
      if (!e) continue;
      e.el.classList.toggle("lock", !s.owned);
      e.el.classList.toggle("on", s.id === (info.open ? info.hover : info.weapon));
      e.el.classList.toggle("cur", s.id === info.weapon);
      e.ammo.textContent = s.ammo != null ? String(s.ammo) : "";
    }
    const h = info.slots.find((s) => s.id === (info.hover || info.weapon));
    center.innerHTML = "";
    center.appendChild(document.createTextNode(h?.label || ""));
    if (h?.ammo != null) {
      const sm = document.createElement("small");
      sm.textContent = `${h.ammo} rounds`;
      center.appendChild(sm);
    }
  }

  /**
   * Steer the wheel. Pass mouse deltas (px) or a stick (x, y in -1..1, `stick` true).
   * Returns the slot under the cursor, or null near the centre.
   */
  function point(dx, dy, stick = false) {
    if (stick) {
      cursor.x = dx * 100;
      cursor.y = dy * 100;
    } else {
      cursor.x += dx;
      cursor.y += dy;
      const len = Math.hypot(cursor.x, cursor.y);
      if (len > 100) {
        cursor.x *= 100 / len;
        cursor.y *= 100 / len;
      }
    }
    if (Math.hypot(cursor.x, cursor.y) < 35) return null;
    let a = Math.atan2(cursor.y, cursor.x) + Math.PI / 2;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = Math.round((a / (Math.PI * 2)) * SLOTS.length) % SLOTS.length;
    return SLOTS[i];
  }

  /** Per frame: `spreadPx` opens the ticks, `enemy` turns it red. */
  function frame({ spreadPx = 0, enemy = false, aiming = false } = {}) {
    reticle.classList.toggle("enemy", !!enemy);
    reticle.classList.toggle("idle", !aiming);
    const g = Math.max(3, Math.min(42, spreadPx));
    reticle.classList.toggle("spread", aiming && last && !last.melee && spreadPx > 5);
    ticks.l.style.left = `${-g - 7}px`;
    ticks.r.style.left = `${g}px`;
    ticks.u.style.top = `${-g - 7}px`;
    ticks.d.style.top = `${g}px`;
  }

  function hit(kill = false) {
    hitEl.classList.remove("on", "kill");
    void hitEl.offsetWidth;
    hitEl.classList.toggle("kill", !!kill);
    hitEl.classList.add("on");
  }

  function setArmor(v) {
    if (!armorEl) return;
    armorEl.classList.toggle("on", v > 0);
    armorEl.firstChild.style.width = `${Math.max(0, Math.min(100, v))}%`;
  }

  return {
    set,
    frame,
    hit,
    setArmor,
    point,
    resetCursor() {
      cursor.x = 0;
      cursor.y = 0;
    },
  };
}
