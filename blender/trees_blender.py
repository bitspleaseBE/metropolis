"""Batched low-poly trees and shrubs for the city tile (runs inside Blender).

Positions come from ``layout["trees"]`` / ``layout["bushes"]`` (see
``cityview.trees``): real municipal + OSM survey points, with a Poisson-disc
fill only in sparse parks. Everything is merged into one mesh per material so
~1k trees cost a handful of draw calls in the browser viewer.
"""

from __future__ import annotations

import math
import random
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
LEAF_ATLAS = Path(_REPO_ROOT) / "assets" / "trees" / "leaf_atlas.png"
# Atlas rectangles (u0, v0, u1, v1) in Blender UV space (v up): scripts/make_leaf_atlas.py.
LEAF_TILES = ((0.0, 0.5, 0.5, 1.0), (0.5, 0.5, 1.0, 1.0), (0.0, 0.0, 0.5, 0.5))
LEAF_TILE_WEIGHTS = (0.4, 0.35, 0.25)
NEEDLE_TILE = (0.5, 0.25, 1.0, 0.5)
BARK_U = (0.51, 0.92)
BARK_V = (0.02, 0.23)

# Reference (height, crown radius) each (kind, form) mesh is modelled at; every tree is
# an instance scaled by (r / r0, r / r0, h / h0), so the clear-trunk *fraction* is baked
# per mesh (treeplan.CLEAR_FRACTION) and survives the scaling.
ARCHETYPE_REF = {
    ("broad", "young"): (6.5, 1.3),
    ("broad", "mature"): (16.0, 5.0),
    ("round", "young"): (6.5, 1.3),
    ("round", "mature"): (13.0, 4.0),
    ("irregular", "young"): (6.5, 1.4),
    ("irregular", "mature"): (14.0, 4.6),
    ("open", "young"): (6.5, 1.2),
    ("open", "mature"): (14.0, 3.8),
    ("columnar", "young"): (6.5, 0.8),
    ("columnar", "mature"): (18.0, 2.2),
    ("ornamental", "young"): (5.5, 1.4),
    ("ornamental", "mature"): (9.0, 3.2),
    ("conifer", "young"): (6.0, 1.3),
    ("conifer", "mature"): (13.0, 3.0),
}
KINDS = sorted({k for k, _ in ARCHETYPE_REF})
# Linear vertex colour per kind; the near-neutral atlas multiplies it.
CANOPY_RGB = {
    "broad": (0.22, 0.48, 0.15),
    "round": (0.27, 0.46, 0.14),
    "irregular": (0.16, 0.40, 0.17),
    "open": (0.31, 0.52, 0.19),
    "columnar": (0.21, 0.44, 0.14),
    "ornamental": (0.32, 0.47, 0.17),
    "conifer": (0.10, 0.30, 0.15),
}
TRUNK_RGB = (0.40, 0.29, 0.19)
# Leaf clusters per (mature, young) crown. Most outer clusters are a crossed pair of
# two-sided quads (4 tris) so the crown has volume instead of a flat stamp.
CLUSTERS = {
    "broad": (78, 38),
    "round": (74, 38),
    "irregular": (78, 38),
    "open": (60, 30),
    "columnar": (70, 34),
    "ornamental": (70, 36),
    "conifer": (86, 42),
}
INNER_SHARE = 0.36
CROSS_SHARE = 0.82
TRI_BUDGET = {"mature": 360, "young": 180}


def _tree_material():
    """``canopy_tree``: atlas × ``Col`` vertex colour, alpha rounded to 0/1 (glTF MASK)."""
    name = "canopy_tree"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(LEAF_ATLAS), check_existing=True)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    a_in = next(s for s in mix.inputs if s.name == "A" and s.type == "RGBA")
    b_in = next(s for s in mix.inputs if s.name == "B" and s.type == "RGBA")
    out = next(s for s in mix.outputs if s.type == "RGBA")
    nt.links.new(tex.outputs["Color"], a_in)
    nt.links.new(vc.outputs["Color"], b_in)
    nt.links.new(out, bsdf.inputs["Base Color"])
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "ROUND"
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    # Two-sided cards; the viewer undoes three.js's back-face normal flip so both sides
    # keep the outward crown normal (keepCrownNormals in viewer/index.html).
    mat.use_backface_culling = False
    return mat


