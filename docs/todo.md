# Landmark model backlog

Hand-modelled (or kit-built) buildings that should replace the generic LOD2 / atlas shell. One building per agent turn. Pipeline overview: [city-pipeline.md](city-pipeline.md). District review pack: [district-agent.md](district-agent.md).

## How a Blender / landmark agent picks this up

### 0. Rules

- Edit **one** district at a time. Package paths are `districts/<id>/…` and `viewer/districts/<id>/…`.
- Pick the highest open **P0**, then **P1**, in that district. Mark it `[~]` in this file while you work; `[x]` when done.
- Do **not** invent a new footprint. Use the OSM way / relation id in the row. Confirm the ring in `viewer/districts/<id>/buildings/catalog.html` or the layout JSON.
- Prefer a **Python kit builder** (no `bpy` in the builder). Blender is for reference, proportions, and optional one-off GLB export — the durable source of truth is the kit so `district build` / `export_missing_landmark_glbs` can regenerate the mesh.
- Custom meshes never get a photo façade. Photos are reference only (`districts/<id>/references/`, Commons, Wikidata).
- Stay inside the triangle budget you register on `TRI_BUDGET` (see peers in `cityview/landmark_models.py`). Typical church 35–50k, civic 40–80k, house 6–15k, node monument ≤3k.

### 1. Gather context (do this before modelling)

```bash
# Review pack + catalog
python3 -m cityview district review <id>
open viewer/districts/<id>/buildings/catalog.html

# Picture pack (thumbs may be gitignored; index.html is the contact sheet)
python3 -m cityview district refs <id>
open districts/<id>/references/index.html
```

Also open:

| What | Where |
|------|--------|
| Manifest (authoritative) | `districts/<id>/landmarks/manifest.json` |
| Dossier scores / OSM ids | `districts/<id>/special_buildings.json` |
| Existing builders | `cityview/landmark_models.py`, `landmark_civic.py`, `landmark_facades.py`, `landmark_grote_markt.py` |
| Walker proof | `http://127.0.0.1:8771/?district=<id>&at=<lat>,<lon>,<yaw>` |

Suggested yaw: face the main façade. Local metres are east/north from `district.json` `origin`; Three.js `z = −y`.

### 2. Register the building

Edit **this district’s** manifest (`districts/<id>/landmarks/manifest.json`), not `assets/landmarks/manifest.json` unless the kit is shared on purpose.

**Full custom** (recognisable silhouette — station, MAS, Stadhuis, named house):

```json
"24029676": {
  "id": "24029676",
  "name": "Centraal Station",
  "kind": "civic",
  "custom": "centraal_station",
  "anchor": [51.2171, 4.4211],
  "height_m": 40.0,
  "roof_height_m": 12.0,
  "roof_shape": "gabled",
  "source_url": "https://commons.wikimedia.org/wiki/…",
  "attribution": "…"
}
```

`anchor` = front door / main entrance `[lat, lon]`. Relation ids stay as the relation id.

**Church massing only** (generic kit is enough — tower/spire preset, no unique builder):

```json
"501410385": {
  "id": "501410385",
  "name": "Heilige Geestkerk",
  "kind": "church",
  "massing": "neo_romanesque_tower_left",
  "anchor": [51.2058, 4.4107]
}
```

Known massing presets (church kit in Blender / `cityview/landmarks.py`): `church_default`, `neo_gothic_tower_left`, `neo_romanesque_tower_left`, `hospital_default`. Prefer massing for ordinary parish churches; use `custom` when the skyline must match a postcard (cathedral, basilica, Centraal dome, Carolus Borromeus façade, MAS stack).

**Free-standing node** (fountain, statue — not a building way): put under `nodes` and add a `NODE_BUILDERS` entry.

If the dossier should always list this building, add `expected_custom` in `cityview/special_buildings.py` (2000 civic list is the pattern).

### 3. Build the mesh

**Preferred — Python kit**

