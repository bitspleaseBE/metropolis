# Agent review — Antwerpen · 2000

- **District**: `2000-antwerpen`
- **Run**: `20261017T111622Z`
- **Spawn**: Grote Markt · Kathedraal (51.220482, 4.399963)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2000-antwerpen/special_buildings.json`
- **Catalog**: `viewer/districts/2000-antwerpen/buildings/catalog.html`

Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.

---

### `plaza-trees-bolivarplaats` — Match plaza trees to aerial — Bolivarplaats

**Goal:** Tree layout on Bolivarplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `bolivarplaats` / `Bolivarplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Bolivarplaats",
  "slug": "bolivarplaats",
  "area_m2": 9802.2,
  "osm_way_ids": [
    87530458
  ],
  "inventory_inside": 134,
  "canopy_blobs": 2,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/bolivarplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/bolivarplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/bolivarplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/bolivarplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Bolivarplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/bolivarplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-bolivarplaats.jpg`

---

### `plaza-trees-paul-smekensplein` — Match plaza trees to aerial — Paul Smekensplein

**Goal:** Tree layout on Paul Smekensplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `paul-smekensplein` / `Paul Smekensplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Paul Smekensplein",
  "slug": "paul-smekensplein",
  "area_m2": 10614.4,
  "osm_way_ids": [
    646017556,
    646017557,
    664864159,
    664864160,
    1002244789
  ],
  "inventory_inside": 55,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/paul-smekensplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/paul-smekensplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/paul-smekensplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/paul-smekensplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Paul Smekensplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/paul-smekensplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-paul-smekensplein.jpg`

---

### `plaza-trees-sint-andriesplaats` — Match plaza trees to aerial — Sint-Andriesplaats

**Goal:** Tree layout on Sint-Andriesplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `sint-andriesplaats` / `Sint-Andriesplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Sint-Andriesplaats",
  "slug": "sint-andriesplaats",
  "area_m2": 3024.0,
  "osm_way_ids": [
    37569835
  ],
  "inventory_inside": 51,
  "canopy_blobs": 1,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/sint-andriesplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/sint-andriesplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/sint-andriesplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/sint-andriesplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Sint-Andriesplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/sint-andriesplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-sint-andriesplaats.jpg`

---

### `plaza-trees-graanmarkt` — Match plaza trees to aerial — Graanmarkt

**Goal:** Tree layout on Graanmarkt must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `graanmarkt` / `Graanmarkt` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Graanmarkt",
  "slug": "graanmarkt",
  "area_m2": 3175.0,
  "osm_way_ids": [
    22972974
  ],
  "inventory_inside": 46,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/graanmarkt.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/graanmarkt.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/graanmarkt.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/graanmarkt.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Graanmarkt** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/graanmarkt.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-graanmarkt.jpg`

---

### `plaza-trees-operaplein` — Match plaza trees to aerial — Operaplein

**Goal:** Tree layout on Operaplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `operaplein` / `Operaplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Operaplein",
  "slug": "operaplein",
  "area_m2": 32634.4,
  "osm_way_ids": [
    178557557,
    197667066,
    862828067
  ],
  "inventory_inside": 43,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/operaplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/operaplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/operaplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/operaplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Operaplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/operaplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-operaplein.jpg`

---

### `plaza-trees-falconplein` — Match plaza trees to aerial — Falconplein

**Goal:** Tree layout on Falconplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `falconplein` / `Falconplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Falconplein",
  "slug": "falconplein",
  "area_m2": 4700.9,
  "osm_way_ids": [
    20593024
  ],
  "inventory_inside": 41,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/falconplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/falconplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/falconplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/falconplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Falconplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/falconplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-falconplein.jpg`

---

### `plaza-trees-square-488775410` — Match plaza trees to aerial — square-488775410

**Goal:** Tree layout on square-488775410 must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `square-488775410` / `square-488775410` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "square-488775410",
  "slug": "square-488775410",
  "area_m2": 1191.6,
  "osm_way_ids": [
    488775410
  ],
  "inventory_inside": 38,
  "canopy_blobs": 5,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/square-488775410.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/square-488775410.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/square-488775410.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/square-488775410.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **square-488775410** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/square-488775410.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-square-488775410.jpg`

---

### `plaza-trees-theodoor-van-rijswijckplaats` — Match plaza trees to aerial — Theodoor Van Rijswijckplaats

**Goal:** Tree layout on Theodoor Van Rijswijckplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `theodoor-van-rijswijckplaats` / `Theodoor Van Rijswijckplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Theodoor Van Rijswijckplaats",
  "slug": "theodoor-van-rijswijckplaats",
  "area_m2": 5834.2,
  "osm_way_ids": [
    210598363,
    210598364,
    210598365
  ],
  "inventory_inside": 28,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/theodoor-van-rijswijckplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Theodoor Van Rijswijckplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/theodoor-van-rijswijckplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-theodoor-van-rijswijckplaats.jpg`

---

### `plaza-trees-johan-westerlundplein` — Match plaza trees to aerial — Johan Westerlundplein

**Goal:** Tree layout on Johan Westerlundplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `johan-westerlundplein` / `Johan Westerlundplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Johan Westerlundplein",
  "slug": "johan-westerlundplein",
  "area_m2": 5149.9,
  "osm_way_ids": [
    646017559
  ],
  "inventory_inside": 28,
  "canopy_blobs": 2,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/johan-westerlundplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/johan-westerlundplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/johan-westerlundplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/johan-westerlundplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Johan Westerlundplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/johan-westerlundplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-johan-westerlundplein.jpg`

---

### `plaza-trees-mechelseplein` — Match plaza trees to aerial — Mechelseplein

**Goal:** Tree layout on Mechelseplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `mechelseplein` / `Mechelseplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Mechelseplein",
  "slug": "mechelseplein",
  "area_m2": 1766.4,
  "osm_way_ids": [
    587017507
  ],
  "inventory_inside": 26,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/mechelseplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/mechelseplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/mechelseplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/mechelseplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Mechelseplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/mechelseplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-mechelseplein.jpg`

---

### `plaza-trees-vrijdagmarkt` — Match plaza trees to aerial — Vrijdagmarkt

**Goal:** Tree layout on Vrijdagmarkt must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `vrijdagmarkt` / `Vrijdagmarkt` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Vrijdagmarkt",
  "slug": "vrijdagmarkt",
  "area_m2": 2187.5,
  "osm_way_ids": [
    32086812
  ],
  "inventory_inside": 25,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/vrijdagmarkt.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/vrijdagmarkt.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/vrijdagmarkt.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/vrijdagmarkt.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Vrijdagmarkt** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/vrijdagmarkt.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-vrijdagmarkt.jpg`

---

### `plaza-trees-square-1052637192` — Match plaza trees to aerial — square-1052637192

**Goal:** Tree layout on square-1052637192 must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `square-1052637192` / `square-1052637192` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "square-1052637192",
  "slug": "square-1052637192",
  "area_m2": 1928.8,
  "osm_way_ids": [
    1052637192
  ],
  "inventory_inside": 26,
  "canopy_blobs": 2,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/square-1052637192.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/square-1052637192.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/square-1052637192.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/square-1052637192.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **square-1052637192** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/square-1052637192.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-square-1052637192.jpg`

---

### `plaza-trees-veemarkt` — Match plaza trees to aerial — Veemarkt

**Goal:** Tree layout on Veemarkt must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `veemarkt` / `Veemarkt` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Veemarkt",
  "slug": "veemarkt",
  "area_m2": 1823.5,
  "osm_way_ids": [
    180020697
  ],
  "inventory_inside": 23,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/veemarkt.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/veemarkt.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/veemarkt.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/veemarkt.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Veemarkt** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/veemarkt.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-veemarkt.jpg`

