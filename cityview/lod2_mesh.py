"""LOD2 surface polygons -> outward-wound triangles (Blender-free, unit-testable).

``city3d`` keeps every building as ``{"v": [[x, y, z]...], "roof": [poly...],
"wall": [poly...]}`` where a poly is ``[outer_ring, hole_ring...]`` of vertex
indices (CityJSON winding: counter-clockwise seen from outside). This module
cleans the rings, triangulates them with a caller-supplied triangulator (Blender
passes ``mathutils.geometry.tessellate_polygon``) and orients every triangle with
the polygon's Newell normal so back-face culling in the viewer stays correct.
"""

from __future__ import annotations

import math
from typing import Any, Callable, Sequence

Vec3 = Sequence[float]
# (loops of xyz points) -> triangles as index triples into the concatenated loops.
Triangulator = Callable[[list[list[Vec3]]], list[tuple[int, int, int]]]

# Wall polygons below this area are dropped (slivers at roof joins; invisible, costly).
MIN_WALL_AREA_M2 = 0.35
MIN_ROOF_AREA_M2 = 0.05


def clean_ring(ring: Sequence[int], verts: Sequence[Vec3]) -> list[int]:
    """Drop the closing duplicate and consecutive repeats (by index or by position)."""
    out: list[int] = []
    for i in ring:
        if out and (i == out[-1] or _same(verts[i], verts[out[-1]])):
            continue
        out.append(int(i))
    while len(out) > 1 and (out[0] == out[-1] or _same(verts[out[0]], verts[out[-1]])):
        out.pop()
    return out


def _same(a: Vec3, b: Vec3, tol: float = 1e-4) -> bool:
    return abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol and abs(a[2] - b[2]) < tol


def newell_normal(ring: Sequence[int], verts: Sequence[Vec3]) -> tuple[float, float, float]:
    """Area-weighted normal (length = 2 * area) of a possibly non-planar ring."""
    nx = ny = nz = 0.0
    n = len(ring)
    for k in range(n):
        x1, y1, z1 = verts[ring[k]]
        x2, y2, z2 = verts[ring[(k + 1) % n]]
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    return nx, ny, nz


def polygon_area(ring: Sequence[int], verts: Sequence[Vec3]) -> float:
    nx, ny, nz = newell_normal(ring, verts)
    return 0.5 * math.sqrt(nx * nx + ny * ny + nz * nz)


def _tri_normal(a: Vec3, b: Vec3, c: Vec3) -> tuple[float, float, float]:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    return uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx


def fan_triangulate(loops: list[list[Vec3]]) -> list[tuple[int, int, int]]:
    """Fallback for convex outer rings without holes (tests, non-Blender callers)."""
    n = len(loops[0])
    return [(0, k, k + 1) for k in range(1, n - 1)]


def polygon_triangles(
    poly: Sequence[Sequence[int]],
    verts: Sequence[Vec3],
    triangulate: Triangulator,
    *,
    min_area: float = 0.0,
) -> list[tuple[int, int, int]]:
    """Triangles (vertex indices into ``verts``) for one LOD2 polygon with holes."""
    rings = [clean_ring(r, verts) for r in poly]
    outer = rings[0] if rings else []
    if len(outer) < 3:
        return []
    ref = newell_normal(outer, verts)
    if 0.5 * math.sqrt(ref[0] ** 2 + ref[1] ** 2 + ref[2] ** 2) < max(min_area, 1e-6):
        return []
    holes = [r for r in rings[1:] if len(r) >= 3]
    if not holes and len(outer) == 3:
        return [(outer[0], outer[1], outer[2])]
    loops = [outer] + holes
    flat = [i for r in loops for i in r]
    try:
        tris = triangulate([[verts[i] for i in r] for r in loops])
    except Exception:  # noqa: BLE001 — degenerate ring: fall back to a fan of the outer ring
        tris = fan_triangulate([[verts[i] for i in outer]])
        flat = outer
    out: list[tuple[int, int, int]] = []
    for a, b, c in tris:
        ia, ib, ic = flat[a], flat[b], flat[c]
        if ia == ib or ib == ic or ia == ic:
            continue
        tn = _tri_normal(verts[ia], verts[ib], verts[ic])
        if tn[0] * ref[0] + tn[1] * ref[1] + tn[2] * ref[2] < 0:
            ib, ic = ic, ib
        out.append((ia, ib, ic))
    return out


def shell_triangles(
    lod2: dict[str, Any], kind: str, triangulate: Triangulator
) -> list[tuple[int, int, int]]:
    """All triangles of one surface kind (``"wall"`` / ``"roof"``) of a building."""
    verts = lod2.get("v") or []
    min_area = MIN_WALL_AREA_M2 if kind == "wall" else MIN_ROOF_AREA_M2
    out: list[tuple[int, int, int]] = []
    for poly in lod2.get(kind) or []:
        out.extend(polygon_triangles(poly, verts, triangulate, min_area=min_area))
    return out