class _TreeMesh:
    """Polygons with per-corner UV, colour and normal, written to one mesh / primitive."""

    def __init__(self) -> None:
        self.verts: list[tuple] = []
        self.faces: list[tuple] = []
        self.uv: list[tuple] = []
        self.col: list[tuple] = []
        self.nor: list[tuple] = []

    @property
    def tris(self) -> int:
        return sum(len(f) - 2 for f in self.faces)

    def add(self, cos, uvs, rgbs, nors) -> None:
        base = len(self.verts)
        self.verts.extend(tuple(c) for c in cos)
        self.faces.append(tuple(range(base, base + len(cos))))
        self.uv.extend(uvs)
        self.col.extend((min(1.0, c[0]), min(1.0, c[1]), min(1.0, c[2]), 1.0) for c in rgbs)
        self.nor.extend(tuple(Vector(n).normalized()) for n in nors)

    def to_mesh(self, name: str, mat):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.update()
        uv = mesh.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", [c for t in self.uv for c in t])
        col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        col.data.foreach_set("color", [c for t in self.col for c in t])
        mesh.color_attributes.active_color = col
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
        mesh.shade_smooth()
        mesh.normals_split_custom_set(self.nor)
        mesh.materials.append(mat)
        return mesh


def _frame(axis: Vector) -> tuple[Vector, Vector]:
    a = axis.normalized()
    ref = Vector((0.0, 0.0, 1.0)) if abs(a.z) < 0.9 else Vector((1.0, 0.0, 0.0))
    e1 = a.cross(ref).normalized()
    return e1, a.cross(e1).normalized()


def _scale(rgb, k: float) -> tuple:
    return (rgb[0] * k, rgb[1] * k, rgb[2] * k)


def _tube(m: _TreeMesh, rings, sides: int, rgb) -> None:
    """Tapered bark tube through ``rings`` [(centre, radius)], side quads only."""
    e1, e2 = _frame(rings[-1][0] - rings[0][0])
    n = len(rings) - 1
    dirs = [e1 * math.cos(math.tau * i / sides) + e2 * math.sin(math.tau * i / sides) for i in range(sides + 1)]
    for k in range(n):
        (c0, r0), (c1, r1) = rings[k], rings[k + 1]
        v0 = BARK_V[0] + (BARK_V[1] - BARK_V[0]) * k / n
        v1 = BARK_V[0] + (BARK_V[1] - BARK_V[0]) * (k + 1) / n
        k0, k1 = 0.72 + 0.28 * k / n, 0.72 + 0.28 * (k + 1) / n
        for i in range(sides):
            d0, d1 = dirs[i], dirs[i + 1]
            u0 = BARK_U[0] + (BARK_U[1] - BARK_U[0]) * i / sides
            u1 = BARK_U[0] + (BARK_U[1] - BARK_U[0]) * (i + 1) / sides
            m.add(
                (c0 + d0 * r0, c0 + d1 * r0, c1 + d1 * r1, c1 + d0 * r1),
                ((u0, v0), (u1, v0), (u1, v1), (u0, v1)),
                (_scale(rgb, k0), _scale(rgb, k0), _scale(rgb, k1), _scale(rgb, k1)),
                (d0, d1, d1, d0),
            )


def _tint(rgb, hue: float) -> tuple:
    """Shift a leaf colour toward yellow-green (hue > 0) or blue-green (hue < 0)."""
    return (rgb[0] * (1.0 + 0.22 * hue), rgb[1] * (1.0 + 0.05 * hue), rgb[2] * (1.0 - 0.2 * hue))


def _card(m: _TreeMesh, centre: Vector, face: Vector, along: Vector, w: float, h: float, tile, cols, nor_of) -> None:
    """One two-sided leaf-cluster quad facing ``face``, normals from the crown volume."""
    side = face.cross(along)
    if side.length < 1e-5:
        return
    side.normalize()
    up = along.normalized()
    hw, hh = w * 0.5, h * 0.5
    cos = [centre - side * hw - up * hh, centre + side * hw - up * hh, centre + side * hw + up * hh, centre - side * hw + up * hh]
    u0, v0, u1, v1 = tile
    m.add(cos, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], cols, [nor_of(c) for c in cos])


