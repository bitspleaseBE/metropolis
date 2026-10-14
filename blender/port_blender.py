"""Container stacks and OSM cranes for port districts (runs inside Blender).

``layout["port_containers"]`` and ``layout["port_cranes"]`` come from
``cityview.port_props``; footprints match the colliders in ``cityview.props``.
Everything is merged per material (a handful of draw calls) and built from boxes,
so a quay full of cranes stays cheap. Local X is the yaw axis.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

_REPO_ROOT = str(Path(__file__).resolve().parents[1])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
from cityview import port_props as pp  # noqa: E402

CONTAINER_KEYS = ("container_red", "container_blue", "container_green", "container_grey", "container_orange")
MEMBER = 0.6  # lattice member section, metres


def _box(bm, base: Matrix, size, center) -> None:
    m = base @ Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def _beam(bm, base: Matrix, a, b, w: float = MEMBER) -> None:
    """Square member from a to b in the local frame."""
    va, vb = Vector(a), Vector(b)
    d = vb - va
    length = d.length
    if length < 1e-6:
        return
    rot = Vector((0.0, 0.0, 1.0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    m = base @ Matrix.Translation((va + vb) * 0.5) @ rot @ Matrix.Diagonal(Vector((w, w, length, 1.0)))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def _frame(x: float, y: float, yaw: float) -> Matrix:
    return Matrix.Translation(Vector((x, y, 0.0))) @ Matrix.Rotation(yaw, 4, "Z")


def _stack(parts: dict, stack: dict) -> None:
    base = _frame(float(stack["x"]), float(stack["y"]), float(stack.get("yaw") or 0.0))
    rows = int(stack.get("rows") or 2)
    tiers = int(stack.get("count") or 3)
    seed = int(stack.get("seed") or 0)
    _, half_depth = pp.container_half_extents(stack)
    pitch = pp.CONTAINER_W + pp.CONTAINER_GAP
    for r in range(rows):
        cy = -half_depth + pp.CONTAINER_W * 0.5 + r * pitch
        # Stacks step down at the ends of a row, like a yard being worked.
        height = max(1, tiers - (1 if (seed >> r) & 1 else 0))
        for t in range(height):
            key = CONTAINER_KEYS[(seed // 7 + r * 3 + t * 2) % len(CONTAINER_KEYS)]
            cz = pp.CONTAINER_H * (t + 0.5)
            _box(parts[key], base, (pp.CONTAINER_L, pp.CONTAINER_W, pp.CONTAINER_H - 0.02), (0.0, cy, cz))


def _gantry(bm, crane: dict) -> None:
    base = _frame(float(crane["x"]), float(crane["y"]), float(crane.get("yaw") or 0.0))
    h = float(crane.get("height") or 30.0)
    hs = max(float(crane.get("span") or 12.0), 12.0) * 0.5
    hg = pp.GANTRY_GAUGE * 0.5
    beam_z = h * 0.72
    for a in (-hs, hs):
        for b in (-hg, hg):
            _beam(bm, base, (a, b, 0.0), (a, b, beam_z), w=1.2)
        # Portal cross-beam and a diagonal brace on each leg pair.
        _beam(bm, base, (a, -hg, beam_z), (a, hg, beam_z), w=1.4)
        _beam(bm, base, (a, -hg, 1.0), (a, hg * 0.2, beam_z * 0.8))
    for b in (-hg, hg):
        _beam(bm, base, (-hs, b, beam_z), (hs, b, beam_z), w=1.0)
    # Boom across the rails: long outreach on +Y, short backreach on -Y.
    boom_z = beam_z + 2.0
    _beam(bm, base, (0.0, -hg - 14.0, boom_z), (0.0, hg + 34.0, boom_z), w=2.0)
    _beam(bm, base, (0.0, 0.0, boom_z), (0.0, 0.0, h), w=1.6)
    _beam(bm, base, (0.0, 0.0, h), (0.0, hg + 34.0, boom_z + 0.8))
    _beam(bm, base, (0.0, 0.0, h), (0.0, -hg - 14.0, boom_z + 0.8))
    _box(bm, base, (6.0, 5.0, 3.0), (0.0, -hg - 10.0, boom_z + 2.5))  # machinery house


def _portal(bm, crane: dict) -> None:
    base = _frame(float(crane["x"]), float(crane["y"]), float(crane.get("yaw") or 0.0))
    h = float(crane.get("height") or 22.0)
    portal_h = min(8.0, h * 0.3)
    leg = pp.PORTAL_PEDESTAL_R * 0.8
    for a in (-leg, leg):
        for b in (-leg, leg):
            _beam(bm, base, (a, b, 0.0), (a * 0.5, b * 0.5, portal_h), w=0.5)
    _box(bm, base, (2.4, 2.4, 1.0), (0.0, 0.0, portal_h + 0.5))
    cab_z = portal_h + 1.0
    _box(bm, base, (3.2, 4.2, 3.0), (0.0, 0.0, cab_z + 1.5))  # slewing house
    _beam(bm, base, (0.0, -2.0, cab_z + 3.0), (0.0, -2.0, h), w=0.7)  # A-frame
    # Luffing jib from the house out and up, with its tie back to the A-frame.
    tip = (0.0, h * 0.95, h * 0.85)
    _beam(bm, base, (0.0, 1.5, cab_z + 1.0), tip, w=0.7)
    _beam(bm, base, (0.0, -2.0, h), tip, w=0.25)
    _box(bm, base, (2.0, 1.4, 1.6), (0.0, -2.8, cab_z + 0.8))  # counterweight


def add_port_props(layout: dict, mats: dict) -> dict:
    """Create merged container / crane meshes. ``mats`` keys: ``CONTAINER_KEYS`` + ``crane``."""
    parts = {k: bmesh.new() for k in (*CONTAINER_KEYS, "crane")}
    counts = {"stacks": 0, "cranes": 0}
    for stack in layout.get("port_containers") or []:
        _stack(parts, stack)
        counts["stacks"] += 1
    for crane in layout.get("port_cranes") or []:
        (_gantry if crane.get("kind") == "gantry" else _portal)(parts["crane"], crane)
        counts["cranes"] += 1
    for key, bm in parts.items():
        if not bm.verts or key not in mats:
            bm.free()
            continue
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        mesh = bpy.data.meshes.new(f"port_{key}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mats[key])
        bpy.context.collection.objects.link(bpy.data.objects.new(f"port_{key}", mesh))
    return counts
