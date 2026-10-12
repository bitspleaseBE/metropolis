"""Velo Antwerpen ride bike at real size → viewer/vehicles/velo.glb.

    blender --background --python scripts/build_velo_glb.py
    blender --background --python scripts/build_velo_glb.py -- --preview /tmp/velo.png

Red step-through frame, white rear panel with the logo, silver front carrier,
swept-back bars, and a sprung Dutch saddle. The rider sits upright like the
city bikes on the Groenplaats.

Blender frame: front +Y, up +Z, rider's right +X, origin on the ground under the
bottom bracket. glTF turns +Y into Three −Z, so the bike faces −Z like the player.

Moving parts are their own nodes with the origin on their axle:
``velo_wheel_front``, ``velo_wheel_rear``, and ``velo_crank``. At rest the left
crank points up, so ``crank.rotation.x = −π/2 − phase`` puts the left pedal
forward at phase 0 and pushes it down as the phase grows.

Ride points for the IK are empties under the ``velo`` root: ``seat_saddle``
(where the sit bones rest), ``seat_crank``, ``grip_L``, ``grip_R``. The root
carries ``crankR``, ``pedalX``, and ``wheelR`` as glTF extras.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "viewer" / "vehicles" / "velo.glb"

WHEEL_R = 0.335
TYRE = 0.022
REAR = Vector((0.0, -0.44, WHEEL_R))
FRONT = Vector((0.0, 0.72, WHEEL_R))
BB = Vector((0.0, 0.0, 0.28))
CRANK = 0.17
PEDAL_X = 0.125
SADDLE = Vector((0.0, -0.29, 0.962))
GRIP = Vector((0.272, 0.32, 1.02))
HEAD_LO = Vector((0.0, 0.56, 0.64))
HEAD_HI = Vector((0.0, 0.4925, 0.807))
SEAT_TOP = Vector((0.0, -0.18, 0.78))


def srgb(h: int) -> tuple[float, float, float]:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return tuple(lin(((h >> s) & 255) / 255.0) for s in (16, 8, 0))


def material(name: str, rgb, metal: float = 0.0, rough: float = 0.5):
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1.0)
    return m


class Part:
    """One mesh object. Primitives are built in their own bmesh and merged in."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.bm = bmesh.new()
        self.mats: list = []

    def add(self, src: bmesh.types.BMesh, mat) -> None:
        if mat not in self.mats:
            self.mats.append(mat)
        mi = self.mats.index(mat)
        vmap = {v: self.bm.verts.new(v.co) for v in src.verts}
        for f in src.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            nf.material_index = mi
            nf.smooth = f.smooth
        src.free()

    def to_object(self, parent, location=(0.0, 0.0, 0.0)):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = location
        return ob


def V(*a) -> Vector:
    return Vector(a)


def spline(ctrl, per: int = 8) -> list[Vector]:
    """Catmull-Rom through the control points."""
    p = [Vector(c) for c in ctrl]
    if len(p) == 2:
        return [p[0].lerp(p[1], i / per) for i in range(per + 1)]
    out = []
    for i in range(len(p) - 1):
        p0, p1, p2 = p[max(i - 1, 0)], p[i], p[i + 1]
        p3 = p[min(i + 2, len(p) - 1)]
        for s in range(per):
            t = s / per
            out.append(
                0.5
                * (
                    2 * p1
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
                )
            )
    out.append(p[-1])
    return out


