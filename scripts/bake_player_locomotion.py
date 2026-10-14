"""Retarget Mixamo locomotion onto the playable cast.

Clip changes also update viewer/movement.html. See .cursor/rules/movement-gallery.mdc.

Downloads live in ``assets/mixamo/`` (gitignored). Each clip is retargeted with the
same world-space match as ``bake_rocketbox_getup.py``, then packed into
``viewer/characters/players/clips/{id}_moves.glb``.

  blender --background --python scripts/bake_player_locomotion.py
  blender --background --python scripts/bake_player_locomotion.py -- pieter

Clips: Idle, Walk, Jog, Run, Jump, Punch, Cross, Kick, Riding.
Riding is solved onto the Velo crank (Mixamo has no bicycle clip). Root motion is
stripped to a vertical bob so the walker owns translation; punch and kick keep a
short lunge.

  blender --background --python scripts/bake_player_locomotion.py -- swap
  blender --background --python scripts/bake_player_locomotion.py -- swap pieter

``swap`` retargets the fuller gait and strike clips into the existing moves GLB.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

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
# Share of the hand's twist the forearm takes; the rest stays in the wrist.
WRIST_UNWIND = 0.8

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

# Fuller cycles and strikes. Spliced in with ``-- swap``; a full rebuild still
# uses SOURCES above when those FBX files are present.
SWAP = (
    ("Idle_2.fbx", "Idle", "bob"),
    ("Walking.fbx", "Walk", "bob"),
    ("Jog_Forward.fbx", "Jog", "bob"),
    ("Fast_Run.fbx", "Run", "bob"),
    ("Jump.fbx", "Jump", "plant"),
    # These strikes keep a closed fist in the Mixamo bind. Jab and the MMA
    # kick do not, so the hands came out open.
    ("Punching.fbx", "Punch", "plant"),
    ("Cross_Punch.fbx", "Cross", "plant"),
    ("Roundhouse_Kick.fbx", "Kick", "plant"),
)

# Armed clips, packed into ``{id}_combat.glb`` by ``-- combat``. The viewer plays the
# aims, fires and reloads on the upper body over the strafe legs; Death and HitReact
# are full-body. ``fall`` keeps the drop to the floor but none of the slide.
COMBAT = (
    ("Pistol_Idle.fbx", "AimPistol", "plant"),
    ("Pistol_Walk.fbx", "AimWalk", "bob"),
    ("Pistol_Walk_Backward.fbx", "AimWalkBack", "bob"),
    ("Pistol_Strafe_Left.fbx", "AimStrafeL", "bob"),
    ("Pistol_Strafe_Right.fbx", "AimStrafeR", "bob"),
    ("Pistol_Run.fbx", "AimRun", "bob"),
    ("Shooting_Handgun.fbx", "FirePistol", "plant"),
    ("Gun_Reload.fbx", "ReloadPistol", "plant"),
    ("Rifle_Aiming_Idle.fbx", "AimRifle", "plant"),
    ("Firing_Rifle.fbx", "FireRifle", "plant"),
    ("Rifle_Reload.fbx", "ReloadRifle", "plant"),
    ("Knife_Stab.fbx", "Stab", "plant"),
    # The stab opens and closes on Mixamo's knife guard; hold it between attacks.
    ("Knife_Stab.fbx", "KnifeReady", "plant", (0.0, 0.1)),
    ("Standing_Melee_Attack_Horizontal.fbx", "Slash", "plant"),
    ("Hit_Reaction.fbx", "HitReact", "plant"),
    ("Dying_Backwards.fbx", "Death", "fall"),
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


def _palm_normal(arm, hand: str, finger: str, thumb: str, flip: bool) -> Vector | None:
    """Direction out of the palm. The right hand's cross product flips under a mirror."""
    if hand not in arm.pose.bones or finger not in arm.pose.bones or thumb not in arm.pose.bones:
        return None
    h = world_head(arm, arm.pose.bones[hand])
    along = world_head(arm, arm.pose.bones[finger]) - h
    side = world_head(arm, arm.pose.bones[thumb]) - h
    # Pieter's armature is scaled by 1e-4, so the raw cross product is ~1e-10
    # and the old length check skipped every palm on the cast.
    if along.length < 1e-12 or side.length < 1e-12:
        return None
    n = along.normalized().cross(side.normalized())
    if n.length < 1e-4:
        return None
    if flip:
        n.negate()
    return n.normalized()