def _cluster(m: _TreeMesh, centre: Vector, face: Vector, along: Vector, w: float, h: float, tile, cols, nor_of, cross: bool) -> None:
    """One leaf clump: a single card, or two cards crossed so it reads as volume."""
    _card(m, centre, face, along, w, h, tile, cols, nor_of)
    if not cross:
        return
    side = face.cross(along)
    if side.length < 1e-5:
        return
    side.normalize()
    ang = math.radians(80)
    face2 = (face * math.cos(ang) + side * math.sin(ang)).normalized()
    _card(m, centre, face2, along, w * 0.88, h * 0.92, tile, cols, nor_of)


def _lobes(kind: str, form: str, r: float, clear: float, ch: float):
    """Crown volume as ellipsoids [(centre, radii)] sitting above the clear trunk."""
    def lobe(x, y, zf, rx, rzf):
        return Vector((x, y, clear + ch * zf)), Vector((rx, rx, ch * rzf))

    mature = form == "mature"
    ring = lambda angs, off: [(math.cos(a) * off, math.sin(a) * off) for a in angs]  # noqa: E731
    if kind == "broad":
        if not mature:
            return [lobe(0, 0, 0.52, r, 0.48)]
        return [lobe(0, 0, 0.6, 0.9 * r, 0.4)] + [
            lobe(x, y, 0.36, 0.55 * r, 0.3) for x, y in ring((0.3, 2.4, 4.4), 0.48 * r)
        ]
    if kind == "round":
        if not mature:
            return [lobe(0, 0, 0.5, r, 0.5)]
        return [lobe(0, 0, 0.5, 0.95 * r, 0.48), lobe(0.35 * r, 0.2 * r, 0.64, 0.6 * r, 0.34)]
    if kind == "irregular":
        if not mature:
            return [lobe(0.25 * r, 0, 0.45, 0.75 * r, 0.42), lobe(-0.3 * r, 0.15 * r, 0.64, 0.65 * r, 0.34)]
        spec = ((0.0, 0.36, 0.6), (1.7, 0.56, 0.55), (3.3, 0.33, 0.58), (4.9, 0.7, 0.45))
        return [lobe(math.cos(a) * 0.42 * r, math.sin(a) * 0.42 * r, zf, rf * r, 0.3) for a, zf, rf in spec]
    if kind == "open":
        if not mature:
            return [lobe(0.3 * r, 0, 0.4, 0.6 * r, 0.36), lobe(-0.3 * r, 0.1 * r, 0.7, 0.55 * r, 0.28)]
        spec = ((0.3, 0.3), (1.9, 0.52), (3.5, 0.4), (5.0, 0.75))
        return [lobe(math.cos(a) * 0.5 * r, math.sin(a) * 0.5 * r, zf, 0.45 * r, 0.24) for a, zf in spec]
    if kind == "ornamental":
        if not mature:
            return [lobe(0, 0, 0.5, r, 0.48)]
        return [lobe(0, 0, 0.52, 0.85 * r, 0.44)] + [
            lobe(x, y, 0.4, 0.5 * r, 0.3) for x, y in ring((0.5, 3.6), 0.5 * r)
        ]
    return [lobe(0, 0, 0.5, r, 0.5)]  # columnar


