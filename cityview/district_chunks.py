"""Spatial city chunk classification for district GLB streaming.

Pure helpers (no Blender) so unit tests and the Blender peel share one policy.
Outer meshes are peeled into ``chunks/c_{ix}_{iy}.glb``; the spawn neighbourhood
stays in ``core.glb``. Every district build writes ``chunks.json``.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Iterable

CELL_M = 256.0
# Spawn neighbourhood in core.glb (first paint). Keep this tight so Pages loads
# fast; cells beyond stream in as you walk (see viewer/chunk-stream.js).
CORE_R = 160.0

# Always stay in the core GLB: roads/ground must be present for first paint and
# district-wide merges cannot be attributed to a single cell.
ALWAYS_CORE_PREFIXES = (
    "road_",
    "sidewalk_",
    "curb_",
    "tram_",
    "rail_",
    "ground_",
    "park_",
    "water_",
    "HumanSpawn",
    "StreetCam",
    "CityCam",
    "lmhold_",
    "rooftop_",
    "skirt",
)


def cell_index(x: float, y: float, cell_m: float = CELL_M) -> tuple[int, int]:
    """Grid indices for Blender XY (floor division)."""
    c = float(cell_m) or CELL_M
    return (math.floor(x / c), math.floor(y / c))


def cell_centre(ix: int, iy: int, cell_m: float = CELL_M) -> tuple[float, float]:
    c = float(cell_m) or CELL_M
    return ((ix + 0.5) * c, (iy + 0.5) * c)


def is_always_core_name(name: str) -> bool:
    n = name or ""
    return any(n.startswith(p) for p in ALWAYS_CORE_PREFIXES)


def assign_object(
    name: str,
    x: float,
    y: float,
    *,
    spawn_xy: tuple[float, float] | None,
    cell_m: float = CELL_M,
    core_r: float = CORE_R,
) -> str | tuple[int, int]:
    """Return ``\"core\"`` or ``(ix, iy)`` for an outer cell."""
    if is_always_core_name(name):
        return "core"
    if spawn_xy is not None:
        if math.hypot(x - spawn_xy[0], y - spawn_xy[1]) <= core_r:
            return "core"
    return cell_index(x, y, cell_m)


def build_chunks_manifest(
    cells: Iterable[tuple[int, int]],
    *,
    cell_m: float = CELL_M,
    core_r: float = CORE_R,
    core_file: str = "core.glb",
) -> dict[str, Any]:
    """Manifest written next to core.glb / chunks/."""
    chunks = []
    for ix, iy in sorted(set(cells)):
        cx, cy = cell_centre(ix, iy, cell_m)
        cid = f"c_{ix}_{iy}"
        chunks.append(
            {
                "id": cid,
                "file": f"chunks/{cid}.glb",
                "ix": ix,
                "iy": iy,
                "cx": round(cx, 3),
                "cy": round(cy, 3),
            }
        )
    return {
        "cell_m": cell_m,
        "core_r": core_r,
        "core": core_file,
        "chunks": chunks,
    }


def write_chunks_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def empty_chunks_manifest(
    *,
    cell_m: float = CELL_M,
    core_r: float = CORE_R,
    core_file: str = "core.glb",
) -> dict[str, Any]:
    return build_chunks_manifest([], cell_m=cell_m, core_r=core_r, core_file=core_file)
