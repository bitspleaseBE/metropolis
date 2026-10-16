# Agent review — Klein Antwerpen · 2018

- **District**: `2018-harmonie`
- **Run**: `20261016T232639Z`
- **Spawn**: Stadspark (51.211471, 4.412035)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2018-harmonie/special_buildings.json`
- **Catalog**: `viewer/districts/2018-harmonie/buildings/catalog.html`

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
  "area_m2": 33350.1,
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
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/koningin-astridplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/koningin-astridplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/koningin-astridplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/koningin-astridplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Koningin Astridplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/koningin-astridplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-koningin-astridplein.jpg`

---

### `plaza-trees-kievitplein` — Match plaza trees to aerial — Kievitplein

**Goal:** Tree layout on Kievitplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `kievitplein` / `Kievitplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Kievitplein",
  "slug": "kievitplein",
  "area_m2": 25954.3,
  "osm_way_ids": [
    47504359,
    191567487,
    191567488,
    191567491,
    781603724,
    781608060,
    781608061,
    1111521866,
    1111521867
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/kievitplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/kievitplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/kievitplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/kievitplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Kievitplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/kievitplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-kievitplein.jpg`

---

### `plaza-trees-groenplaats` — Match plaza trees to aerial — Groenplaats

**Goal:** Tree layout on Groenplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `groenplaats` / `Groenplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Groenplaats",
  "slug": "groenplaats",
  "area_m2": 19320.2,
  "osm_way_ids": [
    805009630,
    805009631
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/groenplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/groenplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/groenplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/groenplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Groenplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/groenplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-groenplaats.jpg`

---

### `plaza-trees-dageraadplaats` — Match plaza trees to aerial — Dageraadplaats

**Goal:** Tree layout on Dageraadplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `dageraadplaats` / `Dageraadplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Dageraadplaats",
  "slug": "dageraadplaats",
  "area_m2": 17926.7,
  "osm_way_ids": [
    5088688,
    210459403
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/dageraadplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/dageraadplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/dageraadplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/dageraadplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Dageraadplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/dageraadplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-dageraadplaats.jpg`

---

### `plaza-trees-paradeplein` — Match plaza trees to aerial — Paradeplein

**Goal:** Tree layout on Paradeplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `paradeplein` / `Paradeplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Paradeplein",
  "slug": "paradeplein",
  "area_m2": 15004.8,
  "osm_way_ids": [
    155508150,
    482669087,
    683662722,
    1329765987
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/paradeplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/paradeplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/paradeplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/paradeplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Paradeplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/paradeplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-paradeplein.jpg`

---

### `plaza-trees-bolivarplaats` — Match plaza trees to aerial — Bolivarplaats

**Goal:** Tree layout on Bolivarplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `bolivarplaats` / `Bolivarplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Bolivarplaats",
  "slug": "bolivarplaats",
  "area_m2": 9806.1,
  "osm_way_ids": [
    87530458
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/bolivarplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/bolivarplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/bolivarplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/bolivarplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Bolivarplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/bolivarplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-bolivarplaats.jpg`

---

### `plaza-trees-wachthuisplein` — Match plaza trees to aerial — Wachthuisplein

**Goal:** Tree layout on Wachthuisplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `wachthuisplein` / `Wachthuisplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Wachthuisplein",
  "slug": "wachthuisplein",
  "area_m2": 8839.1,
  "osm_way_ids": [
    490963101
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/wachthuisplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/wachthuisplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/wachthuisplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/wachthuisplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Wachthuisplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/wachthuisplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-wachthuisplein.jpg`

---

### `plaza-trees-theodoor-van-rijswijckplaats` — Match plaza trees to aerial — Theodoor Van Rijswijckplaats