def _roll_forearm(arm, forearm, hand, current: Vector, want: Vector) -> None:
    """Spin the forearm around its own axis so the palm faces `want`. The wrist stays put."""
    axis = world_head(arm, hand) - world_head(arm, forearm)
    if axis.length < 1e-5:
        return
    axis.normalize()
    a = current - axis * current.dot(axis)
    b = want - axis * want.dot(axis)
    if a.length < 1e-5 or b.length < 1e-5:
        return
    turn_bone(arm, forearm, a.normalized().rotation_difference(b.normalized()).to_matrix())


def _match_palms(src_arm, tgt_arm, sn, spin: Matrix, thigh: bool = True) -> None:
    """Match Mixamo's palm. Walks then turn a hanging palm in toward the thigh.

    A strike keeps Mixamo's own hand. The fist in those clips is part of the
    pose, and rolling it toward the leg opens the knuckles toward the camera.
    """
    if "Bip01 L Thigh" not in tgt_arm.pose.bones or "Bip01 R Thigh" not in tgt_arm.pose.bones:
        return
    across = world_head(tgt_arm, tgt_arm.pose.bones["Bip01 L Thigh"]) - world_head(tgt_arm, tgt_arm.pose.bones["Bip01 R Thigh"])
    across.z = 0.0
    if across.length < 1e-8:
        return
    across.normalize()
    down = Vector((0.0, 0.0, -1.0))
    hands = (
        (False, "LeftHand", "LeftHandIndex1", "LeftHandThumb1", "Bip01 L Forearm", "Bip01 L Hand", "Bip01 L Finger1", "Bip01 L Finger0"),
        (True, "RightHand", "RightHandIndex1", "RightHandThumb1", "Bip01 R Forearm", "Bip01 R Hand", "Bip01 R Finger1", "Bip01 R Finger0"),
    )
    for flip, sh, sf, st, tf, th, tfi, tth in hands:
        src = _palm_normal(src_arm, sn(sh), sn(sf), sn(st), flip)
        cur = _palm_normal(tgt_arm, th, tfi, tth, flip)
        if src is None or cur is None or tf not in tgt_arm.pose.bones or th not in tgt_arm.pose.bones:
            continue
        fore = tgt_arm.pose.bones[tf]
        hand = tgt_arm.pose.bones[th]
        _roll_forearm(tgt_arm, fore, hand, cur, (spin @ src).normalized())
        if not thigh:
            continue
        medial = across if flip else -across
        faced = _palm_normal(tgt_arm, th, tfi, tth, flip)
        if faced is None:
            continue
        want = (medial * 0.75 + down).normalized()
        _roll_forearm(tgt_arm, fore, hand, faced, want)