def _broadleaf(m: _TreeMesh, kind: str, form: str, h: float, r: float, clear: float, rb: float, rng) -> None:
    mature = form == "mature"
    ch = h - clear
    leaf = CANOPY_RGB[kind]
    lobes = _lobes(kind, form, r, clear, ch)

    # Trunk: root flare, clear stem, leader fading into the crown.
    top = clear + ch * (0.55 if mature else 0.5)
    if mature:
        rings = [(0.0, rb * 1.45), (min(0.6, 0.06 * h), rb), (clear, rb * 0.72), (top, rb * 0.28)]
    else:
        rings = [(0.0, rb * 1.15), (clear, rb * 0.75), (top, rb * 0.3)]
    _tube(m, [(Vector((0.0, 0.0, z)), rr) for z, rr in rings], 7, TRUNK_RGB)

    # Primary limbs from the top of the clear stem into the crown.
    if len(lobes) > 1:
        targets = [c for c, _ in lobes if c.xy.length > 0.05 * r]
    else:
        targets = []
    if len(targets) < (3 if mature else 2):
        angs = (0.3, 2.4, 4.5) if mature else (0.8, 3.9)
        upright = 0.25 if kind == "columnar" else 0.45
        targets = [Vector((math.cos(a) * r * upright, math.sin(a) * r * upright, clear + ch * 0.55)) for a in angs]
    for k, tgt in enumerate(targets[: 3 if mature else 2]):
        z0 = clear * (0.9 + 0.05 * k) if mature else clear * 0.95
        start = Vector((0.0, 0.0, z0))
        end = start.lerp(tgt, 0.85)
        lr = rb * (0.5 if mature else 0.4)
        _tube(m, [(start, lr), (end, lr * 0.25)], 5 if mature else 4, TRUNK_RGB)

    # Leaf clusters: dark inner fillers, then a crossed outer shell that pokes past the
    # ellipsoid so the silhouette is a clump, not a smooth blob.
    n_want = CLUSTERS[kind][0 if mature else 1]
    n_inner = round(n_want * INNER_SHARE)
    z_lo = min(c.z - rad.z for c, rad in lobes)
    z_hi = max(c.z + rad.z for c, rad in lobes)
    weights = [rad.x * rad.z for _, rad in lobes]
    total = sum(weights)
    for i in range(n_want):
        inner = i < n_inner
        n_outer = max(1, n_want - n_inner)
        cross = (not inner) and ((i - n_inner) / n_outer < CROSS_SHARE)
        need = 4 if cross else 2
        room = TRI_BUDGET[form] - m.tris
        if room < 2:
            break
        if room < need:
            cross = False
        pick = rng.uniform(0.0, total)
        li = 0
        while li < len(lobes) - 1 and pick > weights[li]:
            pick -= weights[li]
            li += 1
        c, rad = lobes[li]
        while True:
            d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
            if d.z > -0.55 or rng.random() < 0.4:
                break
        f = rng.uniform(0.22, 0.58) if inner else 0.72 + 0.26 * rng.random() ** 0.7
        p = c + Vector((d.x * rad.x, d.y * rad.y, d.z * rad.z)) * f
        span = (rad.x + rad.z) * 0.5
        size = min(
            1.05 * math.sqrt(4.0 * math.pi * span * span / n_outer),
            0.95 * min(rad.x * 1.7, rad.z * 1.15),
        )
        size *= (1.35 if inner else 1.0) * rng.uniform(0.85, 1.12)
        size = min(size, 2.6 if mature else 1.25)
        p.z = max(p.z, clear + size * 0.28)
        if not inner and rng.random() < 0.22:
            face = (
                Vector((0.0, 0.0, 1.0))
                + d * 0.45
                + Vector((rng.gauss(0, 0.4), rng.gauss(0, 0.4), rng.gauss(0, 0.15)))
            ).normalized()
        else:
            spread = 1.1 if inner else 0.65
            face = (d + Vector((rng.gauss(0, spread), rng.gauss(0, spread), rng.gauss(0, spread)))).normalized()
        e1, e2 = _frame(face)
        roll = rng.uniform(0.0, math.tau)
        along = e1 * math.cos(roll) + e2 * math.sin(roll)
        tile = rng.choices(LEAF_TILES, LEAF_TILE_WEIGHTS)[0]
        base = _tint(leaf, rng.uniform(-1.0, 1.0)) if not inner else leaf
        depth = 0.52 + 0.12 * rng.random() if inner else 0.80 + 0.26 * min(1.0, max(0.0, f - 0.72) / 0.26)
        jitter = rng.uniform(0.88, 1.12)
        aspect = rng.uniform(0.78, 1.18)

        def shade(q: Vector, base=base, k=depth * jitter) -> tuple:
            hf = min(1.0, max(0.0, (q.z - z_lo) / max(1e-3, z_hi - z_lo)))
            return _scale(base, k * (0.58 + 0.58 * hf))

        def nor_of(q: Vector, c=c, rad=rad) -> Vector:
            g = q - c
            return Vector((g.x / rad.x**2, g.y / rad.y**2, g.z / rad.z**2)).normalized() + Vector((0, 0, 0.25))

        _cluster(m, p, face, along, size * aspect, size / aspect, tile, [shade(p)] * 4, nor_of, cross)