**Goal:** Tree layout on Theodoor Van Rijswijckplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `theodoor-van-rijswijckplaats` / `Theodoor Van Rijswijckplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Theodoor Van Rijswijckplaats",
  "slug": "theodoor-van-rijswijckplaats",
  "area_m2": 5835.5,
  "osm_way_ids": [
    210598363,
    210598364,
    210598365
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Theodoor Van Rijswijckplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/theodoor-van-rijswijckplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-theodoor-van-rijswijckplaats.jpg`

---

### `plaza-trees-infirmerieplein` — Match plaza trees to aerial — Infirmerieplein

**Goal:** Tree layout on Infirmerieplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `infirmerieplein` / `Infirmerieplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Infirmerieplein",
  "slug": "infirmerieplein",
  "area_m2": 5388.3,
  "osm_way_ids": [
    1491398945
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/infirmerieplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/infirmerieplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/infirmerieplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/infirmerieplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Infirmerieplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/infirmerieplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-infirmerieplein.jpg`

---

### `plaza-trees-flamingoplein` — Match plaza trees to aerial — Flamingoplein

**Goal:** Tree layout on Flamingoplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `flamingoplein` / `Flamingoplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Flamingoplein",
  "slug": "flamingoplein",
  "area_m2": 4915.8,
  "osm_way_ids": [
    755161538
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/flamingoplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/flamingoplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/flamingoplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/flamingoplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Flamingoplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/flamingoplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-flamingoplein.jpg`

---

### `plaza-trees-binnenplein-den-bell` — Match plaza trees to aerial — Binnenplein Den Bell

