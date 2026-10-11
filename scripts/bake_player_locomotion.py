"""Retarget Mixamo locomotion onto the playable cast.

Downloads live in ``assets/mixamo/`` (gitignored). Each clip is retargeted with the
same world-space match as ``bake_rocketbox_getup.py``, then packed into
``viewer/characters/players/clips/{id}_moves.glb``.

  blender --background --python scripts/bake_player_locomotion.py
  blender --background --python scripts/bake_player_locomotion.py -- pieter

Clips: Idle, Walk, Jog, Run, Jump, Punch, Cross, Kick, Riding.
Riding is solved onto the Velo crank (Mixamo has no bicycle clip). Root motion is
stripped to a vertical bob so the walker owns translation; punch and kick keep a
short lunge.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from bake_rocketbox_getup import (  # noqa: E402
    FWD,
    LIMBS,
    MAP,
    SIDES,
    Skel,
    UP,
    floor_z,
    frame,
    import_armature,
    rot,
    turn_bone,
    two_bone_ik,
    world_head,
)
from extract_anim_clips import read_glb, strip_to_clips, write_glb  # noqa: E402

MIXAMO = ROOT / "assets" / "mixamo"
PLAYERS = ROOT / "viewer" / "characters" / "players"
OUT = PLAYERS / "clips"
FPS = 30

# (file, clip name, root mode)  bob = vertical only, plant = none, lunge = partial step
SOURCES = (
    ("Idle_2.fbx", "Idle", "bob"),
    ("Standard_Walk.fbx", "Walk", "bob"),
    ("Jogging.fbx", "Jog", "bob"),
    ("Fast_Run.fbx", "Run", "bob"),
    ("Jump.fbx", "Jump", "plant"),
    ("Punching_3.fbx", "Punch", "lunge"),
    ("Punching.fbx", "Cross", "lunge"),
    ("Kicking.fbx", "Kick", "lunge"),
)

# Viewer normalizes a 0.0001 armature up to 0.01 before measuring height.
NORM_SCALE = 0.01


def _clear() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _import_fbx(path: Path) -> bpy.types.Object:
    bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=False)
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms:
        raise RuntimeError(f"no armature in {path}")
    return arms[0]


def _source_speed(arm: bpy.types.Object, f0: int, f1: int) -> tuple[float, float]:
    """Horizontal metres per second of the Mixamo hips, and the clip duration."""
    scene = bpy.context.scene
    hips = next(b for b in arm.pose.bones if b.name.endswith("Hips"))
    pts = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        pts.append(arm.matrix_world @ hips.head)
    height = max(p.z for p in pts) - min(p.z for p in pts)
    # Skinless Mixamo FBX is centimetres when the hips sit tens of units up.
    standing = pts[0].z
    unit = 0.01 if standing > 3.0 else 1.0
    dist = 0.0
    for a, b in zip(pts, pts[1:]):
        dist += ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5 * unit
    dur = max(1 / FPS, (f1 - f0) / FPS)
    return dist / dur, dur


def _scale_fix(arm: bpy.types.Object) -> float:
    s = abs(arm.scale.x) or 1e-4
    return NORM_SCALE / s


def _key_action(arm: bpy.types.Object, name: str, f0: int, f1: int, quats, locations) -> bpy.types.Action:
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type="OBJECT", name=arm.name)
    strip = act.layers.new("Base").strips.new(type="KEYFRAME")
    cb = strip.channelbags.new(slot)

    def curve(path, n, samples):
        for i in range(n):
            fc = cb.fcurves.new(path, index=i)
            fc.keyframe_points.add(len(samples))
            for k, (fr, v) in enumerate(samples):
                fc.keyframe_points[k].co = (fr, v[i])
                fc.keyframe_points[k].interpolation = "LINEAR"
            fc.update()

    curve("location", 3, locations)
    if arm.rotation_mode == "QUATERNION":
        curve("rotation_quaternion", 4, [(fr, arm.rotation_quaternion.copy()) for fr, _ in locations])
    else:
        curve("rotation_euler", 3, [(fr, arm.rotation_euler.copy()) for fr, _ in locations])
    for bone, samples in quats.items():
        curve(f'pose.bones["{bone}"].rotation_quaternion', 4, samples)
    act.use_frame_range = True
    act.frame_start = f0
    act.frame_end = f1
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = act
    arm.animation_data.action_slot = slot
    return act


def _export_clip(arm: bpy.types.Object, pid: str, name: str) -> Path:
    import tempfile

    scene = bpy.context.scene
    with tempfile.TemporaryDirectory() as tmp:
        full = Path(tmp) / f"{pid}.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(full),
            export_format="GLB",
            export_animations=True,
            export_animation_mode="ACTIONS",
            export_force_sampling=True,
            export_skins=True,
            export_morph=False,
            export_apply=False,
            export_yup=True,
            export_cameras=False,
            export_lights=False,
            export_image_format="NONE",
        )
        gltf, binary = read_glb(full)
    for anim in gltf.get("animations", []):
        anim["name"] = name
    clip, blob = strip_to_clips(gltf, binary)
    dst = OUT / f"_{pid}_{name}.glb"
    OUT.mkdir(parents=True, exist_ok=True)
    write_glb(dst, clip, blob)
    return dst


def _ik_pole(arm, upper, lower, end, goal: Vector, pole: Vector) -> None:
    """Bend a limb so `end` reaches `goal`, with the mid joint pulled toward `pole`."""
    s = world_head(arm, upper)
    l1 = (world_head(arm, lower) - s).length
    l2 = (world_head(arm, end) - world_head(arm, lower)).length
    to_goal = goal - s
    if to_goal.length < 1e-5 or l1 < 1e-5 or l2 < 1e-5:
        return
    d = min(max(to_goal.length, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999)
    u = to_goal.normalized()
    n = u.cross(pole - s)
    if n.length < 1e-6:
        n = u.cross(UP if abs(u.z) < 0.9 else Vector(FWD))
    n.normalize()
    v = n.cross(u)
    if v.dot(pole - s) < 0:
        v.negate()
    cos_a = max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
    elbow = s + (u * cos_a + v * (max(0.0, 1.0 - cos_a * cos_a) ** 0.5)) * l1
    turn_bone(arm, upper, (world_head(arm, lower) - s).rotation_difference(elbow - s).to_matrix())
    e = world_head(arm, lower)
    turn_bone(arm, lower, (world_head(arm, end) - e).rotation_difference(goal - e).to_matrix())


def _flat_fwd(arm: bpy.types.Object, toe: str, foot: str) -> Vector:
    """Bind forward, flattened. Bone matrices on these rigs are yawed 90° off the mesh."""
    if toe in arm.data.bones and foot in arm.data.bones:
        d = _rest_head(arm, toe) - _rest_head(arm, foot)
        d.z = 0.0
        if d.length > 1e-4:
            return d.normalized()
    return Vector(FWD)


def _plant_limbs(src_arm, tgt_arm, sn, ratio: float) -> None:
    """Wrists and ankles follow the Mixamo clip in hip space.

    Rotation matching leaves the elbows rolled out, because Mixamo's bind is a
    T and these bodies hang their arms. The pole keeps the knee and elbow bend.
    """
    src_mw = src_arm.matrix_world
    hips_pb = src_arm.pose.bones[sn("Hips")]
    hips = src_mw @ hips_pb.head
    pelvis_pb = tgt_arm.pose.bones["Bip01 Pelvis"]
    pelvis = world_head(tgt_arm, pelvis_pb)
    # Hip-bone matrices are not the character forward (Mixamo's is yawed 90°).
    # Swing has to stay in the toe direction or a jog throws the arms out sideways.
    src_fwd = _flat_fwd(src_arm, sn("LeftToeBase"), sn("LeftFoot"))
    tgt_fwd = _flat_fwd(tgt_arm, "Bip01 L Toe0", "Bip01 L Foot")
    spin = src_fwd.rotation_difference(tgt_fwd).to_matrix()

    def src_head(short: str) -> Vector:
        return src_mw @ src_arm.pose.bones[sn(short)].head

    chains = (
        ("LeftArm", "LeftForeArm", "LeftHand", "Bip01 L UpperArm", "Bip01 L Forearm", "Bip01 L Hand"),
        ("RightArm", "RightForeArm", "RightHand", "Bip01 R UpperArm", "Bip01 R Forearm", "Bip01 R Hand"),
        ("LeftUpLeg", "LeftLeg", "LeftFoot", "Bip01 L Thigh", "Bip01 L Calf", "Bip01 L Foot"),
        ("RightUpLeg", "RightLeg", "RightFoot", "Bip01 R Thigh", "Bip01 R Calf", "Bip01 R Foot"),
    )
    for s_up, s_mid, s_end, t_up, t_mid, t_end in chains:
        if sn(s_end) not in src_arm.pose.bones or t_end not in tgt_arm.pose.bones:
            continue
        off_end = spin @ ((src_head(s_end) - hips) * ratio)
        off_mid = spin @ ((src_head(s_mid) - hips) * ratio)
        _ik_pole(
            tgt_arm,
            tgt_arm.pose.bones[t_up],
            tgt_arm.pose.bones[t_mid],
            tgt_arm.pose.bones[t_end],
            pelvis + off_end,
            pelvis + off_mid,
        )


def _rest_head(arm: bpy.types.Object, name: str) -> Vector:
    return arm.matrix_world @ arm.data.bones[name].head_local


def _rest_rot(arm: bpy.types.Object, name: str) -> Matrix:
    return rot(arm.matrix_world @ arm.data.bones[name].matrix_local)


def _aim(arm: bpy.types.Object, name: str, child: str | None) -> Vector:
    if child and child in arm.data.bones:
        return _rest_head(arm, child) - _rest_head(arm, name)
    parent = arm.data.bones[name].parent
    return _rest_head(arm, name) - (arm.matrix_world @ parent.head_local)


def _retarget(pid: str, src_path: Path, clip_name: str, mode: str) -> tuple[Path, float]:
    _clear()
    scene = bpy.context.scene
    scene.render.fps = FPS

    # Leave the Mixamo curves on Euler. Switching those bones to quaternion
    # disconnects the FBX fcurves and the clip samples as the bind pose.
    src_arm = _import_fbx(src_path)
    prefix = next(b.name[: -len("Hips")] for b in src_arm.data.bones if b.name.endswith("Hips"))
    sn = lambda s: prefix + s
    act = src_arm.animation_data.action
    f0, f1 = (int(round(v)) for v in act.frame_range)
    speed, dur = _source_speed(src_arm, f0, f1)

    tgt_arm = import_armature(PLAYERS / f"{pid}_Walking.glb")
    if tgt_arm.animation_data:
        tgt_arm.animation_data_clear()
    for a in list(bpy.data.actions):
        if a != act:
            bpy.data.actions.remove(a)
    scene.frame_set(f0)
    for pb in tgt_arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    rest_loc = tgt_arm.location.copy()
    fix = _scale_fix(tgt_arm)

    pairs = [(sn(s), t) for s, t, sc, tc in MAP if sn(s) in src_arm.data.bones and t in tgt_arm.data.bones]
    # Child names for the rest-frame match.
    child = {(sn(s), t): (sn(sc) if sc else None, tc) for s, t, sc, tc in MAP if sn(s) in src_arm.data.bones and t in tgt_arm.data.bones}
    depth = lambda t: len(tgt_arm.data.bones[t].parent_recursive)
    pairs.sort(key=lambda p: depth(p[1]))

    lat_s = _rest_head(src_arm, sn("LeftUpLeg")) - _rest_head(src_arm, sn("RightUpLeg"))
    lat_t = _rest_head(tgt_arm, "Bip01 L Thigh") - _rest_head(tgt_arm, "Bip01 R Thigh")
    align = {}
    for s, t in pairs:
        sc, tc = child[(s, t)]
        a = frame(_aim(src_arm, s, sc), lat_s) @ frame(_aim(tgt_arm, t, tc), lat_t).transposed()
        align[t] = _rest_rot(src_arm, s).inverted() @ a @ _rest_rot(tgt_arm, t)

    def leg(arm, a, b):
        return (_rest_head(arm, a) - _rest_head(arm, b)).length

    ratio = leg(tgt_arm, "Bip01 L Thigh", "Bip01 L Foot") / max(1e-6, leg(src_arm, sn("LeftUpLeg"), sn("LeftFoot")))
    src_hips0 = _rest_head(src_arm, sn("Hips"))
    pelvis_local = tgt_arm.data.bones["Bip01 Pelvis"].head_local
    obj_rot = rot(tgt_arm.matrix_world)
    obj_scale = tgt_arm.matrix_world.to_scale()
    tgt_pelvis0 = _rest_head(tgt_arm, "Bip01 Pelvis")

    def solve(f: int) -> Vector:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        src_mw = src_arm.matrix_world
        hips = src_mw @ src_arm.pose.bones[sn("Hips")].head
        pelvis = tgt_pelvis0 + (hips - src_hips0) * ratio
        tgt_arm.location = pelvis - obj_rot @ Vector(p * s for p, s in zip(pelvis_local, obj_scale))
        bpy.context.view_layer.update()
        tmw_rot_inv = rot(tgt_arm.matrix_world).inverted()
        for s, t in pairs:
            q_src = rot(src_mw @ src_arm.pose.bones[s].matrix)
            pb = tgt_arm.pose.bones[t]
            pb.matrix = Matrix.Translation(pb.head) @ (tmw_rot_inv @ (q_src @ align[t])).to_4x4()
            bpy.context.view_layer.update()
        _plant_limbs(src_arm, tgt_arm, sn, ratio)
        return tgt_arm.location.copy()

    span = f1 - f0
    step = 1 if span <= 90 else max(1, span // 80)
    frames = list(range(f0, f1 + 1, step))
    if frames[-1] != f1:
        frames.append(f1)
    locations = []
    quats: dict[str, list] = {t: [] for _, t in pairs}
    raw = []
    for f in frames:
        raw.append(solve(f))
        for _, t in pairs:
            q = tgt_arm.pose.bones[t].rotation_quaternion.copy()
            if quats[t] and quats[t][-1][1].dot(q) < 0:
                q.negate()
            quats[t].append((f, q))
    origin = raw[0]
    for f, loc in zip(frames, raw):
        d = (loc - origin) * fix
        if mode == "bob":
            d.x = 0.0
            d.y = 0.0
        elif mode == "plant":
            d = Vector()
        else:
            d.x *= 0.4
            d.y *= 0.4
            d.z = 0.0
        locations.append((f, rest_loc + d))

    # Drop the source action so the export only contains this clip.
    if src_arm.animation_data:
        src_arm.animation_data_clear()
    bpy.data.actions.remove(act)
    for o in list(src_arm.children_recursive) + [src_arm]:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    scene.frame_start, scene.frame_end = f0, f1
    _key_action(tgt_arm, clip_name, f0, f1, quats, locations)
    dst = _export_clip(tgt_arm, pid, clip_name)
    print(f"  {clip_name}: {dur:.2f}s  native {speed:.2f} m/s  mode {mode}  fix {fix:.0f}")
    return dst, speed if mode == "bob" else 0.0


def _basis(arm: bpy.types.Object) -> tuple[Vector, Vector, Vector]:
    """Unit forward / character-right / up in Blender world, from the bind."""
    bpy.context.view_layer.update()
    foot = world_head(arm, arm.pose.bones["Bip01 L Foot"])
    toe_name = "Bip01 L Toe0" if "Bip01 L Toe0" in arm.pose.bones else None
    if toe_name:
        fwd = world_head(arm, arm.pose.bones[toe_name]) - foot
        fwd.z = 0.0
    else:
        fwd = Vector(FWD)
    if fwd.length < 1e-4:
        fwd = Vector(FWD)
    fwd.normalize()
    side = fwd.cross(UP)
    if side.length < 1e-4:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    # Character right: from left foot toward right foot should agree with side.
    l = world_head(arm, arm.pose.bones["Bip01 L Foot"])
    r = world_head(arm, arm.pose.bones["Bip01 R Foot"])
    if (r - l).dot(side) < 0:
        side.negate()
    return fwd, side, UP.copy()


def _bake_riding(pid: str) -> Path:
    """One pedal revolution, hips on the saddle, feet on a city-bike crank."""
    import math

    _clear()
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm = import_armature(PLAYERS / f"{pid}_Walking.glb")
    if arm.animation_data:
        arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    rest_loc = arm.location.copy()
    fix = _scale_fix(arm)
    fwd, side, up = _basis(arm)

    # Metres, relative to a standing pelvis. Upright city bike, not a racer tuck.
    sit = -fwd * 0.06 + up * (-0.18)
    arm.location = rest_loc + sit / fix
    bpy.context.view_layer.update()

    n = 32
    f0, f1 = 1, n
    bones = [
        "Bip01 Spine",
        "Bip01 Spine1",
        "Bip01 Spine2",
        "Bip01 Neck",
        "Bip01 Head",
        "Bip01 L Thigh",
        "Bip01 L Calf",
        "Bip01 L Foot",
        "Bip01 R Thigh",
        "Bip01 R Calf",
        "Bip01 R Foot",
        "Bip01 L UpperArm",
        "Bip01 L Forearm",
        "Bip01 L Hand",
        "Bip01 R UpperArm",
        "Bip01 R Forearm",
        "Bip01 R Hand",
    ]
    bones = [b for b in bones if b in arm.pose.bones]
    quats = {b: [] for b in bones}
    locations = []

    def pitch(name: str, deg: float) -> None:
        pb = arm.pose.bones.get(name)
        if pb:
            turn_bone(arm, pb, Matrix.Rotation(math.radians(deg), 3, side))

    for i, f in enumerate(range(f0, f1 + 1)):
        for pb in arm.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        pitch("Bip01 Spine", 18)
        pitch("Bip01 Spine1", 14)
        pitch("Bip01 Spine2", 8)
        pitch("Bip01 Neck", -16)
        pitch("Bip01 Head", -14)
        pelvis = world_head(arm, arm.pose.bones["Bip01 Pelvis"])
        t = (i / n) * math.tau
        for label, phase, lat in (("L", 0.0, -1.0), ("R", math.pi, 1.0)):
            ang = t + phase
            # ang 0 = foot forward, increasing = push down through the stroke.
            offset = (
                fwd * (0.20 + 0.17 * math.cos(ang))
                + up * (-0.50 - 0.17 * math.sin(ang))
                + side * (0.09 * lat)
            )
            goal = pelvis + offset / fix
            upper = arm.pose.bones[f"Bip01 {label} Thigh"]
            lower = arm.pose.bones[f"Bip01 {label} Calf"]
            end = arm.pose.bones[f"Bip01 {label} Foot"]
            two_bone_ik(arm, upper, lower, end, goal)
        for label, lat in (("L", -1.0), ("R", 1.0)):
            goal = pelvis + (fwd * 0.42 + up * 0.22 + side * (0.28 * lat)) / fix
            two_bone_ik(
                arm,
                arm.pose.bones[f"Bip01 {label} UpperArm"],
                arm.pose.bones[f"Bip01 {label} Forearm"],
                arm.pose.bones[f"Bip01 {label} Hand"],
                goal,
            )
        for b in bones:
            q = arm.pose.bones[b].rotation_quaternion.copy()
            if quats[b] and quats[b][-1][1].dot(q) < 0:
                q.negate()
            quats[b].append((f, q))
        locations.append((f, rest_loc + sit))

    scene.frame_start, scene.frame_end = f0, f1
    _key_action(arm, "Riding", f0, f1, quats, locations)
    dst = _export_clip(arm, pid, "Riding")
    print(f"  Riding: {n / FPS:.2f}s pedal  sit {tuple(round(v, 2) for v in sit)}")
    return dst


def _merge(pid: str, parts: list[Path]) -> Path:
    nodes = None
    scenes = None
    anims = []
    accessors = []
    views = []
    blob = bytearray()
    for part in parts:
        gltf, binary = read_glb(part)
        if nodes is None:
            nodes = gltf["nodes"]
            scenes = gltf["scenes"]
        acc_map = {}

        def remap(i: int, gltf=gltf, binary=binary) -> int:
            if i in acc_map:
                return acc_map[i]
            acc = dict(gltf["accessors"][i])
            view = gltf["bufferViews"][acc["bufferView"]]
            start = view.get("byteOffset", 0)
            blob.extend(b"\0" * (-len(blob) % 4))
            new_view = {"buffer": 0, "byteOffset": len(blob), "byteLength": view["byteLength"]}
            if "byteStride" in view:
                new_view["byteStride"] = view["byteStride"]
            blob.extend(binary[start : start + view["byteLength"]])
            views.append(new_view)
            acc["bufferView"] = len(views) - 1
            accessors.append(acc)
            acc_map[i] = len(accessors) - 1
            return acc_map[i]

        for anim in gltf["animations"]:
            samplers = [
                {**s, "input": remap(s["input"]), "output": remap(s["output"])} for s in anim["samplers"]
            ]
            anims.append({**anim, "samplers": samplers})
        part.unlink()

    out = {
        "asset": {"version": "2.0", "generator": "metropolis bake_player_locomotion.py"},
        "scene": 0,
        "scenes": scenes,
        "nodes": nodes,
        "animations": anims,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    dst = OUT / f"{pid}_moves.glb"
    write_glb(dst, out, blob)
    print(f"OK {pid}: {len(anims)} clips, {dst.stat().st_size // 1024} KB")
    return dst


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    want = {a.lower() for a in argv} or None
    ids = ["pieter", "mo", "jacob"]
    if want:
        ids = [i for i in ids if i in want]
    speeds: dict[str, float] = {}
    for pid in ids:
        print(f"== {pid} ==")
        parts = []
        for fname, clip, mode in SOURCES:
            src = MIXAMO / fname
            if not src.exists():
                raise FileNotFoundError(src)
            path, speed = _retarget(pid, src, clip, mode)
            parts.append(path)
            if speed > 0.2 and clip not in speeds:
                speeds[clip.lower()] = round(speed, 2)
        parts.append(_bake_riding(pid))
        _merge(pid, parts)
    if speeds:
        meta = {
            "idle": 0,
            "walk": speeds.get("walk", 1.35),
            "jog": speeds.get("jog", 3.2),
            "run": speeds.get("run", 5.6),
            "ride": 4.2,
        }
        (OUT / "locomotion.json").write_text(json.dumps(meta, indent=2) + "\n")
        print("speeds", meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