def _conifer(m: _TreeMesh, form: str, h: float, r: float, clear: float, rb: float, rng) -> None:
    mature = form == "mature"
    ch = h - clear
    leaf = CANOPY_RGB["conifer"]
    _tube(m, [(Vector((0.0, 0.0, z)), rr) for z, rr in ((0.0, rb * 1.2), (clear, rb * 0.8), (h * 0.9, rb * 0.15))], 7, TRUNK_RGB)
    n_want = CLUSTERS["conifer"][0 if mature else 1]
    n_inner = round(n_want * INNER_SHARE)
    up = Vector((0.0, 0.0, 1.0))
    # Sprays tier up the cone: dark ones close to the stem, lit crossed ones at the tips.
    for i in range(n_want):
        inner = i < n_inner
        n_outer = max(1, n_want - n_inner)
        cross = (not inner) and ((i - n_inner) / n_outer < CROSS_SHARE)
        need = 4 if cross else 2
        room = TRI_BUDGET[form] - m.tris
        if room < 2:
            break
        if room < need:
            cross = False
        t = (i + rng.random()) / n_want
        z = clear + ch * (0.03 + 0.9 * t)
        rz = r * (1.0 - (z - clear) / ch) * 0.95 + 0.08 * r
        ang = rng.uniform(0.0, math.tau)
        out = Vector((math.cos(ang), math.sin(ang), 0.0))
        length = (0.62 * rz + 0.16 * r) * rng.uniform(0.85, 1.12)
        p = Vector((0.0, 0.0, z)) + out * (rz * (rng.uniform(0.15, 0.4) if inner else rng.uniform(0.48, 0.92)))
        tilt = 0.6 if inner else 0.35
        face = (up * 0.75 + out * 0.6 + Vector((rng.gauss(0, tilt), rng.gauss(0, tilt), rng.gauss(0, 0.2)))).normalized()
        along = (out - face * out.dot(face)).normalized()
        jitter = rng.uniform(0.9, 1.1)
        if inner:
            col = _scale(leaf, jitter * (0.4 + 0.2 * t))
        else:
            col = _scale(_tint(leaf, rng.uniform(-1.0, 1.0)), jitter * (0.7 + 0.45 * t))
        _cluster(
            m, p, face, along.cross(face), length, length * 0.48, NEEDLE_TILE, [col, col, col, col],
            lambda q: Vector((q.x, q.y, 0.0)).normalized() * 0.8 + up * 0.55,
            cross,
        )


def _archetype_mesh(kind: str, form: str, mat):
    """Model one (kind, form) at its reference size, trunk base at the origin.

    The trunk is clear up to ``treeplan.crown_clearance`` so every scaled instance
    keeps its foliage above a walker's head.
    """
    from cityview.props import trunk_radius

    h, r = ARCHETYPE_REF[(kind, form)]
    shape = "conifer" if kind == "conifer" else ("columnar" if kind == "columnar" else "broadleaf")
    clear = treeplan.crown_clearance(h, shape, kind)
    rb = trunk_radius(h, r)
    rng = random.Random(f"{kind}-{form}")
    m = _TreeMesh()
    if kind == "conifer":
        _conifer(m, form, h, r, clear, rb, rng)
    else:
        _broadleaf(m, kind, form, h, r, clear, rb, rng)
    if m.tris > TRI_BUDGET[form]:
        raise ValueError(f"tree_{kind}_{form}: {m.tris} tris > {TRI_BUDGET[form]}")
    mesh = m.to_mesh(f"tree_{kind}_{form}", mat)
    mesh["tris"] = m.tris
    return mesh


