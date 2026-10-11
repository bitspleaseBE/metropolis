/**
 * When the walker nears a modelled district edge that has a neighbour, offer
 * a choice to cross into that district package.
 */
export function createDistrictBorder(opts) {
  const getPos = opts.getPos; // () => {x,z}
  const projectGate = opts.projectGate; // (lat,lon) => {x,z} in Three space
  const promptEl = opts.promptEl || document.getElementById("prompt");
  const radius = opts.radiusM || 30;
  let edges = [];
  let active = null;
  let hiddenUntil = 0;

  async function init() {
    if (window.__DISTRICT && window.__DISTRICT.ready) await window.__DISTRICT.ready;
    const d = window.__DISTRICT || {};
    edges = (d.edges || [])
      .map((e) => {
        const g = e.gate || {};
        if (g.lat == null || g.lon == null || !projectGate) return null;
        const p = projectGate(g.lat, g.lon);
        return {
          to: e.to,
          label: e.label || e.to,
          side: e.side,
          x: p.x,
          z: p.z,
          summary: "",
        };
      })
      .filter(Boolean);
    const districts = (d.index && d.index.districts) || [];
    for (const e of edges) {
      const meta = districts.find((x) => x.id === e.to);
      if (meta) e.summary = meta.summary || meta.title || "";
      if (meta && meta.title) e.label = meta.title;
    }
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

  function update() {
    if (!edges.length) return;
    if (performance.now() < hiddenUntil) return;
    const pos = getPos();
    if (!pos) return;
    let best = null;
    let bestD = radius;
    for (const e of edges) {
      const dx = pos.x - e.x;
      const dz = pos.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
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