---

### `plaza-trees-leonie-glassplein` — Match plaza trees to aerial — Leonie Glassplein

**Goal:** Tree layout on Leonie Glassplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `leonie-glassplein` / `Leonie Glassplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Leonie Glassplein",
  "slug": "leonie-glassplein",
  "area_m2": 7447.7,
  "osm_way_ids": [
    424820201,
    553750451,
    553750452,
    875506155,
    875506156,
    875506157,
    1549074060,
    1549074061,
    1549074374,
    1549074375,
    1549265812,
    1549265813
  ],
  "inventory_inside": 23,
  "canopy_blobs": 1,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/leonie-glassplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/leonie-glassplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/leonie-glassplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/leonie-glassplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Leonie Glassplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/leonie-glassplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-leonie-glassplein.jpg`

---

### `plaza-trees-bullinckplaats` — Match plaza trees to aerial — Bullinckplaats

**Goal:** Tree layout on Bullinckplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `bullinckplaats` / `Bullinckplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Bullinckplaats",
  "slug": "bullinckplaats",
  "area_m2": 1897.5,
  "osm_way_ids": [
    26155181
  ],
  "inventory_inside": 21,
  "canopy_blobs": 1,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/bullinckplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/bullinckplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/bullinckplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/bullinckplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Bullinckplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/bullinckplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-bullinckplaats.jpg`

---

### `plaza-trees-hessenplein` — Match plaza trees to aerial — Hessenplein

**Goal:** Tree layout on Hessenplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `hessenplein` / `Hessenplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Hessenplein",
  "slug": "hessenplein",
  "area_m2": 8258.6,
  "osm_way_ids": [
    494268312
  ],
  "inventory_inside": 20,
  "canopy_blobs": 1,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/hessenplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/hessenplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/hessenplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/hessenplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Hessenplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/hessenplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-hessenplein.jpg`

---

### `plaza-trees-panamarenkoplein` — Match plaza trees to aerial — Panamarenkoplein

**Goal:** Tree layout on Panamarenkoplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `panamarenkoplein` / `Panamarenkoplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Panamarenkoplein",
  "slug": "panamarenkoplein",
  "area_m2": 1742.6,
  "osm_way_ids": [
    854116131
  ],
  "inventory_inside": 18,
  "canopy_blobs": 1,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/panamarenkoplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/panamarenkoplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/panamarenkoplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/panamarenkoplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Panamarenkoplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/panamarenkoplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-panamarenkoplein.jpg`

---

### `plaza-trees-limaplein` — Match plaza trees to aerial — Limaplein

**Goal:** Tree layout on Limaplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `limaplein` / `Limaplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Limaplein",
  "slug": "limaplein",
  "area_m2": 3444.7,
  "osm_way_ids": [
    45558161
  ],
  "inventory_inside": 17,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/limaplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/limaplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/limaplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/limaplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Limaplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/limaplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-limaplein.jpg`

---

### `plaza-trees-troonplaats` — Match plaza trees to aerial — Troonplaats

**Goal:** Tree layout on Troonplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `troonplaats` / `Troonplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Troonplaats",
  "slug": "troonplaats",
  "area_m2": 5015.7,
  "osm_way_ids": [
    619101119
  ],
  "inventory_inside": 14,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/troonplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/troonplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/troonplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/troonplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Troonplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/troonplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-troonplaats.jpg`

---

### `plaza-trees-sint-paulusplaats` — Match plaza trees to aerial — Sint-Paulusplaats

**Goal:** Tree layout on Sint-Paulusplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `sint-paulusplaats` / `Sint-Paulusplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Sint-Paulusplaats",
  "slug": "sint-paulusplaats",
  "area_m2": 2891.4,
  "osm_way_ids": [
    20591887
  ],
  "inventory_inside": 14,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/sint-paulusplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/sint-paulusplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/sint-paulusplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/sint-paulusplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Sint-Paulusplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/sint-paulusplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-sint-paulusplaats.jpg`

---

### `plaza-trees-leopoldplaats` — Match plaza trees to aerial — Leopoldplaats

**Goal:** Tree layout on Leopoldplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `leopoldplaats` / `Leopoldplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Leopoldplaats",
  "slug": "leopoldplaats",
  "area_m2": 2888.7,
  "osm_way_ids": [
    150668711
  ],
  "inventory_inside": 14,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/leopoldplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/leopoldplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/leopoldplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/leopoldplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Leopoldplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/leopoldplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-leopoldplaats.jpg`

---

### `plaza-trees-verdraagzaamheidsplein` — Match plaza trees to aerial — Verdraagzaamheidsplein

**Goal:** Tree layout on Verdraagzaamheidsplein must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `verdraagzaamheidsplein` / `Verdraagzaamheidsplein` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Verdraagzaamheidsplein",
  "slug": "verdraagzaamheidsplein",
  "area_m2": 1596.1,
  "osm_way_ids": [
    1018438325
  ],
  "inventory_inside": 14,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/verdraagzaamheidsplein.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/verdraagzaamheidsplein.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/verdraagzaamheidsplein.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/verdraagzaamheidsplein.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Verdraagzaamheidsplein** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/verdraagzaamheidsplein.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-verdraagzaamheidsplein.jpg`

---

### `plaza-trees-ruckersplaats` — Match plaza trees to aerial — Ruckersplaats

**Goal:** Tree layout on Ruckersplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `ruckersplaats` / `Ruckersplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Ruckersplaats",
  "slug": "ruckersplaats",
  "area_m2": 1282.5,
  "osm_way_ids": [
    26155092
  ],
  "inventory_inside": 16,
  "canopy_blobs": 3,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/ruckersplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/ruckersplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/ruckersplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/ruckersplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Ruckersplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/ruckersplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-ruckersplaats.jpg`

---

### `plaza-trees-komedieplaats` — Match plaza trees to aerial — Komedieplaats

**Goal:** Tree layout on Komedieplaats must follow the orthophoto canopy, not a carpeted inventory or a one-size ring rule.

**Acceptance:** vegetation_overrides.json has a `komedieplaats` / `Komedieplaats` plaza; rebuild includes override stats; walk proof shows aerial-matching trees.

**Geo / context:**
```json
{
  "name": "Komedieplaats",
  "slug": "komedieplaats",
  "area_m2": 7038.9,
  "osm_way_ids": [
    22972967,
    424806802,
    677062896
  ],
  "inventory_inside": 13,
  "canopy_blobs": 0,
  "aerial": "districts/2000-antwerpen/cache/aerial/plazas/komedieplaats.jpg",
  "notes": "cyan=inventory trunks, yellow=aerial canopy blobs"
}
```

**Commands:**
- `Open districts/2000-antwerpen/cache/aerial/plazas/komedieplaats.jpg`
- `Edit districts/2000-antwerpen/vegetation_overrides.json`
- `python -m cityview district build 2000-antwerpen`

**Aerial:** `districts/2000-antwerpen/cache/aerial/plazas/komedieplaats.jpg` (cyan = inventory trunks, yellow = aerial canopy)

**Agent prompt:** Open `districts/2000-antwerpen/cache/aerial/plazas/komedieplaats.jpg` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). Match trees on **Komedieplaats** to what you see — each square differs (Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). Do **not** invent a uniform ring rule. Write/merge a plaza entry into `districts/2000-antwerpen/vegetation_overrides.json` with mode `clear` or `replace_inside`, polygon from `districts/2000-antwerpen/cache/aerial/plazas/komedieplaats.json` (`polygon` field), and `trees` as local XY matching visible crowns (or `[]` / mode `clear` when bare). Rebuild: `python -m cityview district build 2000-antwerpen` so the GLB applies the override.

Status: [ ] todo
Proof: `review/proofs/plaza-trees-komedieplaats.jpg`

---

### `cathedral-gothic` — Rework OLV cathedral Gothic massing

**Goal:** From Groenplaats the cathedral must read as Gothic (tower + nave), not a classical temple colonnade.

**Acceptance:** Silhouette from spawn shows one tall north tower and nave; no colonnade of evenly spaced pillars; proof photo from Groenplaats.

**Geo / context:**
- **name**: Onze-Lieve-Vrouwekathedraal
- **osm_id**: 26495164
- **osm_type**: way
- **lat**: 51.22037079122138
- **lon**: 4.401354010305344
- **xy**: [76.976, 79.676]
- **wikidata**: Q5901
- **manifest_custom**: olv_cathedral
- **expected_custom**: olv_cathedral
- **mesh_status**: manifest_custom
- **spawn_distance_m**: 97.8
- **notes**: Gothic from Groenplaats — not a classical temple colonnade.
- **ref:inventaris**: https://inventaris.onroerenderfgoed.be/erfgoedobjecten/4183
- **ref:wikidata**: https://www.wikidata.org/wiki/Q5901
- **wikidata_label**: Onze-Lieve-Vrouwekathedraal — Roman-Catholic cathedral in Antwerp, Belgium

**Commands:**
- `Edit cityview/landmark_civic.py build_olv_cathedral`
- `python -m cityview district build 2000-antwerpen  # or re-export landmark GLB`