def add_instanced_trees(layout: dict, rails, spawn_xy=None) -> dict:
    """Every tree is an instance of a (kind, form) archetype, grouped per streaming cell.

    Trees of one cell are children of one Empty (``trees_<cell>``), which the glTF
    exporter's ``export_gpu_instances`` turns into ``EXT_mesh_gpu_instancing``: three.js
    loads one ``InstancedMesh`` per archetype and cell. Splitting cells into 128 m tiles
    for frustum culling doubled the tree draw calls for 20-30 % fewer tree triangles.
    """
    from cityview.district_chunks import assign_object, cell_tag

    mat = _tree_material()
    meshes: dict[tuple[str, str], object] = {}
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
        if kind not in KINDS:
            kind = "round"
        h = float(tree.get("height") or 8.0)
        r = float(tree.get("radius") or 2.5)
        form = tree.get("form") or treeplan.form_for(h)
        mesh = meshes.get((kind, form))
        if mesh is None:
            mesh = meshes[(kind, form)] = _archetype_mesh(kind, form, mat)
        h0, r0 = ARCHETYPE_REF[(kind, form)]
        key = assign_object("tree", x, y, spawn_xy=spawn_xy)
        parent = groups.get(key)
        if parent is None:
            label = "core" if key == "core" else f"{key[0]}_{key[1]}"
            parent = bpy.data.objects.new(f"trees_{label}{cell_tag(key)}", None)
            parent.location = (x, y, 0.0)
            bpy.context.collection.objects.link(parent)
            groups[key] = parent
        obj = bpy.data.objects.new(f"tree_{i}", mesh)
        obj.parent = parent
        obj.location = (x - parent.location.x, y - parent.location.y, 0.0)
        obj.rotation_euler = (0.0, 0.0, float(tree.get("tone") or 0.5) * math.tau)
        obj.scale = (r / r0, r / r0, h / h0)
        bpy.context.collection.objects.link(obj)
        counts[source if source in counts else "fill"] += 1
        per_kind[f"{kind}/{form}"] = per_kind.get(f"{kind}/{form}", 0) + 1
    counts["archetypes"] = per_kind
    counts["groups"] = len(groups)
    counts["meshes"] = len(meshes)
    counts["mesh_tris"] = {m.name: int(m.get("tris", 0)) for m in meshes.values()}
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
            clear = max(2.0, 0.38 * h)
            crown_h = max(1.2, h - clear)
            vert = max(1.0, min(r * 1.1, crown_h * 0.55))
            cz = clear + vert * 0.85
            wood.cone(trunk_mat, (x, y, 0.0), trunk_r, trunk_r * 0.6, max(clear * 0.95, 1.8), 6)
            leaves.blob(leaf, (x, y, cz), (r, r, vert), yaw, subdiv=2)
            for k, sign in enumerate((1.0, -1.0)):
                ang = yaw + k * 2.4
                ox = math.cos(ang) * r * 0.55 * sign
                oy = math.sin(ang) * r * 0.55 * sign
                lz = max(clear + vert * 0.35, cz - vert * (0.15 + 0.12 * k))
                leaves.blob(
                    leaf,
                    (x + ox, y + oy, lz),
                    (r * 0.68, r * 0.68, vert * 0.65),
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
        yaw = tone * math.tau
        # Multi-lobe mound on the ground — no trunk (distinct from even the smallest tree).
        shrubs.blob(mat, (x, y, hh * 0.42), (w * 0.55, w * 0.5, hh * 0.5), yaw)
        shrubs.blob(
            mat,
            (x + math.cos(yaw) * w * 0.28, y + math.sin(yaw) * w * 0.28, hh * 0.32),
            (w * 0.4, w * 0.38, hh * 0.4),
            yaw + 1.1,
            subdiv=1,
        )
        shrubs.blob(
            mat,
            (x - math.cos(yaw) * w * 0.22, y - math.sin(yaw) * w * 0.22, hh * 0.28),
            (w * 0.36, w * 0.34, hh * 0.35),
            yaw - 0.8,
            subdiv=1,
        )
        counts["bushes"] += 1

    counts["objects"] = wood.flush("tree_trunks") + leaves.flush("tree_crowns") + shrubs.flush("shrubs")
    return counts
