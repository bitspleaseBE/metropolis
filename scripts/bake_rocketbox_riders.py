"""Retarget Mixamo Riding / Scooter clips onto Rocketbox pedestrians.

Writes animation-only GLBs to:
  viewer/characters/people/ride/<id>.glb
  viewer/characters/people/step/<id>.glb

Reuses the world-space retarget in bake_rocketbox_getup.py.

  blender --background --python scripts/bake_rocketbox_riders.py
  blender --background --python scripts/bake_rocketbox_riders.py -- ride Hasidic_Father
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import bake_rocketbox_getup as getup  # noqa: E402

PEOPLE = ROOT / "viewer" / "characters" / "people"
KINDS = {
    "ride": {
        "source": ROOT / "viewer" / "characters" / "Remy_Riding.glb",
        "out": PEOPLE / "ride",
    },
    "step": {
        "source": ROOT / "viewer" / "characters" / "Remy_Scooter.glb",
        "out": PEOPLE / "step",
    },
}


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    kinds = [a for a in argv if a.lower() in KINDS]
    ids = [a for a in argv if a.lower() not in KINDS]
    if not kinds:
        kinds = list(KINDS)

    people = [p["id"] for p in json.loads((PEOPLE / "manifest.json").read_text())["people"]]
    if ids:
        people = [p for p in people if p in ids]

    for kind in kinds:
        cfg = KINDS[kind]
        if not cfg["source"].exists():
            print(f"skip {kind}: missing {cfg['source']}")
            continue
        cfg["out"].mkdir(parents=True, exist_ok=True)
        getup.SOURCE = cfg["source"]
        getup.OUT = cfg["out"]
        print(f"=== {kind}: {cfg['source'].name} → {cfg['out']} ({len(people)} people) ===")
        for pid in people:
            try:
                getup.retarget(pid)
            except Exception as err:
                print(f"FAIL {pid}: {err}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
