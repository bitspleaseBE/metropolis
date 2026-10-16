# Agent review — Linkeroever · 2050

- **District**: `2050-linkeroever`
- **Run**: `20261016T184119Z`
- **Spawn**: Frederik van Eedenplein (51.2212, 4.3878)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2050-linkeroever/special_buildings.json`
- **Catalog**: `viewer/districts/2050-linkeroever/buildings/catalog.html`

Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.

---

### `plaza-trees-maria-claessensplein` — Match plaza trees to aerial — Maria Claessensplein

**Goal:** Tree layout on Maria Claessensplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `maria-claessensplein` / `Maria Claessensplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Maria Claessensplein",
  "slug": "maria-claessensplein",
  "area_m2": 5664.3,
  "osm_way_ids": [
    1022651660,
    1193062412,
    1254851872,
    1254851876
  ],
  "inventory_inside": 27,
  "canopy_blobs": 1,
  "aerial": "districts/2050-linkeroever/cache/aerial/plazas/maria-claessensplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2050-linkeroever/cache/aerial/plazas/maria-claessensplein.jpg`
- `Edit districts/2050-linkeroever/vegetation_overrides.json`
- `python -m cityview district build 2050-linkeroever`

**Aerial:** `districts/2050-linkeroever/cache/aerial/plazas/maria-claessensplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2050-linkeroever/cache/aerial/plazas/maria-claessensplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Maria Claessensplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2050-linkeroever/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2050-linkeroever/cache/aerial/plazas/maria-claessensplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2050-linkeroever` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-maria-claessensplein.jpg`

---

### `plaza-trees-hugo-schiltzplein` — Match plaza trees to aerial — Hugo Schiltzplein

**Goal:** Tree layout on Hugo Schiltzplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `hugo-schiltzplein` / `Hugo Schiltzplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Hugo Schiltzplein",
  "slug": "hugo-schiltzplein",
  "area_m2": 7007.5,
  "osm_way_ids": [
    1154098891,
    1186110492,
    1250415102,
    1254851863
  ],
  "inventory_inside": 21,
  "canopy_blobs": 1,
  "aerial": "districts/2050-linkeroever/cache/aerial/plazas/hugo-schiltzplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2050-linkeroever/cache/aerial/plazas/hugo-schiltzplein.jpg`
- `Edit districts/2050-linkeroever/vegetation_overrides.json`
- `python -m cityview district build 2050-linkeroever`

**Aerial:** `districts/2050-linkeroever/cache/aerial/plazas/hugo-schiltzplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2050-linkeroever/cache/aerial/plazas/hugo-schiltzplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Hugo Schiltzplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2050-linkeroever/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2050-linkeroever/cache/aerial/plazas/hugo-schiltzplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2050-linkeroever` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-hugo-schiltzplein.jpg`

---

### `plaza-trees-zeilsportplein` — Match plaza trees to aerial — Zeilsportplein

**Goal:** Tree layout on Zeilsportplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `zeilsportplein` / `Zeilsportplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Zeilsportplein",
  "slug": "zeilsportplein",
  "area_m2": 7088.8,
  "osm_way_ids": [
    190313320,
    558507478,
    1254851866,
    1254851867,
    1254851868
  ],
  "inventory_inside": 22,
  "canopy_blobs": 6,
  "aerial": "districts/2050-linkeroever/cache/aerial/plazas/zeilsportplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2050-linkeroever/cache/aerial/plazas/zeilsportplein.jpg`
- `Edit districts/2050-linkeroever/vegetation_overrides.json`
- `python -m cityview district build 2050-linkeroever`

**Aerial:** `districts/2050-linkeroever/cache/aerial/plazas/zeilsportplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2050-linkeroever/cache/aerial/plazas/zeilsportplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Zeilsportplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2050-linkeroever/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2050-linkeroever/cache/aerial/plazas/zeilsportplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2050-linkeroever` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-zeilsportplein.jpg`

---

### `plaza-trees-square-870911695` — Match plaza trees to aerial — square-870911695

**Goal:** Tree layout on square-870911695 must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `square-870911695` / `square-870911695` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "square-870911695",
  "slug": "square-870911695",
  "area_m2": 1508.3,
  "osm_way_ids": [
    870911695
  ],
  "inventory_inside": 0,
  "canopy_blobs": 5,
  "aerial": "districts/2050-linkeroever/cache/aerial/plazas/square-870911695.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2050-linkeroever/cache/aerial/plazas/square-870911695.jpg`
- `Edit districts/2050-linkeroever/vegetation_overrides.json`
- `python -m cityview district build 2050-linkeroever`

**Aerial:** `districts/2050-linkeroever/cache/aerial/plazas/square-870911695.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2050-linkeroever/cache/aerial/plazas/square-870911695.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **square-870911695** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2050-linkeroever/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2050-linkeroever/cache/aerial/plazas/square-870911695.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2050-linkeroever` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-square-870911695.jpg`

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