def _copy_mixamo_fingers(src_arm, tgt_arm, sn, spin: Matrix) -> None:
    """Point each finger where the Mixamo clip points it.

    A rest-relative retarget drops a fist that lives in the Mixamo bind,
    because the finger curves never move. The posed bone direction still
    holds the fist. Mo/Jacob tip bones are long; a Mixamo distal fold past a
    soft curl is capped with a real axis-angle turn (the old sin combo kinked
    the tip sideways). Pieter's two-segment fingers keep a sharper distal fold.
    """
    def aim(pb, direction: Vector) -> None:
        if direction.length < 1e-8:
            return
        # Three-segment Rocketbox fingers do not point +Y at the next knuckle.
        if pb.children:
            cur = world_head(tgt_arm, pb.children[0]) - world_head(tgt_arm, pb)
        else:
            # Leaf tip: aim along head→tail (bone length), not a fixed local axis.
            cur = (tgt_arm.matrix_world @ pb.tail) - world_head(tgt_arm, pb)
        if cur.length < 1e-8:
            return
        turn_bone(tgt_arm, pb, cur.normalized().rotation_difference(direction.normalized()).to_matrix())

    chains = []
    for side, letter in (("Left", "L"), ("Right", "R")):
        for finger, n in (("Index", "1"), ("Middle", "2"), ("Ring", "3"), ("Pinky", "4")):
            chains.append(
                (
                    [f"{side}Hand{finger}{i}" for i in (1, 2, 3)],
                    [f"Bip01 {letter} Finger{n}", f"Bip01 {letter} Finger{n}1", f"Bip01 {letter} Finger{n}2"],
                )
            )
        chains.append(
            (
                [f"{side}HandThumb{i}" for i in (1, 2, 3)],
                [f"Bip01 {letter} Finger0", f"Bip01 {letter} Finger01", f"Bip01 {letter} Finger02"],
            )
        )
    for srcs, tgts in chains:
        srcs = [s for s in srcs if sn(s) in src_arm.pose.bones]
        tgts = [t for t in tgts if t in tgt_arm.pose.bones]
        if not srcs or not tgts:
            continue
        tip = src_arm.matrix_world @ src_arm.pose.bones[sn(srcs[-1])].tail
        prev_dir = None
        thumb = "Finger0" in tgts[0]
        for i, t in enumerate(tgts):
            src_pb = src_arm.pose.bones[sn(srcs[min(i, len(srcs) - 1)])]
            src_head = world_head(src_arm, src_pb)
            last = i == len(tgts) - 1
            if last or i + 1 >= len(srcs):
                direction = tip - src_head
            else:
                direction = world_head(src_arm, src_arm.pose.bones[sn(srcs[i + 1])]) - src_head
            # Cap a Mixamo tip fold so the long Rocketbox distal bone does not
            # spear the palm — rotate from the prior phalanx, never kink sideways.
            if last and not thumb and prev_dir is not None and prev_dir.length > 1e-8:
                a = prev_dir.normalized()
                if direction.length < 1e-8:
                    direction = Vector(a)
                else:
                    b = direction.normalized()
                    ang = math.acos(max(-1.0, min(1.0, a.dot(b))))
                    # Three segments (Mo/Jacob): soft curl. Two (Pieter): sharper OK.
                    cap = math.radians(38 if len(tgts) >= 3 else 90)
                    if ang > cap:
                        axis = a.cross(b)
                        if axis.length < 1e-8:
                            direction = Vector(a)
                        else:
                            direction = Matrix.Rotation(cap, 3, axis.normalized()) @ a
            pb = tgt_arm.pose.bones[t]
            aim(pb, spin @ direction)
            prev_dir = direction


def _sole_world(arm, pb) -> Vector | None:
    """World direction out of the sole.

    Whichever rest axis pointed at the ground keeps that meaning once the
    bone is posed. Aiming the toe alone leaves this axis facing the camera.
    """
    rest = rot(arm.matrix_world) @ pb.bone.matrix_local.to_3x3()
    down = Vector((0.0, 0.0, -1.0))
    best_i, best_s, best_d = 0, 1.0, -1.0
    for i in range(3):
        axis = Vector(rest.col[i])
        if axis.length < 1e-8:
            continue
        axis.normalize()
        d = abs(axis.dot(down))
        if d > best_d:
            best_d = d
            best_i = i
            best_s = 1.0 if axis.dot(down) > 0 else -1.0
    posed = rot(arm.matrix_world) @ rot(pb.matrix)
    v = Vector(posed.col[best_i]) * best_s
    if v.length < 1e-6:
        return None
    return v.normalized()


def _posed_col(arm, pb, i: int) -> Vector:
    """World direction of pose-bone column `i`. Rocketbox feet have no toe bone; length is Y."""
    posed = rot(arm.matrix_world) @ rot(pb.matrix)
    v = Vector(posed.col[i])
    if v.length < 1e-6:
        return Vector((0.0, 0.0, 1.0))
    return v.normalized()


def _roll_axis(arm, pb, axis: Vector, current: Vector, want: Vector) -> None:
    """Spin `pb` around `axis` so `current` lines up with `want`. The axis stays put."""
    if axis.length < 1e-5:
        return
    axis = axis.normalized()
    a = current - axis * current.dot(axis)
    b = want - axis * want.dot(axis)
    if a.length < 1e-5 or b.length < 1e-5:
        return
    turn_bone(arm, pb, a.normalized().rotation_difference(b.normalized()).to_matrix())


