# How the city is built (and how to keep it walkable)

This is the maintainer note for the generated Antwerp tiles. Read it when you need to fix a street you cannot walk, add a landmark, or understand what a district rebuild will overwrite.

The walk viewer is free in the horizontal plane. Nothing paints a navmesh. After each step the player is pushed out of **building rings**, **props** (fences, hedges, trunks, benches), **Velo rails**, **café tables**, **vehicles**, and **deep water** (Scheldt, docks). Shallow ponds are not solids: you wade through them (slower gait, feet on the silt `bed_y`). Streets, parks and squares stay walkable only if those solids leave a gap. That contract lives in code (`cityview/walkability.py`) and is checked at the end of every district build.

## What you edit vs what a rebuild overwrites

A rebuild (`python3 -m cityview district build <id>`) rewrites the viewer package. Do not hand-edit those files and expect the change to last.

| Keep (source) | Overwritten (export) |
|---|---|
| `districts/<id>/district.json` — bbox, origin, spawn, stages | `viewer/districts/<id>/buildings.json`, `roads.json`, `props.json`, `velo.json`, `shops.json`, `water.json` |
| `districts/<id>/cache/*.json` — OSM, trees, benches, Velo, GTFS | `viewer/districts/<id>/core.glb`, `chunks/*.glb` |
| `districts/<id>/landmarks/manifest.json` | `viewer/districts/<id>/landmarks.json` and streamed `landmarks/*.glb` (when the kit rebuilds them) |
| `districts/<id>/facades/elevations/` | packed atlas copies under the viewer |
| `districts/<id>/vegetation_overrides.json`, `shop_overrides.json` | derived tree / shop placement in the GLB and `shops.json` |
| `cityview/*.py`, `viewer/*.js` (collision, motion) | nothing — these persist |

Local metres are **east, north** from `district.json` `origin`. The Three.js viewer uses `z = −y`. When a check prints `(73.9, -80.9)`, that is Blender XY, not lat/lon.

## Pipeline

```
district add          discover stages from OSM (tram, Velo, water, …)
        ↓
fetch caches          OSM, GTFS, trees, benches, Velo  (use --refresh to re-download)
        ↓
plan the tile         layout_from_osm → trees, benches, clutter, barriers, courtyards, spawn
        ↓
Blender               blender/build_city.py → core.glb + 256 m chunks
        ↓
publish JSON          buildings / roads / props / velo / shops / water for the walker
        ↓
district check        package files, spawn not indoors, walkability, façade uniqueness
```

Commands:

```bash
python3 -m cityview district add --postcode 2000
python3 -m cityview district build 2018-harmonie --no-render
python3 -m cityview district build 2000-antwerpen --skip-blender   # JSON only, no GLB
python3 -m cityview district check 2018-harmonie --no-sims
python3 -m cityview district review 2000-antwerpen
```

`district add` writes `districts/<id>/district.json` and turns on only the stages that exist in the extract (no trains in the historic core, no port props in Harmonie). `district build` plans from those caches, runs Blender unless you pass `--skip-blender`, publishes the walker JSON, then runs `district check`. A failed check is a failed build (unless you skipped Blender and the GLB is missing).

Agent finishing work after a build is in [district-agent.md](district-agent.md): one review task at a time, proofs under `districts/<id>/review/proofs/`.

### Stages, in order

1. **OSM → layout** (`cityview/osm.py`). Buildings, roads, parks, water, transit tracks. Water rings are classified in `cityview/water.py` (shallow pond vs deep river/dock; Scheldt by name; `bank` natural vs built). Multipolygon courtyards become `holes` on the footprint. Tags that are not a wall (`building=roof`, `location=underground`, bandstands) are marked `walker_solid: false`.
2. **Street furniture.** Trees and benches from the city survey + OSM. Clutter (bollards, bins, racks) and barriers (walls, hedges, fences) from OSM ways. Barriers are sampled every 0.8 m; stretches inside a house, on a carriageway, on a tram bed, across a public gate, or across a footway / square are cut out so the collider matches the opening you can see.
3. **Spawn.** `district.json` `spawn` projected to local metres. Everything the walker collides with is culled to a radius around that point (buildings 280 m, props 450 m).
4. **Blender.** Extrudes footprints (holes become courtyards in the mesh), maps façades, draws kerbs, parks, rails, merged prop meshes. Park grass subtracts overlapping water rings (basin cutout via `water_holes_for_ring`). Shallow water is a silt bed (`Z_WATER_BED` −0.28 m) plus a surface disc (`Z_WATER` +0.02 m) in that hole; deep water is a single opaque disc.
5. **Publish.** `export_buildings_near_spawn` writes rings + holes, skipping non-solids. `export_props_for_viewer` writes trunks, boxes, barrier segments. Roads become `roads.json` (`roads`, `walks`, `cycleways`, `signals`). `export_water_for_viewer` writes `water.json` (wade / deep rings, `bed_y`, `bank`).
6. **Check.** Missing package files, spawn inside a ring, streamed landmark GLBs, unique façade hashes, then **walkability**: no 3 m stretch of street sealed across its width, no public gate or path/fence crossing still sitting on a collider.

