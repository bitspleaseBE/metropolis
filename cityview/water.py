"""Classify OSM water bodies and export them for the walk viewer.

Shallow ponds / park basins are wadeable: feet stand on the silt bed
(``bed_y``). Rivers, docks and the Scheldt are deep — opaque fill, walker
pushed out. ``bank`` is ``natural`` (soft organic edge) or ``built``
(straight kerbed rim).
"""

from __future__ import annotations

from typing import Any

# Keep in sync with blender/build_city.py Z_WATER_BED / Z_WATER.
BED_Y = -0.28
SURFACE_Y = 0.02

# OSM `water=*` / waterway values treated as deep (no wade).
DEEP_KINDS = frozenset(
    {
        "river",
        "dock",
        "harbour",
        "harbor",
        "canal",
        "lock",
        "wastewater",
        "riverbank",
    }
)
DEEP_WATERWAYS = frozenset({"river", "riverbank", "dock", "canal"})

# Explicit shallow kinds (park ponds, decorative basins, moats).
SHALLOW_KINDS = frozenset(
    {
        "pond",
        "reflecting_pond",
        "moat",
        "oxbow",
        "lagoon",
        "fountain",
        "swimming_pool",
        "stream",
        "ditch",
        "drain",
        "lake",
        "reservoir",
    }
)

# Hard-edged / man-made rims (stone kerb in Blender).
BUILT_KINDS = frozenset(
    {
        "basin",
        "fountain",
        "swimming_pool",
        "reflecting_pond",
        "reservoir",
        "moat",  # castle / park moats are lined
        "dock",
        "harbour",
        "harbor",
        "canal",
        "lock",
        "wastewater",
    }
)

# Default water column depth (surface − bed); feet use bed_y, not this sink.
_DEPTH_M = {
    "pond": 0.30,
    "reflecting_pond": 0.18,
    "moat": 0.30,
    "fountain": 0.14,
    "lake": 0.30,
    "reservoir": 0.30,
    "oxbow": 0.30,
    "lagoon": 0.30,
    "stream": 0.22,
    "ditch": 0.22,
    "drain": 0.18,
    "swimming_pool": 0.40,
    "basin": 0.28,
    "water": 0.30,
}

# Unclassified open water larger than this is treated as deep (Scheldt arms, docks).
_LARGE_OPEN_M2 = 40_000.0
_BASIN_DEEP_M2 = 5_000.0


def _area_m2(ring: list[list[float]]) -> float:
    if len(ring) < 3:
        return 0.0
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % len(ring)][0], ring[(i + 1) % len(ring)][1]
        a += x1 * y2 - x2 * y1
    return abs(a) * 0.5


def bank_for(kind: str, *, deep: bool = False) -> str:
    """``built`` = straight kerbed rim; ``natural`` = soft / organic edge."""
    if deep and kind in {"dock", "harbour", "harbor", "canal", "lock", "wastewater"}:
        return "built"
    if kind in BUILT_KINDS:
        return "built"
    return "natural"


def _entry(
    *,
    kind: str,
    depth: str,
    wade: bool,
    depth_m: float,
    name: str,
) -> dict[str, Any]:
    deep = depth == "deep"
    return {
        "kind": kind,
        "depth": depth,
        "wade": wade,
        "depth_m": 0.0 if deep else depth_m,
        "bed_y": 0.0 if deep else BED_Y,
        "bank": bank_for(kind, deep=deep),
        "name": name,
    }