Status: [x] done
Proof: `review/proofs/cathedral-gothic.jpg`

---

### `het-steen-silhouette` — Polish Het Steen gatehouse from the Scheldt

**Goal:** Gatehouse massing readable from the quay approach.

**Acceptance:** Distinct gatehouse + roof; proof from Scheldt / Steenplein side.

**Geo / context:**
- **name**: Het Steen
- **osm_id**: 29067925
- **osm_type**: way
- **lat**: 51.22272038965517
- **lon**: 4.397394144827586
- **xy**: [-199.121, 339.401]
- **wikidata**: Q1014126
- **manifest_custom**: het_steen
- **expected_custom**: het_steen
- **mesh_status**: manifest_custom
- **spawn_distance_m**: 305.5
- **notes**: Medieval gatehouse on the Scheldt — silhouette from the quay.
- **ref:wikidata**: https://www.wikidata.org/wiki/Q1014126
- **wikidata_label**: Het Steen — fortress in Antwerp, Belgium

**Commands:**
- `Edit cityview/landmark_civic.py build_het_steen`

Status: [x] done
Proof: `review/proofs/het-steen-silhouette.jpg`

---

### `grote-markt-setpiece` — Grote Markt set-piece: Stadhuis + Brabo + guild terrace

**Goal:** Square reads as city hall + Brabo fountain + guild fronts together.

**Acceptance:** Minimap gold pins for Stadhuis, Brabo, Huis Spaengien; walk proof facing Stadhuis with Brabo in frame.

**Geo / context:**
```json
{
  "stadhuis": {
    "name": "Stadhuis Antwerpen",
    "osm_id": 22966134,
    "osm_type": "way",
    "role": "city_hall",
    "score": null,
    "wikidata": "Q2005868",
    "heritage": true,
    "building": "government",
    "amenity": "townhall",
    "historic": "townhall",
    "lat": 51.22129266111111,
    "lon": 4.399297288888889,
    "xy": [
      -66.427,
      181.58
    ],
    "spawn_distance_m": 100.9,
    "expected_custom": "stadhuis",
    "manifest_custom": "stadhuis",
    "mesh_status": "manifest_custom",
    "notes": "Renaissance city hall on Grote Markt west side.",
    "refs": {
      "wikidata": "https://www.wikidata.org/wiki/Q2005868"
    },
    "canonical": true,
    "wikidata_label": {
      "label_en": "Antwerp City Hall",
      "label_nl": "Stadhuis van Antwerpen",
      "description_en": "city hall of Antwerp, Belgium",
      "description_nl": "bouwwerk in Antwerpen (stad)"
    }
  },
  "brabo": {
    "name": "Brabo fountain",
    "osm_id": 900000001,
    "osm_type": "node",
    "role": "monument",
    "score": null,
    "wikidata": "Q3911365",
    "heritage": false,
    "building": null,
    "amenity": null,
    "historic": null,
    "lat": 51.22111,
    "lon": 4.39972,
    "xy": [
      -36.954,
      161.388
    ],
    "spawn_distance_m": 71.5,
    "expected_custom": "brabo_fountain",
    "manifest_custom": "brabo_fountain",
    "mesh_status": "manifest_custom",
    "notes": "Brabo on Grote Markt; synthetic node (not in OSM extract as memorial).",
    "refs": {
      "wikidata": "https://www.wikidata.org/wiki/Q3911365"
    },
    "canonical": true,
    "wikidata_label": {
      "label_en": "Brabo Fountain",
      "label_nl": "Brabofontein",
      "description_en": "fountain in Antwerp, Belgium",
      "description_nl": "fontein op de Grote Markt in Antwerpen"
    }
  },
  "terrace": {
    "name": "Huis Spaengien (Grote Markt 7)",
    "osm_id": 496929324,
    "osm_type": "way",
    "role": "guild_terrace",
    "score": null,
    "wikidata": null,
    "heritage": true,
    "building": "yes",
    "amenity": null,
    "historic": null,
    "lat": 51.2217116,
    "lon": 4.399869871428572,
    "xy": [
      -26.504,
      227.889
    ],
    "spawn_distance_m": 136.1,
    "expected_custom": "guild_house",
    "manifest_custom": "guild_house",
    "mesh_status": "manifest_custom",
    "notes": "Tallest guild house on the north row; every Grote Markt frontage has its own spec in grote_markt_houses.json.",
    "refs": {},
    "canonical": true
  }
}
```

**Commands:**
- `Confirm districts/2000-antwerpen/landmarks/manifest.json nodes/by_id`
- `python -m cityview.landmark_grote_markt sync 2000-antwerpen`
- `Rebuild streamed landmark GLBs for 22966134, 900000001 and every guild_house / hansahuis entry`

Status: [x] done
Proof: `review/proofs/grote-markt-setpiece.jpg`

---

### `centre-shopfront-facades` — Centre shopfront / horeca façade batch

**Goal:** Replace procedural centre elevations with shopfront/horeca art (nearby names: Albert Heijn, Apotheek Roosevelt, Apotheek Krols, Shipping Dispensary, Carrefour Express, Carrefour Market, Delhaize, Shamra, De Broers van Julienne, Vitrin, Baron, Soho).

**Acceptance:** At least 8 near-spawn shopfront elevations; atlas re-packed; assert_facades_unique passes; hashes differ from 2018.

**Geo / context:**
```json
{
  "facade_slots": [
    "facade_01",
    "facade_02",
    "facade_03",
    "facade_04",
    "facade_05",
    "facade_06",
    "facade_07",
    "facade_08"
  ],
  "shop_sample": [
    "Albert Heijn",
    "Apotheek Roosevelt",
    "Apotheek Krols",
    "Shipping Dispensary",
    "Carrefour Express",
    "Carrefour Market",
    "Delhaize",
    "Shamra",
    "De Broers van Julienne",
    "Vitrin",
    "Baron",
    "Soho"
  ]
}
```