## How walking actually works

There is no walkable mask. `viewer/player-motion.js` integrates WASD. Each frame:

1. A downward ray against meshes named `sidewalk`, `road_`, `park_`, `curb`, `ground`, `tram_`, `courtyard_`, `rail_` sets foot height. It never blocks XZ. Water meshes are not in that set.
2. `viewer/outdoors.js` rejects a step that lands inside a `buildings.json` ring, unless that point is in a courtyard `holes` polygon. Slide along the façade, or snap back.
3. `viewer/water.js` samples `water.json`: shallow rings slow the gait and put the feet on `bed_y` (soil under the surface — not `Math.max(0, groundAt)`); deep rings (Scheldt, docks) push you back like a soft wall. Blender draws a silt bed plus either an inset natural shoreline or a straight built kerb. The viewer also upgrades `water*` materials to a transparent liquid with light ripples.
4. `viewer/props-collide.js` pushes the 0.34 m body out of circles, boxes and thick segments from `props.json`.
5. Live solids: Velo rails (`hw` 0.45 m), open café tables (radius 0.48 m), cars / trams / buses.
6. A soft clamp keeps you inside the district box.

So an “invisible wall” is almost always a collider that is bigger than the mesh, or a mesh that should not have been a collider: a fence drawn as posts with a continuous capsule, a gate left sealed, a Velo rail that was 2 m deep, an underground footprint, a `building=roof` canopy, a courtyard whose hole never made it into `buildings.json`.

Policy (what is solid, which gates open, how wide a Velo rail is) is in `cityview/walkability.py`. The viewer copies the same numbers for Velo and terraces. Change the policy once; do not special-case Groenplaats or Harmoniepark in the export.

## Fine-tuning road and park issues

### 1. Name the solid

Walk into the wall. Decide which family it is:

| Feels like | Usually | Where it is decided |
|---|---|---|
| Gap in a park fence you can see through | Gate node or path crossing left sealed | `cityview/barriers.py` (`GATE_CLEAR_M`, `WALK_CUT_KINDS`) |
| Thin post-and-rail fence you cannot step through | Intentional — garden fences stay solid; only gates and paths open | do not “open every post” |
| Long bar on a square | Velo station or a row of café tables | `viewer/velo.js`, `viewer/terraces.js` |
| Lawn that looks open, body stops | Building ring (underground, canopy, bandstand, missing hole) | `walker_solid_from_tags`, `export_buildings_near_spawn` |
| You slide around a house you should enter | Courtyard hole missing from `buildings.json` | rebuild; holes come from OSM multipolygons |
| Tram you cannot cross | Moving vehicle box (~31 × 2.4 m) — expected while it is there | `viewer/index.html` `collideWorld` |

Coordinates printed by `district check` are local XY. Project them with `district.json` `origin`, or stand at spawn and walk.

### 2. Prefer a rule over a one-off

If the OSM is wrong (a hedge drawn through a path, a building tagged `yes` that is a bandstand), fix the extract: edit OpenStreetMap, then rebuild with `--refresh`. If the OSM is right and we still wall you off, change the **policy**:

- Public gate kinds and “should this building be a wall?” → `cityview/walkability.py`
- Where a fence is split → `cityview/barriers.py` (`WALK_CUT_MARGIN` if a path skims a hedge and still seals)
- Kerbs blocking a plaza → `blender/build_city.py` / `cityview/kerbs.py` (pedestrian / footway / path already skip a raised kerb)
- Walk ways missing from `roads.json` → `WALK_WAY_KINDS` in `cityview/streetscape.py`
- Trees in the wrong plaza → `districts/<id>/vegetation_overrides.json` (see [district-agent.md](district-agent.md)), not collision

Add a unit test next to the rule (`cityview/test_walkability.py`, `test_barriers.py`, `test_streetscape.py`). The next rebuild is the proof; do not patch `viewer/districts/<id>/props.json`.

### 3. Confirm with the check

```bash
python3 -m cityview district check 2000-antwerpen --no-sims
```

It loads the **exported** viewer JSON plus `districts/<id>/cache/osm.json`. Failures look like:

```
footway 863858574 sealed for 4 m at (12.0,-3.1) by hedge
2 path/street crossing(s) still sealed by a barrier, e.g. (-142.0,47.9) by fence
```