def classify_water(tags: dict[str, Any] | None, area_m2: float = 0.0) -> dict[str, Any]:
    """Return kind / depth / wade / bed_y / bank for an OSM water polygon."""
    tags = tags or {}
    water = str(tags.get("water") or "").lower()
    waterway = str(tags.get("waterway") or "").lower()
    landuse = str(tags.get("landuse") or "").lower()
    name = str(tags.get("name") or "")
    name_l = name.lower()

    kind = water or waterway or (landuse if landuse == "basin" else "") or "water"

    # Scheldt / Escaut — always deep, never wade.
    if "schelde" in name_l or "escaut" in name_l:
        return _entry(kind="river", depth="deep", wade=False, depth_m=0.0, name=name)

    if waterway in DEEP_WATERWAYS or water in DEEP_KINDS:
        k = kind if kind in DEEP_KINDS else (waterway or water or "river")
        return _entry(kind=k, depth="deep", wade=False, depth_m=0.0, name=name)

    if landuse == "basin":
        if "fountain" in name_l or "fontein" in name_l:
            return _entry(
                kind="fountain",
                depth="shallow",
                wade=True,
                depth_m=_DEPTH_M["fountain"],
                name=name,
            )
        if "vijver" in name_l:
            # Named vijver basins in parks are natural ponds with a lined rim rare.
            return _entry(
                kind="pond",
                depth="shallow",
                wade=True,
                depth_m=_DEPTH_M["pond"],
                name=name,
            )
        if area_m2 >= _BASIN_DEEP_M2:
            return _entry(kind="basin", depth="deep", wade=False, depth_m=0.0, name=name)
        return _entry(
            kind="basin",
            depth="shallow",
            wade=True,
            depth_m=_DEPTH_M["basin"],
            name=name,
        )

    if water in SHALLOW_KINDS:
        return _entry(
            kind=water,
            depth="shallow",
            wade=True,
            depth_m=_DEPTH_M.get(water, _DEPTH_M["water"]),
            name=name,
        )

    # Bare natural=water / water=* catch-all: large open water → deep.
    if area_m2 >= _LARGE_OPEN_M2:
        return _entry(kind=kind or "water", depth="deep", wade=False, depth_m=0.0, name=name)

    return _entry(
        kind=kind or "pond",
        depth="shallow",
        wade=True,
        depth_m=_DEPTH_M.get(kind, _DEPTH_M["water"]),
        name=name,
    )


def annotate_water_entry(
    entry: dict[str, Any], tags: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Attach classification fields onto a layout water dict (mutates and returns)."""
    ring = entry.get("ring") or []
    area = _area_m2(ring)
    info = classify_water(tags, area)
    entry["kind"] = info["kind"]
    entry["depth"] = info["depth"]
    entry["wade"] = info["wade"]
    entry["depth_m"] = info["depth_m"]
    entry["bed_y"] = info["bed_y"]
    entry["bank"] = info["bank"]
    if info.get("name"):
        entry["name"] = info["name"]
    elif "name" not in entry:
        entry["name"] = ""
    return entry


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1):
            inside = not inside
    return inside


def _ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    if not ring:
        return 0.0, 0.0
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def water_holes_for_ring(
    outer: list[list[float]], water: list[dict[str, Any]]
) -> list[list[list[float]]]:
    """Water rings whose centroid lies inside ``outer`` — cut these out of grass/ground.

    Stadspark's park polygon covers Stadsparkvijver; without a hole the grass disc
    sits on top of the pond. Only rings that fit inside the outer area are returned
    (centroid test + area smaller than the host).
    """
    if len(outer) < 3:
        return []
    host_area = _area_m2(outer)
    holes: list[list[list[float]]] = []
    for body in water or []:
        ring = body.get("ring") or []
        if len(ring) < 3:
            continue
        cx, cy = _ring_centroid(ring)
        if not _point_in_ring(cx, cy, outer):
            continue
        # Skip water that is as large as (or larger than) the host — Scheldt vs quay park.
        if _area_m2(ring) >= host_area * 0.95:
            continue
        holes.append([[float(p[0]), float(p[1])] for p in ring])
    return holes


def export_water_for_viewer(layout: dict[str, Any]) -> dict[str, Any]:
    """District water rings for wade / deep push-out (Blender XY metres)."""
    bodies: list[dict[str, Any]] = []
    for w in layout.get("water") or []:
        ring = w.get("ring") or []
        if len(ring) < 3:
            continue
        # Already classified at layout time; re-classify if a cache is stale.
        if "depth" not in w or "bank" not in w or "bed_y" not in w:
            annotate_water_entry(w, {"water": w.get("kind"), "name": w.get("name")})
        deep = str(w.get("depth") or "shallow") == "deep"
        bodies.append(
            {
                "id": int(w.get("id") or 0),
                "kind": str(w.get("kind") or "pond"),
                "depth": str(w.get("depth") or "shallow"),
                "wade": bool(w.get("wade", not deep)),
                "depth_m": round(float(w.get("depth_m") or 0.0), 3),
                "bed_y": round(float(w.get("bed_y") if w.get("bed_y") is not None else (0.0 if deep else BED_Y)), 3),
                "bank": str(w.get("bank") or bank_for(str(w.get("kind") or "pond"), deep=deep)),
                "name": str(w.get("name") or ""),
                "ring": [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in ring],
            }
        )
    return {
        "attribution": "Water: (c) OpenStreetMap contributors (ODbL)",
        "bodies": bodies,
    }
