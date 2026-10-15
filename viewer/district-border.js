/**
 * Walking across a shared postcode border (``edges[].borders``) into a built neighbour hands the
 * walker over to that district package at the same spot and heading. Neighbour chunks already
 * stream across the border (neighbour-districts.js), so the city never stops at the edge.
 *
 * Without ``insideRing`` / ``unproject`` (legacy callers) it falls back to the old prompt.
 */
export function createDistrictBorder(opts) {
  const getPos = opts.getPos; // () => {x,z}
  const projectGate = opts.projectGate; // (lat,lon) => {x,z} in Three space
  const unproject = opts.unproject; // (x,z) => {lat,lon}
  const insideRing = opts.insideRing; // (x,z) => bool, current postcode ring
  const insideNeighbour = opts.insideNeighbour || (() => true); // (id,x,z) => bool
  const getYaw = opts.getYaw || (() => 0);
  const promptEl = opts.promptEl || document.getElementById("prompt");
  const radius = opts.radiusM || 30;
  /** Metres past our ring before the handoff fires (arrival lands this far inside theirs). */
  const HANDOFF_M = 4;
  const ARRIVAL_GRACE_MS = 4000;
  const seamless = typeof unproject === "function" && typeof insideRing === "function";
  const bornAt = performance.now();
  let edges = [];
  let active = null;
  let hiddenUntil = 0;
  let leaving = false;

  async function init() {
    if (window.__DISTRICT && window.__DISTRICT.ready) await window.__DISTRICT.ready;
    const d = window.__DISTRICT || {};
    const districts = (d.index && d.index.districts) || [];
    edges = (d.edges || [])
      .map((e) => {
        const meta = districts.find((x) => x.id === e.to);
        // Standalone districts are reached from the menu, never by walking.
        // Campaign locks stay in the list so the border can say why, and update()
        // refuses the handoff until district-progress opens them.
        if (meta && (meta.standalone || meta.unlocked === false || meta.access !== "border")) return null;
        const g = e.gate || {};
        if (g.lat == null || g.lon == null || !projectGate) return null;
        const p = projectGate(g.lat, g.lon);
        // Shared postcode border runs of [lat, lon] points; fall back to the single gate.
        let runs = Array.isArray(e.borders) && e.borders.length ? e.borders : null;
        if (!runs) runs = Array.isArray(e.border) && e.border.length >= 2 ? [e.border] : [[[g.lat, g.lon]]];
        const lines = runs.map((run) => run.map(([lat, lon]) => projectGate(lat, lon)));
        return {
          to: e.to,
          label: (meta && meta.title) || e.label || e.to,
          side: e.side,
          x: p.x,
          z: p.z,
          lines,
          summary: (meta && (meta.summary || meta.title)) || "",
        };
      })
      .filter(Boolean);
  }

  function distToEdge(e, x, z) {
    let best = Infinity;
    for (const pts of e.lines) best = Math.min(best, distToLine(pts, x, z));
    return best;
  }

  function distToLine(pts, x, z) {
    if (pts.length === 1) return Math.hypot(x - pts[0].x, z - pts[0].z);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const ab2 = abx * abx + abz * abz;
      let t = ab2 > 1e-9 ? ((x - a.x) * abx + (z - a.z) * abz) / ab2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
      if (d < best) best = d;
    }
    return best;
  }

  function hide() {
    if (promptEl && active) {
      while (promptEl.firstChild) promptEl.removeChild(promptEl.firstChild);
      promptEl.style.display = "none";
    }
    active = null;
  }

  function show(edge) {
    if (!promptEl) return;
    active = edge;
    while (promptEl.firstChild) promptEl.removeChild(promptEl.firstChild);
    promptEl.style.display = "block";

    const root = document.createElement("div");
    root.className = "district-border";

    const title = document.createElement("strong");
    title.textContent = "Leaving the modelled area";
    root.appendChild(title);

    const p = document.createElement("p");
    p.appendChild(document.createTextNode("Continue to "));
    const em = document.createElement("em");
    em.textContent = edge.label;
    p.appendChild(em);
    if (edge.summary) p.appendChild(document.createTextNode(" — " + edge.summary));
    p.appendChild(document.createTextNode("?"));
    root.appendChild(p);

    const actions = document.createElement("div");
    actions.className = "district-border-actions";

    const go = document.createElement("button");
    go.type = "button";
    go.dataset.act = "go";
    go.textContent = "Go to district";
    edge.locked = false;
    go.onclick = () => {
      if (typeof window.enterDistrict === "function") window.enterDistrict(edge.to);
    };

    const stay = document.createElement("button");
    stay.type = "button";
    stay.dataset.act = "stay";
    stay.textContent = "Stay here";
    stay.onclick = () => {
      hiddenUntil = performance.now() + 15000;
      hide();
    };

    actions.appendChild(go);
    actions.appendChild(stay);
    root.appendChild(actions);
    promptEl.appendChild(root);
  }

  function mayEnter(id) {
    const progress = typeof window !== "undefined" ? window.__districtProgress : null;
    if (!progress || typeof progress.isUnlocked !== "function") return true;
    return progress.isUnlocked(progress.loadPlay(), id);
  }

  function lockCopy(id) {
    const progress = typeof window !== "undefined" ? window.__districtProgress : null;
    if (!progress || typeof progress.lockReason !== "function") {
      return "Play Antwerpen and Klein Antwerpen first";
    }
    return progress.lockReason(progress.loadPlay(), id) || "Keep playing to unlock";
  }

  function showLocked(edge) {
    if (!promptEl) return;
    active = edge;
    edge.locked = true;
    while (promptEl.firstChild) promptEl.removeChild(promptEl.firstChild);
    promptEl.style.display = "block";
    const root = document.createElement("div");
    root.className = "district-border";
    const title = document.createElement("strong");
    title.textContent = edge.label + " is locked";
    root.appendChild(title);
    const p = document.createElement("p");
    p.textContent = lockCopy(edge.to);
    root.appendChild(p);
    promptEl.appendChild(root);
  }

  function showEntering(edge) {
    if (!promptEl) return;
    while (promptEl.firstChild) promptEl.removeChild(promptEl.firstChild);
    promptEl.style.display = "block";
    const root = document.createElement("div");
    root.className = "district-border";
    const title = document.createElement("strong");
    title.textContent = "Entering " + edge.label;
    root.appendChild(title);
    promptEl.appendChild(root);
  }

  function handoff(edge, pos) {
    leaving = true;
    showEntering(edge);
    const at = unproject(pos.x, pos.z);
    if (typeof window.enterDistrict === "function") {
      window.enterDistrict(edge.to, { lat: at.lat, lon: at.lon, yaw: getYaw() });
    }
  }

  function update() {
    if (!edges.length || leaving) return;
    if (performance.now() < hiddenUntil) return;
    const pos = getPos();
    if (!pos) return;
    let best = null;
    let bestD = radius;
    for (const e of edges) {
      const d = distToEdge(e, pos.x, pos.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      if (active) hide();
    } else if (!mayEnter(best.to)) {
      // Play can open a district without a reload. Don't hand off into it early,
      // and don't treat a locked edge as a crossing (that sets `leaving` forever).
      if (!active || active.to !== best.to || !active.locked) showLocked(best);
      return;
    } else if (active && active.locked) {
      hide();
    }
    if (seamless) {
      if (
        best &&
        bestD >= HANDOFF_M &&
        !insideRing(pos.x, pos.z) &&
        insideNeighbour(best.to, pos.x, pos.z) &&
        performance.now() - bornAt > ARRIVAL_GRACE_MS
      ) {
        handoff(best, pos);
      }
      return;
    }
    if (best && (!active || active.to !== best.to)) show(best);
    else if (!best && active) hide();
  }

  return {
    init,
    update,
    hide,
    get edges() {
      return edges;
    },
  };
}
