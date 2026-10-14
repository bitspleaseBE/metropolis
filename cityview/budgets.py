"""Size / triangle budgets for district viewer packages (core.glb + chunks/*.glb).

Reads only the GLB JSON chunk (works on Meshopt-compressed files: accessor counts
stay in the JSON), so the check is cheap enough for every ``district check``.
Instanced meshes (``EXT_mesh_gpu_instancing``) count once per instance.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

CORE_MAX_MB = 80.0
# ~5.5 MB of each dense chunk is the district's shared façade textures, embedded per chunk.
CHUNK_MAX_MB = 13.0
CORE_MAX_TRIS = 3_000_000
CHUNK_MAX_TRIS = 900_000

_TRIANGLE_MODES = {4: 1, 5: 2, 6: 2}  # TRIANGLES, STRIP, FAN (strip/fan: n - 2)


def glb_json(path: Path) -> dict[str, Any]:
    with open(path, "rb") as fh:
        head = fh.read(20)
        if len(head) < 20 or head[:4] != b"glTF":
            raise ValueError(f"{path} is not a GLB")
        length, kind = struct.unpack("<I4s", head[12:20])
        if kind != b"JSON":
            raise ValueError(f"{path}: first chunk is not JSON")
        return json.loads(fh.read(length))


def _primitive_tris(doc: dict[str, Any], prim: dict[str, Any]) -> int:
    mode = prim.get("mode", 4)
    if mode not in _TRIANGLE_MODES:
        return 0
    accessors = doc.get("accessors") or []
    if prim.get("indices") is not None:
        n = int(accessors[prim["indices"]].get("count") or 0)
    else:
        pos = (prim.get("attributes") or {}).get("POSITION")
        n = int(accessors[pos].get("count") or 0) if pos is not None else 0
    return n // 3 if mode == 4 else max(0, n - 2)


def glb_triangles(doc: dict[str, Any]) -> dict[str, int]:
    """``{"tris": total drawn, "instanced_tris": share from GPU instances, "draws": nodes x prims}``."""
    mesh_tris = [sum(_primitive_tris(doc, p) for p in m.get("primitives") or []) for m in doc.get("meshes") or []]
    mesh_prims = [len(m.get("primitives") or []) for m in doc.get("meshes") or []]
    accessors = doc.get("accessors") or []
    tris = inst_tris = draws = 0
    for node in doc.get("nodes") or []:
        mi = node.get("mesh")
        if mi is None or mi >= len(mesh_tris):
            continue
        ext = (node.get("extensions") or {}).get("EXT_mesh_gpu_instancing")
        copies = 1
        if ext:
            attrs = ext.get("attributes") or {}
            acc = attrs.get("TRANSLATION", attrs.get("ROTATION", attrs.get("SCALE")))
            copies = int(accessors[acc].get("count") or 1) if acc is not None else 1
            inst_tris += mesh_tris[mi] * copies
        tris += mesh_tris[mi] * copies
        draws += mesh_prims[mi]
    return {"tris": tris, "instanced_tris": inst_tris, "draws": draws}


def glb_report(path: Path) -> dict[str, Any]:
    doc = glb_json(path)
    out = {"file": path.name, "mb": round(path.stat().st_size / 1e6, 2)}
    out.update(glb_triangles(doc))
    return out


def package_report(viewer_dir: Path) -> dict[str, Any]:
    """Budget report for one district viewer folder; ``errors`` lists every breach."""
    viewer_dir = Path(viewer_dir)
    errors: list[str] = []
    core_path = viewer_dir / "core.glb"
    core = glb_report(core_path) if core_path.exists() else None
    if core:
        if core["mb"] > CORE_MAX_MB:
            errors.append(f"core.glb {core['mb']:.1f} MB > {CORE_MAX_MB:.0f} MB budget")
        if core["tris"] > CORE_MAX_TRIS:
            errors.append(f"core.glb {core['tris']:,} tris > {CORE_MAX_TRIS:,} budget")
    chunks: list[dict[str, Any]] = []
    for path in sorted((viewer_dir / "chunks").glob("*.glb")):
        rep = glb_report(path)
        chunks.append(rep)
        if rep["mb"] > CHUNK_MAX_MB:
            errors.append(f"chunk {path.name} {rep['mb']:.1f} MB > {CHUNK_MAX_MB:.0f} MB budget")
        if rep["tris"] > CHUNK_MAX_TRIS:
            errors.append(f"chunk {path.name} {rep['tris']:,} tris > {CHUNK_MAX_TRIS:,} budget")
    total_mb = (core["mb"] if core else 0.0) + sum(c["mb"] for c in chunks)
    total_tris = (core["tris"] if core else 0) + sum(c["tris"] for c in chunks)
    heaviest = sorted(chunks, key=lambda c: -c["mb"])[:5]
    return {
        "core": core,
        "chunks": len(chunks),
        "chunk_max_mb": max((c["mb"] for c in chunks), default=0.0),
        "chunk_max_tris": max((c["tris"] for c in chunks), default=0),
        "heaviest": heaviest,
        "total_mb": round(total_mb, 1),
        "total_tris": total_tris,
        "errors": errors,
    }


def summarize(rep: dict[str, Any]) -> str:
    core = rep.get("core") or {}
    return (
        f"core {core.get('mb', 0):.1f} MB / {core.get('tris', 0):,} tris; "
        f"{rep['chunks']} chunks (max {rep['chunk_max_mb']:.1f} MB, {rep['chunk_max_tris']:,} tris); "
        f"total {rep['total_mb']:.0f} MB / {rep['total_tris']:,} tris"
    )
