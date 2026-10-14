/**
 * Local smoke checks for district chunk packages (no browser / WebGL).
 *
 *   node scripts/smoke_district_chunks.mjs
 *   node scripts/smoke_district_chunks.mjs --base http://127.0.0.1:8767
 *   node scripts/smoke_district_chunks.mjs --district 2000-antwerpen
 *
 * Verifies core.glb + chunks.json + each listed chunk exist and that the core and
 * every chunk stay inside the size / triangle budgets. Exit 1 on any failure.
 */
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1]?.replace(/\/$/, "") : null;

const onlyIdx = args.indexOf("--district");
const indexPath = join(ROOT, "viewer", "districts", "index.json");
const DISTRICTS =
  onlyIdx >= 0
    ? [args[onlyIdx + 1]]
    : existsSync(indexPath)
      ? (JSON.parse(readFileSync(indexPath, "utf8")).districts || []).map((d) => d.id)
      : ["2018-harmonie", "2000-antwerpen"];

async function fetchOrRead(rel) {
  if (BASE) {
    const res = await fetch(`${BASE}/${rel}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${rel}`);
    if (rel.endsWith(".json")) return { kind: "json", data: await res.json(), bytes: Number(res.headers.get("content-length") || 0) };
    const buf = Buffer.from(await res.arrayBuffer());
    return { kind: "bin", data: buf, bytes: buf.length };
  }
  const path = join(ROOT, "viewer", rel);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  if (rel.endsWith(".json")) {
    const text = readFileSync(path, "utf8");
    return { kind: "json", data: JSON.parse(text), bytes: Buffer.byteLength(text) };
  }
  const st = statSync(path);
  return { kind: "bin", data: null, bytes: st.size, path };
}

function isGlb(buf) {
  return buf && buf.length >= 12 && buf.toString("ascii", 0, 4) === "glTF";
}

// Budgets mirror cityview/budgets.py.
const CORE_MAX_MB = 80;
const CHUNK_MAX_MB = 12;
const CORE_MAX_TRIS = 3_000_000;
const CHUNK_MAX_TRIS = 900_000;

/** Drawn triangles from the GLB JSON chunk; GPU instances count once per copy. */
function glbTriangles(buf) {
  if (!isGlb(buf)) return 0;
  const len = buf.readUInt32LE(12);
  const doc = JSON.parse(buf.toString("utf8", 20, 20 + len));
  const acc = doc.accessors || [];
  const primTris = (p) => {
    const mode = p.mode ?? 4;
    if (![4, 5, 6].includes(mode)) return 0;
    const n = p.indices != null ? acc[p.indices]?.count || 0 : acc[p.attributes?.POSITION]?.count || 0;
    return mode === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
  };
  const meshTris = (doc.meshes || []).map((m) => (m.primitives || []).reduce((s, p) => s + primTris(p), 0));
  let tris = 0;
  for (const node of doc.nodes || []) {
    if (node.mesh == null) continue;
    const inst = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    const a = inst ? inst.TRANSLATION ?? inst.ROTATION ?? inst.SCALE : null;
    tris += (meshTris[node.mesh] || 0) * (a != null ? acc[a]?.count || 1 : 1);
  }
  return tris;
}

async function readBuf(rel, file) {
  if (file.data) return file.data;
  return readFileSync(file.path);
}

let failed = 0;
for (const id of DISTRICTS) {
  const prefix = `districts/${id}`;
  console.log(`\n== ${id} ==`);
  try {
    const chunksDoc = await fetchOrRead(`${prefix}/chunks.json`);
    assert.equal(chunksDoc.kind, "json");
    const catalog = chunksDoc.data;
    assert.ok(catalog.core, "chunks.json missing core");
    assert.ok(Array.isArray(catalog.chunks), "chunks.json missing chunks[]");
    assert.ok(catalog.cell_m > 0, "cell_m");

    const core = await fetchOrRead(`${prefix}/${catalog.core}`);
    assert.ok(core.bytes > 1e6, `core too small (${core.bytes})`);
    if (core.data) assert.ok(isGlb(core.data), "core is not a GLB");
    const coreTris = glbTriangles(await readBuf(catalog.core, core));
    console.log(`  core: ${(core.bytes / 1e6).toFixed(1)} MB, ${coreTris.toLocaleString()} tris (${catalog.core})`);
    const over = [];
    if (core.bytes > CORE_MAX_MB * 1e6) over.push(`core ${(core.bytes / 1e6).toFixed(1)} MB > ${CORE_MAX_MB} MB`);
    if (coreTris > CORE_MAX_TRIS) over.push(`core ${coreTris} tris > ${CORE_MAX_TRIS}`);

    let missing = 0;
    let chunkBytes = 0;
    let maxChunkMb = 0;
    let maxChunkTris = 0;
    for (const ch of catalog.chunks) {
      try {
        const file = await fetchOrRead(`${prefix}/${ch.file}`);
        chunkBytes += file.bytes;
        if (file.data) assert.ok(isGlb(file.data), `${ch.file} not GLB`);
        assert.ok(Number.isFinite(ch.cx) && Number.isFinite(ch.cy), `${ch.id} missing centre`);
        const tris = glbTriangles(await readBuf(ch.file, file));
        maxChunkMb = Math.max(maxChunkMb, file.bytes / 1e6);
        maxChunkTris = Math.max(maxChunkTris, tris);
        if (file.bytes > CHUNK_MAX_MB * 1e6) over.push(`${ch.id} ${(file.bytes / 1e6).toFixed(1)} MB > ${CHUNK_MAX_MB} MB`);
        if (tris > CHUNK_MAX_TRIS) over.push(`${ch.id} ${tris} tris > ${CHUNK_MAX_TRIS}`);
      } catch (err) {
        missing += 1;
        console.error(`  FAIL chunk ${ch.id}: ${err.message}`);
      }
    }
    assert.equal(missing, 0, `${missing} missing chunk files`);
    console.log(
      `  chunks: ${catalog.chunks.length} cells, ${(chunkBytes / 1e6).toFixed(0)} MB total on disk, ` +
        `max ${maxChunkMb.toFixed(1)} MB / ${maxChunkTris.toLocaleString()} tris`,
    );
    assert.equal(over.length, 0, `over budget: ${over.join("; ")}`);

    const spawn = await fetchOrRead(`${prefix}/spawn.json`);
    assert.ok(spawn.data.x != null && spawn.data.y != null, "spawn.json");
    console.log(`  spawn: (${spawn.data.x}, ${spawn.data.y})`);

    // Sanity: at least one cell centre should be outside core_r of spawn (Blender XY).
    const coreR = catalog.core_r || 160;
    const far = catalog.chunks.filter((ch) => {
      const dx = ch.cx - spawn.data.x;
      const dy = ch.cy - spawn.data.y;
      return Math.hypot(dx, dy) > coreR;
    });
    if (catalog.chunks.length) {
      assert.ok(far.length > 0, "expected at least one chunk outside core radius");
      console.log(`  cells outside core_r=${coreR}: ${far.length}`);
    }

    console.log(`  OK ${id}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${id}: ${err.message || err}`);
  }
}

console.log(failed ? `\n${failed} district(s) failed` : "\nAll district chunk packages look good");
if (BASE) {
  console.log(`\nOpen in browser:`);
  console.log(`  ${BASE}/?district=2018-harmonie`);
  console.log(`  ${BASE}/?district=2000-antwerpen`);
  console.log(`Watch console for: [metropolis] chunks: N cells (core first paint)`);
}
process.exit(failed ? 1 : 0);
