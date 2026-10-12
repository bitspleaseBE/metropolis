"""Harbour / container props when a district profile finds port industry.

Scheldt promenade districts skip this (no ``landuse=industrial|port``). When
enabled, layout gets ``port_containers`` placed on industrial footprints for
Blender / viewer props export.
"""

from __future__ import annotations

from typing import Any

from cityview.geo import project


def plan_port_containers(layout: dict[str, Any], osm: dict[str, Any], origin: tuple[float, float]) -> list[dict[str, Any]]:
    """Place a few container stacks on industrial / port landuse footprints."""
    if not layout.get("port_props"):
        return []
    nodes = {e["id"]: e for e in osm.get("elements") or [] if e.get("type") == "node"}
    out: list[dict[str, Any]] = []
    for el in osm.get("elements") or []:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        landuse = tags.get("landuse")
        if landuse not in {"industrial", "port"} and tags.get("industrial") not in {
            "port",
            "warehouse",
        }:
            if tags.get("man_made") not in {"crane"} and tags.get("cargo") != "container":
                continue
        coords = []
        for nid in el.get("nodes") or []:
            n = nodes.get(nid)
            if n and "lat" in n:
                coords.append((n["lat"], n["lon"]))
        if len(coords) < 3:
            continue
        lat = sum(c[0] for c in coords) / len(coords)
        lon = sum(c[1] for c in coords) / len(coords)
        x, y = project(lat, lon, origin[0], origin[1])
        out.append(
            {
                "kind": "container_stack",
                "x": x,
                "y": y,
                "yaw": 0.0,
                "count": 3,
                "osm_id": el.get("id"),
            }
        )
        if len(out) >= 24:
            break
    layout["port_containers"] = out
    return out