**Commands:**
- `python -m cityview.district_facades 2000-antwerpen --force --pack`
- `python -m cityview district check 2000-antwerpen --no-sims`

**Per-slot façade prompts:**

- `facade_01` (baroque_civic, 4 storeys) → `districts/2000-antwerpen/facades/elevations/facade_01.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_01, 4 storeys, style baroque_civic, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_02` (stepped_gable, 3 storeys) → `districts/2000-antwerpen/facades/elevations/facade_02.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_02, 3 storeys, style stepped_gable, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_03` (shopfront_kebab, 4 storeys) → `districts/2000-antwerpen/facades/elevations/facade_03.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_03, 4 storeys, style shopfront_kebab, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_04` (postwar_block, 5 storeys) → `districts/2000-antwerpen/facades/elevations/facade_04.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_04, 5 storeys, style postwar_block, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_05` (shopfront_pizza, 3 storeys) → `districts/2000-antwerpen/facades/elevations/facade_05.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_05, 3 storeys, style shopfront_pizza, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_06` (shopfront_frituur, 4 storeys) → `districts/2000-antwerpen/facades/elevations/facade_06.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_06, 4 storeys, style shopfront_frituur, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_07` (shopfront_newsstand, 4 storeys) → `districts/2000-antwerpen/facades/elevations/facade_07.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_07, 4 storeys, style shopfront_newsstand, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.
- `facade_08` (warehouse_quay, 3 storeys) → `districts/2000-antwerpen/facades/elevations/facade_08.jpg`
  - Prompt: Antwerp historic-centre street elevation facade_08, 3 storeys, style warehouse_quay, orthographic facade photo, ground-floor restaurant/cafe shopfront, Flemish brick or render, no sky, no people.

Status: [x] done
Proof: `review/proofs/centre-shopfront-facades.jpg`

---

### `proof-screenshots` — Capture proof screenshots (spawn, Grote Markt, Steen)

**Goal:** Drop walk-mode stills into review/proofs/ and tick related tasks.

**Acceptance:** Files exist for cathedral-gothic, grote-markt-setpiece, het-steen-silhouette.

**Geo / context:**
- **lat**: 51.220482
- **lon**: 4.399963

**Commands:**
- `Open http://127.0.0.1:8767/?district=2000-antwerpen`
- `Save stills under districts/2000-antwerpen/review/proofs/`

Status: [x] done
Proof: `review/proofs/spawn-groenplaats.jpg`

---

### `minimap-district-scoped` — Verify minimap is district-scoped (no Harmonie kiosk)

**Goal:** Gold pins only for 2000 landmarks; street caption uses Antwerpen · 2000; no Albertpark kiosk ghost pin near Groenplaats.

**Acceptance:** Minimap pins match viewer/districts/2000-antwerpen/landmarks.json.

**Geo / context:**
```json
{
  "note": "Groenplaats has no kiosk mesh \u2014 false positive was root landmarks.json"
}
```

**Commands:**
- `Hard-reload viewer; compare pins to landmarks.json`

Status: [x] done
Proof: `review/proofs/minimap-district-scoped.jpg`

---

### `ref-onze-lieve-vrouw-geboorte` — Match Onze-Lieve-Vrouw Geboorte to its reference photos

**Goal:** Onze-Lieve-Vrouw Geboorte reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Onze-Lieve-Vrouw Geboorte
- **osm_id**: 497461472
- **osm_type**: way
- **lat**: 51.218125414285716
- **lon**: 4.403438635714286
- **xy**: [222.32, -168.53]
- **wikidata**: Q107388201
- **spawn_distance_m**: 156.0
- **ref:photo1**: districts/2000-antwerpen/references/onze-lieve-vrouw-geboorte/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/onze-lieve-vrouw-geboorte/01.jpg`
- `Add a manifest custom for osm way/497461472 or tune its façade`

**Agent prompt:** Look at every photo for **Onze-Lieve-Vrouw Geboorte** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-onze-lieve-vrouw-geboorte.jpg`

---

### `ref-onze-lieve-vrouwekathedraal` — Match Onze-Lieve-Vrouwekathedraal to its reference photos

**Goal:** Onze-Lieve-Vrouwekathedraal reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Onze-Lieve-Vrouwekathedraal
- **osm_id**: 26495164
- **osm_type**: way
- **lat**: 51.22037079122138
- **lon**: 4.401354010305344
- **xy**: [76.98, 79.68]
- **wikidata**: Q5901
- **manifest_custom**: olv_cathedral
- **spawn_distance_m**: 157.1
- **ref:photo1**: districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/01.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/02.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/03.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouwekathedraal/04.jpg`
- `Edit the `olv_cathedral` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2000-antwerpen', force=True)"`

**Agent prompt:** Look at every photo for **Onze-Lieve-Vrouwekathedraal** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-onze-lieve-vrouwekathedraal.jpg`

---

### `ref-brabo-fountain` — Match Brabo fountain to its reference photos

**Goal:** Brabo fountain reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Brabo fountain
- **osm_id**: 900000001
- **osm_type**: node
- **lat**: 51.22111
- **lon**: 4.39972
- **xy**: [-36.95, 161.39]
- **wikidata**: Q3911365
- **manifest_custom**: brabo_fountain
- **spawn_distance_m**: 273.3
- **ref:photo1**: districts/2000-antwerpen/references/brabo-fountain/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/brabo-fountain/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/brabo-fountain/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/brabo-fountain/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/brabo-fountain/01.jpg`
- `Open districts/2000-antwerpen/references/brabo-fountain/02.jpg`
- `Open districts/2000-antwerpen/references/brabo-fountain/03.jpg`
- `Open districts/2000-antwerpen/references/brabo-fountain/04.jpg`
- `Edit the `brabo_fountain` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2000-antwerpen', force=True)"`

**Agent prompt:** Look at every photo for **Brabo fountain** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [x] done
Proof: `review/proofs/ref-brabo-fountain.jpg`

---

### `ref-sint-augustinuskerk` — Match Sint-Augustinuskerk to its reference photos

**Goal:** Sint-Augustinuskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Augustinuskerk
- **osm_id**: 232768394
- **osm_type**: way
- **lat**: 51.21628625128205
- **lon**: 4.402010443589743
- **xy**: [122.74, -371.83]
- **wikidata**: Q23580548
- **spawn_distance_m**: 299.5
- **ref:photo1**: districts/2000-antwerpen/references/sint-augustinuskerk/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-augustinuskerk/01.jpg`
- `Add a manifest custom for osm way/232768394 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Augustinuskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-augustinuskerk.jpg`

---

### `ref-stadhuis-antwerpen` — Match Stadhuis Antwerpen to its reference photos

**Goal:** Stadhuis Antwerpen reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Stadhuis Antwerpen
- **osm_id**: 22966134
- **osm_type**: way
- **lat**: 51.22129266111111
- **lon**: 4.399297288888889
- **xy**: [-66.43, 181.58]
- **wikidata**: Q2005868
- **manifest_custom**: stadhuis
- **spawn_distance_m**: 305.9
- **ref:photo1**: districts/2000-antwerpen/references/stadhuis-antwerpen/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/stadhuis-antwerpen/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/stadhuis-antwerpen/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/stadhuis-antwerpen/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/stadhuis-antwerpen/01.jpg`
- `Open districts/2000-antwerpen/references/stadhuis-antwerpen/02.jpg`
- `Open districts/2000-antwerpen/references/stadhuis-antwerpen/03.jpg`
- `Open districts/2000-antwerpen/references/stadhuis-antwerpen/04.jpg`
- `Edit the `stadhuis` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2000-antwerpen', force=True)"`