Private `access=no` gates, underground parking lift-gates, and service ramps into a garage are ignored. After you change the generator, rebuild, then re-run the check. `skip-blender` is enough when only JSON solids changed.

### 4. What “walk every street” does not mean

You should cross every public street, path, park and square from spawn. You should not walk through a closed garden fence, through a house, or down a Vinci parking ramp. The check encodes that split.

## Adding a custom building

Most footprints stay procedural: OSM ring + height prior + a façade from the district atlas. A **custom** is a hand-built kit mesh on that same ring, streamed as `viewer/districts/<id>/landmarks/<osm-id>.glb`.

Churches can skip a Python builder. Put `massing` on the manifest entry (`neo_gothic_tower_left`, `church_default`, …) and the generic church kit will extrude the footprint. Use `custom` when the silhouette is a specific building (cathedral, Stadhuis, Feestzaal, Albertpark kiosk).

### 1. Identify the OSM object

Use the review catalog (`viewer/districts/<id>/buildings/catalog.html`) or OpenStreetMap. You need the **way or relation id** and a front-door **anchor** `[lat, lon]`. Relation ids stay as the relation id (the layout already built that mass).

### 2. Register it on this district’s manifest

Edit `districts/<id>/landmarks/manifest.json` (not `assets/landmarks/manifest.json` unless you are sharing a kit across tiles). `by_id` wins; names are a fallback.

```json
"22966134": {
  "id": "22966134",
  "name": "Stadhuis",
  "kind": "civic",
  "custom": "stadhuis",
  "anchor": [51.2213, 4.3997],
  "height_m": 24.0,
  "roof_height_m": 8.0,
  "roof_shape": "gabled",
  "source_url": "https://commons.wikimedia.org/wiki/…",
  "attribution": "…"
}
```

`photo` / `crop` are reference only. Custom meshes never get a photo façade. For a free-standing statue or fountain that is not a building way, add a `nodes` entry and a `NODE_BUILDERS` function.

If the dossier should always mention this building, add `expected_custom` in `cityview/special_buildings.py` (the 2000 civic list is there).

### 3. Write the builder

Builders are pure Python, no `bpy`. They take the surveyed ring (and holes) plus the manifest dict and return a `landmark_kit.Mesh` in world metres.

| Kind of landmark | File |
|---|---|
| Neighbourhood houses, kiosks | `cityview/landmark_models.py` |
| Churches / civic shells that share a façade frame | `cityview/landmark_facades.py` |
| Cathedral, Stadhuis, Het Steen, Nationale Bank | `cityview/landmark_civic.py` |
| Grote Markt guild houses | `cityview/landmark_grote_markt.py` |

Register the function on `BUILDERS` (footprint) or `NODE_BUILDERS` (point) and give it a `TRI_BUDGET` entry. Tests in `cityview/test_landmark_models.py` fail if you blow the budget or use a photo material.

Use `landmark_kit`: `extrude_ring`, `Frame` from the `anchor` so the front door stays on the OSM edge if the outline is redrawn, tiling materials (`brick`, `stone_grey`, `slate`, `zinc`, …). Look at `build_albertpark_kiosk` or `build_stadhuis` before inventing a new primitive.

### 4. Rebuild the mesh

A full `district build` will emit the GLB. To refresh one kit without re-peeling the city:

```bash
python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs; export_missing_landmark_glbs('2000-antwerpen', force=True)"
```

`scripts/refresh_landmark_glbs.py` is the older Blender-in-the-blend path for a fixed set of Harmonie kits; new work should go through `export_missing_landmark_glbs` / the district build.

Then:

```bash
python3 -m cityview district review <id>
python3 -m cityview district check <id> --no-sims
```

The minimap pin comes from `landmarks.json` (`custom` or `stream`). Keep landmark URLs district-scoped — a root `viewer/landmarks.json` once dropped Harmonie’s kiosk on Groenplaats.

## Keeping the system

- **One source for draw and collide.** If you add a new prop kind, export a collider from the same record the mesh uses, and teach `walkability.py` about it if it can seal a street.
- **Checks are the memory.** `cityview/test_walkability.py` holds the policy. `district check` holds the tile. If you walk into a new wall, add a failing test or a check case first, then the rule.
- **No district hardcodes in the generator.** Groenplaats and Harmoniepark are tests of the rules, not `if name == "Groenplaats"` branches.
- **OSM is surveyed geometry.** Invented clutter is the exception (park-edge hedges in Blender are visual-only and must not be written to `props.json`).
- **Rebuild to see tile data; reload the viewer to see JS collision.** Velo / terrace / `outdoors.js` hole handling is live. Building rings and fence gaps need a published JSON.

When something feels like “the world forgot a street”, start at `cityview/walkability.py` and `district check`, not at the GLB.