"""NMBS/SNCB GTFS enrichment for districts that contain heavy rail.

Uses the Belgian Mobility portal static GTFS feed (same family as De Lijn).
Cached per district under ``districts/<id>/cache/gtfs_nmbs.json``. When the
profile has no rail, the pipeline skips this module entirely.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path
from typing import Any
from urllib.request import urlopen

# Official Belgian Mobility catalogue — NMBS/SNCB GTFS static.
NMBS_GTFS_URL = "https://gtfs.irail.be/nmbs/gtfs/latest.zip"

ROUTE_TYPE_MODE = {
    "2": "train",  # rail
    "100": "train",
    "101": "train",
    "102": "train",
    "103": "train",
    "106": "train",
    "109": "train",
}


def _download_zip(url: str = NMBS_GTFS_URL) -> bytes:
    with urlopen(url, timeout=120) as resp:  # noqa: S310 — fixed public URL
        return resp.read()


def _read_csv(zf: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    raw = zf.read(name)
    text = io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8-sig")
    return list(csv.DictReader(text))


def fetch_nmbs_slice(
    bbox: tuple[float, float, float, float],
    cache_path: Path,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    """Download NMBS GTFS and keep stops + shapes that touch ``bbox``."""
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text())

    south, west, north, east = bbox
    data = _download_zip()
    stops: list[dict[str, Any]] = []
    shapes: list[dict[str, Any]] = []
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = set(zf.namelist())
        stop_rows = _read_csv(zf, "stops.txt") if "stops.txt" in names else []
        stop_ids_in: set[str] = set()
        for row in stop_rows:
            try:
                lat = float(row.get("stop_lat") or 0)
                lon = float(row.get("stop_lon") or 0)
            except ValueError:
                continue
            if not (south <= lat <= north and west <= lon <= east):
                continue
            sid = row.get("stop_id") or ""
            stop_ids_in.add(sid)
            stops.append(
                {
                    "id": sid,
                    "name": row.get("stop_name") or sid,
                    "lat": lat,
                    "lon": lon,
                    "mode": "train",
                }
            )
        # Shapes: keep those with any point in bbox (optional — large file).
        if "shapes.txt" in names and stop_ids_in:
            by_shape: dict[str, list[tuple[int, float, float]]] = {}
            for row in _read_csv(zf, "shapes.txt"):
                sid = row.get("shape_id") or ""
                try:
                    seq = int(row.get("shape_pt_sequence") or 0)
                    lat = float(row.get("shape_pt_lat") or 0)
                    lon = float(row.get("shape_pt_lon") or 0)
                except ValueError:
                    continue
                by_shape.setdefault(sid, []).append((seq, lat, lon))
            for sid, pts in by_shape.items():
                pts.sort()
                if any(south <= lat <= north and west <= lon <= east for _, lat, lon in pts):
                    shapes.append(
                        {
                            "id": sid,
                            "mode": "train",
                            "points": [[lat, lon] for _, lat, lon in pts],
                        }
                    )

    payload = {
        "agency": "nmbs",
        "bbox": list(bbox),
        "stops": stops,
        "shapes": shapes[:40],
        "meta": {"stop_count": len(stops), "shape_count": len(shapes)},
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload))
    return payload


def enrich_layout_trains(
    layout: dict[str, Any],
    origin: tuple[float, float],
    bbox: tuple[float, float, float, float],
    cache_path: Path,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    """Attach NMBS train stops/paths onto the layout when rail is present."""
    from cityview.geo import project

    try:
        payload = fetch_nmbs_slice(bbox, cache_path, refresh=refresh)
    except Exception as exc:  # noqa: BLE001 — offline CI / network blip
        layout.setdefault("transit_meta", {})["nmbs_error"] = str(exc)
        return {"stops": 0, "paths": 0, "error": str(exc)}

    stops_out = layout.setdefault("transit_stops", [])
    paths_out = layout.setdefault("transit_paths", [])
    existing = {(s.get("x"), s.get("y"), s.get("mode")) for s in stops_out}

    n_stops = 0
    for s in payload.get("stops") or []:
        x, y = project(s["lat"], s["lon"], origin[0], origin[1])
        key = (round(x, 1), round(y, 1), "train")
        if key in existing:
            continue
        stops_out.append(
            {
                "id": f"nmbs-{s['id']}",
                "name": s.get("name") or "NMBS",
                "mode": "train",
                "x": x,
                "y": y,
                "lines": ["NMBS"],
            }
        )
        n_stops += 1

    n_paths = 0
    for shape in payload.get("shapes") or []:
        pts = []
        for lat, lon in shape.get("points") or []:
            x, y = project(lat, lon, origin[0], origin[1])
            pts.append([x, y])
        if len(pts) < 2:
            continue
        paths_out.append(
            {
                "id": f"nmbs-shape-{shape['id']}",
                "mode": "train",
                "ref": "NMBS",
                "points": pts,
                "direction": 1,
            }
        )
        n_paths += 1

    meta = layout.setdefault("transit_meta", {})
    meta["nmbs_stops"] = n_stops
    meta["nmbs_paths"] = n_paths
    return {"stops": n_stops, "paths": n_paths}
