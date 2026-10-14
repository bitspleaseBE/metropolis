"""Minimal binary glTF writer for landmark_kit.Mesh (no Blender).

Emits one mesh with a primitive per logical material so streamed landmark
GLBs keep the same colours as the Blender city bake.
"""

from __future__ import annotations

import json
import struct
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cityview.landmark_kit import Mesh

# Approximate Blender landmark baseColor × tint (see make_landmark_materials).
# Order: baseColorFactor RGB + roughness + metallic.
_MAT_PBR: dict[str, tuple[float, float, float, float, float]] = {
    "brick": (0.31, 0.12, 0.08, 0.9, 0.0),
    "brick_dark": (0.17, 0.06, 0.04, 0.94, 0.0),
    "brick_brown": (0.22, 0.11, 0.07, 0.92, 0.0),
    "brick_cream": (0.61, 0.61, 0.55, 0.88, 0.0),
    "brick_yellow": (0.86, 0.64, 0.24, 0.9, 0.0),
    # Lit Brabant limestone — warm bone, not chalk white.
    "stone_white": (0.82, 0.78, 0.70, 0.82, 0.0),
    # Recessed / soot-shadowed stone — cool warm-grey for AO depth.
    "stone_grey": (0.55, 0.52, 0.48, 0.88, 0.0),
    "bluestone": (0.19, 0.20, 0.24, 0.86, 0.0),
    "render_white": (0.90, 0.88, 0.83, 0.86, 0.0),
    "render_cream": (0.86, 0.78, 0.61, 0.86, 0.0),
    "render_shade": (0.58, 0.55, 0.49, 0.9, 0.0),
    "slate": (0.14, 0.14, 0.15, 0.7, 0.0),
    "zinc": (0.34, 0.37, 0.40, 0.55, 0.15),
    "glass": (0.04, 0.05, 0.06, 0.15, 0.35),
    "glass_roof": (0.55, 0.6, 0.62, 0.2, 0.3),
    "glass_amber": (0.86, 0.52, 0.1, 0.12, 0.15),
    "glass_green": (0.12, 0.48, 0.28, 0.12, 0.15),
    "glass_blue": (0.1, 0.24, 0.62, 0.12, 0.15),
    "glass_dark": (0.015, 0.016, 0.018, 0.3, 0.2),
    "frame_white": (0.84, 0.84, 0.81, 0.6, 0.0),
    "frame_dark": (0.09, 0.09, 0.09, 0.6, 0.3),
    "iron": (0.06, 0.07, 0.065, 0.5, 0.6),
    "gold": (0.78, 0.6, 0.22, 0.35, 1.0),
    "bronze": (0.13, 0.22, 0.18, 0.5, 0.5),
    "stone_rose": (0.43, 0.3, 0.26, 0.85, 0.0),
    "rock": (0.07, 0.065, 0.06, 0.7, 0.0),
    "cloth_red": (0.62, 0.05, 0.06, 0.9, 0.0),
    "cloth_yellow": (0.9, 0.7, 0.08, 0.9, 0.0),
    "cloth_blue": (0.05, 0.16, 0.5, 0.9, 0.0),
    "cloth_white": (0.88, 0.88, 0.86, 0.9, 0.0),
    "cloth_green": (0.05, 0.4, 0.18, 0.9, 0.0),
    "door": (0.13, 0.07, 0.04, 0.8, 0.0),
    "canopy": (0.84, 0.82, 0.74, 0.8, 0.0),
    "water": (0.07, 0.11, 0.12, 0.08, 0.0),
}


def _tri_face(face: tuple[int, ...]) -> list[int]:
    if len(face) == 3:
        return list(face)
    if len(face) == 4:
        a, b, c, d = face
        return [a, b, c, a, c, d]
    out: list[int] = []
    for i in range(1, len(face) - 1):
        out.extend((face[0], face[i], face[i + 1]))
    return out


def _fan_cap(outer: list[tuple[float, float]], z: float, y_up: bool) -> tuple[list[float], list[int]]:
    """Triangulate a hole-free horizontal cap (fan)."""
    if len(outer) < 3:
        return [], []
    positions: list[float] = []
    for x, y in outer:
        if y_up:
            positions.extend((float(x), float(z), -float(y)))
        else:
            positions.extend((float(x), float(y), float(z)))
    n = len(outer)
    indices: list[int] = []
    for i in range(1, n - 1):
        indices.extend((0, i, i + 1))
    return positions, indices


