/**
 * Stream built neighbour districts across shared postcode borders so buildings never stop at the
 * edge of the current package. Each neighbour keeps its own local frame (origin); we place its
 * chunk root at the projected origin and stretch east by cos(lat0)/cos(lat_n), which makes the
 * two equirectangular frames agree exactly.
 *
 * Neighbour content sits a few centimetres lower so the current district wins the depth test
 * where both packages carry the same border street.
 */

import { createChunkStream } from "./chunk-stream.js";
import { fetchJsonCached } from "./json-cache.js";
import { isUnlocked, loadPlay } from "./district-progress.js";

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LON = 111320;
const NEIGHBOUR_Y = -0.03;
/** Footprints + map layer load once the walker is this close to any neighbour cell. */
const DETAIL_M = 520;

function pointInRing(x, z, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], zi = ring[i * 2 + 1], xj = ring[j * 2], zj = ring[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

async function json(url) {
  try {
    const res = await fetchJsonCached(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {*} o.THREE
 * @param {*} o.scene
 * @param {*} o.loader
 * @param {{ lat: number, lon: number }} o.origin — current district origin
 * @param {(lat: number, lon: number) => { x: number, z: number }} o.project
 * @param {(root: object) => void} [o.onChunkLoaded]
 * @param {(id: string, doc: object, transform: object) => void} [o.onFootprints]
 * @param {(base: string, transform: object) => void} [o.onMapSource]
 */
export async function createNeighbourDistricts(o) {
  const d = window.__DISTRICT || {};
  const districts = (d.index && d.index.districts) || [];
  const play = loadPlay();
  const ids = [...new Set((d.edges || []).map((e) => e.to))].filter((id) => {
    const meta = districts.find((x) => x.id === id);
    if (meta && meta.standalone) return false;
    return isUnlocked(play, id);
  });
  const cosLat0 = Math.cos((o.origin.lat * Math.PI) / 180);
  const out = [];

  for (const id of ids) {
    const base = "./districts/" + id + "/";
    const [doc, catalog] = await Promise.all([json(base + "district.json"), json(base + "chunks.json")]);
    if (!doc || !Array.isArray(doc.origin) || !catalog) continue;
    const [latN, lonN] = doc.origin;
    const at = o.project(latN, lonN);
    const transform = { x: at.x, z: at.z, y: NEIGHBOUR_Y, sx: cosLat0 / Math.cos((latN * Math.PI) / 180) };
    const extraItems = [];
    // The neighbour's core holds everything within core_r of its spawn.
    const sp = doc.spawn;
    if (catalog.core && sp && Number.isFinite(sp.lat) && Number.isFinite(sp.lon)) {
      extraItems.push({
        id: "core",
        file: String(catalog.core),
        cx: (sp.lon - lonN) * METERS_PER_DEG_LON * Math.cos((latN * Math.PI) / 180),
        cy: (sp.lat - latN) * METERS_PER_DEG_LAT,
        reach: Number(catalog.core_r) || 160,
      });
    }
    const stream = createChunkStream({
      THREE: o.THREE,
      scene: o.scene,
      loader: o.loader,
      catalog,
      baseUrl: base,
      transform,
      extraItems,
      name: "Neighbour_" + id,
      onChunkLoaded: o.onChunkLoaded,
    });
    let ring = null;
    if (Array.isArray(doc.boundary) && doc.boundary.length >= 3) {
      ring = new Float32Array(doc.boundary.length * 2);
      doc.boundary.forEach(([lon, lat], i) => {
        const p = o.project(lat, lon);
        ring[i * 2] = p.x;
        ring[i * 2 + 1] = p.z;
      });
    }
    out.push({ id, base, transform, stream, ring, detail: false });
  }

  let frame = 0;
  function update(x, z, mode, height) {
    frame += 1;
    for (const n of out) {
      n.stream.update(x, z, mode, height);
      if (n.detail || frame % 30 !== 0) continue;
      let best = Infinity;
      for (const it of n.stream.items) best = Math.min(best, Math.hypot(it.x - x, it.z - z));
      if (best > DETAIL_M) continue;
      n.detail = true;
      void json(n.base + "buildings.json").then((bdoc) => {
        if (bdoc && o.onFootprints) o.onFootprints(n.id, bdoc, n.transform);
      });
      if (o.onMapSource) o.onMapSource(n.base, n.transform);
    }
  }

  /** Whether (x, z) — our frame — lies inside neighbour `id`'s postcode ring. */
  function insideNeighbour(id, x, z) {
    const n = out.find((m) => m.id === id);
    return !!(n && n.ring && pointInRing(x, z, n.ring));
  }

  return { update, insideNeighbour, neighbours: out };
}