def sweep(pts, radius, segs: int = 12, closed: bool = False, caps: bool = True, squash: float = 1.0):
    """Round tube along points. Parallel transport keeps the seams from twisting."""
    bm = bmesh.new()
    n = len(pts)
    tans = []
    for i in range(n):
        if closed:
            a, b = pts[(i - 1) % n], pts[(i + 1) % n]
        else:
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        tans.append((b - a).normalized())
    ref = V(0, 0, 1) if abs(tans[0].z) < 0.9 else V(1, 0, 0)
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
    rings = []
    for i in range(n):
        t = tans[i]
        nrm = (nrm - t * nrm.dot(t)).normalized()
        bi = t.cross(nrm)
        r = radius(i / max(1, n - 1)) if callable(radius) else radius
        ring = []
        for k in range(segs):
            a = math.tau * k / segs
            ring.append(bm.verts.new(pts[i] + (nrm * math.cos(a) * squash + bi * math.sin(a)) * r))
        rings.append(ring)
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            f = bm.faces.new((r0[k], r0[(k + 1) % segs], r1[(k + 1) % segs], r1[k]))
            f.smooth = True
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0]))).smooth = False
        bm.faces.new(rings[-1]).smooth = False
    return bm


def tube(ctrl, radius, segs: int = 12, per: int = 8, **kw):
    return sweep(spline(ctrl, per), radius, segs, **kw)


def ring_yz(center: Vector, r: float, n: int = 48, x: float = 0.0) -> list[Vector]:
    return [center + V(x, r * math.cos(math.tau * i / n), r * math.sin(math.tau * i / n)) for i in range(n)]


def torus_yz(center: Vector, major: float, minor: float, n: int = 48, segs: int = 10, x: float = 0.0):
    return sweep(ring_yz(center, major, n, x), minor, segs, closed=True)


def box(center, size, bevel: float = 0.004, rot: Matrix | None = None):
    bm = bmesh.new()
    m = Matrix.Translation(Vector(center)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    if bevel > 0:
        bmesh.ops.bevel(
            bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True
        )
    for f in bm.faces:
        f.smooth = False
    return bm


def prism(outline_yz, x0: float, x1: float):
    """Flat plate: a (y, z) outline extruded across X."""
    bm = bmesh.new()
    a = [bm.verts.new(V(x0, y, z)) for y, z in outline_yz]
    b = [bm.verts.new(V(x1, y, z)) for y, z in outline_yz]
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    for f in bm.faces:
        f.smooth = False
    return bm


def sector(center: Vector, r_in: float, r_out: float, a0: float, a1: float, n: int = 24):
    """Annular sector in YZ around a wheel axle. Angle 0 is the bike's front."""
    outer = [
        (center.y + r_out * math.cos(a0 + (a1 - a0) * i / n), center.z + r_out * math.sin(a0 + (a1 - a0) * i / n))
        for i in range(n + 1)
    ]
    inner = [
        (center.y + r_in * math.cos(a1 - (a1 - a0) * i / n), center.z + r_in * math.sin(a1 - (a1 - a0) * i / n))
        for i in range(n + 1)
    ]
    return outer + inner


def disc_x(center: Vector, r: float, x0: float, x1: float, n: int = 24):
    return sweep([center + V(x0, 0, 0), center + V(x1, 0, 0)], r, n)


def loft(stations, n: int = 16):
    """Saddle shell: (y, half width, half height, z) rings along the bike."""
    bm = bmesh.new()
    rings = []
    for y, hw, hh, zc in stations:
        ring = []
        for k in range(n):
            a = math.tau * k / n
            c, s = math.cos(a), math.sin(a)
            sx = math.copysign(abs(c) ** 0.7, c)
            sz = math.copysign(abs(s) ** (0.55 if s > 0 else 0.9), s)
            ring.append(bm.verts.new(V(hw * sx, y, zc + hh * sz)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k])).smooth = True
    bm.faces.new(list(reversed(rings[0]))).smooth = True
    bm.faces.new(rings[-1]).smooth = True
    return bm


def mirror_x(ctrl):
    return [V(-p[0], p[1], p[2]) for p in ctrl]