**Agent prompt:** Look at every photo for **Stadhuis Antwerpen** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [x] done
Proof: `review/proofs/ref-stadhuis-antwerpen.jpg`

---

### `ref-sint-carolus-borromeuskerk` — Match Sint-Carolus Borromeuskerk to its reference photos

**Goal:** Sint-Carolus Borromeuskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Carolus Borromeuskerk
- **osm_id**: 39886923
- **osm_type**: way
- **lat**: 51.22098518709678
- **lon**: 4.4046529258064515
- **xy**: [306.99, 147.59]
- **wikidata**: Q1415440
- **spawn_distance_m**: 306.5
- **ref:photo1**: districts/2000-antwerpen/references/sint-carolus-borromeuskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-carolus-borromeuskerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-carolus-borromeuskerk/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-carolus-borromeuskerk/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-carolus-borromeuskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-carolus-borromeuskerk/02.jpg`
- `Open districts/2000-antwerpen/references/sint-carolus-borromeuskerk/03.jpg`
- `Open districts/2000-antwerpen/references/sint-carolus-borromeuskerk/04.jpg`
- `Add a manifest custom for osm way/39886923 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Carolus Borromeuskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-carolus-borromeuskerk.jpg`

---

### `ref-sint-andrieskerk` — Match Sint-Andrieskerk to its reference photos

**Goal:** Sint-Andrieskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Andrieskerk
- **osm_id**: 232914449
- **osm_type**: way
- **lat**: 51.216495994936714
- **lon**: 4.397876910126582
- **xy**: [-165.46, -348.64]
- **wikidata**: Q2802159
- **spawn_distance_m**: 380.4
- **ref:photo1**: districts/2000-antwerpen/references/sint-andrieskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-andrieskerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-andrieskerk/03.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-andrieskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-andrieskerk/02.jpg`
- `Open districts/2000-antwerpen/references/sint-andrieskerk/03.jpg`
- `Add a manifest custom for osm way/232914449 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Andrieskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-andrieskerk.jpg`

---

### `ref-vleeshuis` — Match Vleeshuis to its reference photos

**Goal:** Vleeshuis reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Vleeshuis
- **osm_id**: 179882624
- **osm_type**: way
- **lat**: 51.22268508352941
- **lon**: 4.399246084705882
- **xy**: [-70.0, 335.5]
- **wikidata**: Q2801959
- **spawn_distance_m**: 445.7
- **ref:photo1**: districts/2000-antwerpen/references/vleeshuis/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/vleeshuis/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/vleeshuis/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/vleeshuis/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/vleeshuis/01.jpg`
- `Open districts/2000-antwerpen/references/vleeshuis/02.jpg`
- `Open districts/2000-antwerpen/references/vleeshuis/03.jpg`
- `Open districts/2000-antwerpen/references/vleeshuis/04.jpg`
- `Add a manifest custom for osm way/179882624 or tune its façade`

**Agent prompt:** Look at every photo for **Vleeshuis** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-vleeshuis.jpg`

---

### `ref-steenplein-2020` — Match Steenplein 2020 to its reference photos

**Goal:** Steenplein 2020 reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Steenplein 2020
- **osm_id**: 662325582
- **osm_type**: way
- **lat**: 51.22164525925926
- **lon**: 4.396717544444444
- **xy**: [-246.3, 220.56]
- **spawn_distance_m**: 454.4
- **ref:photo1**: districts/2000-antwerpen/references/steenplein-2020/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/steenplein-2020/02.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/steenplein-2020/01.jpg`
- `Open districts/2000-antwerpen/references/steenplein-2020/02.jpg`
- `Add a manifest custom for osm way/662325582 or tune its façade`

**Agent prompt:** Look at every photo for **Steenplein 2020** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-steenplein-2020.jpg`

---

### `ref-steenplein` — Match Steenplein to its reference photos

**Goal:** Steenplein reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Steenplein
- **osm_id**: 445101734
- **osm_type**: way
- **lat**: 51.22175034375
- **lon**: 4.396708125
- **xy**: [-246.95, 232.17]
- **spawn_distance_m**: 462.6
- **ref:photo1**: districts/2000-antwerpen/references/steenplein/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/steenplein/02.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/steenplein/01.jpg`
- `Open districts/2000-antwerpen/references/steenplein/02.jpg`
- `Add a manifest custom for osm way/445101734 or tune its façade`

**Agent prompt:** Look at every photo for **Steenplein** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-steenplein.jpg`

---

### `ref-delbekehuis` — Match Delbekehuis to its reference photos

**Goal:** Delbekehuis reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Delbekehuis
- **osm_id**: 496126599
- **osm_type**: way
- **lat**: 51.22207353076923
- **lon**: 4.406364353846154
- **xy**: [426.32, 267.9]
- **wikidata**: Q33100296
- **spawn_distance_m**: 476.3
- **ref:photo1**: districts/2000-antwerpen/references/delbekehuis/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/delbekehuis/01.jpg`
- `Add a manifest custom for osm way/496126599 or tune its façade`

**Agent prompt:** Look at every photo for **Delbekehuis** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-delbekehuis.jpg`

---

### `ref-sint-annakapel` — Match Sint-Annakapel to its reference photos

**Goal:** Sint-Annakapel reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Annakapel
- **osm_id**: 496126617
- **osm_type**: way
- **lat**: 51.2217729
- **lon**: 4.4073711666666675
- **xy**: [496.51, 234.67]
- **wikidata**: Q107382995
- **spawn_distance_m**: 505.9
- **ref:photo1**: districts/2000-antwerpen/references/sint-annakapel/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-annakapel/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-annakapel/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-annakapel/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-annakapel/01.jpg`
- `Open districts/2000-antwerpen/references/sint-annakapel/02.jpg`
- `Open districts/2000-antwerpen/references/sint-annakapel/03.jpg`
- `Open districts/2000-antwerpen/references/sint-annakapel/04.jpg`
- `Add a manifest custom for osm way/496126617 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Annakapel** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-annakapel.jpg`

---

### `ref-het-steen` — Match Het Steen to its reference photos

**Goal:** Het Steen reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Het Steen
- **osm_id**: 29067925
- **osm_type**: way
- **lat**: 51.22272038965517
- **lon**: 4.397394144827586
- **xy**: [-199.12, 339.4]
- **wikidata**: Q1014126
- **manifest_custom**: het_steen
- **spawn_distance_m**: 511.6
- **ref:photo1**: districts/2000-antwerpen/references/het-steen/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/het-steen/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/het-steen/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/het-steen/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/het-steen/01.jpg`
- `Open districts/2000-antwerpen/references/het-steen/02.jpg`
- `Open districts/2000-antwerpen/references/het-steen/03.jpg`
- `Open districts/2000-antwerpen/references/het-steen/04.jpg`
- `Edit the `het_steen` builder (cityview/landmark_civic.py / landmark_models.py)`
- `python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('2000-antwerpen', force=True)"`

**Agent prompt:** Look at every photo for **Het Steen** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-het-steen.jpg`

---

### `ref-steenbergstraat` — Match Steenbergstraat to its reference photos

**Goal:** Steenbergstraat reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Steenbergstraat
- **osm_id**: 26407876
- **osm_type**: way
- **lat**: 51.2146883
- **lon**: 4.39796144
- **xy**: [-159.57, -548.47]
- **spawn_distance_m**: 541.0
- **ref:photo1**: districts/2000-antwerpen/references/steenbergstraat/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/steenbergstraat/01.jpg`
- `Add a manifest custom for osm way/26407876 or tune its façade`

