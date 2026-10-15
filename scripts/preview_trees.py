"""Render every tree archetype next to a 1.8 m figure, and export them as a test GLB.

Fast iteration on ``blender/trees_blender.py`` without a district build:

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \\
      --python scripts/preview_trees.py -- [--out output/tree_preview.png] [--glb output/tree_preview.glb]

Left: mature forms, right: young forms, each at its reference size. The GLB uses
the district export settings (instancing, ``MATERIAL`` vertex colours, JPEG images) and
puts two instances of every mesh under one Empty, as ``add_instanced_trees`` does.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "blender"))
import trees_blender as tb  # noqa: E402

PERSON_H = 1.8


def _args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(ROOT / "output" / "tree_preview.png"))
    p.add_argument("--glb", default=str(ROOT / "output" / "tree_preview.glb"))
    p.add_argument("--res", type=int, default=3000)
    return p.parse_args(argv)


def _person(x: float, y: float) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, PERSON_H / 2))
    o = bpy.context.active_object
    o.scale = (0.45, 0.28, PERSON_H)
    o.name = "person_1.8m"
    mat = bpy.data.materials.new("person")
    mat.diffuse_color = (0.8, 0.1, 0.1, 1.0)
    mat.use_nodes = True
    next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (
        0.8, 0.1, 0.1, 1.0,
    )
    o.data.materials.append(mat)


def main() -> None:
    args = _args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    mat = tb._tree_material()

    placed = []
    report = []
    x, y = 0.0, 0.0
    for form in ("mature", "young"):
        for kind in tb.KINDS:
            h, r = tb.ARCHETYPE_REF[(kind, form)]
            mesh = tb._archetype_mesh(kind, form, mat)
            x += r + 1.5
            parent = bpy.data.objects.new(f"trees_{kind}_{form}", None)
            parent.location = (x, y, 0.0)
            scene.collection.objects.link(parent)
            for k, (dx, yaw) in enumerate(((0.0, 0.0), (0.0, 2.2))):
                obj = bpy.data.objects.new(f"tree_{kind}_{form}_{k}", mesh)
                obj.parent = parent
                # Second instance sits behind the first (hidden in the side view) for instancing.
                obj.location = (dx, 30.0 * k, 0.0)
                obj.rotation_euler = (0.0, 0.0, yaw)
                scene.collection.objects.link(obj)
            _person(x + r + 0.5, y)
            placed.append((x, h, r))
            report.append(f"{kind:>10}/{form:<6} h={h:5.1f} r={r:4.1f} tris={mesh['tris']}")
            x += r + 1.5

    glb = Path(args.glb)
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(glb),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_yup=True,
        export_cameras=False,
        export_gpu_instances=True,
        export_vertex_color="MATERIAL",
    )

    # Ground, sun, sky, orthographic side camera.
    width = max(px + pr for px, _, pr in placed) + 2.0
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(width / 2, -8.0, 0.0))
    ground = bpy.context.active_object
    ground.scale = (width + 20, 80, 1)
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    next(n for n in gmat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (
        0.35, 0.33, 0.3, 1.0,
    )
    ground.data.materials.append(gmat)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(35))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.7, 0.9, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    tallest = max(h for _, h, _ in placed)
    frame_h = tallest + 3.0
    cam.data.ortho_scale = width
    cam.location = Vector((width / 2, -80.0, frame_h / 2 - 1.0))
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = args.res
    scene.render.resolution_y = int(args.res * frame_h / width)
    scene.render.filepath = args.out
    scene.view_settings.view_transform = "Standard"
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("\n".join(report))
    print(f"wrote {args.out} and {glb}")


if __name__ == "__main__":
    main()