1. Add `build_<slug>(ring, holes, entry) -> landmark_kit.Mesh` in the right module:

   | Kind | Module |
   |------|--------|
   | Neighbourhood houses, kiosks, gates | `cityview/landmark_models.py` |
   | Shared church / civic façade frames | `cityview/landmark_facades.py` |
   | One-off civic (cathedral, Stadhuis, station, MAS) | `cityview/landmark_civic.py` |
   | Grote Markt guild row | `cityview/landmark_grote_markt.py` |

2. Register on `BUILDERS` / `NODE_BUILDERS` and `TRI_BUDGET`.
3. Use `landmark_kit`: `extrude_ring`, `Frame` from `anchor`, tiling materials (`brick`, `stone_grey`, `slate`, `zinc`, …). Look at `build_stadhuis` or `build_albertpark_kiosk` before inventing primitives.
4. Export:

```bash
python3 -c "from cityview.export_landmark_glbs import export_missing_landmark_glbs; export_missing_landmark_glbs('<id>', force=True)"
```

Output: `viewer/districts/<id>/landmarks/<osm-id>.glb`.

**Optional — Blender as authoring tool**

Use Blender (MCP or local) to block out volumes against the OSM ring and reference photos. Then either:

- translate the result into a Python kit (above), **or**
- export a GLB to `viewer/districts/<id>/landmarks/<osm-id>.glb` **and** still add a kit builder that regenerates an equivalent mesh so the next rebuild does not depend on a one-off file.

Do not leave a hand GLB without a manifest `custom` key — the walker will keep the LOD2 shell.

Units: metres. Origin: district origin. The streamed GLB is already in world metres; do not bake a second offset.

### 4. Definition of done

- [ ] Manifest entry with correct OSM id + `custom` or `massing` + `anchor`
- [ ] Builder registered (customs) with `TRI_BUDGET`; unit test green (`cityview/test_landmark_models.py`)
- [ ] GLB present at `viewer/districts/<id>/landmarks/<osm-id>.glb`
- [ ] Walker: approach from spawn / nearby street; silhouette readable; no float / sink; door on the `anchor` edge
- [ ] Proof still under `districts/<id>/review/proofs/<slug>.jpg` (or png)
- [ ] Checks:

```bash
python3 -m cityview district review <id>
python3 -m cityview district check <id> --no-sims
```

- [ ] This backlog row marked `[x]` with the `custom` / `massing` slug you shipped

A full `district build` is only required if the LOD2 shell must be suppressed in core/chunks; streaming the landmark GLB is enough for most customs. Use `--skip-blender` when only JSON / landmark index changed.

---

## Status legend

| Mark | Meaning |
|------|---------|
| `[ ]` | Not started |
| `[~]` | In progress (one agent only) |
| `[x]` | Shipped (manifest + GLB + proof) |
| `massing` | Church/hospital kit preset — no unique builder |
| `custom` | Named kit builder required |

---

## Already shipped (do not redo)

### 2000-antwerpen — customs on disk (55 GLBs)

Cathedral `olv_cathedral` (26495164), Stadhuis `stadhuis` (22966134), Het Steen `het_steen` (29067925), Brabo fountain node `brabo_fountain` (900000001), Grote Markt guild row + Hansahuis (`guild_house` / `hansahuis`).

### 2018-harmonie — customs on disk (12 GLBs)

Bonifacius, Feestzaal Harmonie, ZAS Vincentius, Albertpark kiosk, Gulden Spoor + gate, Harmonie koetshuis, Benoit 34/38/40, Art Deco MS123, Benoit monument.

**Manifest customs still missing a GLB** (finish these before new P1 churches):

| Status | OSM | Name | Slug |
|--------|-----|------|------|
| `[ ]` | 353285592 | Basiliek van het Heilig Hart | `heilig_hart` (builder exists) |
| `[x]` | 12470557 | Nationale Bank van België | `nationale_bank` LOD3 (2000+2018 stream; LOD2 shells removed) |
| `[ ]` | 432190363 | Klooster van het Heilig Hart | `heilig_hart_klooster` (builder exists) |
| `[ ]` | 501410385 | Heilige Geestkerk | massing `neo_romanesque_tower_left` |
| `[ ]` | 780448684 | AZ Monica Antwerpen | massing `hospital_default` |

