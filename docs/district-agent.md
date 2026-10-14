# District agent guide

How to finish a district after `python -m cityview district build <id>` using the generated review pack.

For the pipeline itself, walkability, road/park collision, and adding a custom building, see [city-pipeline.md](city-pipeline.md). The per-district backlog of buildings that still need their own model (with Blender/kit agent instructions) is [todo.md](todo.md).

## Open the pack

1. Read `districts/<id>/review/LATEST.md` (also mirrored at `viewer/districts/<id>/review/AGENT_REVIEW.md`).
2. Pick **one** task with `Status: [ ] todo`.
3. Use the injected **Geo / context** (OSM id, lat/lon, local XY, Wikidata, spawn distance) — do not rediscover ids.
4. Browse `viewer/districts/<id>/buildings/catalog.html` for the special-building grid and façade table.

## Rules

- Edit **this district’s package only** (`districts/<id>/…`, `viewer/districts/<id>/…`).
- Never reuse another district’s façade elevation **pixel hashes** (`assert_facades_unique` will fail).
- Prefer JSON / mesh kit fixes first; full Blender rebuild only when landmark GLBs or core geometry must change.
- After visual work: drop a still under `districts/<id>/review/proofs/<task_id>.jpg`, set `Status: [x] done`, re-run:

```bash
python -m cityview district review <id>
python -m cityview district check <id> --no-sims
```

## Plaza trees (aerial → override)

Squares are **not** thinned with place-specific hardcodes. The review pack fetches Digitaal Vlaanderen winter orthophoto crops under `districts/<id>/cache/aerial/plazas/` and opens a task per mismatched square (cyan = inventory trunks; yellow = auto green blobs — sparse in winter, so read shadows/crowns in the photo).

1. Open the aerial JPEG for that plaza.
2. Write/merge `districts/<id>/vegetation_overrides.json`:

```json
{
  "version": 1,
  "plazas": [
    {
      "name": "Groenplaats",
      "slug": "groenplaats",
      "mode": "replace_inside",
      "polygon": [[x, y], "...from plazas/<slug>.json"],
      "trees": [{"x": 12.3, "y": -4.5, "species": "Platanus × hispanica"}]
    },
    {
      "name": "Grote Markt",
      "mode": "clear",
      "polygon": [["..."]]
    }
  ]
}
```

3. Rebuild so Blender picks up the override (`attach_trees` reads this file automatically):

```bash
python -m cityview district build <id>
```

Refresh crops only: `python -m cityview.plaza_aerial <id> --force`.

## Where data lives

| File | Role |
|------|------|
| `districts/<id>/special_buildings.json` | Recognition dossier (OSM + Wikidata labels) |
| `districts/<id>/landmarks/manifest.json` | Authoritative custom / streamed meshes |
| `districts/<id>/facades/elevations/` | Per-slot façade JPEGs |
| `districts/<id>/cache/aerial/plazas/` | Orthophoto crops + meta for plaza tree tasks |
| `districts/<id>/vegetation_overrides.json` | Agent-authored plaza tree clear/replace |
| `districts/<id>/cache/places.json` | Every shop, horeca, sight and heritage POI (OSM, all types) |
| `districts/<id>/references/index.json` | Commons photo pack per landmark / sight / named shop (thumbs git-ignored, `index.html` contact sheet) |
| `districts/<id>/shop_overrides.json` | Agent-authored shop looks from the photos (`by_osm` / `by_name`: fascia, accent, glass, frame, front, awning, terrace) |
| `viewer/districts/<id>/shops.json` | Fascia boards, 3D shopfronts and awnings in the walker |
| `viewer/districts/<id>/landmarks.json` | Minimap gold pins + stream index |

## Commands cheat sheet

```bash
# Dossier + review markdown + catalog (no Blender)
python -m cityview district review 2000-antwerpen

# JSON package only (shops, roads near spawn, landmarks index)
python -m cityview district build 2000-antwerpen --skip-blender

# Façade regenerate + atlas
python -m cityview.district_facades 2000-antwerpen --force --pack

# Playability
python -m cityview district check 2000-antwerpen --no-sims

# Places (all shops / horeca / sights) and Commons picture references
python -m cityview district places 2000-antwerpen
python -m cityview district refs 2000-antwerpen [--refresh]

# Re-plan shops only after editing shop_overrides.json (no Blender, no chunk republish)
python -m cityview district shops 2000-antwerpen
```

## Picture references → makeovers

`district review` builds the reference pack too (skip with `--no-refs`). The pack adds
`ref-<slug>` tasks for landmarks (photos + builder + GLB export command) and one
`ref-shopfronts` task. For shops, compare the photos with the walker and write
`shop_overrides.json`, keyed `"node/<id>"` (preferred) or by lowercase name:

```json
{"by_osm": {"node/2405486929": {"fascia": [0.62, 0.05, 0.06], "accent": [1, 1, 1],
  "front": "bar", "awning": {"colour": [0.6, 0.05, 0.06]}, "terrace": true}}}
```

Fronts: boutique, bar, cafe, restaurant, bakery, chocolatier, heritage, market, frituur,
kebab, pizza, newsstand, fastfood, bank, pharmacy, office, plain. `"awning": null` removes one.

## 2000 notes

- Spawn is **Groenplaats**. There is **no** Groenplaats kiosk mesh; ghost pins were Harmonie’s Albertpark kiosk from root `viewer/landmarks.json` — the viewer now uses `districtUrl("landmarks.json")`.
- Canonical customs: cathedral `26495164`, Stadhuis `22966134`, Het Steen `29067925`, guild terrace `496929324`, Brabo synthetic node `900000001`.
- Cathedral kit must read Gothic from Groenplaats (see task `cathedral-gothic`).