**Goal:** Tree layout on Binnenplein Den Bell must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `binnenplein-den-bell` / `Binnenplein Den Bell` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Binnenplein Den Bell",
  "slug": "binnenplein-den-bell",
  "area_m2": 4128.0,
  "osm_way_ids": [
    44171343
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/binnenplein-den-bell.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/binnenplein-den-bell.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/binnenplein-den-bell.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/binnenplein-den-bell.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Binnenplein Den Bell** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/binnenplein-den-bell.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-binnenplein-den-bell.jpg`

---

### `plaza-trees-coxplein` — Match plaza trees to aerial — Coxplein

**Goal:** Tree layout on Coxplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `coxplein` / `Coxplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Coxplein",
  "slug": "coxplein",
  "area_m2": 3435.2,
  "osm_way_ids": [
    766783058
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/coxplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/coxplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/coxplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/coxplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Coxplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/coxplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-coxplein.jpg`

---

### `plaza-trees-burgemeester-e-ryckaertsplein` — Match plaza trees to aerial — Burgemeester E. Ryckaertsplein

**Goal:** Tree layout on Burgemeester E. Ryckaertsplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `burgemeester-e-ryckaertsplein` / `Burgemeester E. Ryckaertsplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Burgemeester E. Ryckaertsplein",
  "slug": "burgemeester-e-ryckaertsplein",
  "area_m2": 3235.2,
  "osm_way_ids": [
    117266916
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/burgemeester-e-ryckaertsplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/burgemeester-e-ryckaertsplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/burgemeester-e-ryckaertsplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/burgemeester-e-ryckaertsplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Burgemeester E. Ryckaertsplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/burgemeester-e-ryckaertsplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-burgemeester-e-ryckaertsplein.jpg`

---

### `plaza-trees-troonplaats` — Match plaza trees to aerial — Troonplaats

**Goal:** Tree layout on Troonplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `troonplaats` / `Troonplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Troonplaats",
  "slug": "troonplaats",
  "area_m2": 3090.6,
  "osm_way_ids": [
    150788231
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/troonplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/troonplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/troonplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/troonplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Troonplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/troonplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-troonplaats.jpg`

---

### `plaza-trees-leopoldplaats` — Match plaza trees to aerial — Leopoldplaats

**Goal:** Tree layout on Leopoldplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `leopoldplaats` / `Leopoldplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Leopoldplaats",
  "slug": "leopoldplaats",
  "area_m2": 2889.8,
  "osm_way_ids": [
    150668711
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/leopoldplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/leopoldplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/leopoldplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/leopoldplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Leopoldplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/leopoldplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-leopoldplaats.jpg`

---

### `plaza-trees-moorkensplein` — Match plaza trees to aerial — Moorkensplein

**Goal:** Tree layout on Moorkensplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `moorkensplein` / `Moorkensplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Moorkensplein",
  "slug": "moorkensplein",
  "area_m2": 2879.0,
  "osm_way_ids": [
    508239730
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/moorkensplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/moorkensplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/moorkensplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/moorkensplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Moorkensplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/moorkensplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-moorkensplein.jpg`

---

### `plaza-trees-mediaplein` — Match plaza trees to aerial — Mediaplein

**Goal:** Tree layout on Mediaplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `mediaplein` / `Mediaplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Mediaplein",
  "slug": "mediaplein",
  "area_m2": 2607.0,
  "osm_way_ids": [
    39970105
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/mediaplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/mediaplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/mediaplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/mediaplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Mediaplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/mediaplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-mediaplein.jpg`

---

### `plaza-trees-loosplaats` — Match plaza trees to aerial — Loosplaats

**Goal:** Tree layout on Loosplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `loosplaats` / `Loosplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Loosplaats",
  "slug": "loosplaats",
  "area_m2": 2404.4,
  "osm_way_ids": [
    677068249
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/loosplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/loosplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/loosplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/loosplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Loosplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/loosplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-loosplaats.jpg`

---

### `plaza-trees-teniersplaats` — Match plaza trees to aerial — Teniersplaats

**Goal:** Tree layout on Teniersplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `teniersplaats` / `Teniersplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Teniersplaats",
  "slug": "teniersplaats",
  "area_m2": 1745.6,
  "osm_way_ids": [
    758838620
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/teniersplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/teniersplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/teniersplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/teniersplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Teniersplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/teniersplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-teniersplaats.jpg`

---

### `plaza-trees-verdraagzaamheidsplein` — Match plaza trees to aerial — Verdraagzaamheidsplein

**Goal:** Tree layout on Verdraagzaamheidsplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `verdraagzaamheidsplein` / `Verdraagzaamheidsplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Verdraagzaamheidsplein",
  "slug": "verdraagzaamheidsplein",
  "area_m2": 1596.7,
  "osm_way_ids": [
    1018438325
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/verdraagzaamheidsplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/verdraagzaamheidsplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/verdraagzaamheidsplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/verdraagzaamheidsplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Verdraagzaamheidsplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/verdraagzaamheidsplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-verdraagzaamheidsplein.jpg`

---

### `plaza-trees-square-488775410` — Match plaza trees to aerial — square-488775410

**Goal:** Tree layout on square-488775410 must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `square-488775410` / `square-488775410` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "square-488775410",
  "slug": "square-488775410",
  "area_m2": 1192.1,
  "osm_way_ids": [
    488775410
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/square-488775410.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/square-488775410.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/square-488775410.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/square-488775410.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **square-488775410** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/square-488775410.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-square-488775410.jpg`

---

### `plaza-trees-hospitaalplein` — Match plaza trees to aerial — Hospitaalplein

**Goal:** Tree layout on Hospitaalplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `hospitaalplein` / `Hospitaalplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Hospitaalplein",
  "slug": "hospitaalplein",
  "area_m2": 720.3,
  "osm_way_ids": [
    677073475
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/hospitaalplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/hospitaalplein.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/hospitaalplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/hospitaalplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Hospitaalplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/hospitaalplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-hospitaalplein.jpg`

---

### `plaza-trees-fransenplaats` — Match plaza trees to aerial — Fransenplaats

**Goal:** Tree layout on Fransenplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `fransenplaats` / `Fransenplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Fransenplaats",
  "slug": "fransenplaats",
  "area_m2": 466.9,
  "osm_way_ids": [
    488775100
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/fransenplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/fransenplaats.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/fransenplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/fransenplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Fransenplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/fransenplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-fransenplaats.jpg`

---

### `plaza-trees-square-1552958437` — Match plaza trees to aerial — square-1552958437

**Goal:** Tree layout on square-1552958437 must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `square-1552958437` / `square-1552958437` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "square-1552958437",
  "slug": "square-1552958437",
  "area_m2": 227.6,
  "osm_way_ids": [
    1552958437
  ],
  "inventory_inside": null,
  "canopy_blobs": null,
  "aerial": "districts/2018-harmonie/cache/aerial/plazas/square-1552958437.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2018-harmonie/cache/aerial/plazas/square-1552958437.jpg`
- `Edit districts/2018-harmonie/vegetation_overrides.json`
- `python -m cityview district build 2018-harmonie`

**Aerial:** `districts/2018-harmonie/cache/aerial/plazas/square-1552958437.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2018-harmonie/cache/aerial/plazas/square-1552958437.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **square-1552958437** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2018-harmonie/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2018-harmonie/cache/aerial/plazas/square-1552958437.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2018-harmonie` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-square-1552958437.jpg`

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

### `ref-peter-benoit` — Match Peter Benoit to its reference photos

**Goal:** Peter Benoit reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Peter Benoit
- **osm_id**: 2396262252
- **osm_type**: node
- **lat**: 51.2011604
- **lon**: 4.4117296
- **xy**: [22.99, -59.65]
- **wikidata**: Q116036362
- **manifest_custom**: benoit_monument
- **spawn_distance_m**: 65.6
- **ref:photo1**: districts/2018-harmonie/references/peter-benoit/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/peter-benoit/01.jpg`
- `Edit the `benoit_monument` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2018-harmonie', force=True)"`

**Agent prompt:** Look at every photo for **Peter Benoit** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-peter-benoit.jpg`

---

### `ref-koning-albertpark` — Match Koning Albertpark to its reference photos

**Goal:** Koning Albertpark reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Koning Albertpark
- **osm_id**: 4358044
- **osm_type**: way
- **lat**: 51.199694867441856
- **lon**: 4.412704811627907
- **xy**: [91.01, -221.65]
- **wikidata**: Q33100208
- **spawn_distance_m**: 242.1
- **ref:photo1**: districts/2018-harmonie/references/koning-albertpark/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/koning-albertpark/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/koning-albertpark/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/koning-albertpark/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/koning-albertpark/01.jpg`
- `Open districts/2018-harmonie/references/koning-albertpark/02.jpg`
- `Open districts/2018-harmonie/references/koning-albertpark/03.jpg`
- `Open districts/2018-harmonie/references/koning-albertpark/04.jpg`
- `Add a manifest custom for osm way/4358044 or tune its façade`

**Agent prompt:** Look at every photo for **Koning Albertpark** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-koning-albertpark.jpg`

---

### `ref-muziekkiosk-koning-albertpark` — Match Muziekkiosk Koning Albertpark to its reference photos

**Goal:** Muziekkiosk Koning Albertpark reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Muziekkiosk Koning Albertpark
- **osm_id**: 117235287
- **osm_type**: way
- **lat**: 51.19957121111111
- **lon**: 4.412916466666666
- **xy**: [105.78, -235.32]
- **manifest_custom**: albertpark_kiosk
- **spawn_distance_m**: 260.7
- **ref:photo1**: districts/2018-harmonie/references/muziekkiosk-koning-albertpark/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/muziekkiosk-koning-albertpark/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/muziekkiosk-koning-albertpark/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/muziekkiosk-koning-albertpark/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/muziekkiosk-koning-albertpark/01.jpg`
- `Open districts/2018-harmonie/references/muziekkiosk-koning-albertpark/02.jpg`
- `Open districts/2018-harmonie/references/muziekkiosk-koning-albertpark/03.jpg`
- `Open districts/2018-harmonie/references/muziekkiosk-koning-albertpark/04.jpg`
- `Edit the `albertpark_kiosk` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2018-harmonie', force=True)"`

**Agent prompt:** Look at every photo for **Muziekkiosk Koning Albertpark** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-muziekkiosk-koning-albertpark.jpg`

---

### `ref-sint-bonifaciuskerk` — Match Sint-Bonifaciuskerk to its reference photos

**Goal:** Sint-Bonifaciuskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Bonifaciuskerk
- **osm_id**: 453577567
- **osm_type**: way
- **lat**: 51.202583295121954
- **lon**: 4.4171276573170735
- **xy**: [399.51, 97.64]
- **wikidata**: Q2306039
- **manifest_custom**: bonifacius
- **spawn_distance_m**: 413.7
- **ref:photo1**: districts/2018-harmonie/references/sint-bonifaciuskerk/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/sint-bonifaciuskerk/01.jpg`
- `Edit the `bonifacius` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2018-harmonie', force=True)"`

**Agent prompt:** Look at every photo for **Sint-Bonifaciuskerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-bonifaciuskerk.jpg`

---

### `ref-heilige-geestkerk` — Match Heilige Geestkerk to its reference photos

**Goal:** Heilige Geestkerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Heilige Geestkerk
- **osm_id**: 501410385
- **osm_type**: way
- **lat**: 51.20578114166667
- **lon**: 4.410730258333333
- **xy**: [-46.72, 451.13]
- **wikidata**: Q107316402
- **spawn_distance_m**: 455.6
- **ref:photo1**: districts/2018-harmonie/references/heilige-geestkerk/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/heilige-geestkerk/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/heilige-geestkerk/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/heilige-geestkerk/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/heilige-geestkerk/01.jpg`
- `Open districts/2018-harmonie/references/heilige-geestkerk/02.jpg`
- `Open districts/2018-harmonie/references/heilige-geestkerk/03.jpg`
- `Open districts/2018-harmonie/references/heilige-geestkerk/04.jpg`
- `Add a manifest custom for osm way/501410385 or tune its façade`

**Agent prompt:** Look at every photo for **Heilige Geestkerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-heilige-geestkerk.jpg`

---

### `ref-basiliek-van-het-heilig-hart` — Match Basiliek van het Heilig Hart to its reference photos

**Goal:** Basiliek van het Heilig Hart reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Basiliek van het Heilig Hart
- **osm_id**: 353285592
- **osm_type**: way
- **lat**: 51.197142927777776
- **lon**: 4.41158275
- **xy**: [12.75, -503.74]
- **wikidata**: Q2750109
- **manifest_custom**: heilig_hart
- **spawn_distance_m**: 507.2
- **ref:photo1**: districts/2018-harmonie/references/basiliek-van-het-heilig-hart/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/basiliek-van-het-heilig-hart/01.jpg`
- `Edit the `heilig_hart` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2018-harmonie', force=True)"`

**Agent prompt:** Look at every photo for **Basiliek van het Heilig Hart** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-basiliek-van-het-heilig-hart.jpg`

---

### `ref-kasteel-de-bergeyck` — Match Kasteel de Bergeyck to its reference photos

**Goal:** Kasteel de Bergeyck reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Kasteel de Bergeyck
- **osm_id**: 231689700
- **osm_type**: way
- **lat**: 51.19704426976744
- **lon**: 4.415041518604651
- **xy**: [254.0, -514.64]
- **wikidata**: Q99584299
- **spawn_distance_m**: 578.1
- **ref:photo1**: districts/2018-harmonie/references/kasteel-de-bergeyck/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/kasteel-de-bergeyck/02.jpg

**Commands:**
- `Open districts/2018-harmonie/references/kasteel-de-bergeyck/01.jpg`
- `Open districts/2018-harmonie/references/kasteel-de-bergeyck/02.jpg`
- `Add a manifest custom for osm way/231689700 or tune its façade`

**Agent prompt:** Look at every photo for **Kasteel de Bergeyck** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-kasteel-de-bergeyck.jpg`

---

### `ref-kapel-van-het-allerheiligste-sacrament` — Match Kapel van het Allerheiligste Sacrament to its reference photos

**Goal:** Kapel van het Allerheiligste Sacrament reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Kapel van het Allerheiligste Sacrament
- **osm_id**: 232921428
- **osm_type**: way
- **lat**: 51.20927500714286
- **lon**: 4.409642757142857
- **xy**: [-122.57, 837.34]
- **wikidata**: Q2420493
- **spawn_distance_m**: 850.5
- **ref:photo1**: districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/01.jpg`
- `Open districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/02.jpg`
- `Open districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/03.jpg`
- `Open districts/2018-harmonie/references/kapel-van-het-allerheiligste-sacrament/04.jpg`
- `Add a manifest custom for osm way/232921428 or tune its façade`

**Agent prompt:** Look at every photo for **Kapel van het Allerheiligste Sacrament** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-kapel-van-het-allerheiligste-sacrament.jpg`

---

### `ref-vlaamse-evangelische-kerk` — Match Vlaamse Evangelische kerk to its reference photos

**Goal:** Vlaamse Evangelische kerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Vlaamse Evangelische kerk
- **osm_id**: 222816084
- **osm_type**: way
- **lat**: 51.20949562068965
- **lon**: 4.413013610344827
- **xy**: [112.55, 861.73]
- **wikidata**: Q28515913
- **spawn_distance_m**: 874.2
- **ref:photo1**: districts/2018-harmonie/references/vlaamse-evangelische-kerk/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/vlaamse-evangelische-kerk/01.jpg`
- `Add a manifest custom for osm way/222816084 or tune its façade`

**Agent prompt:** Look at every photo for **Vlaamse Evangelische kerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-vlaamse-evangelische-kerk.jpg`

---

### `ref-gerechtshof` — Match Gerechtshof to its reference photos

**Goal:** Gerechtshof reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Gerechtshof
- **osm_id**: 192642420
- **osm_type**: way
- **lat**: 51.20868169315069
- **lon**: 4.403882697260274
- **xy**: [-524.34, 771.76]
- **wikidata**: Q33100193
- **spawn_distance_m**: 934.6
- **ref:photo1**: districts/2018-harmonie/references/gerechtshof/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/gerechtshof/01.jpg`
- `Add a manifest custom for osm way/192642420 or tune its façade`

**Agent prompt:** Look at every photo for **Gerechtshof** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-gerechtshof.jpg`

---

### `ref-christus-geboortekerk` — Match Christus’ Geboortekerk to its reference photos

**Goal:** Christus’ Geboortekerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Christus’ Geboortekerk
- **osm_id**: 121677048
- **osm_type**: way
- **lat**: 51.209602996190476
- **lon**: 4.418902441904762
- **xy**: [523.3, 873.6]
- **wikidata**: Q2375157
- **spawn_distance_m**: 1023.7
- **ref:photo1**: districts/2018-harmonie/references/christus-geboortekerk/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/christus-geboortekerk/01.jpg`
- `Add a manifest custom for osm way/121677048 or tune its façade`

**Agent prompt:** Look at every photo for **Christus’ Geboortekerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-christus-geboortekerk.jpg`

---

### `ref-blauwtorentunnel` — Match Blauwtorentunnel to its reference photos

**Goal:** Blauwtorentunnel reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Blauwtorentunnel
- **osm_id**: 21047453
- **osm_type**: way
- **lat**: 51.21181055625
- **lon**: 4.40941834375
- **xy**: [-138.22, 1117.62]
- **wikidata**: Q2303862
- **spawn_distance_m**: 1132.1
- **ref:photo1**: districts/2018-harmonie/references/blauwtorentunnel/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/blauwtorentunnel/01.jpg`
- `Add a manifest custom for osm way/21047453 or tune its façade`

**Agent prompt:** Look at every photo for **Blauwtorentunnel** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-blauwtorentunnel.jpg`

---

### `ref-stadspark` — Match Stadspark to its reference photos

**Goal:** Stadspark reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Stadspark
- **osm_id**: 4344313
- **osm_type**: way
- **lat**: 51.21202495714285
- **lon**: 4.4147200125
- **xy**: [231.57, 1141.32]
- **wikidata**: Q21771395
- **spawn_distance_m**: 1171.5
- **ref:photo1**: districts/2018-harmonie/references/stadspark/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/stadspark/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/stadspark/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/stadspark/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/stadspark/01.jpg`
- `Open districts/2018-harmonie/references/stadspark/02.jpg`
- `Open districts/2018-harmonie/references/stadspark/03.jpg`
- `Open districts/2018-harmonie/references/stadspark/04.jpg`
- `Add a manifest custom for osm way/4344313 or tune its façade`

**Agent prompt:** Look at every photo for **Stadspark** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-stadspark.jpg`

---

### `ref-monument-belgisch-congo` — Match Monument Belgisch-Congo to its reference photos

**Goal:** Monument Belgisch-Congo reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Monument Belgisch-Congo
- **osm_id**: 5832228887
- **osm_type**: node
- **lat**: 51.2128733
- **lon**: 4.4130871
- **xy**: [117.68, 1235.1]
- **wikidata**: Q56070901
- **spawn_distance_m**: 1248.0
- **ref:photo1**: districts/2018-harmonie/references/monument-belgisch-congo/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/monument-belgisch-congo/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/monument-belgisch-congo/03.jpg

**Commands:**
- `Open districts/2018-harmonie/references/monument-belgisch-congo/01.jpg`
- `Open districts/2018-harmonie/references/monument-belgisch-congo/02.jpg`
- `Open districts/2018-harmonie/references/monument-belgisch-congo/03.jpg`
- `Add a manifest custom for osm node/5832228887 or tune its façade`

**Agent prompt:** Look at every photo for **Monument Belgisch-Congo** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-monument-belgisch-congo.jpg`

---

### `ref-monument-jan-van-beers` — Match Monument Jan van Beers to its reference photos

**Goal:** Monument Jan van Beers reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Monument Jan van Beers
- **osm_id**: 7296545179
- **osm_type**: node
- **lat**: 51.212788
- **lon**: 4.4154131
- **xy**: [279.92, 1225.67]
- **wikidata**: Q56070888
- **spawn_distance_m**: 1264.6
- **ref:photo1**: districts/2018-harmonie/references/monument-jan-van-beers/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/monument-jan-van-beers/01.jpg`
- `Add a manifest custom for osm node/7296545179 or tune its façade`

**Agent prompt:** Look at every photo for **Monument Jan van Beers** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-monument-jan-van-beers.jpg`

---

### `ref-sint-joriskerk` — Match Sint-Joriskerk to its reference photos

**Goal:** Sint-Joriskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Joriskerk
- **osm_id**: 232926614
- **osm_type**: way
- **lat**: 51.21264227592592
- **lon**: 4.404873442592593
- **xy**: [-455.23, 1209.56]
- **wikidata**: Q2278872
- **spawn_distance_m**: 1297.6
- **ref:photo1**: districts/2018-harmonie/references/sint-joriskerk/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/sint-joriskerk/02.jpg

**Commands:**
- `Open districts/2018-harmonie/references/sint-joriskerk/01.jpg`
- `Open districts/2018-harmonie/references/sint-joriskerk/02.jpg`
- `Add a manifest custom for osm way/232926614 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Joriskerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-joriskerk.jpg`

---

### `ref-zna-sint-elisabeth` — Match ZNA Sint-Elisabeth to its reference photos

**Goal:** ZNA Sint-Elisabeth reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: ZNA Sint-Elisabeth
- **osm_id**: 783100218
- **osm_type**: way
- **lat**: 51.21329959186046
- **lon**: 4.405882780232559
- **xy**: [-384.83, 1282.22]
- **wikidata**: Q2667287
- **spawn_distance_m**: 1344.8
- **ref:photo1**: districts/2018-harmonie/references/zna-sint-elisabeth/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/zna-sint-elisabeth/01.jpg`
- `Add a manifest custom for osm way/783100218 or tune its façade`

**Agent prompt:** Look at every photo for **ZNA Sint-Elisabeth** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-zna-sint-elisabeth.jpg`

---

### `ref-onze-lieve-vrouw-van-gratiekerk` — Match Onze-Lieve-Vrouw van Gratiekerk to its reference photos

**Goal:** Onze-Lieve-Vrouw van Gratiekerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Onze-Lieve-Vrouw van Gratiekerk
- **osm_id**: 232921429
- **osm_type**: way
- **lat**: 51.21409413181818
- **lon**: 4.412666731818182
- **xy**: [88.36, 1370.05]
- **wikidata**: Q28530528
- **spawn_distance_m**: 1380.9
- **ref:photo1**: districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/01.jpg
- **ref:photo2**: districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/02.jpg
- **ref:photo3**: districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/03.jpg
- **ref:photo4**: districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/04.jpg

**Commands:**
- `Open districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/01.jpg`
- `Open districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/02.jpg`
- `Open districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/03.jpg`
- `Open districts/2018-harmonie/references/onze-lieve-vrouw-van-gratiekerk/04.jpg`
- `Add a manifest custom for osm way/232921429 or tune its façade`

**Agent prompt:** Look at every photo for **Onze-Lieve-Vrouw van Gratiekerk** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-onze-lieve-vrouw-van-gratiekerk.jpg`

---

### `ref-plantentuin` — Match Plantentuin to its reference photos

**Goal:** Plantentuin reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Plantentuin
- **osm_id**: 22956428
- **osm_type**: way
- **lat**: 51.21440617941177
- **lon**: 4.406330473529412
- **xy**: [-353.6, 1404.54]
- **wikidata**: Q3232192
- **spawn_distance_m**: 1455.4
- **ref:photo1**: districts/2018-harmonie/references/plantentuin/01.jpg

**Commands:**
- `Open districts/2018-harmonie/references/plantentuin/01.jpg`
- `Add a manifest custom for osm way/22956428 or tune its façade`

**Agent prompt:** Look at every photo for **Plantentuin** first (they are Wikimedia Commons, authors in `districts/2018-harmonie/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-plantentuin.jpg`

---

### `ref-shopfronts` — Shopfronts that look like the real places

**Goal:** Every shop / bar / restaurant with a reference photo has a shop_overrides.json entry so its fascia colour, lettering, frame, awning and front type match the photo.

**Acceptance:** 2 referenced places; each has an override (now 6 shops carry one) and a walk proof of the busiest street shows them.

**Geo / context:**
```json
{
  "referenced": [
    {
      "name": "De Merode",
      "osm": "node/2329196231",
      "category": "restaurant",
      "photos": [
        "districts/2018-harmonie/references/de-merode/01.jpg"
      ],
      "links": {
        "website": "https://www.demerodeberchem.be"
      }
    },
    {
      "name": "DE Studio",
      "osm": "node/4809730099",
      "category": "theatre",
      "photos": [
        "districts/2018-harmonie/references/de-studio/01.jpg",
        "districts/2018-harmonie/references/de-studio/02.jpg"
      ],
      "links": {
        "website": "https://www.destudio.com/"
      }
    }
  ]
}
```

**Commands:**
- `Open districts/2018-harmonie/references/index.html`
- `Edit districts/2018-harmonie/shop_overrides.json`
- `python -m cityview district build 2018-harmonie --skip-blender`

**Agent prompt:** For each referenced place open its photo (or Mapillary link) and write a `by_osm` override: fascia = board colour, accent = lettering colour, frame = window joinery, front = archetype (boutique / bar / cafe / restaurant / bakery / chocolatier / heritage / market / frituur / fastfood / bank / pharmacy / office), awning = {colour, stripe} or false, terrace. Skip photos that show an interior or a different object (statue, logo) — note them instead.

Status: [ ] todo
Proof: `review/proofs/ref-shopfronts.jpg`

---