def _pack_aligned(chunks: list[bytes]) -> tuple[bytes, list[tuple[int, int]]]:
    """Concatenate byte chunks, 4-byte pad each; return blob and (offset, length) per chunk."""
    out = bytearray()
    spans: list[tuple[int, int]] = []
    for raw in chunks:
        off = len(out)
        out.extend(raw)
        pad = (4 - (len(raw) % 4)) % 4
        if pad:
            out.extend(b"\x00" * pad)
        spans.append((off, len(raw)))
    return bytes(out), spans


def write_mesh_glb(mesh: "Mesh", path: Path, *, y_up: bool = True) -> Path:
    """Write a multi-material GLB. Blender XY (east, north, up=Z) → glTF Y-up if y_up."""
    by_mat: dict[str, list[int]] = defaultdict(list)
    positions: list[float] = []
    for v in mesh.verts:
        x, y, z = float(v[0]), float(v[1]), float(v[2])
        if y_up:
            positions.extend((x, z, -y))
        else:
            positions.extend((x, y, z))
    for face, mat in zip(mesh.faces, mesh.mats):
        by_mat[mat].extend(_tri_face(face))

    # Caps are separate verts (not indexed into mesh.verts).
    for cap in mesh.caps:
        if cap.holes:
            # Hole-bearing caps need Blender; skip rather than fill the void wrong.
            continue
        cpos, cidx = _fan_cap(cap.outer, cap.z, y_up)
        if not cidx:
            continue
        base = len(positions) // 3
        positions.extend(cpos)
        by_mat[cap.mat].extend(base + i for i in cidx)

    if not positions or not by_mat:
        raise ValueError("empty mesh")

    mat_names = sorted(by_mat.keys())
    mat_index = {n: i for i, n in enumerate(mat_names)}

    # Remap indices per-primitive to a shared POSITION buffer (already global).
    idx_chunks: list[bytes] = []
    prim_meta: list[tuple[str, int, int]] = []  # mat, idx_count, chunk_i
    for name in mat_names:
        idxs = by_mat[name]
        if not idxs:
            continue
        # Drop refs past shared vert count (should not happen for faces).
        max_i = len(positions) // 3
        clean = [i for i in idxs if 0 <= i < max_i]
        if len(clean) < 3:
            continue
        idx_chunks.append(struct.pack(f"<{len(clean)}I", *clean))
        prim_meta.append((name, len(clean), len(idx_chunks) - 1))

    if not prim_meta:
        raise ValueError("empty mesh after triangulation")

    pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
    bin_blob, spans = _pack_aligned([pos_bytes, *idx_chunks])
    pos_off, pos_len = spans[0]

    xs = positions[0::3]
    ys = positions[1::3]
    zs = positions[2::3]
    min_v = [min(xs), min(ys), min(zs)]
    max_v = [max(xs), max(ys), max(zs)]
    n_verts = len(positions) // 3

    materials = []
    for name in mat_names:
        r, g, b, rough, metal = _MAT_PBR.get(name, (0.55, 0.55, 0.52, 0.85, 0.0))
        materials.append(
            {
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [r, g, b, 1.0],
                    "metallicFactor": metal,
                    "roughnessFactor": rough,
                },
            }
        )

    buffer_views = [
        {"buffer": 0, "byteOffset": pos_off, "byteLength": pos_len, "target": 34962},
    ]
    accessors = [
        {
            "bufferView": 0,
            "componentType": 5126,
            "count": n_verts,
            "type": "VEC3",
            "min": min_v,
            "max": max_v,
        },
    ]
    primitives = []
    for name, count, chunk_i in prim_meta:
        off, length = spans[1 + chunk_i]
        bv = len(buffer_views)
        buffer_views.append(
            {"buffer": 0, "byteOffset": off, "byteLength": length, "target": 34963}
        )
        acc = len(accessors)
        accessors.append(
            {
                "bufferView": bv,
                "componentType": 5125,
                "count": count,
                "type": "SCALAR",
            }
        )
        primitives.append(
            {
                "attributes": {"POSITION": 0},
                "indices": acc,
                "mode": 4,
                "material": mat_index[name],
            }
        )

    gltf = {
        "asset": {"version": "2.0", "generator": "cityview.mesh_glb"},
        "scenes": [{"nodes": [0]}],
        "scene": 0,
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": primitives}],
        "materials": materials,
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    if len(json_bytes) % 4:
        json_bytes += b" " * (4 - len(json_bytes) % 4)

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(bin_blob), b"BIN\x00"))
        f.write(bin_blob)
    return path
