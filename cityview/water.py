"""Classify OSM water bodies and export them for the walk viewer.

Shallow ponds / park basins are wadeable (walk, slowed). Rivers, docks and the
Scheldt are deep: opaque fill, no swimming yet — the walker is pushed out.
"""

from __future__ import annotations

from typing import Any

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

# Default wade depth (metres) by kind — feet sink this far; gait slows.
_DEPTH_M = {
    "pond": 0.32,
    "reflecting_pond": 0.18,
    "moat": 0.38,
    "fountain": 0.12,
    "lake": 0.36,
    "reservoir": 0.36,
    "oxbow": 0.30,
    "lagoon": 0.34,
    "stream": 0.20,
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


def classify_water(tags: dict[str, Any] | None, area_m2: float = 0.0) -> dict[str, Any]:
    """Return kind / depth / wade / depth_m for an OSM water polygon."""
    tags = tags or {}
    water = str(tags.get("water") or "").lower()
    waterway = str(tags.get("waterway") or "").lower()
    landuse = str(tags.get("landuse") or "").lower()
    name = str(tags.get("name") or "")
    name_l = name.lower()

    kind = water or waterway or (landuse if landuse == "basin" else "") or "water"

    # Scheldt / Escaut — always deep, never wade.
    if "schelde" in name_l or "escaut" in name_l:
        return {
            "kind": "river",
            "depth": "deep",
            "wade": False,
            "depth_m": 0.0,
            "name": name,
        }

    if waterway in DEEP_WATERWAYS or water in DEEP_KINDS:
        return {
            "kind": kind if kind in DEEP_KINDS else (waterway or water or "river"),
            "depth": "deep",
            "wade": False,
            "depth_m": 0.0,
            "name": name,
        }

    if landuse == "basin":
        if "fountain" in name_l or "fontein" in name_l or "vijver" in name_l:
            return {
                "kind": "pond",
                "depth": "shallow",
                "wade": True,
                "depth_m": _DEPTH_M["fountain"],
                "name": name,
            }
        if area_m2 >= _BASIN_DEEP_M2:
            return {
                "kind": "basin",
                "depth": "deep",
                "wade": False,
                "depth_m": 0.0,
                "name": name,
            }
        return {
            "kind": "basin",
            "depth": "shallow",
            "wade": True,
            "depth_m": _DEPTH_M["basin"],
            "name": name,
        }

    if water in SHALLOW_KINDS:
        return {
            "kind": water,
            "depth": "shallow",
            "wade": True,
            "depth_m": _DEPTH_M.get(water, _DEPTH_M["water"]),
            "name": name,
        }

    # Bare natural=water / water=* catch-all: large open water → deep.
    if area_m2 >= _LARGE_OPEN_M2:
        return {
            "kind": kind or "water",
            "depth": "deep",
            "wade": False,
            "depth_m": 0.0,
            "name": name,
        }

    return {
        "kind": kind or "pond",
        "depth": "shallow",
        "wade": True,
        "depth_m": _DEPTH_M.get(kind, _DEPTH_M["water"]),
        "name": name,
    }


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
    if info.get("name"):
        entry["name"] = info["name"]
    elif "name" not in entry:
        entry["name"] = ""
    return entry


def export_water_for_viewer(layout: dict[str, Any]) -> dict[str, Any]:
    """District water rings for wade / deep push-out (Blender XY metres)."""
    bodies: list[dict[str, Any]] = []
    for w in layout.get("water") or []:
        ring = w.get("ring") or []
        if len(ring) < 3:
            continue
        # Already classified at layout time; re-classify if a cache is stale.
        if "depth" not in w:
            annotate_water_entry(w, {"water": w.get("kind"), "name": w.get("name")})
        bodies.append(
            {
                "id": int(w.get("id") or 0),
                "kind": str(w.get("kind") or "pond"),
                "depth": str(w.get("depth") or "shallow"),
                "wade": bool(w.get("wade", w.get("depth") != "deep")),
                "depth_m": round(float(w.get("depth_m") or 0.0), 3),
                "name": str(w.get("name") or ""),
                "ring": [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in ring],
            }
        )
    return {
        "attribution": "Water: (c) OpenStreetMap contributors (ODbL)",
        "bodies": bodies,
    }
