"""District-wide 2D map layer for the viewer radar, overview map and street captions.

``roads.json`` is deliberately spawn-limited (runtime traffic); the minimap needs every
street, path, water body and park of the postcode, so it reads ``map.json`` instead.
Coordinates are Blender XY metres in the district's local frame.
"""

from __future__ import annotations

import math
from typing import Any

MAP_SIMPLIFY_M = 0.6
AREA_SIMPLIFY_M = 1.5
MIN_AREA_M2 = 40.0

# Draw order / weight on the radar; anything else is skipped.
MAP_ROAD_KINDS = {
    "motorway": 1,
    "trunk": 1,
    "primary": 1,
    "secondary": 1,
    "tertiary": 2,
    "unclassified": 2,
    "residential": 2,
    "living_street": 2,
    "service": 3,
    "pedestrian": 3,
    "footway": 4,
    "path": 4,
    "cycleway": 4,
    "steps": 4,
    "track": 4,
}


def _dp(pts: list[list[float]], tol: float) -> list[list[float]]:
    if len(pts) <= 2:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    ll = math.hypot(dx, dy) or 1e-9
    best, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / ll
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return _dp(pts[: idx + 1], tol)[:-1] + _dp(pts[idx:], tol)


def _r(pts: list[list[float]]) -> list[list[float]]:
    return [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in pts]


def _ring_area(ring: list[list[float]]) -> float:
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % len(ring)][0], ring[(i + 1) % len(ring)][1]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def _areas(items: list[dict[str, Any]]) -> list[list[list[float]]]:
    out = []
    for it in items:
        ring = [[float(p[0]), float(p[1])] for p in it.get("ring") or []]
        if len(ring) < 3 or _ring_area(ring) < MIN_AREA_M2:
            continue
        simple = _dp(ring + [ring[0]], AREA_SIMPLIFY_M)[:-1]
        out.append(_r(simple if len(simple) >= 3 else ring))
    return out


def export_viewer_map(layout: dict[str, Any]) -> dict[str, Any]:
    """Every mapped street / path / water / park / rail of the district, simplified."""
    roads = []
    for road in layout.get("roads") or []:
        kind = str(road.get("kind") or "residential").lower()
        if kind not in MAP_ROAD_KINDS or road.get("tunnel"):
            continue
        pts = [[float(p[0]), float(p[1])] for p in road.get("points") or []]
        if len(pts) < 2:
            continue
        roads.append(
            {
                "name": str(road.get("name") or ""),
                "kind": kind,
                "rank": MAP_ROAD_KINDS[kind],
                "width": round(float(road.get("width") or 6.0), 1),
                "points": _r(_dp(pts, MAP_SIMPLIFY_M)),
            }
        )
    roads.sort(key=lambda r: -r["rank"])
    rails = []
    for line in layout.get("transit_lines") or []:
        if line.get("tunnel"):
            continue
        pts = [[float(p[0]), float(p[1])] for p in line.get("points") or []]
        if len(pts) >= 2:
            rails.append({"mode": str(line.get("mode") or "rail"), "points": _r(_dp(pts, MAP_SIMPLIFY_M))})
    return {
        "version": 1,
        "roads": roads,
        "rails": rails,
        "water": _areas(layout.get("water") or []),
        "parks": _areas(layout.get("parks") or []),
    }