def _aim_feet(src_arm, tgt_arm, sn, spin: Matrix) -> None:
    """Point each toe the way Mixamo does, then roll the sole to match.

    The leg solve swings the calf and drags the foot with it, so the sole
    ends up facing forward and the toes point at the sky. Pieter's feet have
    no toe bone; the shoe runs along the foot bone's Y axis.
    """
    pairs = (
        ("LeftFoot", "LeftToeBase", "Bip01 L Foot", "Bip01 L Toe0"),
        ("RightFoot", "RightToeBase", "Bip01 R Foot", "Bip01 R Toe0"),
    )
    for sf, st, tf, tt in pairs:
        if sn(sf) not in src_arm.pose.bones or tf not in tgt_arm.pose.bones:
            continue
        src_toe = sn(st) if sn(st) in src_arm.pose.bones else None
        if src_toe is None:
            continue
        src_dir = world_head(src_arm, src_arm.pose.bones[src_toe]) - world_head(src_arm, src_arm.pose.bones[sn(sf)])
        if src_dir.length < 1e-5:
            continue
        want = (spin @ src_dir).normalized()
        foot = tgt_arm.pose.bones[tf]
        tgt_toe = tt if tt in tgt_arm.pose.bones else None
        if tgt_toe is None:
            kids = foot.children
            tgt_toe = kids[0].name if kids else None
        if tgt_toe is not None:
            cur = world_head(tgt_arm, tgt_arm.pose.bones[tgt_toe]) - world_head(tgt_arm, foot)
            if cur.length < 1e-5:
                continue
            turn_bone(tgt_arm, foot, cur.normalized().rotation_difference(want).to_matrix())
            toe = tgt_arm.pose.bones[tgt_toe]
        else:
            cur = _posed_col(tgt_arm, foot, 1)
            turn_bone(tgt_arm, foot, cur.rotation_difference(want).to_matrix())
            toe = None
        src_sole = _sole_world(src_arm, src_arm.pose.bones[sn(sf)])
        cur_sole = _sole_world(tgt_arm, foot)
        if src_sole is None or cur_sole is None:
            continue
        rolled = (spin @ src_sole).normalized()
        if toe is not None:
            _roll_forearm(tgt_arm, foot, toe, cur_sole, rolled)
        else:
            _roll_axis(tgt_arm, foot, _posed_col(tgt_arm, foot, 1), cur_sole, rolled)


_TWIST_PREV: dict[str, float] = {}


def _unwind_wrist(arm, fore_name: str, hand_name: str, share: float = WRIST_UNWIND) -> None:
    """Roll the forearm to carry the hand's twist; the hand keeps its world orientation.

    The cast has no forearm twist bones. Matching Mixamo's hand alone leaves the
    whole pronation in the wrist joint, which wrings the skin (up to ~175° in the
    knife clips). The sleeve hides a rolled forearm; a wrung wrist shows.
    """
    if fore_name not in arm.pose.bones or hand_name not in arm.pose.bones:
        return
    fore = arm.pose.bones[fore_name]
    hand = arm.pose.bones[hand_name]
    rf = rot(fore.matrix).to_quaternion()
    rel0 = fore.bone.matrix_local.to_quaternion().inverted() @ hand.bone.matrix_local.to_quaternion()
    d = rf.inverted() @ rot(hand.matrix).to_quaternion() @ rel0.inverted()
    axis = rf.inverted() @ (hand.head - fore.head)
    if axis.length < 1e-12:
        return
    axis.normalize()
    twist = 2.0 * math.atan2(d.x * axis.x + d.y * axis.y + d.z * axis.z, d.w)
    twist = (twist + math.pi) % (2.0 * math.pi) - math.pi
    # Near a half turn the wrap flips sides between frames; stay on the previous
    # frame's side or the forearm spins most of a turn in one step.
    prev = _TWIST_PREV.get(hand_name)
    if prev is not None:
        twist += 2.0 * math.pi * round((prev - twist) / (2.0 * math.pi))
    _TWIST_PREV[hand_name] = twist
    if abs(twist) < 1e-3:
        return
    keep = hand.matrix.copy()
    spin = Quaternion(rf @ axis, twist * share).to_matrix()
    fore.matrix = Matrix.Translation(fore.head) @ (spin @ rot(fore.matrix)).to_4x4()
    bpy.context.view_layer.update()
    hand.matrix = keep
    bpy.context.view_layer.update()


