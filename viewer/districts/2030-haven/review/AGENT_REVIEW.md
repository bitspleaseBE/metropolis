# Agent review — Haven · 2030

- **District**: `2030-haven`
- **Run**: `20261014T131029Z`
- **Spawn**: Havenhuis (51.2386, 4.4036)
- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)
- **Dossier**: `districts/2030-haven/special_buildings.json`
- **Catalog**: `viewer/districts/2030-haven/buildings/catalog.html`

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
