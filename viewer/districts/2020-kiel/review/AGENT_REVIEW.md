# Agent review — 't Kiel · 2020

- **District**: `2020-kiel`
- **Run**: `20261014T123809Z`
- **Spawn**: Kielpark (51.1918, 4.3925)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2020-kiel/special_buildings.json`
- **Catalog**: `viewer/districts/2020-kiel/buildings/catalog.html`

Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.

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
