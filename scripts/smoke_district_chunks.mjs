/**
 * Local smoke checks for district chunk packages (no browser / WebGL).
 *
 *   node scripts/smoke_district_chunks.mjs
 *   node scripts/smoke_district_chunks.mjs --base http://127.0.0.1:8767
 *
 * Verifies core.glb + chunks.json + each listed chunk exist and that core is
 * smaller than a typical monolith. Exit 1 on any failure.
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

const DISTRICTS = ["2018-harmonie", "2000-antwerpen"];

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
    console.log(`  core: ${(core.bytes / 1e6).toFixed(1)} MB (${catalog.core})`);

    // Soft budget: first paint should stay under ~80 MB Meshopt for local QA.
    if (core.bytes > 80e6) {
      console.warn(`  WARN: core ${(core.bytes / 1e6).toFixed(1)} MB > 80 MB — heavy first paint`);
    }

    let missing = 0;
    let chunkBytes = 0;
    for (const ch of catalog.chunks) {
      try {
        const file = await fetchOrRead(`${prefix}/${ch.file}`);
        chunkBytes += file.bytes;
        if (file.data) assert.ok(isGlb(file.data), `${ch.file} not GLB`);
        assert.ok(Number.isFinite(ch.cx) && Number.isFinite(ch.cy), `${ch.id} missing centre`);
      } catch (err) {
        missing += 1;
        console.error(`  FAIL chunk ${ch.id}: ${err.message}`);
      }
    }
    assert.equal(missing, 0, `${missing} missing chunk files`);
    console.log(
      `  chunks: ${catalog.chunks.length} cells, ${(chunkBytes / 1e6).toFixed(0)} MB total on disk`,
    );

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