def _plant_limbs(src_arm, tgt_arm, sn, ratio: float, fist: bool = False, hand_align: dict | None = None) -> None:
    """Ankles follow the Mixamo clip in hip space, wrists in shoulder space.

    Rotation matching leaves the elbows rolled out, because Mixamo's bind is a
    T and these bodies hang their arms. The pole keeps the knee and elbow bend.
    The cast's torsos are longer than Mixamo's for their legs, so a wrist placed
    from the hips lands out of reach and the elbow locks straight on the
    backswing. From the shoulder, scaled by arm length, the elbow keeps Mixamo's angle.
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
        up, mid, end = (tgt_arm.pose.bones[n] for n in (t_up, t_mid, t_end))
        if "Arm" in s_up:
            src_len = (src_head(s_mid) - src_head(s_up)).length + (src_head(s_end) - src_head(s_mid)).length
            tgt_len = (world_head(tgt_arm, mid) - world_head(tgt_arm, up)).length + (
                world_head(tgt_arm, end) - world_head(tgt_arm, mid)
            ).length
            k = tgt_len / max(1e-9, src_len)
            base, src_base = world_head(tgt_arm, up), src_head(s_up)
        else:
            k, base, src_base = ratio, pelvis, hips
        off_end = spin @ ((src_head(s_end) - src_base) * k)
        off_mid = spin @ ((src_head(s_mid) - src_base) * k)
        _ik_pole(tgt_arm, up, mid, end, base + off_end, base + off_mid)
    _aim_feet(src_arm, tgt_arm, sn, spin)
    if hand_align:
        # The solve swung the arm, so put each hand back on Mixamo's world orientation.
        tmw_inv = rot(tgt_arm.matrix_world).inverted()
        for s_hand, t_hand in (("LeftHand", "Bip01 L Hand"), ("RightHand", "Bip01 R Hand")):
            if t_hand not in hand_align or sn(s_hand) not in src_arm.pose.bones:
                continue
            q_src = rot(src_mw @ src_arm.pose.bones[sn(s_hand)].matrix)
            pb = tgt_arm.pose.bones[t_hand]
            pb.matrix = Matrix.Translation(pb.head) @ (tmw_inv @ (q_src @ hand_align[t_hand])).to_4x4()
            bpy.context.view_layer.update()
    else:
        _match_palms(src_arm, tgt_arm, sn, spin, thigh=not fist)
    for letter in ("L", "R"):
        _unwind_wrist(tgt_arm, f"Bip01 {letter} Forearm", f"Bip01 {letter} Hand")
    # Every clip takes Mixamo's fingers: a loose curl on the run, a fist on a punch.
    # The Rocketbox bind keeps them straight, which reads as pointing.
    if fist or hand_align:
        _copy_mixamo_fingers(src_arm, tgt_arm, sn, spin)


def _rest_head(arm: bpy.types.Object, name: str) -> Vector:
    return arm.matrix_world @ arm.data.bones[name].head_local


def _rest_rot(arm: bpy.types.Object, name: str) -> Matrix:
    return rot(arm.matrix_world @ arm.data.bones[name].matrix_local)


def _aim(arm: bpy.types.Object, name: str, child: str | None) -> Vector:
    if child and child in arm.data.bones:
        return _rest_head(arm, child) - _rest_head(arm, name)
    parent = arm.data.bones[name].parent
    return _rest_head(arm, name) - (arm.matrix_world @ parent.head_local)


def _retarget(
    pid: str,
    src_path: Path,
    clip_name: str,
    mode: str,
    window: tuple[float, float] | None = None,
) -> tuple[Path, float]:
    _clear()
    _TWIST_PREV.clear()
    scene = bpy.context.scene
    scene.render.fps = FPS

    # Leave the Mixamo curves on Euler. Switching those bones to quaternion
    # disconnects the FBX fcurves and the clip samples as the bind pose.
    src_arm = _import_fbx(src_path)
    prefix = next(b.name[: -len("Hips")] for b in src_arm.data.bones if b.name.endswith("Hips"))
    sn = lambda s: prefix + s
    act = src_arm.animation_data.action
    f0, f1 = (int(round(v)) for v in act.frame_range)
    if window:
        origin = f0
        f0 = origin + int(round(window[0] * FPS))
        f1 = min(f1, origin + int(round(window[1] * FPS)))
        f1 = max(f1, f0 + 2)
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

    # Hands roll on the knuckle line. Mixamo's T-pose hand lies along the body's
    # side axis, so the shared frame above falls back to forward and the palm
    # comes out a quarter turn off.
    hand_align = {}
    for side, letter in (("Left", "L"), ("Right", "R")):
        s_hand, t_hand = sn(f"{side}Hand"), f"Bip01 {letter} Hand"
        s_knuck = [sn(f"{side}Hand{f}1") for f in ("Index", "Middle", "Pinky")]
        pinky = f"Bip01 {letter} Finger4" if f"Bip01 {letter} Finger4" in tgt_arm.data.bones else f"Bip01 {letter} Finger3"
        t_knuck = [f"Bip01 {letter} Finger1", f"Bip01 {letter} Finger2", pinky]
        if not all(b in src_arm.data.bones for b in [s_hand, *s_knuck]) or not all(b in tgt_arm.data.bones for b in [t_hand, *t_knuck]):
            continue
        s_aim = _rest_head(src_arm, s_knuck[1]) - _rest_head(src_arm, s_hand)
        t_aim = _rest_head(tgt_arm, t_knuck[1]) - _rest_head(tgt_arm, t_hand)
        s_side = _rest_head(src_arm, s_knuck[0]) - _rest_head(src_arm, s_knuck[2])
        t_side = _rest_head(tgt_arm, t_knuck[0]) - _rest_head(tgt_arm, t_knuck[2])
        a = frame(s_aim, s_side) @ frame(t_aim, t_side).transposed()
        hand_align[t_hand] = _rest_rot(src_arm, s_hand).inverted() @ a @ _rest_rot(tgt_arm, t_hand)

    def leg(arm, a, b):
        return (_rest_head(arm, a) - _rest_head(arm, b)).length

    ratio = leg(tgt_arm, "Bip01 L Thigh", "Bip01 L Foot") / max(1e-6, leg(src_arm, sn("LeftUpLeg"), sn("LeftFoot")))
    src_hips0 = _rest_head(src_arm, sn("Hips"))
    pelvis_local = tgt_arm.data.bones["Bip01 Pelvis"].head_local
    obj_rot = rot(tgt_arm.matrix_world)
    obj_scale = tgt_arm.matrix_world.to_scale()
    tgt_pelvis0 = _rest_head(tgt_arm, "Bip01 Pelvis")
    fist = clip_name in {"Punch", "Cross", "Kick"}
    # Thumbs are not in the Mixamo map. The copied fingers still have to key them.
    thumbs = [
        name
        for side in ("L", "R")
        for suffix in ("0", "01")
        if (name := f"Bip01 {side} Finger{suffix}") in tgt_arm.data.bones
    ]

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
        _plant_limbs(src_arm, tgt_arm, sn, ratio, fist, hand_align)
        return tgt_arm.location.copy()

    span = f1 - f0
    step = 1 if span <= 90 else max(1, span // 80)
    frames = list(range(f0, f1 + 1, step))
    if frames[-1] != f1:
        frames.append(f1)
    locations = []
    quats: dict[str, list] = {t: [] for _, t in pairs}
    for name in thumbs:
        quats[name] = []
    raw = []
    for f in frames:
        raw.append(solve(f))
        for t in [bone for _, bone in pairs] + thumbs:
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
        elif mode == "fall":
            d.x = 0.0
            d.y = 0.0
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

    # Key from frame 1. A trimmed window would otherwise sit late in the clip
    # and the viewer would hold the guard for the missing lead-in.
    shift = f0 - 1
    if shift:
        quats = {t: [(f - shift, q) for f, q in keys] for t, keys in quats.items()}
        locations = [(f - shift, loc) for f, loc in locations]
        f1 -= shift
        f0 = 1
    scene.frame_start, scene.frame_end = f0, f1
    _key_action(tgt_arm, clip_name, f0, f1, quats, locations)
    dst = _export_clip(tgt_arm, pid, clip_name)
    print(f"  {clip_name}: {dur:.2f}s  native {speed:.2f} m/s  mode {mode}  fix {fix:.0f}")
    return dst, speed if mode in ("bob", "fall") else 0.0


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


def _merge(pid: str, parts: list[Path], kind: str = "moves") -> Path:
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
    dst = OUT / f"{pid}_{kind}.glb"
    write_glb(dst, out, blob)
    print(f"OK {pid}: {len(anims)} clips, {dst.stat().st_size // 1024} KB")
    return dst


def _align_part(part: Path, kept_names: list[str]) -> None:
    """Point a freshly exported clip at the moves GLB's node indices."""
    gltf, binary = read_glb(part)
    src_names = [n.get("name", "") for n in gltf["nodes"]]
    index = {name: i for i, name in enumerate(kept_names)}
    for anim in gltf.get("animations") or []:
        channels = []
        for ch in anim["channels"]:
            name = src_names[ch["target"]["node"]]
            if name not in index:
                continue
            channels.append({**ch, "target": {**ch["target"], "node": index[name]}})
        anim["channels"] = channels
    gltf["nodes"] = [{"name": n} for n in kept_names]
    write_glb(part, gltf, binary)