def build_wheel(name: str, M, hub_r: float, hub_w: float, parent, at: Vector):
    p = Part(name)
    o = V(0, 0, 0)
    p.add(torus_yz(o, WHEEL_R - TYRE, TYRE, 56, 12), M["tyre"])
    p.add(torus_yz(o, WHEEL_R - TYRE * 1.9, 0.008, 56, 8, x=-0.009), M["rim"])
    p.add(torus_yz(o, WHEEL_R - TYRE * 1.9, 0.008, 56, 8, x=0.009), M["rim"])
    p.add(disc_x(o, hub_r, -hub_w * 0.5, hub_w * 0.5, 18), M["silver"])
    p.add(disc_x(o, 0.009, -hub_w * 0.5 - 0.03, hub_w * 0.5 + 0.03, 8), M["dark"])
    rim_r = WHEEL_R - TYRE * 2.2
    spokes = 32
    for i in range(spokes):
        a = math.tau * i / spokes
        side = 1 if i % 2 else -1
        lace = 0.35 * (1 if (i // 2) % 2 else -1)
        hub = V(side * hub_w * 0.42, hub_r * 0.8 * math.cos(a + lace), hub_r * 0.8 * math.sin(a + lace))
        rim = V(side * 0.004, rim_r * math.cos(a), rim_r * math.sin(a))
        p.add(sweep([hub, rim], 0.0016, 4, caps=False), M["spoke"])
    return p.to_object(parent, at)


def build_crank(M, parent):
    p = Part("velo_crank")
    o = V(0, 0, 0)
    p.add(disc_x(o, 0.013, -0.09, 0.09, 12), M["silver"])
    p.add(disc_x(o, 0.095, 0.062, 0.068, 36), M["dark"])
    p.add(torus_yz(o, 0.095, 0.004, 36, 6, x=0.065), M["silver"])
    for side, up in ((-1, 1), (1, -1)):
        x = side * 0.085
        tip = V(x, 0, up * CRANK)
        p.add(sweep([V(x, 0, 0), tip], 0.011, 10, squash=0.6), M["silver"])
        p.add(disc_x(tip, 0.006, 0, side * 0.03, 8), M["silver"])
        pc = V(side * PEDAL_X, 0, up * CRANK)
        p.add(box(pc, (0.085, 0.07, 0.022), 0.005), M["rubber"])
        p.add(box(pc + V(0, 0.036, 0), (0.08, 0.008, 0.012), 0.002), M["tail"])
        p.add(box(pc + V(0, -0.036, 0), (0.08, 0.008, 0.012), 0.002), M["tail"])
    return p.to_object(parent, BB)


def build_body(M, parent):
    p = Part("velo_body")
    red, white, silver, dark, rubber = M["red"], M["white"], M["silver"], M["dark"], M["rubber"]

    # Frame: one sweeping low down tube, a second tube above it, the seat tube, and the stays.
    p.add(tube([HEAD_LO + V(0, -0.01, 0.05), V(0, 0.42, 0.44), V(0, 0.2, 0.285), BB + V(0, 0.03, -0.005)], 0.026, 16, 10), red)
    p.add(tube([HEAD_HI + V(0, 0.01, -0.04), V(0, 0.28, 0.63), V(0, 0.05, 0.585), V(0, -0.1, 0.56)], 0.019, 14, 10), red)
    p.add(tube([BB, SEAT_TOP], 0.021, 14), red)
    p.add(tube([HEAD_LO + V(0, 0.02, -0.03), HEAD_HI + V(0, -0.005, 0.015)], 0.028, 16), red)
    p.add(tube([HEAD_LO + V(0, 0.01, -0.045), HEAD_LO + V(0, 0.015, -0.03)], 0.031, 16), silver)
    p.add(tube([HEAD_HI, HEAD_HI + V(0, -0.006, 0.02)], 0.03, 16), silver)
    for s in (-1, 1):
        p.add(tube([BB + V(s * 0.03, -0.02, 0.0), V(s * 0.06, -0.25, 0.31), REAR + V(s * 0.062, 0, 0)], 0.012, 10), red)
        p.add(tube([SEAT_TOP + V(s * 0.022, 0.008, -0.04), V(s * 0.055, -0.3, 0.56), REAR + V(s * 0.062, 0, 0.005)], 0.011, 10), red)
        # Fork: straight off the head tube, then raked forward to the axle.
        p.add(
            tube([HEAD_LO + V(s * 0.03, 0.01, -0.05), V(s * 0.05, 0.62, 0.5), FRONT + V(s * 0.055, 0, 0.0)], 0.014, 10),
            red,
        )
    p.add(tube([HEAD_LO + V(-0.05, 0.015, -0.05), HEAD_LO + V(0.05, 0.015, -0.05)], 0.018, 12), red)
    p.add(box(SEAT_TOP + V(0, 0.0, 0.005), (0.05, 0.05, 0.03), 0.008), red)

    # Lock box on the seat tube, like the Velo's red ID unit.
    p.add(box((0.0, -0.105, 0.69), (0.075, 0.055, 0.11), 0.012), red)
    p.add(box((0.0, -0.075, 0.70), (0.045, 0.004, 0.035), 0.002), dark)

    # Seat post, clamp, and a wide Dutch saddle with springs.
    post_top = V(0, -0.222, 0.895)
    p.add(tube([SEAT_TOP, post_top], 0.0135, 12), silver)
    p.add(box(post_top + V(0, -0.015, 0.012), (0.05, 0.06, 0.02), 0.004), dark)
    for s in (-1, 1):
        p.add(
            sweep(spline([V(s * 0.06, -0.335, 0.905), V(s * 0.06, -0.335, 0.885), V(s * 0.06, -0.335, 0.865)], 4), 0.011, 10),
            silver,
        )
        p.add(tube([V(s * 0.02, -0.17, 0.905), V(s * 0.05, -0.27, 0.9), V(s * 0.06, -0.335, 0.905)], 0.004, 6), silver)
    p.add(tube([V(-0.06, -0.335, 0.87), V(0, -0.29, 0.88), V(0.06, -0.335, 0.87)], 0.005, 6), silver)
    p.add(
        loft(
            [
                (-0.372, 0.085, 0.012, 0.93),
                (-0.36, 0.118, 0.03, 0.93),
                (-0.325, 0.127, 0.036, 0.929),
                (-0.275, 0.112, 0.034, 0.927),
                (-0.225, 0.078, 0.03, 0.925),
                (-0.175, 0.048, 0.026, 0.923),
                (-0.125, 0.036, 0.022, 0.921),
                (-0.1, 0.022, 0.013, 0.92),
            ],
            20,
        ),
        rubber,
    )

    # Tall stem and swept-back city bars.
    p.add(tube([HEAD_HI + V(0, 0, 0.01), V(0, 0.455, 0.9), V(0, 0.475, 0.985)], 0.0145, 12, 6), silver)
    p.add(box((0, 0.475, 0.99), (0.05, 0.035, 0.035), 0.008), silver)
    bar_r = [V(0.0, 0.477, 0.99), V(0.17, 0.452, 1.0), V(0.26, 0.37, 1.014), V(0.305, 0.262, 1.026)]
    p.add(tube(list(reversed(mirror_x(bar_r[1:]))) + bar_r, 0.0115, 12, 8), silver)
    grip_dir = (V(0.305, 0.262, 1.026) - V(0.245, 0.38, 1.012)).normalized()
    for s in (-1, 1):
        a = V(s * 0.245, 0.38, 1.012)
        b = V(s * 0.305, 0.262, 1.026)
        p.add(tube([a, b + V(s * grip_dir.x, grip_dir.y, grip_dir.z) * 0.012], 0.0175, 14), rubber)
        p.add(tube([a - (b - a).normalized() * 0.006, a], 0.021, 14), rubber)
        # Brake lever forward of the grip, and its clamp.
        side = V(s * 0.894, 0.447, 0)
        p.add(box(a + V(s * -0.01, 0.01, 0.0), (0.03, 0.03, 0.028), 0.006), dark)
        p.add(tube([a + side * 0.02 + V(0, 0, -0.012), b + side * 0.045 + V(0, 0, -0.022)], 0.0055, 8, squash=0.5), silver)
        # Brake cable down to the fork.
        p.add(
            tube(
                [a + V(-s * 0.01, 0.02, -0.01), V(s * 0.12, 0.55, 0.96), V(s * 0.04, 0.6, 0.8), V(s * 0.04, 0.6, 0.66)],
                0.0035,
                6,
                10,
            ),
            rubber,
        )
    p.add(disc_x(V(0.12, 0.465, 1.022), 0.024, -0.012, 0.012, 16), silver)

    # Front carrier: a platform, a tall rear loop, and stays to the axle.
    plat = 0.8
    fy0, fy1, hw = 0.6, 0.96, 0.15
    p.add(
        tube(
            [V(-hw, fy0, plat), V(-hw, fy1, plat), V(hw, fy1, plat), V(hw, fy0, plat)],
            0.009,
            10,
            1,
        ),
        silver,
    )
    for y in (0.69, 0.78, 0.87):
        p.add(tube([V(-hw, y, plat), V(hw, y, plat)], 0.005, 6, 1), silver)
    p.add(tube([V(-0.08, fy0, plat), V(-0.08, fy1, plat)], 0.005, 6, 1), silver)
    p.add(tube([V(0.08, fy0, plat), V(0.08, fy1, plat)], 0.005, 6, 1), silver)
    p.add(
        tube([V(-hw, fy0, plat), V(-hw, fy0 - 0.02, 0.98), V(-0.1, fy0 - 0.025, 1.05), V(0.1, fy0 - 0.025, 1.05), V(hw, fy0 - 0.02, 0.98), V(hw, fy0, plat)], 0.009, 10, 8),
        silver,
    )
    for s in (-1, 1):
        p.add(tube([V(s * hw, fy1, plat), V(s * 0.1, 0.86, 0.55), FRONT + V(s * 0.068, 0, 0)], 0.007, 8, 6), silver)
    p.add(tube([V(0, fy0, plat), HEAD_LO + V(0, 0.02, 0.06)], 0.009, 8, 1), silver)

    # Headlamp under the front of the carrier.
    p.add(sweep([V(0, fy1 - 0.035, plat - 0.045), V(0, fy1 + 0.02, plat - 0.045)], 0.032, 16), dark)
    p.add(box((0, fy1 - 0.02, plat - 0.012), (0.02, 0.02, 0.03), 0.003), dark)

    # Mudguards. Front: a white shell with number plates on the fork legs.
    p.add(prism(sector(FRONT, WHEEL_R + 0.018, WHEEL_R + 0.03, math.radians(8), math.radians(150), 30), -0.034, 0.034), white)
    for s in (-1, 1):
        p.add(box(FRONT + V(s * 0.068, -0.02, 0.105), (0.008, 0.1, 0.11), 0.006), white)
        p.add(box(FRONT + V(s * 0.073, -0.02, 0.105), (0.002, 0.07, 0.03), 0.0), dark)

    # Rear: the big white panel over the top of the wheel, with the A and velo logo.
    p.add(prism(sector(REAR, WHEEL_R + 0.02, WHEEL_R + 0.034, math.radians(32), math.radians(196), 36), -0.075, 0.075), white)
    for s in (-1, 1):
        x0, x1 = s * 0.07, s * 0.082
        p.add(prism(sector(REAR, 0.06, WHEEL_R + 0.034, math.radians(30), math.radians(186), 36), min(x0, x1), max(x0, x1)), white)
        lx = s * 0.0835
        ang = math.radians(98)
        cy = REAR.y + 0.23 * math.cos(ang)
        cz = REAR.z + 0.23 * math.sin(ang)
        p.add(box((lx, cy + 0.055, cz), (0.002, 0.085, 0.085), 0.0), M["logo_red"])
        p.add(box((lx, cy - 0.05, cz), (0.002, 0.11, 0.085), 0.0), M["logo_yellow"])
    tail_at = REAR + V(0, (WHEEL_R + 0.035) * math.cos(math.radians(176)), (WHEEL_R + 0.035) * math.sin(math.radians(176)))
    p.add(box(tail_at + V(0, -0.006, 0.0), (0.055, 0.014, 0.03), 0.004), M["tail"])

    # Chain guard on the drive side, kickstand folded along the left stay.
    guard = [(0.115, 0.3), (0.085, 0.37), (0.0, 0.392), (-0.45, 0.372), (-0.482, 0.345), (-0.455, 0.318), (-0.05, 0.312), (0.06, 0.27)]
    p.add(prism(guard, 0.088, 0.096), dark)
    p.add(tube([V(-0.07, -0.22, 0.3), V(-0.085, -0.5, 0.25)], 0.009, 8), dark)
    p.add(box((-0.085, -0.51, 0.247), (0.03, 0.04, 0.012), 0.004), dark)

    return p.to_object(parent)


def build_lamps(M, parent):
    p = Part("velo_lamps")
    p.add(sweep([V(0, 0.982, 0.755), V(0, 0.986, 0.755)], 0.027, 16), M["lamp"])
    tail_at = REAR + V(0, (WHEEL_R + 0.035) * math.cos(math.radians(176)), (WHEEL_R + 0.035) * math.sin(math.radians(176)))
    p.add(box(tail_at + V(0, -0.015, 0.0), (0.045, 0.006, 0.022), 0.002), M["tail_lens"])
    return p.to_object(parent)


def empty(name: str, at: Vector, parent):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = at
    return ob


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = {
        "red": material("velo_frame", srgb(0xED0B0D), 0.15, 0.38),
        "white": material("velo_panel", srgb(0xF4F2EE), 0.0, 0.42),
        "silver": material("velo_silver", srgb(0xC9CBCF), 1.0, 0.24),
        "rim": material("velo_rim", srgb(0xB9BBBF), 1.0, 0.3),
        "spoke": material("velo_spoke", srgb(0xA8AAAE), 1.0, 0.32),
        "dark": material("velo_dark", srgb(0x232426), 0.4, 0.5),
        "rubber": material("velo_rubber", srgb(0x161616), 0.0, 0.72),
        "tyre": material("velo_tyre", srgb(0x1A1A1A), 0.0, 0.85),
        "logo_red": material("velo_logo_red", srgb(0xE30613), 0.0, 0.4),
        "logo_yellow": material("velo_logo_yellow", srgb(0xF6A800), 0.0, 0.4),
        "tail": material("velo_reflector", srgb(0xB01515), 0.0, 0.35),
        "lamp": material("velo_lamp", srgb(0xFFF6DD), 0.0, 0.3),
        "tail_lens": material("velo_tail", srgb(0xA01010), 0.0, 0.3),
    }
    root = bpy.data.objects.new("velo", None)
    bpy.context.scene.collection.objects.link(root)
    root["crankR"] = CRANK
    root["pedalX"] = PEDAL_X
    root["wheelR"] = WHEEL_R

    build_body(M, root)
    build_lamps(M, root)
    build_wheel("velo_wheel_front", M, 0.034, 0.09, root, FRONT)
    build_wheel("velo_wheel_rear", M, 0.048, 0.1, root, REAR)
    build_crank(M, root)
    empty("seat_saddle", SADDLE, root)
    empty("seat_crank", BB, root)
    empty("grip_L", V(-GRIP.x, GRIP.y, GRIP.z), root)
    empty("grip_R", GRIP, root)
    return root


def export() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        export_yup=True,
        export_extras=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print(f"OK {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


def preview(path: str) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.filepath = path
    world = bpy.data.worlds.new("w")
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.55, 0.65, 0.8, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (2.6, 0.9, 1.05)
    target = Vector((0.0, 0.12, 0.58))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    ground = bpy.data.meshes.new("ground")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4.0)
    bm.to_mesh(ground)
    bm.free()
    g = bpy.data.objects.new("ground", ground)
    g.data.materials.append(material("ground", (0.35, 0.35, 0.36), 0.0, 0.9))
    scene.collection.objects.link(g)
    bpy.ops.render.render(write_still=True)
    print(f"Preview {path}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    build()
    export()
    if "--preview" in argv:
        preview(argv[argv.index("--preview") + 1])


main()
