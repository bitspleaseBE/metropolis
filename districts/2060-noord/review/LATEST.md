# Agent review — Antwerpen Noord · 2060

- **District**: `2060-noord`
- **Run**: `20261017T024841Z`
- **Spawn**: Sint-Jansplein (51.2282, 4.4176)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2060-noord/special_buildings.json`
- **Catalog**: `viewer/districts/2060-noord/buildings/catalog.html`

Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.

---

### `plaza-trees-koningin-astridplein` — Match plaza trees to aerial — Koningin Astridplein

**Goal:** Tree layout on Koningin Astridplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `koningin-astridplein` / `Koningin Astridplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Koningin Astridplein",
  "slug": "koningin-astridplein",
  "area_m2": 33335.3,
  "osm_way_ids": [
    488848869,
    488848870,
    488848871,
    550003027,
    749488985,
    749792240,
    749792241,
    749792246,
    749792253,
    749794802,
    787060498
  ],
  "inventory_inside": 70,
  "canopy_blobs": 3,
  "aerial": "districts/2060-noord/cache/aerial/plazas/koningin-astridplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/koningin-astridplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/koningin-astridplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/koningin-astridplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Koningin Astridplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/koningin-astridplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-koningin-astridplein.jpg`

---

### `plaza-trees-damplein` — Match plaza trees to aerial — Damplein

**Goal:** Tree layout on Damplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `damplein` / `Damplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Damplein",
  "slug": "damplein",
  "area_m2": 11126.6,
  "osm_way_ids": [
    285186303,
    295199800
  ],
  "inventory_inside": 58,
  "canopy_blobs": 4,
  "aerial": "districts/2060-noord/cache/aerial/plazas/damplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/damplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/damplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/damplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Damplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/damplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-damplein.jpg`

---

### `plaza-trees-de-coninckplein` — Match plaza trees to aerial — De Coninckplein

**Goal:** Tree layout on De Coninckplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `de-coninckplein` / `De Coninckplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "De Coninckplein",
  "slug": "de-coninckplein",
  "area_m2": 11887.9,
  "osm_way_ids": [
    8060138,
    29238350
  ],
  "inventory_inside": 28,
  "canopy_blobs": 0,
  "aerial": "districts/2060-noord/cache/aerial/plazas/de-coninckplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/de-coninckplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/de-coninckplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/de-coninckplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **De Coninckplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/de-coninckplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-de-coninckplein.jpg`

---

### `plaza-trees-vetten-osplein` — Match plaza trees to aerial — Vetten Osplein

**Goal:** Tree layout on Vetten Osplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `vetten-osplein` / `Vetten Osplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Vetten Osplein",
  "slug": "vetten-osplein",
  "area_m2": 3927.9,
  "osm_way_ids": [
    1358222848
  ],
  "inventory_inside": 25,
  "canopy_blobs": 0,
  "aerial": "districts/2060-noord/cache/aerial/plazas/vetten-osplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/vetten-osplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/vetten-osplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/vetten-osplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Vetten Osplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/vetten-osplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-vetten-osplein.jpg`

---

### `plaza-trees-hortensia-sillisplein` — Match plaza trees to aerial — Hortensia Sillisplein

**Goal:** Tree layout on Hortensia Sillisplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `hortensia-sillisplein` / `Hortensia Sillisplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Hortensia Sillisplein",
  "slug": "hortensia-sillisplein",
  "area_m2": 1052.2,
  "osm_way_ids": [
    506062044
  ],
  "inventory_inside": 20,
  "canopy_blobs": 0,
  "aerial": "districts/2060-noord/cache/aerial/plazas/hortensia-sillisplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/hortensia-sillisplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/hortensia-sillisplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/hortensia-sillisplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Hortensia Sillisplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/hortensia-sillisplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-hortensia-sillisplein.jpg`

---

### `plaza-trees-flamingoplein` — Match plaza trees to aerial — Flamingoplein

**Goal:** Tree layout on Flamingoplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `flamingoplein` / `Flamingoplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Flamingoplein",
  "slug": "flamingoplein",
  "area_m2": 4912.9,
  "osm_way_ids": [
    755161538
  ],
  "inventory_inside": 12,
  "canopy_blobs": 2,
  "aerial": "districts/2060-noord/cache/aerial/plazas/flamingoplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/flamingoplein.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/flamingoplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/flamingoplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Flamingoplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/flamingoplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-flamingoplein.jpg`

---

### `plaza-trees-duinplak` — Match plaza trees to aerial — Duinplak

**Goal:** Tree layout on Duinplak must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `duinplak` / `Duinplak` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Duinplak",
  "slug": "duinplak",
  "area_m2": 909.0,
  "osm_way_ids": [
    506395644
  ],
  "inventory_inside": 9,
  "canopy_blobs": 0,
  "aerial": "districts/2060-noord/cache/aerial/plazas/duinplak.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2060-noord/cache/aerial/plazas/duinplak.jpg`
- `Edit districts/2060-noord/vegetation_overrides.json`
- `python -m cityview district build 2060-noord`

**Aerial:** `districts/2060-noord/cache/aerial/plazas/duinplak.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2060-noord/cache/aerial/plazas/duinplak.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Duinplak** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2060-noord/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2060-noord/cache/aerial/plazas/duinplak.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2060-noord` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-duinplak.jpg`

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