Export with `export_missing_landmark_glbs('2018-harmonie', force=True)` after confirming layout JSON exists.

---

## Backlog by district

Priorities: **P0** = skyline / postcard from spawn or main approach; **P1** = strong local landmark; **P2** = nice-to-have / massing-only church.

### 2000-antwerpen

Spawn: Grote Markt · Kathedraal. Core already has cathedral, Stadhuis, Steen, Brabo, guild houses.

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 25364883 | Museum aan de Stroom (MAS) | `custom: mas` | Stacked box museum on the Eilandje. Wikidata Q104723730. Not yet in special_buildings dossier — add expected_custom when registering. |
| `[ ]` | P0 | way 40102689 | Boerentoren | `custom: boerentoren` | Historic high-rise on the Meir / Schoenmarkt. Wikidata Q59487. |
| `[ ]` | P0 | relation 902468 | Paleis op de Meir | `custom: paleis_op_de_meir` | Royal town palace; dossier score high. Wikidata Q775797. Confirm relation ring in layout. |
| `[ ]` | P0 | way 39886923 | Sint-Carolus Borromeuskerk | `custom: carolus_borromeus` or strong massing | Baroque façade on the Conscienceplein — must read from the square. Wikidata Q1415440. |
| `[ ]` | P1 | way 116149697 | Sint-Pauluskerk | `custom` or massing | North of Groenplaats / Veemarkt. Wikidata Q2272511. |
| `[ ]` | P1 | way 40092556 | Sint-Jacobskerk | `custom` or massing | Large Gothic parish; tower matters on the skyline. Wikidata Q1083704. |
| `[ ]` | P1 | way 232914449 | Sint-Andrieskerk | massing ok | Wikidata Q2802159. |
| `[ ]` | P1 | way 25047062 | Bourlaschouwburg | `custom: bourla` | Round theatre. Wikidata Q2154112. |
| `[ ]` | P1 | way 39889176 | Handelsbeurs | `custom: handelsbeurs` | Wikidata Q2127864. |
| `[ ]` | P1 | relation 919315 / way 1411265135 | Rubenshuis | `custom: rubenshuis` | Prefer the relation if the layout uses it. Wikidata Q775644. |
| `[ ]` | P1 | way 179882624 | Vleeshuis | `custom: vleeshuis` | Late Gothic meat hall. Wikidata Q2801959. |
| `[ ]` | P1 | relation 3428464 | Plantin-Moretusmuseum | `custom: plantin_moretus` | UNESCO courtyard block. Wikidata Q595802. |
| `[ ]` | P1 | way 203141347 | Sint-Felix pakhuis | `custom: felix_pakhuis` | Warehouse / city archive. Wikidata Q33100130. |
| `[ ]` | P1 | way 1093070549 | Red Star Line Museum | `custom: red_star_line` | Wikidata Q23090950. |
| `[ ]` | P1 | way 47359481 | M HKA | `custom: mhka` | Contemporary art; southern quay. Wikidata Q1573755. |
| `[ ]` | P2 | way 232926614 | Sint-Joriskerk | massing | Wikidata Q2278872. |
| `[ ]` | P2 | way 233040913 | Sint-Walburgiskerk | massing | Wikidata Q2686991. |
| `[ ]` | P2 | way 192642420 | Gerechtshof | `custom` or civic shell | Shared with 2018 edge — register in the district that owns the footprint. |

### 2018-harmonie

