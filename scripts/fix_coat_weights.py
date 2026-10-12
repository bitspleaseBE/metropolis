"""Hang the player coats from the pelvis instead of the thighs.

The Rocketbox coats weight their hems partly to the thighs. When a player sits on a
bike, the raised thighs drag the back hem up into a crumpled flap over the saddle.
This moves most of that thigh weight onto the pelvis, in place, for every mesh island
that rides mainly on the spine (coat, shirt, and vest panels). Trousers keep their
weights.

Pieter's shirt tail is a separate band under the jacket hem, skinned to the thighs
and pelvis only. A raised thigh swings it out through the back of the jacket, so for
the players in SHIRT_TAILS every small waist island with no calf or foot influence
hangs from the pelvis completely.

Run: ``python3 scripts/fix_coat_weights.py [pieter mo jacob]``. Each file is marked in
``asset.extras.coatWeights`` / ``asset.extras.tailWeights`` and each pass runs once.
"""

from __future__ import annotations

import json
import struct
import sys
from collections import Counter
from pathlib import Path

PLAYERS = Path(__file__).resolve().parent.parent / "viewer" / "characters" / "players"
SPINE = {"Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2"}
THIGHS = {"Bip01 L Thigh", "Bip01 R Thigh"}
PELVIS = "Bip01 Pelvis"
MOVE = 0.85
SHIRT_TAILS = {"pieter"}
TAIL_MAX_VERTS = 40


def read_glb(path: Path) -> tuple[dict, bytearray]:
    data = path.read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + json_len])
    bin_off = 20 + json_len
    bin_len = struct.unpack_from("<I", data, bin_off)[0]
    return doc, bytearray(data[bin_off + 8 : bin_off + 8 + bin_len])


def write_glb(path: Path, doc: dict, blob: bytearray) -> None:
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    blob += b"\0" * (-len(blob) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    path.write_bytes(out)


def view(doc: dict, acc_i: int) -> tuple[int, int, int, int]:
    acc = doc["accessors"][acc_i]
    bv = doc["bufferViews"][acc["bufferView"]]
    size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[acc["componentType"]]
    comps = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    stride = bv.get("byteStride") or size * comps
    return bv.get("byteOffset", 0) + acc.get("byteOffset", 0), stride, acc["count"], acc["componentType"]


def islands(count: int, tris: list[int]) -> list[int]:
    parent = list(range(count))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def join(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(0, len(tris), 3):
        join(tris[i], tris[i + 1])
        join(tris[i], tris[i + 2])
    return [find(i) for i in range(count)]


def fix_primitive(doc: dict, blob: bytearray, prim: dict, names: list[str], coats: bool, tails: bool) -> int:
    attrs = prim["attributes"]
    count = doc["accessors"][attrs["POSITION"]]["count"]
    j_off, j_stride, _, j_type = view(doc, attrs["JOINTS_0"])
    w_off, w_stride, _, w_type = view(doc, attrs["WEIGHTS_0"])
    if w_type != 5126 or j_type not in (5121, 5123):
        return 0
    j_fmt = "<4B" if j_type == 5121 else "<4H"
    i_off, i_stride, i_count, i_type = view(doc, prim["indices"])
    i_fmt = {5121: "<B", 5123: "<H", 5125: "<I"}[i_type]
    i_size = struct.calcsize(i_fmt)
    tris = [struct.unpack_from(i_fmt, blob, i_off + k * i_size)[0] for k in range(i_count)]
    joints = [struct.unpack_from(j_fmt, blob, j_off + k * j_stride) for k in range(count)]
    weights = [list(struct.unpack_from("<4f", blob, w_off + k * w_stride)) for k in range(count)]

    root = islands(count, tris)
    lead: dict[int, Counter] = {}
    for k in range(count):
        top = max(range(4), key=lambda s: weights[k][s])
        lead.setdefault(root[k], Counter())[names[joints[k][top]]] += 1
    share: dict[int, float] = {}
    if coats:
        for r, c in lead.items():
            if sum(c[b] for b in SPINE) * 2 > sum(c.values()):
                share[r] = MOVE
    if tails:
        waist = THIGHS | SPINE | {PELVIS}
        bones: dict[int, set] = {}
        for k in range(count):
            bones.setdefault(root[k], set()).update(names[joints[k][s]] for s in range(4) if weights[k][s] > 0)
        for r, c in lead.items():
            if sum(c.values()) <= TAIL_MAX_VERTS and bones[r] <= waist and bones[r] & THIGHS:
                share[r] = 1.0
    pos_off, pos_stride, _, _ = view(doc, attrs["POSITION"])
    seam: dict[bytes, float] = {}
    for k in range(count):
        key = bytes(blob[pos_off + k * pos_stride : pos_off + k * pos_stride + 12])
        seam[key] = max(seam.get(key, 0.0), share.get(root[k], 0.0))
    pelvis = names.index(PELVIS)

    changed = 0
    for k in range(count):
        frac = seam[bytes(blob[pos_off + k * pos_stride : pos_off + k * pos_stride + 12])]
        if frac <= 0:
            continue
        js, ws = list(joints[k]), weights[k]
        moved = 0.0
        for s in range(4):
            if names[js[s]] in THIGHS and ws[s] > 0:
                moved += ws[s] * frac
                ws[s] *= 1 - frac
        if moved <= 0:
            continue
        slot = next((s for s in range(4) if js[s] == pelvis), None)
        if slot is None:
            slot = min(range(4), key=lambda s: ws[s])
            js[slot], ws[slot] = pelvis, 0.0
        ws[slot] += moved
        total = sum(ws) or 1.0
        ws = [w / total for w in ws]
        struct.pack_into(j_fmt, blob, j_off + k * j_stride, *js)
        struct.pack_into("<4f", blob, w_off + k * w_stride, *ws)
        changed += 1
    return changed


def fix(pid: str) -> None:
    path = PLAYERS / f"{pid}_Walking.glb"
    doc, blob = read_glb(path)
    extras = doc.setdefault("asset", {}).setdefault("extras", {})
    coats = not extras.get("coatWeights")
    tails = pid in SHIRT_TAILS and not extras.get("tailWeights")
    if not coats and not tails:
        print(f"{pid}: already done")
        return
    names = [doc["nodes"][n].get("name", "") for n in doc["skins"][0]["joints"]]
    if PELVIS not in names:
        print(f"{pid}: no pelvis, skipped")
        return
    changed = sum(
        fix_primitive(doc, blob, p, names, coats, tails) for m in doc["meshes"] for p in m["primitives"]
    )
    extras["coatWeights"] = True
    if tails:
        extras["tailWeights"] = True
    write_glb(path, doc, blob)
    print(f"{pid}: {changed} coat and shirt-tail vertices now hang from the pelvis")


def main() -> None:
    for pid in sys.argv[1:] or ["pieter", "mo", "jacob"]:
        fix(pid)


if __name__ == "__main__":
    main()
