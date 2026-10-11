"""Carriageway look from OSM ``surface`` / ``highway`` tags.

Antwerp streets are asphalt on the main roads and granite setts or cobbles on
the smaller ones. Untagged living streets and pedestrian ways follow that
habit; everything else stays asphalt when the surface was never mapped.
"""

from __future__ import annotations

from typing import Any

# Stone carriageways. ``paving_stones`` is how most Antwerp kasseien are tagged.
COBBLE_SURFACES = frozenset(
    {
        "sett",
        "cobblestone",
        "unhewn_cobblestone",
        "pebblestone",
        "paving_stones",
    }
)

# No ``surface`` tag, but these classes are cobbled far more often than not.
COBBLE_WHEN_UNTAGGED = frozenset({"living_street", "pedestrian"})


def carriageway_material(tags: dict | None) -> str:
    """``cobble`` or ``asphalt`` for a highway way."""
    tags = tags or {}
    surface = str(tags.get("surface") or "").split(":")[0].strip().lower()
    if surface in COBBLE_SURFACES:
        return "cobble"
    highway = str(tags.get("highway") or "").strip().lower()
    if surface in {"", "paved"} and highway in COBBLE_WHEN_UNTAGGED:
        return "cobble"
    return "asphalt"


def surfaces_from_layout(layout: dict[str, Any]) -> dict[str, str]:
    """Way id → ``cobble`` for every non-asphalt road in a layout. Asphalt is the default."""
    out: dict[str, str] = {}
    for road in layout.get("roads") or []:
        rid = road.get("id")
        if rid is None:
            continue
        mat = str(road.get("surface") or "asphalt")
        if mat != "asphalt":
            out[str(rid)] = mat
    return out


def surfaces_from_osm(doc: dict[str, Any]) -> dict[str, str]:
    """Same index straight from an Overpass document (way id matches ``road_{id}`` meshes)."""
    out: dict[str, str] = {}
    for el in doc.get("elements") or []:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        if "highway" not in tags:
            continue
        mat = carriageway_material(tags)
        if mat != "asphalt":
            out[str(el["id"])] = mat
    return out
