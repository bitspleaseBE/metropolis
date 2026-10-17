"""Retarget Mixamo phone clips onto a few Rocketbox pedestrians.

Sources (downloaded without skin, assets/mixamo/ is gitignored):

  Texting.fbx                  standing, looking at a phone
  Walking_Mixamo.fbx           Mixamo "Walking"
  Walking_While_Texting.fbx   walking with the phone up
  Talking_On_Phone.fbx         phone held to the ear
  Pacing_And_Talking.fbx       walking while on a call

Each clip is an animation-only GLB, same retarget as the idle bake, loaded on
first use (viewer/people.js loadPhone). Only the ids in PHONE are baked — the
street pool pins a few of them so some pedestrians actually wear the clips.
Pass ``.fbx`` names after ``--`` to bake only those sources.

  blender --background --python scripts/bake_rocketbox_phone.py [-- <person id or source.fbx> ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from bake_rocketbox_getup import PEOPLE, retarget  # noqa: E402

# A spread of looks. Households mix flemish / arab / african, and 2018 adds hasidic.
PHONE = [
    "Female_Adult_01",  # european
    "Male_Adult_02",  # european
    "Female_Adult_03",  # asian
    "Male_Adult_09",  # asian
    "Female_Adult_06",  # muslim
    "Male_Adult_15",  # muslim
    "Female_Adult_11",  # mediterranean
    "Business_Male_06",  # mediterranean
    "Female_Adult_13",  # slavic
    "Female_Party_02",  # african
    "Male_Adult_04",  # african
    "Male_Adult_19",  # arab
    "Hasidic_Young_Man",
    "Male_Adult_03",  # senior
]

CLIPS = [
    ("Texting.fbx", PEOPLE / "texting", "Texting", 2),
    ("Walking_Mixamo.fbx", PEOPLE / "phone-walk", "Walking", 2),
    ("Walking_While_Texting.fbx", PEOPLE / "text-walk", "TextWalk", 2),
    ("Talking_On_Phone.fbx", PEOPLE / "phone-call", "PhoneCall", 2),
    ("Pacing_And_Talking.fbx", PEOPLE / "phone-pace", "PhonePace", 2),
]


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    only_src = {a for a in argv if a.endswith(".fbx")}
    only_people = [a for a in argv if not a.endswith(".fbx")]
    known = {p["id"] for p in json.loads((PEOPLE / "manifest.json").read_text())["people"]}
    missing = [pid for pid in PHONE if pid not in known]
    if missing:
        raise SystemExit(f"unknown people: {', '.join(missing)}")
    people = [pid for pid in PHONE if not only_people or pid in only_people]
    clips = [c for c in CLIPS if not only_src or c[0] in only_src]
    for pid in people:
        for filename, out_dir, clip_name, step in clips:
            retarget(
                pid,
                source=ROOT / "assets" / "mixamo" / filename,
                out_dir=out_dir,
                clip_name=clip_name,
                step=step,
                sparse=True,
            )
    ids = PEOPLE / "phone.json"
    ids.write_text(json.dumps({"people": PHONE}, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