**Agent prompt:** Look at every photo for **Steenbergstraat** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-steenbergstraat.jpg`

---

### `ref-sint-pauluskerk` — Match Sint-Pauluskerk to its reference photos

**Goal:** Sint-Pauluskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Pauluskerk
- **osm_id**: 116149697
- **osm_type**: way
- **lat**: 51.22388510215054
- **lon**: 4.401297522580645
- **xy**: [73.04, 468.15]
- **wikidata**: Q2272511
- **spawn_distance_m**: 547.1
- **ref:photo1**: districts/2000-antwerpen/references/sint-pauluskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-pauluskerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-pauluskerk/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-pauluskerk/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-pauluskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-pauluskerk/02.jpg`
- `Open districts/2000-antwerpen/references/sint-pauluskerk/03.jpg`
- `Open districts/2000-antwerpen/references/sint-pauluskerk/04.jpg`
- `Add a manifest custom for osm way/116149697 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Pauluskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-pauluskerk.jpg`

---

### `ref-sint-annatunnel` — Match Sint-Annatunnel to its reference photos

**Goal:** Sint-Annatunnel reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Annatunnel
- **osm_id**: 147447606
- **osm_type**: way
- **lat**: 51.219492579999994
- **lon**: 4.39287132
- **xy**: [-514.47, -17.4]
- **wikidata**: Q691988
- **spawn_distance_m**: 614.2
- **ref:photo1**: districts/2000-antwerpen/references/sint-annatunnel/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-annatunnel/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-annatunnel/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-annatunnel/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-annatunnel/01.jpg`
- `Open districts/2000-antwerpen/references/sint-annatunnel/02.jpg`
- `Open districts/2000-antwerpen/references/sint-annatunnel/03.jpg`
- `Open districts/2000-antwerpen/references/sint-annatunnel/04.jpg`
- `Add a manifest custom for osm way/147447606 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Annatunnel** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-annatunnel.jpg`

---

### `ref-sint-jacobskerk` — Match Sint-Jacobskerk to its reference photos

**Goal:** Sint-Jacobskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Jacobskerk
- **osm_id**: 40092556
- **osm_type**: way
- **lat**: 51.220150378231295
- **lon**: 4.410466325170068
- **xy**: [712.32, 55.31]
- **wikidata**: Q1083704
- **spawn_distance_m**: 627.9
- **ref:photo1**: districts/2000-antwerpen/references/sint-jacobskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-jacobskerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-jacobskerk/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-jacobskerk/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-jacobskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-jacobskerk/02.jpg`
- `Open districts/2000-antwerpen/references/sint-jacobskerk/03.jpg`
- `Open districts/2000-antwerpen/references/sint-jacobskerk/04.jpg`
- `Add a manifest custom for osm way/40092556 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Jacobskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-jacobskerk.jpg`

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
- **xy**: [322.36, -774.63]
- **wikidata**: Q2278872
- **spawn_distance_m**: 738.6
- **ref:photo1**: districts/2000-antwerpen/references/sint-joriskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-joriskerk/02.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-joriskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-joriskerk/02.jpg`
- `Add a manifest custom for osm way/232926614 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Joriskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-joriskerk.jpg`

---

### `ref-protestants-evangelische-kerk` — Match Protestants Evangelische kerk to its reference photos

**Goal:** Protestants Evangelische kerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Protestants Evangelische kerk
- **osm_id**: 232933576
- **osm_type**: way
- **lat**: 51.22368363382353
- **lon**: 4.412205295588235
- **xy**: [833.57, 445.88]
- **wikidata**: Q2183335
- **spawn_distance_m**: 902.8
- **ref:photo1**: districts/2000-antwerpen/references/protestants-evangelische-kerk/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/protestants-evangelische-kerk/01.jpg`
- `Add a manifest custom for osm way/232933576 or tune its façade`

**Agent prompt:** Look at every photo for **Protestants Evangelische kerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-protestants-evangelische-kerk.jpg`

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
- **xy**: [865.74, -614.15]
- **wikidata**: Q28530528
- **spawn_distance_m**: 939.5
- **ref:photo1**: districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/01.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/02.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/03.jpg`
- `Open districts/2000-antwerpen/references/onze-lieve-vrouw-van-gratiekerk/04.jpg`
- `Add a manifest custom for osm way/232921429 or tune its façade`

**Agent prompt:** Look at every photo for **Onze-Lieve-Vrouw van Gratiekerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-onze-lieve-vrouw-van-gratiekerk.jpg`

---

### `ref-toegangsgebouw-sint-annatunnel` — Match Toegangsgebouw Sint-Annatunnel to its reference photos

**Goal:** Toegangsgebouw Sint-Annatunnel reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Toegangsgebouw Sint-Annatunnel
- **osm_id**: 60582816
- **osm_type**: way
- **lat**: 51.22067222941176
- **lon**: 4.388319917647059
- **xy**: [-831.81, 113.0]
- **spawn_distance_m**: 947.5
- **ref:photo1**: districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/03.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/01.jpg`
- `Open districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/02.jpg`
- `Open districts/2000-antwerpen/references/toegangsgebouw-sint-annatunnel/03.jpg`
- `Add a manifest custom for osm way/60582816 or tune its façade`

**Agent prompt:** Look at every photo for **Toegangsgebouw Sint-Annatunnel** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-toegangsgebouw-sint-annatunnel.jpg`

---

### `ref-sint-walburgiskerk` — Match Sint-Walburgiskerk to its reference photos

**Goal:** Sint-Walburgiskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Walburgiskerk
- **osm_id**: 233040913
- **osm_type**: way
- **lat**: 51.210403910714284
- **lon**: 4.3959973678571425
- **xy**: [-296.51, -1022.06]
- **wikidata**: Q2686991
- **spawn_distance_m**: 1030.7
- **ref:photo1**: districts/2000-antwerpen/references/sint-walburgiskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-walburgiskerk/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/sint-walburgiskerk/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/sint-walburgiskerk/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-walburgiskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-walburgiskerk/02.jpg`
- `Open districts/2000-antwerpen/references/sint-walburgiskerk/03.jpg`
- `Open districts/2000-antwerpen/references/sint-walburgiskerk/04.jpg`
- `Add a manifest custom for osm way/233040913 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Walburgiskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-walburgiskerk.jpg`

---

### `ref-sint-antoniuskerk` — Match Sint-Antoniuskerk to its reference photos

**Goal:** Sint-Antoniuskerk reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Sint-Antoniuskerk
- **osm_id**: 116481762
- **osm_type**: way
- **lat**: 51.225117468354426
- **lon**: 4.413039793670887
- **xy**: [891.75, 604.37]
- **wikidata**: Q16069295
- **spawn_distance_m**: 1047.1
- **ref:photo1**: districts/2000-antwerpen/references/sint-antoniuskerk/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/sint-antoniuskerk/02.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/sint-antoniuskerk/01.jpg`
- `Open districts/2000-antwerpen/references/sint-antoniuskerk/02.jpg`
- `Add a manifest custom for osm way/116481762 or tune its façade`

**Agent prompt:** Look at every photo for **Sint-Antoniuskerk** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-sint-antoniuskerk.jpg`

---

### `ref-museum-aan-de-stroom` — Match Museum aan de Stroom to its reference photos

