"""Batched low-poly trees and shrubs for the city tile (runs inside Blender).

Positions come from ``layout["trees"]`` / ``layout["bushes"]`` (see
``cityview.trees``): real municipal + OSM survey points, with a Poisson-disc
fill only in sparse parks. Everything is merged into one mesh per material so
~1k trees cost a handful of draw calls in the browser viewer.
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
from cityview import trees as treeplan  # noqa: E402
from cityview.roadclear import TRUNK_MARGIN, RoadIndex  # noqa: E402

# Genus → canopy palette slot (indices into canopy_mats); others use per-tree tone.
GENUS_CANOPY = {
    "Platanus": 3,
    "Tilia": 3,
    "Prunus": 3,
    "Malus": 3,
    "Pyrus": 3,
    "Fagus": 2,
    "Quercus": 2,
    "Carpinus": 4,
    "Acer": 0,
    "Aesculus": 1,
    "Fraxinus": 1,
}


class _Batch:
    """Accumulates primitives into one bmesh per material."""

    def __init__(self) -> None:
        self.meshes: dict[str, tuple[object, bmesh.types.BMesh]] = {}

    def bm(self, mat) -> bmesh.types.BMesh:
        key = mat.name
        if key not in self.meshes:
            self.meshes[key] = (mat, bmesh.new())
        return self.meshes[key][1]

    def blob(self, mat, center, radii, yaw: float = 0.0, subdiv: int = 1) -> None:
        m = Matrix.Translation(Vector(center)) @ Matrix.Rotation(yaw, 4, "Z")
        m = m @ Matrix.Diagonal(Vector((radii[0], radii[1], radii[2], 1.0)))
        bmesh.ops.create_icosphere(self.bm(mat), subdivisions=subdiv, radius=1.0, matrix=m)

    def cone(self, mat, base, r_bottom: float, r_top: float, depth: float, segments: int = 7) -> None:
        m = Matrix.Translation(Vector((base[0], base[1], base[2] + depth * 0.5)))
        bmesh.ops.create_cone(
            self.bm(mat),
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=r_bottom,
            radius2=r_top,
            depth=depth,
            matrix=m,
        )

    def flush(self, prefix: str) -> int:
        count = 0
        for mat, bm in self.meshes.values():
            if not bm.verts:
                bm.free()
                continue
            mesh = bpy.data.meshes.new(f"{prefix}_{mat.name}")
            bm.to_mesh(mesh)
            bm.free()
            mesh.materials.append(mat)
            obj = bpy.data.objects.new(f"{prefix}_{mat.name}", mesh)
            bpy.context.collection.objects.link(obj)
            count += 1
        self.meshes.clear()
        return count


def _canopy_mat(tree: dict, canopy_mats: list):
    slot = GENUS_CANOPY.get(tree.get("genus") or "")
    tone = float(tree.get("tone") or 0.0)
    if slot is None:
        slot = int(tone * len(canopy_mats)) % len(canopy_mats)
    elif tone > 0.78:  # a few individuals drift to the neighbouring shade
        slot = (slot + 1) % len(canopy_mats)
    return canopy_mats[slot % len(canopy_mats)]


# --- instanced crown archetypes (EXT_mesh_gpu_instancing) -------------------
# Reference size (height, crown radius) each archetype mesh is modelled at; every tree
# is an instance scaled by (r / r0, r / r0, h / h0).
ARCHETYPE_REF = {
    "broad": (14.0, 5.0),
    "round": (10.0, 3.5),
    "irregular": (14.0, 5.0),
    "open": (13.0, 3.5),
    "columnar": (16.0, 2.0),
    "ornamental": (6.0, 3.0),
    "conifer": (12.0, 3.0),
}
# Canopy tones (linear RGB) per archetype; a tree's ``tone`` picks one.
ARCHETYPE_CANOPY = {
    "broad": ((0.16, 0.40, 0.13), (0.24, 0.44, 0.14)),
    "round": ((0.20, 0.36, 0.10), (0.30, 0.42, 0.16)),
    "irregular": ((0.12, 0.32, 0.15), (0.16, 0.34, 0.12)),
    "open": ((0.26, 0.44, 0.16), (0.32, 0.46, 0.18)),
    "columnar": ((0.18, 0.38, 0.12),),
    "ornamental": ((0.24, 0.40, 0.14), (0.30, 0.36, 0.14)),
    "conifer": ((0.07, 0.22, 0.11),),
}
TRUNK_RGB = (0.28, 0.18, 0.10)


def _vc_material():
    """One shared material: base colour from the ``Col`` vertex colours (trunk + crown)."""
    name = "tree_vc"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


class _Painter:
    """bmesh primitives that also write a per-loop colour (crowns shade darker below)."""

    def __init__(self) -> None:
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new("Col")

    def _paint(self, verts, rgb, shade: bool) -> None:
        faces = {f for v in verts for f in v.link_faces}
        zs = [v.co.z for v in verts] or [0.0]
        z0, z1 = min(zs), max(zs)
        span = max(z1 - z0, 1e-3)
        for f in faces:
            for loop in f.loops:
                k = (0.72 + 0.38 * (loop.vert.co.z - z0) / span) if shade else 1.0
                loop[self.col] = (min(1.0, rgb[0] * k), min(1.0, rgb[1] * k), min(1.0, rgb[2] * k), 1.0)

    def blob(self, rgb, center, radii, subdiv: int = 2) -> None:
        m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((radii[0], radii[1], radii[2], 1.0)))
        out = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=1.0, matrix=m)
        self._paint(out["verts"], rgb, True)

    def cone(self, rgb, base, r_bottom: float, r_top: float, depth: float, segments: int = 7, shade=False) -> None:
        m = Matrix.Translation(Vector((base[0], base[1], base[2] + depth * 0.5)))
        out = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=segments,
            radius1=r_bottom, radius2=r_top, depth=depth, matrix=m,
        )
        self._paint(out["verts"], rgb, shade)

    def to_mesh(self, name: str, mat):
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        if "Col" in mesh.color_attributes:
            mesh.color_attributes.active_color = mesh.color_attributes["Col"]
            mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
        mesh.materials.append(mat)
        return mesh


def _archetype_mesh(kind: str, leaf, mat):
    """Model one crown archetype at its reference size (trunk base at the origin)."""
    h, r = ARCHETYPE_REF[kind]
    p = _Painter()
    bark = TRUNK_RGB
    if kind == "conifer":
        p.cone(bark, (0, 0, 0), 0.22, 0.15, h * 0.25, 6)
        p.cone(leaf, (0, 0, h * 0.16), r, r * 0.35, h * 0.5, 8, shade=True)
        p.cone(leaf, (0, 0, h * 0.5), r * 0.72, 0.05, h * 0.5, 8, shade=True)
    elif kind == "columnar":
        p.cone(bark, (0, 0, 0), 0.2, 0.12, h * 0.4, 6)
        p.blob(leaf, (0, 0, h * 0.62), (r, r, h * 0.38))
    elif kind == "ornamental":
        p.cone(bark, (0, 0, 0), 0.14, 0.1, h * 0.5, 6)
        p.blob(leaf, (0, 0, h * 0.66), (r, r, h * 0.3))
        p.blob(leaf, (r * 0.45, 0, h * 0.58), (r * 0.6, r * 0.6, h * 0.22), 1)
        p.blob(leaf, (-r * 0.45, 0, h * 0.6), (r * 0.6, r * 0.6, h * 0.22), 1)
    elif kind == "open":
        p.cone(bark, (0, 0, 0), 0.18, 0.08, h * 0.8, 6)
        # Sparse, airy crown: three separated clumps around a slender leader.
        for k, (ang, zf, rf) in enumerate(((0.3, 0.55, 0.55), (2.4, 0.68, 0.5), (4.4, 0.82, 0.45))):
            ox, oy = math.cos(ang) * r * 0.45, math.sin(ang) * r * 0.45
            p.blob(leaf, (ox, oy, h * zf), (r * rf, r * rf, h * 0.16), 1 + (k == 0))
    elif kind == "irregular":
        p.cone(bark, (0, 0, 0), 0.32, 0.18, h * 0.5, 6)
        for ang, zf, rf in ((0.0, 0.62, 0.62), (1.7, 0.72, 0.55), (3.3, 0.58, 0.58), (4.9, 0.8, 0.45)):
            ox, oy = math.cos(ang) * r * 0.42, math.sin(ang) * r * 0.42
            p.blob(leaf, (ox, oy, h * zf), (r * rf, r * rf, h * 0.2))
    else:  # broad / round
        vert = max(1.1, min(r * 1.45, h * 0.44))
        cz = h - vert
        p.cone(bark, (0, 0, 0), 0.3 if kind == "broad" else 0.22, 0.16, max(1.6, cz * 0.95), 6)
        p.blob(leaf, (0, 0, cz), (r, r, vert))
        lobes = ((1.0, 0.0), (-1.0, 2.4)) if kind == "broad" else ((1.0, 0.8),)
        for k, (sign, ang) in enumerate(lobes):
            ox, oy = math.cos(ang) * r * 0.55 * sign, math.sin(ang) * r * 0.55 * sign
            p.blob(leaf, (ox, oy, cz - vert * (0.25 + 0.2 * k)), (r * 0.68, r * 0.68, vert * 0.7), 1)
    return p.to_mesh(f"tree_{kind}", mat)


def add_instanced_trees(layout: dict, rails, spawn_xy=None) -> dict:
    """Every tree is an instance of a crown archetype, grouped per streaming cell.

    Trees of one cell are children of one Empty (``trees_<cell>``), which is what the
    glTF exporter's ``export_gpu_instances`` turns into ``EXT_mesh_gpu_instancing``:
    three.js loads one ``InstancedMesh`` per archetype and cell.
    """
    from cityview.district_chunks import assign_object

    mat = _vc_material()
    meshes: dict[tuple[str, int], object] = {}
    groups: dict[object, object] = {}
    counts = {"antwerp": 0, "osm": 0, "osm_row": 0, "fill": 0, "skipped_rail": 0, "skipped_road": 0}
    per_kind: dict[str, int] = {}
    roads = RoadIndex.from_layout(layout)
    for i, tree in enumerate(layout.get("trees") or []):
        x, y = float(tree["x"]), float(tree["y"])
        source = tree.get("source") or "fill"
        clearance = treeplan.CLEAR_TREE if source == "fill" else treeplan.CLEAR_REAL_TRUNK
        if rails.within(x, y, clearance):
            counts["skipped_rail"] += 1
            continue
        if roads.on_carriageway(x, y, TRUNK_MARGIN - 0.05):
            counts["skipped_road"] += 1
            continue
        kind = tree.get("archetype") or treeplan.archetype_for(tree.get("genus") or "", tree.get("shape") or "")
        if kind not in ARCHETYPE_REF:
            kind = "round"
        tone = float(tree.get("tone") or 0.5)
        tones = ARCHETYPE_CANOPY[kind]
        variant = min(len(tones) - 1, int(tone * len(tones)))
        mesh = meshes.get((kind, variant))
        if mesh is None:
            mesh = meshes[(kind, variant)] = _archetype_mesh(kind, tones[variant], mat)
            mesh.name = f"tree_{kind}_{variant}"
        h0, r0 = ARCHETYPE_REF[kind]
        h = float(tree.get("height") or 8.0)
        r = float(tree.get("radius") or 2.5)
        key = assign_object("tree", x, y, spawn_xy=spawn_xy)
        parent = groups.get(key)
        if parent is None:
            label = "core" if key == "core" else f"{key[0]}_{key[1]}"
            parent = bpy.data.objects.new(f"trees_{label}", None)
            parent.location = (x, y, 0.0)
            bpy.context.collection.objects.link(parent)
            groups[key] = parent
        obj = bpy.data.objects.new(f"tree_{i}", mesh)
        obj.parent = parent
        obj.location = (x - parent.location.x, y - parent.location.y, 0.0)
        obj.rotation_euler = (0.0, 0.0, tone * math.tau)
        obj.scale = (r / r0, r / r0, h / h0)
        bpy.context.collection.objects.link(obj)
        counts[source if source in counts else "fill"] += 1
        per_kind[kind] = per_kind.get(kind, 0) + 1
    counts["archetypes"] = per_kind
    counts["groups"] = len(groups)
    counts["meshes"] = len(meshes)
    return counts


def add_vegetation(
    layout: dict,
    rails,
    trunk_mat,
    canopy_mats: list,
    conifer_mat,
    bush_mats: list,
    spawn_xy=None,
    instanced: bool = True,
) -> dict:
    """Create batched tree + bush meshes. Returns per-source counts."""
    origin = tuple(layout.get("origin") or (0.0, 0.0))
    if "trees" not in layout:  # layout predates tree planning: park fill only
        plan = treeplan.plan_trees(layout, None, origin)
        layout["trees"], layout["bushes"], layout["tree_stats"] = (
            plan["trees"],
            plan["bushes"],
            plan["stats"],
        )

    wood = _Batch()
    leaves = _Batch()
    counts = {
        "antwerp": 0,
        "osm": 0,
        "osm_row": 0,
        "fill": 0,
        "skipped_rail": 0,
        "skipped_road": 0,
        "bushes": 0,
    }
    roads = RoadIndex.from_layout(layout)
    if instanced:
        inst = add_instanced_trees(layout, rails, spawn_xy)
        counts.update({k: v for k, v in inst.items()})

    for tree in [] if instanced else layout.get("trees") or []:
        x, y = float(tree["x"]), float(tree["y"])
        source = tree.get("source") or "fill"
        clearance = treeplan.CLEAR_TREE if source == "fill" else treeplan.CLEAR_REAL_TRUNK
        if rails.within(x, y, clearance):
            counts["skipped_rail"] += 1  # safety net: nothing grows on a tram bed
            continue
        if roads.on_carriageway(x, y, TRUNK_MARGIN - 0.05):
            counts["skipped_road"] += 1  # safety net: nothing grows in a traffic lane
            continue
        h = float(tree.get("height") or 8.0)
        r = float(tree.get("radius") or 2.5)
        tone = float(tree.get("tone") or 0.5)
        yaw = tone * math.tau
        shape = tree.get("shape") or "broadleaf"
        trunk_r = max(0.09, min(0.36, 0.07 + 0.016 * h, 0.06 + 0.07 * r))
        if shape == "conifer":
            wood.cone(trunk_mat, (x, y, 0.0), trunk_r, trunk_r * 0.7, h * 0.25, 6)
            leaves.cone(conifer_mat, (x, y, h * 0.16), r, 0.05, h * 0.84, 7)
        elif shape == "columnar":
            wood.cone(trunk_mat, (x, y, 0.0), trunk_r, trunk_r * 0.6, h * 0.4, 6)
            leaves.blob(
                _canopy_mat(tree, canopy_mats),
                (x, y, h * 0.62),
                (r, r, h * 0.38),
                yaw,
                subdiv=2,
            )
        else:
            leaf = _canopy_mat(tree, canopy_mats)
            # Round-ish crown: height follows the radius, trunk runs up into it.
            vert = max(1.1, min(r * 1.45, h * 0.44))
            cz = h - vert
            wood.cone(trunk_mat, (x, y, 0.0), trunk_r, trunk_r * 0.6, max(1.6, cz * 0.95), 6)
            leaves.blob(leaf, (x, y, cz), (r, r, vert), yaw, subdiv=2)
            # Two smaller lobes break the silhouette so no two crowns match.
            for k, sign in enumerate((1.0, -1.0)):
                ang = yaw + k * 2.4
                ox = math.cos(ang) * r * 0.55 * sign
                oy = math.sin(ang) * r * 0.55 * sign
                leaves.blob(
                    leaf,
                    (x + ox, y + oy, cz - vert * (0.25 + 0.2 * k)),
                    (r * 0.68, r * 0.68, vert * 0.7),
                    ang,
                    subdiv=1,
                )
        counts[source if source in counts else "fill"] += 1

    shrubs = _Batch()
    for bush in layout.get("bushes") or []:
        x, y = float(bush["x"]), float(bush["y"])
        if rails.within(x, y, treeplan.CLEAR_FURNITURE):
            continue
        w = float(bush.get("w") or 1.4)
        hh = float(bush.get("h") or 1.0)
        tone = float(bush.get("tone") or 0.0)
        mat = bush_mats[int(tone * len(bush_mats)) % len(bush_mats)]
        shrubs.blob(mat, (x, y, hh * 0.4), (w * 0.6, w * 0.6, hh * 0.55), tone * math.tau)
        counts["bushes"] += 1

    counts["objects"] = wood.flush("tree_trunks") + leaves.flush("tree_crowns") + shrubs.flush("shrubs")
    return counts
