"""Meshopt compression for GLBs published into ``viewer/`` (``scripts/compress_glb.mjs``)."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from cityview.paths import ROOT


def compress_viewer_glb(path: Path, *, required: bool = False) -> None:
    """Meshopt-compress a GLB in place for faster Pages downloads.

    Pages serves committed GLBs as-is, so district publishes pass ``required=True``:
    a missing Node or script is an error there instead of a silently fat package.
    ``CITYVIEW_SKIP_COMPRESS=1`` still opts out explicitly.
    """
    if not path.exists():
        return
    if os.environ.get("CITYVIEW_SKIP_COMPRESS", "").strip() in {"1", "true", "yes"}:
        print(f"Skipping Meshopt compress ({path.name}): CITYVIEW_SKIP_COMPRESS set")
        return
    script = ROOT / "scripts" / "compress_glb.mjs"
    node = shutil.which("node")
    missing = f"missing {script}" if not script.exists() else ("node not on PATH" if not node else "")
    if missing:
        if required:
            raise FileNotFoundError(f"Cannot Meshopt-compress {path}: {missing}")
        print(f"Skipping Meshopt compress ({path.name}): {missing}")
        return
    print(f"Compressing {path} …")
    subprocess.run([node, str(script), str(path)], check=True, cwd=ROOT)
