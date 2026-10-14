"""Quick look at the Grote Markt models (houses, Stadhuis, Brabo, Hansahuis) without a city build.

    blender -b --python scripts/preview_grote_markt.py -- [--only brabo,stadhuis] [--res 900]

Neighbouring buildings are grey extrusions; cameras match WORLD_SHOTS in render_landmarks.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from cityview import landmark_models as LM  # noqa: E402
from cityview import landmarks  # noqa: E402
from cityview.mesh_glb import _MAT_PBR  # noqa: E402
from render_landmarks import WORLD_SHOTS  # noqa: E402

CUSTOMS = {"guild_house", "hansahuis", "stadhuis", "olv_cathedral"}


def _mat(name: str):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r, g, b, rough, metal = _MAT_PBR.get(name, (0.5, 0.5, 0.5, 0.9, 0.0))
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


def _add(kit, name: str) -> None:
    names = sorted(kit.materials_used())
    slot = {n: i for i, n in enumerate(names)}
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new(v) for v in kit.verts]
    for face, mname in zip(kit.faces, kit.mats):
        try:
            bf = bm.faces.new([verts[i] for i in face])
        except ValueError:
            continue
        bf.material_index = slot[mname]
    for cap in getattr(kit, "caps", []):
        try:
            bf = bm.faces.new([bm.verts.new((x, y, cap.z)) for x, y in cap.outer])
            bf.material_index = slot.get(cap.mat, 0)
        except (ValueError, AttributeError):
            pass
    bm.to_mesh(mesh)
    bm.free()
    for n in names:
        mesh.materials.append(_mat(n))


def _box(b: dict) -> None:
    ring = [tuple(p) for p in b["ring"]]
    if len(ring) > 2 and ring[0] == ring[-1]:
        ring = ring[:-1]
    h = float(b.get("height") or 10.0)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, 0.0)) for x, y in ring]
    hi = [bm.verts.new((x, y, h)) for x, y in ring]
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        try:
            bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
        except ValueError:
            pass
    try:
        bm.faces.new(hi)
    except ValueError:
        pass
    mesh = bpy.data.meshes.new(f"ctx_{b['id']}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(_mat("ctx"))
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(obj)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--res", type=int, default=900)
    args = ap.parse_args(argv)
    layout = json.loads((ROOT / "output/district_2000_antwerpen_layout.json").read_text())
    manifest = json.loads((ROOT / "districts/2000-antwerpen/landmarks/manifest.json").read_text())
    origin = tuple(layout["origin"])
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    _MAT_PBR.setdefault("ctx", (0.22, 0.21, 0.2, 0.92, 0.0))
    _MAT_PBR.setdefault("ground", (0.26, 0.25, 0.23, 0.95, 0.0))
    for b in layout["buildings"]:
        xs = [p[0] for p in b["ring"]]
        ys = [p[1] for p in b["ring"]]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        if not (-260 < cx < 140 and 60 < cy < 300):
            continue
        b = dict(b)
        if landmarks.attach_custom_landmark(b, manifest, origin) and b["landmark"]["custom"] in CUSTOMS:
            kit = LM.build_landmark(b)
            if kit is not None:
                _add(kit, f"lm_{b['id']}")
                continue
        # Keep the street open: skip grey stand-ins that sit on the camera path.
        if min(xs) < -100 and max(xs) > -160 and 130 < cy < 170:
            continue
        _box(b)
    for node in landmarks.landmark_nodes({}, origin, manifest):
        kit = LM.build_node_landmark(node)
        if kit is not None and -260 < node["x"] < 140:
            _add(kit, f"node_{node['id']}")
    bpy.ops.mesh.primitive_plane_add(size=800, location=(-60, 170, -0.02))
    bpy.context.active_object.data.materials.append(_mat("ground"))

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "JPEG"
    world = bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.28, 0.55, 0.92, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.4
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.5
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.85, 0.15, 2.4)
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    out = ROOT / "output" / "grote_markt_preview"
    out.mkdir(parents=True, exist_ok=True)
    only = {s for s in args.only.split(",") if s}
    for name, eye, tgt, lens, portrait in WORLD_SHOTS["grote_markt"]:
        if only and name not in only:
            continue
        scene.render.resolution_x = int(args.res * 0.75) if portrait else int(args.res * 1.4)
        scene.render.resolution_y = args.res
        cam.location = Vector(eye)
        cam.rotation_euler = (Vector(tgt) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        cam_data.lens = lens
        scene.render.filepath = str(out / f"{name}.jpg")
        bpy.ops.render.render(write_still=True)
        print("Wrote", scene.render.filepath)


if __name__ == "__main__":
    main()
