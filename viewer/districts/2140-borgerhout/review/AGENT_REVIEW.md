# Agent review — Borgerhout · 2140

- **District**: `2140-borgerhout`
- **Run**: `20261015T142335Z`
- **Spawn**: Moorkensplein (51.2152, 4.4378)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2140-borgerhout/special_buildings.json`
- **Catalog**: `viewer/districts/2140-borgerhout/buildings/catalog.html`

Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.

---

### `plaza-trees-dageraadplaats` — Match plaza trees to aerial — Dageraadplaats

**Goal:** Tree layout on Dageraadplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `dageraadplaats` / `Dageraadplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Dageraadplaats",
  "slug": "dageraadplaats",
  "area_m2": 17924.3,
  "osm_way_ids": [
    210459403
  ],
  "inventory_inside": 86,
  "canopy_blobs": 1,
  "aerial": "districts/2140-borgerhout/cache/aerial/plazas/dageraadplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2140-borgerhout/cache/aerial/plazas/dageraadplaats.jpg`
- `Edit districts/2140-borgerhout/vegetation_overrides.json`
- `python -m cityview district build 2140-borgerhout`

**Aerial:** `districts/2140-borgerhout/cache/aerial/plazas/dageraadplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2140-borgerhout/cache/aerial/plazas/dageraadplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Dageraadplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2140-borgerhout/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2140-borgerhout/cache/aerial/plazas/dageraadplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2140-borgerhout` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-dageraadplaats.jpg`

---

### `plaza-trees-groeningerplein` — Match plaza trees to aerial — Groeningerplein

**Goal:** Tree layout on Groeningerplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `groeningerplein` / `Groeningerplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Groeningerplein",
  "slug": "groeningerplein",
  "area_m2": 8485.2,
  "osm_way_ids": [
    505242445
  ],
  "inventory_inside": 53,
  "canopy_blobs": 1,
  "aerial": "districts/2140-borgerhout/cache/aerial/plazas/groeningerplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2140-borgerhout/cache/aerial/plazas/groeningerplein.jpg`
- `Edit districts/2140-borgerhout/vegetation_overrides.json`
- `python -m cityview district build 2140-borgerhout`

**Aerial:** `districts/2140-borgerhout/cache/aerial/plazas/groeningerplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2140-borgerhout/cache/aerial/plazas/groeningerplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Groeningerplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2140-borgerhout/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2140-borgerhout/cache/aerial/plazas/groeningerplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2140-borgerhout` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-groeningerplein.jpg`

---

### `plaza-trees-moorkensplein` — Match plaza trees to aerial — Moorkensplein

**Goal:** Tree layout on Moorkensplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `moorkensplein` / `Moorkensplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Moorkensplein",
  "slug": "moorkensplein",
  "area_m2": 2878.5,
  "osm_way_ids": [
    508239730
  ],
  "inventory_inside": 13,
  "canopy_blobs": 0,
  "aerial": "districts/2140-borgerhout/cache/aerial/plazas/moorkensplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2140-borgerhout/cache/aerial/plazas/moorkensplein.jpg`
- `Edit districts/2140-borgerhout/vegetation_overrides.json`
- `python -m cityview district build 2140-borgerhout`

**Aerial:** `districts/2140-borgerhout/cache/aerial/plazas/moorkensplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2140-borgerhout/cache/aerial/plazas/moorkensplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Moorkensplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2140-borgerhout/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2140-borgerhout/cache/aerial/plazas/moorkensplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2140-borgerhout` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-moorkensplein.jpg`

---

### `plaza-trees-maarschalk-montgomeryplein` — Match plaza trees to aerial — Maarschalk Montgomeryplein

**Goal:** Tree layout on Maarschalk Montgomeryplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `maarschalk-montgomeryplein` / `Maarschalk Montgomeryplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Maarschalk Montgomeryplein",
  "slug": "maarschalk-montgomeryplein",
  "area_m2": 5065.3,
  "osm_way_ids": [
    5665196
  ],
  "inventory_inside": 10,
  "canopy_blobs": 1,
  "aerial": "districts/2140-borgerhout/cache/aerial/plazas/maarschalk-montgomeryplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2140-borgerhout/cache/aerial/plazas/maarschalk-montgomeryplein.jpg`
- `Edit districts/2140-borgerhout/vegetation_overrides.json`
- `python -m cityview district build 2140-borgerhout`

**Aerial:** `districts/2140-borgerhout/cache/aerial/plazas/maarschalk-montgomeryplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2140-borgerhout/cache/aerial/plazas/maarschalk-montgomeryplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Maarschalk Montgomeryplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2140-borgerhout/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2140-borgerhout/cache/aerial/plazas/maarschalk-montgomeryplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2140-borgerhout` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-maarschalk-montgomeryplein.jpg`

---

### `wire-missing-customs` — Wire missing custom meshes from dossier

**Goal:** Every expected_custom in special_buildings.json has a manifest entry.

**Acceptance:** No mesh_status=missing_mesh for canonical rows.

**Geo / context:**
```json
{
  "missing": []
}
```

**Commands:**
- `Edit districts/<id>/landmarks/manifest.json`

Status: [ ] todo
Proof: `review/proofs/wire-missing-customs.jpg`

---
