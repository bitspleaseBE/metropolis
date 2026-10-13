"""Velo Antwerpen dock rails (runs inside Blender).

``layout["velo_stations"]`` (see ``cityview.velo``) lists docking terminals at their
surveyed positions. Mesh convention: rail length on local X, front (street) on local +Y,
``yaw`` is ``rotation_z``.

Docked bikes are not baked here. ``viewer/velo.js`` instances ``velo.glb`` in each
slot so a take (E) can hide that bike and a return can put the same model back.
"""

from __future__ import annotations

import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

_REPO_ROOT = str(Path(__file__).resolve().parents[1])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
from cityview.railclear import CLEAR_FURNITURE  # noqa: E402
from cityview import velo as veloplan  # noqa: E402

LIFT = 0.04


def _box(bm, base: Matrix, size, center) -> None:
    m = base @ Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


class Parts:
    def __init__(self) -> None:
        self.meshes: dict[str, bmesh.types.BMesh] = {}

    def bm(self, key: str):
        if key not in self.meshes:
            self.meshes[key] = bmesh.new()
        return self.meshes[key]


def _station_rail(p: Parts, base: Matrix, length: float, capacity: int) -> None:
    half = length * 0.5
    metal = p.bm("metal")
    red = p.bm("signal_red")
    _box(metal, base, (length + 0.15, 0.65, 0.06), (0.0, 0.02, LIFT + 0.03))
    _box(metal, base, (length, 0.09, 0.12), (0.0, -0.14, LIFT + 0.36))
    _box(metal, base, (length, 0.035, 0.22), (0.0, -0.26, LIFT + 0.3))
    for sx in (-1.0, 1.0):
        _box(metal, base, (0.09, 0.5, 0.5), (sx * (half - 0.05), -0.06, LIFT + 0.28))
    n_mid = max(0, int(length // 2.6) - 1)
    for i in range(n_mid):
        t = (i + 1) / (n_mid + 1)
        cx = -half + t * length
        _box(metal, base, (0.055, 0.36, 0.42), (cx, -0.1, LIFT + 0.26))
    slots = max(4, int(capacity))
    spacing = length / max(1, slots)
    screen = p.bm("screen")
    panel = p.bm("panel")
    for i in range(slots):
        cx = -half + (i + 0.5) * spacing
        # Dock post with a lock head and status LED, plus a short wheel guide in front.
        _box(metal, base, (0.08, 0.08, 0.6), (cx, 0.1, LIFT + 0.3))
        _box(metal, base, (0.12, 0.2, 0.13), (cx, 0.14, LIFT + 0.66))
        _box(red, base, (0.05, 0.02, 0.03), (cx, 0.25, LIFT + 0.68))
        for gx in (-0.05, 0.05):
            _box(metal, base, (0.025, 0.42, 0.025), (cx + gx, 0.42, LIFT + 0.1))
    # Terminal pillar at the rail head: red column, dark screen + white map panel.
    tx = -half - 0.45
    _box(metal, base, (0.5, 0.36, 0.08), (tx, 0.0, LIFT + 0.04))
    _box(red, base, (0.42, 0.28, 1.9), (tx, 0.0, LIFT + 1.03))
    _box(red, base, (0.48, 0.34, 0.08), (tx, 0.0, LIFT + 2.0))
    _box(screen, base, (0.26, 0.02, 0.2), (tx, 0.145, LIFT + 1.42))
    _box(panel, base, (0.3, 0.02, 0.5), (tx, 0.145, LIFT + 0.85))
    _box(panel, base, (0.34, 0.02, 0.9), (tx, -0.145, LIFT + 1.1))
    _box(panel, base, (0.36, 0.3, 0.14), (tx, 0.0, LIFT + 1.82))


def add_velo_stations(layout: dict, rails, mats: dict) -> dict:
    origin = tuple(layout.get("origin") or (0.0, 0.0))
    if "velo_stations" not in layout:
        plan = veloplan.plan_velo(layout, None, origin)
        layout["velo_stations"] = plan["stations"]
        layout["velo_stats"] = plan["stats"]

    p = Parts()
    counts = {"stations": 0, "skipped_rail": 0}
    for st in layout.get("velo_stations") or []:
        x, y = float(st["x"]), float(st["y"])
        if rails.within(x, y, CLEAR_FURNITURE):
            counts["skipped_rail"] += 1
            continue
        length = float(st.get("railLength") or 8.0)
        capacity = int(st.get("capacity") or 20)
        yaw = float(st["yaw"])
        base = Matrix.Translation(Vector((x, y, 0.0))) @ Matrix.Rotation(yaw, 4, "Z")
        _station_rail(p, base, length, capacity)
        counts["stations"] += 1

    name_map = {
        "metal": "velo_dock_metal",
        "signal_red": "velo_accent_red",
        "screen": "velo_dock_screen",
        "panel": "velo_dock_panel",
    }
    for key, obj_name in name_map.items():
        bm = p.meshes.get(key)
        if not bm or not bm.verts:
            if bm:
                bm.free()
            continue
        mesh = bpy.data.meshes.new(obj_name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(obj_name, mesh)
        mat = mats.get(key)
        if mat is not None:
            mesh.materials.append(mat)
        bpy.context.collection.objects.link(obj)
    return counts