**Goal:** Museum aan de Stroom reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Museum aan de Stroom
- **osm_id**: 25364883
- **osm_type**: way
- **lat**: 51.22899653333334
- **lon**: 4.40481
- **xy**: [317.94, 1033.17]
- **wikidata**: Q104723730
- **spawn_distance_m**: 1136.4
- **ref:photo1**: districts/2000-antwerpen/references/museum-aan-de-stroom/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/museum-aan-de-stroom/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/museum-aan-de-stroom/03.jpg
- **ref:photo4**: districts/2000-antwerpen/references/museum-aan-de-stroom/04.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/museum-aan-de-stroom/01.jpg`
- `Open districts/2000-antwerpen/references/museum-aan-de-stroom/02.jpg`
- `Open districts/2000-antwerpen/references/museum-aan-de-stroom/03.jpg`
- `Open districts/2000-antwerpen/references/museum-aan-de-stroom/04.jpg`
- `Add a manifest custom for osm way/25364883 or tune its façade`

**Agent prompt:** Look at every photo for **Museum aan de Stroom** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-museum-aan-de-stroom.jpg`

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
- **xy**: [253.29, -1212.44]
- **wikidata**: Q33100193
- **spawn_distance_m**: 1154.5
- **ref:photo1**: districts/2000-antwerpen/references/gerechtshof/01.jpg
- **ref:photo2**: districts/2000-antwerpen/references/gerechtshof/02.jpg
- **ref:photo3**: districts/2000-antwerpen/references/gerechtshof/03.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/gerechtshof/01.jpg`
- `Open districts/2000-antwerpen/references/gerechtshof/02.jpg`
- `Open districts/2000-antwerpen/references/gerechtshof/03.jpg`
- `Add a manifest custom for osm way/192642420 or tune its façade`

**Agent prompt:** Look at every photo for **Gerechtshof** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-gerechtshof.jpg`

---

### `ref-m-hka-museum-van-hedendaagse-kunst-antwerpen` — Match M HKA - Museum van Hedendaagse Kunst Antwerpen to its reference photos

**Goal:** M HKA - Museum van Hedendaagse Kunst Antwerpen reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: M HKA - Museum van Hedendaagse Kunst Antwerpen
- **osm_id**: 47359481
- **osm_type**: way
- **lat**: 51.211270853225805
- **lon**: 4.3898843080645165
- **xy**: [-722.74, -926.23]
- **wikidata**: Q1573755
- **spawn_distance_m**: 1185.1
- **ref:photo1**: districts/2000-antwerpen/references/m-hka-museum-van-hedendaagse-kunst-antwerpen/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/m-hka-museum-van-hedendaagse-kunst-antwerpen/01.jpg`
- `Add a manifest custom for osm way/47359481 or tune its façade`

**Agent prompt:** Look at every photo for **M HKA - Museum van Hedendaagse Kunst Antwerpen** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-m-hka-museum-van-hedendaagse-kunst-antwerpen.jpg`

---

### `ref-osm-494993846` — Match osm-494993846 to its reference photos

**Goal:** osm-494993846 reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: osm-494993846
- **osm_id**: 494993846
- **osm_type**: way
- **lat**: 51.22679683333333
- **lon**: 4.413888726666666
- **xy**: [950.94, 790.01]
- **wikidata**: Q10669705
- **spawn_distance_m**: 1218.1
- **ref:photo1**: districts/2000-antwerpen/references/osm-494993846/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/osm-494993846/01.jpg`
- `Add a manifest custom for osm way/494993846 or tune its façade`

**Agent prompt:** Look at every photo for **osm-494993846** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-osm-494993846.jpg`

---

### `ref-willemdok` — Match Willemdok to its reference photos

**Goal:** Willemdok reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Willemdok
- **osm_id**: 44100103
- **osm_type**: way
- **lat**: 51.22938634166667
- **lon**: 4.4078615333333335
- **xy**: [530.7, 1076.26]
- **wikidata**: Q2365563
- **spawn_distance_m**: 1236.4
- **ref:photo1**: districts/2000-antwerpen/references/willemdok/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/willemdok/01.jpg`
- `Add a manifest custom for osm way/44100103 or tune its façade`

**Agent prompt:** Look at every photo for **Willemdok** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-willemdok.jpg`

---

### `ref-kattendijkdok` — Match Kattendijkdok to its reference photos

**Goal:** Kattendijkdok reads like the real building from the street: silhouette, proportions, materials, colour, openings and orientation agree with the photos.

**Acceptance:** Side-by-side proof (street render from a matching viewpoint next to a reference) shows the same massing and front; differences you chose to keep are listed in the proof note.

**Geo / context:**
- **name**: Kattendijkdok
- **osm_id**: 319261272
- **osm_type**: way
- **lat**: 51.23765233493976
- **lon**: 4.406202512650602
- **xy**: [415.03, 1989.98]
- **wikidata**: Q1809382
- **spawn_distance_m**: 2101.4
- **ref:photo1**: districts/2000-antwerpen/references/kattendijkdok/01.jpg

**Commands:**
- `Open districts/2000-antwerpen/references/kattendijkdok/01.jpg`
- `Add a manifest custom for osm way/319261272 or tune its façade`

**Agent prompt:** Look at every photo for **Kattendijkdok** first (they are Wikimedia Commons, authors in `districts/2000-antwerpen/references/index.json`). Note which side faces which street, tower / gable positions, storey count, window rhythm, roof shape and the dominant stone / brick colours. Then render the current model from the same viewpoint and fix the largest mismatch first.

Status: [ ] todo
Proof: `review/proofs/ref-kattendijkdok.jpg`

---

### `ref-shopfronts` — Shopfronts that look like the real places

**Goal:** Every shop / bar / restaurant with a reference photo has a shop_overrides.json entry so its fascia colour, lettering, frame, awning and front type match the photo.

**Acceptance:** 32 referenced places; each has an override (now 7 shops carry one) and a walk proof of the busiest street shows them.

