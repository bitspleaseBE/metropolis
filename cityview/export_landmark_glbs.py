"""Export missing custom landmark GLBs from kits (offline, no Blender)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cityview.districts import district_paths
from cityview.landmark_models import build_landmark, build_node_landmark
from cityview.landmarks import attach_custom_landmark, landmark_nodes, load_manifest
from cityview.mesh_glb import write_mesh_glb


def export_missing_landmark_glbs(
    district_id: str,
    layout: dict[str, Any] | None = None,
    *,
    force: bool = False,
) -> list[Path]:
    """Write viewer/districts/<id>/landmarks/<osm-id>.glb for customs missing on disk."""
    paths = district_paths(district_id)
    dest_dir = paths.viewer_landmarks
    dest_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    doc = json.loads(paths.district_json.read_text()) if paths.district_json.exists() else {}
    origin = tuple(doc.get("origin") or (0.0, 0.0))

    if layout is None:
        for cand in (
            Path("output") / f"district_{district_id.replace('-', '_')}_layout.json",
            paths.viewer / "buildings.json",
        ):
            if cand.exists():
                layout = json.loads(cand.read_text())
                break
    layout = layout or {"buildings": [], "landmark_nodes": []}

    import cityview.landmarks as lm

    lm.MANIFEST_PATH = paths.landmarks_manifest
    lm.clear_manifest_cache()
    manifest = load_manifest()

    layout["landmark_nodes"] = landmark_nodes({}, origin, manifest)

    for bldg in layout.get("buildings") or []:
        attach_custom_landmark(bldg, manifest, origin)
        if not (bldg.get("landmark") or {}).get("custom"):
            continue
        lid = str(bldg.get("id"))
        out = dest_dir / f"{lid}.glb"
        if out.exists() and not force:
            continue
        mesh = build_landmark(bldg)
        if mesh is None:
            continue
        write_mesh_glb(mesh, out)
        written.append(out)
        print(f"Exported landmark GLB {out}")

    for node in layout.get("landmark_nodes") or []:
        lid = str(node.get("id"))
        out = dest_dir / f"{lid}.glb"
        if out.exists() and not force:
            continue
        mesh = build_node_landmark(node)
        if mesh is None:
            continue
        write_mesh_glb(mesh, out)
        written.append(out)
        print(f"Exported node landmark GLB {out}")

    return written