Spawn: Stadspark. Finish missing GLBs in “Already shipped” first.

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 24029676 | Centraal Station | `custom: centraal_station` | Stone dome + terminal wings. Wikidata Q800398. Dossier lists it here; footprint sits on the 2018/2060 edge — confirm `boundary_local` before registering. |
| `[ ]` | P0 | way 5088713 | Zoo Antwerpen (entrance / street wall) | `custom: zoo_entrance` | Full zoo is a park polygon; model the **De Keyserlei / Koningin Astridplein** entrance block the walker sees, not every pavilion. Wikidata Q220003. |
| `[ ]` | P1 | way 118248178 | Sint-Laurentiuskerk | massing or `custom` | Wikidata Q28499944. |
| `[ ]` | P1 | way 121677048 | Christus’ Geboortekerk | massing | Wikidata Q2375157. |
| `[ ]` | P1 | way 500730746 | Hoofdsynagoge Machsiké Hadass | `custom: synagoge_machsike_hadass` | Distinct dome. Wikidata Q2049516. |
| `[ ]` | P1 | way 500458171 | Sint-Dominicuskerk | massing | Now events venue. Wikidata Q107316398. |
| `[ ]` | P1 | way 5991613 | deSingel | `custom: desingel` | Large cultural complex — simplify volumes. Wikidata Q775025. |
| `[ ]` | P2 | way 60781377 | Sint-Norbertuskerk | massing | Wikidata Q2006109. |
| `[ ]` | P2 | way 222816084 | Vlaamse Evangelische kerk | massing | Wikidata Q28515913. |
| `[ ]` | P2 | node memorials in Stadspark | Congo / Van Beers / war memorials | `nodes` + small `NODE_BUILDERS` | Only if spawn walk needs them; keep ≤3k tris. |

### 2020-kiel

No landmark GLBs yet. Create `districts/2020-kiel/landmarks/manifest.json` on first registration.

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 205538785 | Christus Koningkerk | `custom` or strong massing | District skyline church. Wikidata Q4421168. |
| `[ ]` | P0 | way 449740906 | Maison Guiette | `custom: maison_guiette` | Le Corbusier — must not look like a row house. Wikidata Q23707656. |
| `[ ]` | P1 | way 205847345 | B.P.-building | `custom: bp_building` | Modernist office. Wikidata Q56558294. |
| `[ ]` | P1 | way 231139349 | Braempaviljoen | `custom: braempaviljoen` | Middelheim. Wikidata Q27681118. |
| `[ ]` | P1 | way 219268446 | Den Brandt | `custom` or castle massing | Historic castle in park. |
| `[ ]` | P1 | way 208485300 | Sint-Catharinakerk | massing | Wikidata Q107348116. |
| `[ ]` | P2 | way 311605502 | Onze-Lieve-Vrouwekapel | massing / small chapel | Wayside chapel. |

### 2030-haven

Standalone port tile. No landmark GLBs yet.

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 791129416 (confirm siblings) | Havenhuis | `custom: havenhuis` | Zaha Hadid port house — the one building everyone recognises. Several OSM ways share the name; pick the main mass that matches the LOD2 footprint and note siblings in the manifest `notes`. |
| `[ ]` | P1 | way 124895085 | Onze-Lieve-Vrouw-Boodschapkerk | massing or `custom` | Wikidata Q107338975. |
| `[ ]` | P1 | way 790981331 | Sint-Jan-de-Doperkerk | massing | Wikidata Q74042824. |
| `[ ]` | P1 | way 172349724 | Kerktoren Sint-Laurentiuskerk | `custom: laurentius_toren` | Surviving tower only. Wikidata Q107094054. |
| `[ ]` | P1 | way 25217579 | Hogere Zeevaartschool | `custom` or civic | Wikidata Q2262236. |
| `[ ]` | P2 | way 23374043 | Schouwburg Luchtbal | `custom` or hall | Wikidata Q33100223. |
| `[ ]` | P2 | fort / lock masses | Fort Sint-Filips, Kattendijksluis | optional | Only if the walker route goes there; otherwise leave LOD2. |

