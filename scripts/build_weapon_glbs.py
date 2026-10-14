"""Turn the CC0 Quaternius weapons into game GLBs for viewer/weapons/.

Sources are poly.pizza downloads in ``assets/weapons/candidates/`` (gitignored):
knife_q4, pistol_q1, shotgun_q1, smg_q1, rifle_q1 — all Quaternius, CC0.

Each output has its origin on the palm of the firing hand, the barrel (or blade)
along glTF +Z and up along +Y, real-world length, and two empties:

  Muzzle   where tracers and the flash start
  Support  where the left hand grips (fore-end, pump, handguard)

It also renders a white side silhouette per weapon to ``viewer/weapons/icons/``
for the weapon wheel and ammo counter.

  blender --background --python scripts/build_weapon_glbs.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "weapons" / "candidates"
OUT = ROOT / "viewer" / "weapons"

# Anchors are bbox fractions in the source: u from stock/pommel to muzzle/tip,
# v from bottom to top. `axis` is the source's long axis.
WEAPONS = {
    "knife": dict(src="knife_q4", axis="z", length=0.30, grip=(0.10, 0.5), support=None, muzzle=(1.0, 0.5)),
    "pistol": dict(src="pistol_q1", axis="x", length=0.20, grip=(0.18, 0.44), support=(0.18, 0.30), muzzle=(1.0, 0.86)),
    "shotgun": dict(src="shotgun_q1", axis="x", length=1.00, grip=(0.26, 0.54), support=(0.62, 0.59), muzzle=(1.0, 0.85)),
    "smg": dict(src="smg_q1", axis="x", length=0.55, grip=(0.43, 0.445), support=(0.66, 0.50), muzzle=(1.0, 0.78)),
    "rifle": dict(src="rifle_q1", axis="x", length=0.86, grip=(0.30, 0.44), support=(0.65, 0.745), muzzle=(1.0, 0.76)),
}


def build(name: str, cfg: dict) -> Path:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC / f"{cfg['src']}.glb"))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.context.view_layer.update()
    for o in meshes:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)

    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in meshes:
        for v in o.data.vertices:
            lo = Vector(map(min, lo, v.co))
            hi = Vector(map(max, hi, v.co))
    mid = (lo + hi) / 2

    def point(uv):
        u, v = uv
        if cfg["axis"] == "x":
            return Vector((lo.x + (hi.x - lo.x) * u, mid.y, lo.z + (hi.z - lo.z) * v))
        return Vector((mid.x, mid.y, lo.z + (hi.z - lo.z) * u))

    span = (hi.x - lo.x) if cfg["axis"] == "x" else (hi.z - lo.z)
    s = cfg["length"] / span
    # Barrel to Blender -Y (glTF +Z), up stays +Z (glTF +Y).
    turn = Matrix.Rotation(-math.pi / 2, 4, "Z") if cfg["axis"] == "x" else Matrix.Rotation(math.pi / 2, 4, "X")
    grip = point(cfg["grip"])
    xf = turn @ Matrix.Scale(s, 4) @ Matrix.Translation(-grip)

    for o in meshes:
        o.data.transform(xf)
        o.data.update()
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = name

    for label, uv in (("Muzzle", cfg["muzzle"]), ("Support", cfg["support"])):
        if uv is None:
            continue
        e = bpy.data.objects.new(label, None)
        bpy.context.scene.collection.objects.link(e)
        e.location = xf @ point(uv)
        e.parent = body

    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{name}.glb"
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(dst),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    print(f"OK {name}: {dst.stat().st_size // 1024} KB, scale {s:.4f}")
    render_icon(name, body)
    return dst


def render_icon(name: str, body) -> None:
    """Flat white silhouette, muzzle to the right, on transparent."""
    bpy.context.view_layer.update()
    pts = [body.matrix_world @ Vector(c) for c in body.bound_box]
    lo = Vector(map(min, *pts))
    hi = Vector(map(max, *pts))
    mid = (lo + hi) / 2
    w, h = 256, 128
    cam_data = bpy.data.cameras.new("icon")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(hi.y - lo.y, (hi.z - lo.z) * w / h) * 1.08
    cam = bpy.data.objects.new("icon", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    # From -X looking +X puts Blender -Y (the barrel) on the right of the frame.
    cam.location = (mid.x - 5, mid.y, mid.z)
    cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "SINGLE"
    sc.display.shading.single_color = (1, 1, 1)
    sc.render.film_transparent = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    dst = OUT / "icons" / f"{name}.png"
    dst.parent.mkdir(parents=True, exist_ok=True)
    sc.render.filepath = str(dst)
    bpy.ops.render.render(write_still=True)


def main() -> int:
    for name, cfg in WEAPONS.items():
        build(name, cfg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