def _splice(pid: str, parts: list[Path]) -> None:
    existing = OUT / f"{pid}_moves.glb"
    gltf, binary = read_glb(existing)
    kept_names = [n.get("name", "") for n in gltf["nodes"]]
    drop = set()
    for part in parts:
        _align_part(part, kept_names)
        part_gltf, _binary = read_glb(part)
        for anim in part_gltf.get("animations") or []:
            drop.add(anim.get("name"))
    gltf["animations"] = [a for a in gltf["animations"] if a.get("name") not in drop]
    kept = OUT / f"_{pid}_kept.glb"
    write_glb(kept, gltf, binary)
    _merge(pid, [kept, *parts])


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    flags = {a.lower() for a in argv}
    swap = "swap" in flags
    fight = "fight" in flags
    combat = "combat" in flags
    want = {a for a in flags if a not in {"swap", "fight", "combat"}} or None
    ids = ["pieter", "mo", "jacob"]
    if want:
        ids = [i for i in ids if i in want]
    if combat:
        speeds = {}
        for pid in ids:
            print(f"== {pid} combat ==")
            parts = []
            for row in COMBAT:
                fname, clip, mode = row[0], row[1], row[2]
                window = row[3] if len(row) > 3 else None
                src = MIXAMO / fname
                if not src.exists():
                    print(f"  skip {clip}: no {fname}")
                    continue
                path, speed = _retarget(pid, src, clip, mode, window)
                parts.append(path)
                if mode == "bob" and speed > 0.2:
                    speeds[clip] = round(speed, 2)
            _merge(pid, parts, "combat")
        (OUT / "combat.json").write_text(json.dumps(speeds, indent=2) + "\n")
        print("speeds", speeds)
        return 0
    if swap:
        speeds: dict[str, float] = {}
        meta_path = OUT / "locomotion.json"
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {
            "idle": 0, "walk": 1.35, "jog": 3.2, "run": 5.6, "ride": 4.2,
        }
        for pid in ids:
            print(f"== {pid} swap ==")
            parts = []
            if fight:
                rows = [r for r in SWAP if r[1] in {"Punch", "Cross", "Kick"}]
            else:
                rows = SWAP
            for row in rows:
                fname, clip, mode = row[0], row[1], row[2]
                window = row[3] if len(row) > 3 else None
                src = MIXAMO / fname
                if not src.exists():
                    raise FileNotFoundError(src)
                path, speed = _retarget(pid, src, clip, mode, window)
                parts.append(path)
                if speed > 0.2:
                    speeds[clip.lower()] = round(speed, 2)
            _splice(pid, parts)
        for key in ("walk", "jog", "run"):
            if key in speeds:
                meta[key] = speeds[key]
        meta_path.write_text(json.dumps(meta, indent=2) + "\n")
        print("speeds", meta)
        return 0
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