### 2050-linkeroever

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 60582816 | Toegangsgebouw Sint-Annatunnel | `custom: sint_anna_tunnel_entrance` | Circular Art Deco pavilion — district icon. |
| `[ ]` | P0 | way 29415713 | Sint-Anna-ten-Drieënkerk | massing or `custom` | Wikidata Q109450253. |
| `[ ]` | P1 | way 199418023 | Molen van Sint-Anneke | `custom: molen_sint_anneke` | Windmill. Wikidata Q5207718. |
| `[ ]` | P1 | way 29084511 | Sint-Lucaskerk | massing | Wikidata Q107070798. |
| `[ ]` | P2 | way 180051361 | OLV-ter-Scheldekapel | massing | |
| `[ ]` | P2 | way 675487881 | Sint-Petruskapel | massing | |

### 2060-noord

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 23634249 | AFAS Dome (Sportpaleis) | `custom: afas_dome` | Arena roof — simplify. Wikidata Q731520. |
| `[ ]` | P0 | way 32134683 | Sint-Willibrorduskerk | massing or `custom` | Wikidata Q28525954. |
| `[ ]` | P1 | way 230505309 | Sint-Amanduskerk | massing | Wikidata Q2654106. |
| `[ ]` | P1 | way 230505310 | Sint-Eligiuskerk | massing | Wikidata Q28530544. |
| `[ ]` | P1 | way 501390581 | Sint-Lambertuskerk | massing | Wikidata Q107348115. |
| `[ ]` | P1 | relation/way Koninklijk Atheneum | `custom` or school shell | Dossier osm 226933 — confirm type/id in OSM cache before registering. Wikidata Q33100553. |
| `[ ]` | P2 | way 489256648 | Heilig-Hartkerk | massing | Wikidata Q107348113. |
| `[ ]` | P2 | way 507365210 | Panamarenkohuis | `custom: panamarenkohuis` | Wikidata Q110042867. |

If Centraal Station’s footprint falls inside 2060’s postcode ring, move that P0 row here and remove it from 2018.

### 2140-borgerhout

| Status | Pri | OSM | Name | Path | Notes |
|--------|-----|-----|------|------|-------|
| `[ ]` | P0 | way 232885950 | Onze-Lieve-Vrouw-ter-Sneeuwkerk | `custom` or strong massing | Highest dossier score in the district. Wikidata Q78598936. |
| `[ ]` | P0 | way 231253620 | Districtshuis Borgerhout | `custom: districtshuis_borgerhout` | Town hall on the Reuzenpijp / Turnhoutsebaan. Wikidata Q19974050. |
| `[ ]` | P0 | way 453587861 | De Roma | `custom: de_roma` | Concert hall façade. Wikidata Q2592022. |
| `[ ]` | P1 | way 45195770 | OLV van het Heilig Hartkerk | massing | Wikidata Q28527914. |
| `[ ]` | P1 | way 231253621 | Heilige Familie en Sint-Corneliuskerk | massing | Wikidata Q14630906. |
| `[ ]` | P1 | way 44682733 | Xaveriuskerk | massing | Wikidata Q28526200. |
| `[ ]` | P1 | way 507931085 | Sint-Annakerk | massing | Wikidata Q107316409. |
| `[ ]` | P1 | node 5195941594 | De-Koepel moskee | `custom: de_koepel` | Dome reads from the street. Wikidata Q18039995. |
| `[ ]` | P2 | way 109754256 | Sint-Janskerk | massing | Wikidata Q78598959. |

---

## Out of scope (do not turn into building customs)

- Street / tram / fietsroute rows that leaked into `special_buildings.json`
- Park polygons as a whole (Stadspark, Nachtegalenpark, Rivierenhof) — model a **pavilion or entrance**, not the park
- Docks, locks, and bridges unless the walker path requires a recognisable prop (prefer port props / barrier systems)
- Statues and war memorials unless spawn-adjacent (use `nodes`, tiny budget)
- Replacing every parish church with a unique builder — massing presets exist for a reason

---

## Maintaining this file

When you ship a building: flip `[ ]` → `[x]`, write the final `custom` / `massing` slug, and drop a one-line note if the OSM id changed. When you discover a postcard building missing here, add a row with OSM id, district, and pri — do not start modelling without an OSM id and district home.
