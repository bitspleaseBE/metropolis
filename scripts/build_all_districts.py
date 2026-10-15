"""Rebuild district packages side by side and report how long each took.

Every ``district build`` writes to its own ``output/<id>/``, so builds of different
districts can run at the same time. Each build is a separate process (Python layout →
Blender → publish + Meshopt → checks → build stamp); its log goes to
``output/build-logs/<run>/<id>.log`` with an elapsed-seconds prefix per line.

After the builds finish the shared districts index and Maps menu are refreshed once,
the freshness check runs, and ``summary.json`` / ``summary.md`` record wall time, CPU
time, peak memory and the time spent before, in and after Blender per district.

  python3 scripts/build_all_districts.py                    # every registry district
  python3 scripts/build_all_districts.py 2000-antwerpen 2060-noord -j 2
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from cityview.districts import DISTRICT_REGISTRY  # noqa: E402

# Log lines that mark the Blender phase of a build (first and last Blender output).
BLENDER_START = "Blender 4."
PUBLISH_START = "Copied "


def _fmt(seconds: float | None) -> str:
    if seconds is None:
        return "–"
    m, s = divmod(int(round(seconds)), 60)
    h, m = divmod(m, 60)
    return f"{h}h{m:02d}m{s:02d}s" if h else f"{m}m{s:02d}s"


def _max_rss_bytes(ru_maxrss: int) -> int:
    # macOS reports bytes, Linux kilobytes.
    return ru_maxrss if sys.platform == "darwin" else ru_maxrss * 1024


def build_one(district_id: str, log_dir: Path, run_started: float, extra: list[str]) -> dict:
    log_path = log_dir / f"{district_id}.log"
    cmd = [sys.executable, "-u", "-m", "cityview", "district", "build", district_id, *extra]
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    started = time.monotonic()
    marks: dict[str, float] = {}
    print(f"[{_fmt(started - run_started)}] start {district_id}", flush=True)
    with log_path.open("w", buffering=1) as log:
        log.write(f"$ {' '.join(cmd)}\n")
        proc = subprocess.Popen(
            cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )

        def pump() -> None:
            assert proc.stdout is not None
            for line in proc.stdout:
                t = time.monotonic() - started
                if BLENDER_START in line and "blender_start" not in marks:
                    marks["blender_start"] = t
                if PUBLISH_START in line and "blender_start" in marks and "publish_start" not in marks:
                    marks["publish_start"] = t
                log.write(f"{t:9.1f} | {line}")

        reader = threading.Thread(target=pump, daemon=True)
        reader.start()
        _, status, usage = os.wait4(proc.pid, 0)
        proc.returncode = os.waitstatus_to_exitcode(status)
        reader.join()
    wall = time.monotonic() - started
    b0, p0 = marks.get("blender_start"), marks.get("publish_start")
    result = {
        "district": district_id,
        "exit_code": proc.returncode,
        "wall_seconds": round(wall, 1),
        "cpu_seconds": round(usage.ru_utime + usage.ru_stime, 1),
        "max_rss_mb": round(_max_rss_bytes(usage.ru_maxrss) / 1e6),
        "prep_seconds": round(b0, 1) if b0 is not None else None,
        "blender_seconds": round(p0 - b0, 1) if b0 is not None and p0 is not None else None,
        "publish_check_seconds": round(wall - p0, 1) if p0 is not None else None,
        "log": str(log_path.relative_to(ROOT)),
    }
    state = "ok" if proc.returncode == 0 else f"FAILED (exit {proc.returncode})"
    print(f"[{_fmt(time.monotonic() - run_started)}] {state} {district_id} in {_fmt(wall)}", flush=True)
    return result


def package_size_mb(district_id: str) -> float:
    pkg = ROOT / "viewer" / "districts" / district_id
    total = sum(p.stat().st_size for p in pkg.rglob("*") if p.is_file() and not p.name.endswith(("city.glb", ".premeshopt.glb")))
    return round(total / 1e6, 1)


def write_summary(log_dir: Path, results: list[dict], meta: dict) -> str:
    lines = [
        "| District | Result | Wall | Before Blender | Blender | Publish + checks | CPU | Peak RSS | Package |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in sorted(results, key=lambda r: -r["wall_seconds"]):
        lines.append(
            f"| {r['district']} | {'ok' if r['exit_code'] == 0 else 'failed'} | {_fmt(r['wall_seconds'])} "
            f"| {_fmt(r['prep_seconds'])} | {_fmt(r['blender_seconds'])} | {_fmt(r['publish_check_seconds'])} "
            f"| {_fmt(r['cpu_seconds'])} | {r['max_rss_mb'] / 1000:.1f} GB | {r.get('package_mb', 0):.0f} MB |"
        )
    serial = sum(r["wall_seconds"] for r in results)
    lines += [
        "",
        f"Parallel wall clock: **{_fmt(meta['wall_seconds'])}** for {len(results)} districts "
        f"({meta['jobs']} at a time) on {meta['machine']}; the same builds back to back: {_fmt(serial)} "
        f"({serial / max(meta['wall_seconds'], 1):.1f}x speed-up).",
    ]
    md = "\n".join(lines) + "\n"
    (log_dir / "summary.md").write_text(md)
    (log_dir / "summary.json").write_text(json.dumps({**meta, "districts": results}, indent=2) + "\n")
    return md


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("ids", nargs="*", help="District ids (default: every registry district)")
    parser.add_argument("-j", "--jobs", type=int, default=0, help="Builds at a time (default: all at once)")
    parser.add_argument("--refresh", action="store_true", help="Re-download every cache (slow; Overpass rate limits)")
    args = parser.parse_args(argv)

    ids = args.ids or list(DISTRICT_REGISTRY)
    unknown = [d for d in ids if d not in DISTRICT_REGISTRY]
    if unknown:
        parser.error(f"unknown district(s): {', '.join(unknown)}")
    jobs = args.jobs or len(ids)
    run_id = time.strftime("%Y%m%d-%H%M%S")
    log_dir = ROOT / "output" / "build-logs" / run_id
    log_dir.mkdir(parents=True, exist_ok=True)
    extra = ["--refresh"] if args.refresh else []
    print(f"Building {len(ids)} district(s), {jobs} at a time; logs in {log_dir.relative_to(ROOT)}", flush=True)

    run_started = time.monotonic()
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        results = list(pool.map(lambda did: build_one(did, log_dir, run_started, extra), ids))
    wall = time.monotonic() - run_started
    for r in results:
        r["package_mb"] = package_size_mb(r["district"])

    from cityview.district_pipeline import write_districts_index
    from cityview.menu_map import write_menu_map

    write_districts_index()
    write_menu_map()

    meta = {
        "run": run_id,
        "jobs": jobs,
        "wall_seconds": round(wall, 1),
        "machine": f"{platform.machine()} {platform.system()} {os.cpu_count()} CPUs",
        "git_head": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip(),
    }
    print("\n" + write_summary(log_dir, results, meta))

    from cityview.district_freshness import report

    fresh = report(ids)
    failed = [r["district"] for r in results if r["exit_code"] != 0]
    if failed:
        print(f"Failed: {', '.join(failed)} (see logs in {log_dir.relative_to(ROOT)})", file=sys.stderr)
    return 1 if failed or fresh else 0


if __name__ == "__main__":
    sys.exit(main())
