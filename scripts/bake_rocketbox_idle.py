"""Retarget Mixamo's standing idle onto the Rocketbox people (shop staff and customers).

Rocketbox ships walks only, so an NPC that stops (a cashier behind the till, a shopper at a
shelf) would freeze mid-stride. This carries ``assets/mixamo/Idle_2.fbx`` (the idle the cast
uses, scripts/bake_player_locomotion.py) over to each person with the same world-space bone
match and floor IK as the get-up bake, and writes an animation-only GLB to
``viewer/characters/people/idle/<id>.glb``.

  blender --background --python scripts/bake_rocketbox_idle.py [-- <person id> ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from bake_rocketbox_getup import PEOPLE, retarget  # noqa: E402

SOURCE = ROOT / "assets" / "mixamo" / "Idle_2.fbx"
OUT = PEOPLE / "idle"


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    people = [p["id"] for p in json.loads((PEOPLE / "manifest.json").read_text())["people"]]
    for pid in [p for p in people if not argv or p in argv]:
        # A slow sway: every third frame, retargeted bones only, keeps a clip near 100 KB.
        retarget(pid, source=SOURCE, out_dir=OUT, clip_name="Idle", step=3, sparse=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
