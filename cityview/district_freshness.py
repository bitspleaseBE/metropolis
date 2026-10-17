"""Which district packages are older than the code and data they are built from.

GitHub Pages publishes the committed ``viewer/`` and never rebuilds, so every change to
the build pipeline or to a district's sources has to ship with its rebuilt package.

A full ``district build`` that passes its checks stamps ``viewer/districts/<id>/build.json``
with a hash of every git-tracked input: shared pipeline code and assets plus the
district's own sources. ``python -m cityview district stale`` recomputes those hashes
and lists the packages whose stamp no longer matches the tree; CI runs the same check
on every pull request.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from cityview.districts import DISTRICT_REGISTRY
from cityview.paths import ROOT

STAMP_NAME = "build.json"
STAMP_VERSION = 1
SHARED = "shared"

SHARED_PREFIXES = ("cityview/", "blender/", "assets/", "viewer/cars/")
SHARED_FILES = frozenset({"scripts/compress_glb.mjs", "scripts/package.json", "scripts/package-lock.json"})
SHARED_EXCLUDED_PREFIXES = ("cityview/testdata/", "assets/references/")
# Modules that review, serve, check or regenerate committed assets, but never change
# what a build writes into a package (regenerated assets are inputs themselves).
TOOLING_MODULES = frozenset({
    "__main__",
    "aerial",
    "budgets",
    "cli",
    "courts",
    "district_freshness",
    "district_review",
    "facade_windows",
    "menu_map",
    "plaza_aerial",
    "special_buildings",
    "surface_textures",
})
# Under districts/<id>/: written by `district review` as well as by a build.
DISTRICT_EXCLUDED_PREFIXES = ("review/", "references/", "buildings/", "special_buildings.json")
# District sources a no-Blender republish rebuilds completely, by command.
PARTIAL_INPUTS = {
    "shops": ("shop_overrides.json", "interiors.json"),
    "interiors": ("interiors.json",),
}
GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A


def classify(rel: str, district_ids=None) -> str | None:
    """``SHARED``, a district id, or ``None`` when ``rel`` does not feed a district build."""
    ids = DISTRICT_REGISTRY if district_ids is None else district_ids
    if rel.startswith("districts/"):
        parts = rel.split("/", 2)
        if len(parts) < 3 or parts[1] not in ids:
            return None
        return None if parts[2].startswith(DISTRICT_EXCLUDED_PREFIXES) else parts[1]
    if rel in SHARED_FILES:
        return SHARED
    if rel.startswith(SHARED_EXCLUDED_PREFIXES) or not rel.startswith(SHARED_PREFIXES):
        return None
    if rel.startswith("cityview/") and rel.count("/") == 1 and rel.endswith(".py"):
        stem = rel[len("cityview/"):-3]
        if stem.startswith("test_") or stem in TOOLING_MODULES:
            return None
    return SHARED


def tracked_files(root: Path = ROOT) -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(root), "ls-files", "-z"], check=True, capture_output=True
    ).stdout
    return [p for p in out.decode().split("\0") if p]


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:16]


def collect_inputs(root: Path = ROOT, district_ids=None) -> dict[str, dict[str, str]]:
    """``{district_id: {path: hash}}`` over shared + per-district inputs (tracked files only).

    Files deleted in the working tree are skipped, so the result matches a checkout of
    the commit that records the deletion.
    """
    ids = list(DISTRICT_REGISTRY if district_ids is None else district_ids)
    shared: dict[str, str] = {}
    own: dict[str, dict[str, str]] = {did: {} for did in ids}
    for rel in tracked_files(root):
        kind = classify(rel, ids)
        if kind is None:
            continue
        path = root / rel
        if not path.is_file():
            continue
        (shared if kind == SHARED else own[kind])[rel] = _file_hash(path)
    return {did: {**shared, **own[did]} for did in ids}


def inputs_digest(inputs: dict[str, str]) -> str:
    h = hashlib.sha256()
    for rel in sorted(inputs):
        h.update(f"{rel}\0{inputs[rel]}\n".encode())
    return h.hexdigest()


def stamp_path(district_id: str, root: Path = ROOT) -> Path:
    return root / "viewer" / "districts" / district_id / STAMP_NAME


def load_stamp(district_id: str, root: Path = ROOT) -> dict | None:
    path = stamp_path(district_id, root)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def _git_head(root: Path) -> str | None:
    res = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True)
    return res.stdout.strip() or None


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _write_stamp_doc(district_id: str, doc: dict, root: Path) -> Path:
    path = stamp_path(district_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n")
    return path


def write_stamp(district_id: str, *, build_seconds: float | None = None, root: Path = ROOT) -> Path:
    """Record the inputs this package was just built from. Call only after a passing full build."""
    inputs = collect_inputs(root, [district_id])[district_id]
    doc = {
        "version": STAMP_VERSION,
        "district": district_id,
        "built_at": _now(),
        "git_head": _git_head(root),
        "build_seconds": round(build_seconds, 1) if build_seconds is not None else None,
        "inputs_sha256": inputs_digest(inputs),
        "inputs": inputs,
    }
    path = _write_stamp_doc(district_id, doc, root)
    print(f"Stamped {path} ({len(inputs)} inputs)")
    return path


def diff_inputs(old: dict[str, str], new: dict[str, str]) -> list[str]:
    """Sorted changes as ``+path`` (new input), ``-path`` (gone) and ``~path`` (edited)."""
    out = [f"+{p}" for p in new.keys() - old.keys()]
    out += [f"-{p}" for p in old.keys() - new.keys()]
    out += [f"~{p}" for p in old.keys() & new.keys() if old[p] != new[p]]
    return sorted(out, key=lambda s: (s[1:], s[0]))


@dataclass
class Staleness:
    district: str
    reason: str
    changes: list[str] = field(default_factory=list)

    @property
    def shared_changed(self) -> bool:
        return any(not c[1:].startswith("districts/") for c in self.changes)


def stale_districts(district_ids=None, root: Path = ROOT) -> list[Staleness]:
    ids = list(DISTRICT_REGISTRY if district_ids is None else district_ids)
    current = collect_inputs(root, ids)
    out = []
    for did in ids:
        stamp = load_stamp(did, root)
        if not stamp or stamp.get("version") != STAMP_VERSION:
            out.append(Staleness(did, "no build stamp (package predates `district build` stamping)"))
            continue
        if stamp.get("inputs_sha256") == inputs_digest(current[did]):
            continue
        changes = diff_inputs(stamp.get("inputs") or {}, current[did])
        out.append(Staleness(did, f"inputs changed since the build of {stamp.get('built_at')}", changes))
    return out


def restamp_after_republish(district_id: str, command: str, root: Path = ROOT) -> bool:
    """After ``district shops`` / ``interiors``: keep the stamp current when that command
    rebuilt everything that changed. Returns False (stamp untouched) when other inputs
    changed too, because those still need a full ``district build``."""
    stamp = load_stamp(district_id, root)
    if not stamp or stamp.get("version") != STAMP_VERSION:
        print(f"{district_id}: no build stamp; a full `district build {district_id}` is still needed")
        return False
    current = collect_inputs(root, [district_id])[district_id]
    old = stamp.get("inputs") or {}
    changes = diff_inputs(old, current)
    if not changes:
        return True
    allowed = {f"districts/{district_id}/{name}" for name in PARTIAL_INPUTS[command]}
    other = [c for c in changes if c[1:] not in allowed]
    if other:
        print(
            f"{district_id}: `district {command}` does not cover {', '.join(other[:5])}"
            f"{' …' if len(other) > 5 else ''}; run `python -m cityview district build {district_id}`"
        )
        return False
    inputs = {p: h for p, h in old.items() if p not in allowed}
    inputs.update({p: h for p, h in current.items() if p in allowed})
    stamp["inputs"] = inputs
    stamp["inputs_sha256"] = inputs_digest(inputs)
    stamp.setdefault("republished", []).append(
        {"command": command, "at": _now(), "changes": changes}
    )
    _write_stamp_doc(district_id, stamp, root)
    print(f"{district_id}: stamp updated for `district {command}` ({', '.join(changes)})")
    return True


def _glb_json(path: Path) -> dict | None:
    with path.open("rb") as fh:
        head = fh.read(20)
        if len(head) < 20:
            return None
        magic = int.from_bytes(head[0:4], "little")
        clen = int.from_bytes(head[12:16], "little")
        ctype = int.from_bytes(head[16:20], "little")
        if magic != GLB_MAGIC or ctype != CHUNK_JSON:
            return None
        return json.loads(fh.read(clen))


def uncompressed_glbs(district_id: str, root: Path = ROOT) -> list[str]:
    """Published GLBs in the package that are not Meshopt-compressed."""
    pkg = root / "viewer" / "districts" / district_id
    glbs = [pkg / "core.glb", *sorted(pkg.glob("chunks/*.glb")), *sorted(pkg.glob("landmarks/*.glb"))]
    out = []
    for glb in glbs:
        if not glb.is_file() or glb.name.endswith(".premeshopt.glb"):
            continue
        doc = _glb_json(glb)
        if doc is None or "EXT_meshopt_compression" not in (doc.get("extensionsUsed") or []):
            out.append(str(glb.relative_to(root)))
    return out


def report(district_ids=None, *, as_json: bool = False, root: Path = ROOT) -> int:
    """Print stale / uncompressed packages; exit status 1 when any (0 with ALLOW_STALE_DISTRICTS=1)."""
    ids = list(DISTRICT_REGISTRY if district_ids is None else district_ids)
    unknown = [d for d in ids if d not in DISTRICT_REGISTRY]
    if unknown:
        raise ValueError(f"Unknown district(s): {', '.join(unknown)}")
    stale = stale_districts(ids, root)
    fat = {did: uncompressed_glbs(did, root) for did in ids}
    fat = {did: v for did, v in fat.items() if v}

    if as_json:
        print(json.dumps({
            "stale": [{"district": s.district, "reason": s.reason, "changes": s.changes} for s in stale],
            "uncompressed": fat,
        }, indent=2))
    else:
        annotate = os.environ.get("GITHUB_ACTIONS") == "true"
        for s in stale:
            shown = ", ".join(s.changes[:8]) + (f" (+{len(s.changes) - 8} more)" if len(s.changes) > 8 else "")
            msg = f"{s.district} is stale: {s.reason}" + (f": {shown}" if shown else "")
            print(f"::error::{msg}" if annotate else f"STALE {msg}")
        for did, files in fat.items():
            msg = f"{did} has GLBs without Meshopt compression: {', '.join(files[:5])}"
            print(f"::error::{msg}" if annotate else f"UNCOMPRESSED {msg}")
        if stale or fat:
            todo = sorted({s.district for s in stale} | set(fat))
            print("\nRebuild locally and commit the packages (builds of different districts can run in parallel):")
            if len(todo) > 1:
                print(f"  python3 scripts/build_all_districts.py {' '.join(todo)}")
            else:
                print(f"  python3 -m cityview district build {todo[0]}")
        else:
            print(f"OK: {len(ids)} district package(s) match their inputs")

    if not (stale or fat):
        return 0
    if os.environ.get("ALLOW_STALE_DISTRICTS", "").strip() in {"1", "true", "yes"}:
        print("ALLOW_STALE_DISTRICTS set: reporting only, not failing")
        return 0
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("ids", nargs="*", help="District ids (default: every registry district)")
    parser.add_argument("--json", action="store_true", help="Machine-readable output")
    args = parser.parse_args(argv)
    return report(args.ids or None, as_json=args.json)


if __name__ == "__main__":
    sys.exit(main())