**Geo / context:**
```json
{
  "referenced": [
    {
      "name": "Da Giovanni",
      "osm": "node/2141153942",
      "category": "restaurant",
      "photos": [],
      "links": {
        "mapillary": "https://www.mapillary.com/app/?pKey=195886575686132&focus=photo",
        "website": "https://www.dagiovanni.be"
      }
    },
    {
      "name": "La Torre",
      "osm": "node/3025995007",
      "category": "restaurant",
      "photos": [],
      "links": {
        "mapillary": "https://www.mapillary.com/app/?pKey=1153238661806244&focus=photo"
      }
    },
    {
      "name": "Bij Lam en Yin",
      "osm": "node/5287315414",
      "category": "restaurant",
      "photos": [
        "districts/2000-antwerpen/references/bij-lam-en-yin/01.jpg"
      ],
      "links": {
        "website": "https://lam-en-yin.be/"
      }
    },
    {
      "name": "Nello",
      "osm": "node/6179181376",
      "category": "chocolate",
      "photos": [
        "districts/2000-antwerpen/references/nello/01.jpg",
        "districts/2000-antwerpen/references/nello/02.jpg"
      ],
      "links": {
        "website": "https://www.chocolatesnello.be"
      }
    },
    {
      "name": "G. Bastin",
      "osm": "node/6679841673",
      "category": "deli",
      "photos": [
        "districts/2000-antwerpen/references/g-bastin/01.jpg"
      ],
      "links": {
        "website": "https://www.g-bastin.com"
      }
    },
    {
      "name": "Vrijdagmarkt",
      "osm": "node/6321736486",
      "category": "marketplace",
      "photos": [
        "districts/2000-antwerpen/references/vrijdagmarkt/01.jpg",
        "districts/2000-antwerpen/references/vrijdagmarkt/02.jpg"
      ],
      "links": {}
    },
    {
      "name": "Erfgoedbibliotheek Hendrik Conscience",
      "osm": "node/247670999",
      "category": "library",
      "photos": [
        "districts/2000-antwerpen/references/erfgoedbibliotheek-hendrik-conscience/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "Erfgoedbibliotheek Hendrik Conscience",
      "osm": "way/496295625",
      "category": "library",
      "photos": [
        "districts/2000-antwerpen/references/erfgoedbibliotheek-hendrik-conscience-496295625/01.jpg",
        "districts/2000-antwerpen/references/erfgoedbibliotheek-hendrik-conscience-496295625/02.jpg"
      ],
      "links": {}
    },
    {
      "name": "Caffe Mundi",
      "osm": "node/5123359322",
      "category": "cafe",
      "photos": [],
      "links": {
        "mapillary": "https://www.mapillary.com/app/?pKey=2925677674372611&focus=photo",
        "website": "https://www.caffemundi.be/"
      }
    },
    {
      "name": "Demian",
      "osm": "node/13026212324",
      "category": "books",
      "photos": [
        "districts/2000-antwerpen/references/demian/01.jpg"
      ],
      "links": {
        "website": "https://www.demian.be/"
      }
    },
    {
      "name": "Den Engel",
      "osm": "node/2405486929",
      "category": "pub",
      "photos": [
        "districts/2000-antwerpen/references/den-engel/01.jpg"
      ],
      "links": {
        "website": "https://www.cafedenengel.be"
      }
    },
    {
      "name": "Amadeus",
      "osm": "node/2405529832",
      "category": "restaurant",
      "photos": [
        "districts/2000-antwerpen/references/amadeus/01.jpg"
      ],
      "links": {
        "website": "http://amadeus-resto.be"
      }
    },
    {
      "name": "Caf\u00e9 Beveren",
      "osm": "node/5921427377",
      "category": "pub",
      "photos": [
        "districts/2000-antwerpen/references/cafe-beveren/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "Cartoon's",
      "osm": "node/1087916196",
      "category": "cinema",
      "photos": [
        "districts/2000-antwerpen/references/cartoon-s/01.jpg"
      ],
      "links": {
        "website": "https://cinemacartoons.be"
      }
    },
    {
      "name": "Poppentheater De Poesje",
      "osm": "node/2405454345",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/poppentheater-de-poesje/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "Rituals",
      "osm": "node/11114411509",
      "category": "cosmetics",
      "photos": [
        "districts/2000-antwerpen/references/rituals/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "Arenbergschouwburg",
      "osm": "node/1121941451",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/arenbergschouwburg/01.jpg"
      ],
      "links": {
        "website": "https://www.arenbergschouwburg.be/"
      }
    },
    {
      "name": "Horta Grand Caf\u00e9",
      "osm": "node/2367581654",
      "category": "restaurant",
      "photos": [
        "districts/2000-antwerpen/references/horta-grand-cafe/01.jpg",
        "districts/2000-antwerpen/references/horta-grand-cafe/02.jpg"
      ],
      "links": {
        "website": "https://www.grandcafehorta.be/"
      }
    },
    {
      "name": "DE Studio",
      "osm": "node/4809730099",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/de-studio/01.jpg",
        "districts/2000-antwerpen/references/de-studio/02.jpg"
      ],
      "links": {
        "website": "https://www.destudio.com/"
      }
    },
    {
      "name": "Stadsschouwburg",
      "osm": "way/33181245",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/stadsschouwburg/01.jpg",
        "districts/2000-antwerpen/references/stadsschouwburg/02.jpg"
      ],
      "links": {}
    },
    {
      "name": "Shopping Stadsfeestzaal",
      "osm": "way/59621992",
      "category": "mall",
      "photos": [
        "districts/2000-antwerpen/references/shopping-stadsfeestzaal/01.jpg"
      ],
      "links": {
        "website": "https://stadsfeestzaal.com"
      }
    },
    {
      "name": "Theater Klokhuis",
      "osm": "node/1297671034",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/theater-klokhuis/01.jpg",
        "districts/2000-antwerpen/references/theater-klokhuis/02.jpg"
      ],
      "links": {
        "website": "https://www.vlaamsfruit.be"
      }
    },
    {
      "name": "Cargo Club",
      "osm": "node/4756142221",
      "category": "nightclub",
      "photos": [
        "districts/2000-antwerpen/references/cargo-club/01.jpg"
      ],
      "links": {
        "website": "http://www.cargoclub.be"
      }
    },
    {
      "name": "America Today",
      "osm": "node/11114411511",
      "category": "clothes",
      "photos": [
        "districts/2000-antwerpen/references/america-today/01.jpg"
      ],
      "links": {
        "website": "https://www.america-today.com/nl-be"
      }
    },
    {
      "name": "Hessenhuis",
      "osm": "node/7691415282",
      "category": "bar",
      "photos": [
        "districts/2000-antwerpen/references/hessenhuis/01.jpg",
        "districts/2000-antwerpen/references/hessenhuis/02.jpg"
      ],
      "links": {
        "website": "https://www.hessenhuis.be/"
      }
    },
    {
      "name": "Elckerlyc",
      "osm": "node/7414968424",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/elckerlyc/01.jpg"
      ],
      "links": {
        "website": "https://www.elckerlyc.be"
      }
    },
    {
      "name": "Vlaamse Opera",
      "osm": "way/40101547",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/vlaamse-opera/01.jpg"
      ],
      "links": {
        "mapillary": "https://www.mapillary.com/app/?pKey=1871739109674664&focus=photo"
      }
    },
    {
      "name": "UGC",
      "osm": "node/247528899",
      "category": "cinema",
      "photos": [
        "districts/2000-antwerpen/references/ugc/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "'t Zilte",
      "osm": "node/4838819307",
      "category": "restaurant",
      "photos": [
        "districts/2000-antwerpen/references/t-zilte/01.jpg"
      ],
      "links": {
        "website": "https://www.zilte.be/"
      }
    },
    {
      "name": "Chatleroi",
      "osm": "node/1858262840",
      "category": "pub",
      "photos": [
        "districts/2000-antwerpen/references/chatleroi/01.jpg"
      ],
      "links": {}
    },
    {
      "name": "Djingel Djangel",
      "osm": "node/4922022152",
      "category": "music",
      "photos": [
        "districts/2000-antwerpen/references/djingel-djangel/01.jpg"
      ],
      "links": {
        "website": "https://djingeldjangel.be"
      }
    },
    {
      "name": "FROE FROE",
      "osm": "node/1618702910",
      "category": "theatre",
      "photos": [
        "districts/2000-antwerpen/references/froe-froe/01.jpg"
      ],
      "links": {
        "website": "https://www.froefroe.be"
      }
    }
  ]
}
```

**Commands:**
- `Open districts/2000-antwerpen/references/index.html`
- `Edit districts/2000-antwerpen/shop_overrides.json`
- `python -m cityview district build 2000-antwerpen --skip-blender`

**Agent prompt:** For each referenced place open its photo (or Mapillary link) and write a `by_osm` override: fascia = board colour, accent = lettering colour, frame = window joinery, front = archetype (boutique / bar / cafe / restaurant / bakery / chocolatier / heritage / market / frituur / fastfood / bank / pharmacy / office), awning = {colour, stripe} or false, terrace. Skip photos that show an interior or a different object (statue, logo) — note them instead.

Status: [ ] todo
Proof: `review/proofs/ref-shopfronts.jpg`

---
