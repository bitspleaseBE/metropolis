"""Harbour props when a district profile finds port industry.

Scheldt promenade districts skip this (no ``landuse=industrial|port``). When
enabled, the layout gets:

* ``port_cranes``: every OSM ``man_made=crane`` (node or way) at its mapped spot.
  Ways (gantry / container cranes mapped along their rails) give the yaw and span.
  Construction tower cranes are skipped: they are temporary and usually stale in OSM.
* ``port_containers``: a container stack on each port / container-yard area, set at
  the area centroid only when that spot is open ground (not inside a footprint).
"""

from __future__ import annotations

import math
import zlib
from typing import Any

from cityview.geo import project

MAX_CONTAINER_STACKS = 24
MAX_CRANES = 120
SKIP_CRANE_TYPES = frozenset({"tower_crane"})
# Defaults by ``crane:type`` when ``height`` is not mapped (metres).
CRANE_HEIGHT = {
    "portal_crane": 24.0,
    "gantry_crane": 30.0,
    "container_crane": 48.0,
    "floor-mounted_crane": 18.0,
    "travel_lift": 14.0,
}
DEFAULT_CRANE_HEIGHT = 22.0
GANTRY_TYPES = frozenset({"gantry_crane", "container_crane"})
# ISO 40 ft box; stacks are laid out ``rows`` wide across the yaw axis.
CONTAINER_L, CONTAINER_W, CONTAINER_H = 12.19, 2.44, 2.59
CONTAINER_GAP = 0.3
GANTRY_GAUGE = 16.0  # rail gauge of a quay gantry, across the span axis
GANTRY_LEG_R = 0.7
PORTAL_PEDESTAL_R = 1.8


def container_half_extents(stack: dict[str, Any]) -> tuple[float, float]:
    """``(half_len, half_depth)`` of a stack's footprint on its yaw axis."""
    rows = int(stack.get("rows") or 2)
    return CONTAINER_L * 0.5, (rows * CONTAINER_W + (rows - 1) * CONTAINER_GAP) * 0.5


def crane_legs(crane: dict[str, Any]) -> list[tuple[float, float, float]]:
    """``(x, y, radius)`` of the parts a walker bumps into: gantry legs or a portal pedestal."""
    x, y = float(crane["x"]), float(crane["y"])
    if crane.get("kind") != "gantry":
        return [(x, y, PORTAL_PEDESTAL_R)]
    yaw = float(crane.get("yaw") or 0.0)
    ux, uy = math.cos(yaw), math.sin(yaw)
    vx, vy = -uy, ux
    hs = max(float(crane.get("span") or 12.0), 12.0) * 0.5
    hg = GANTRY_GAUGE * 0.5
    return [
        (x + ux * a * hs + vx * b * hg, y + uy * a * hs + vy * b * hg, GANTRY_LEG_R)
        for a in (-1, 1)
        for b in (-1, 1)
    ]


def _height(tags: dict[str, Any], ctype: str) -> float:
    raw = str(tags.get("height", "")).replace(",", ".").replace("m", "").strip()
    try:
        h = float(raw)
    except ValueError:
        return CRANE_HEIGHT.get(ctype, DEFAULT_CRANE_HEIGHT)
    if not math.isfinite(h) or h <= 3.0:
        return CRANE_HEIGHT.get(ctype, DEFAULT_CRANE_HEIGHT)
    return min(h, 90.0)


def plan_port_cranes(osm: dict[str, Any], origin: tuple[float, float]) -> list[dict[str, Any]]:
    """``{kind, type, x, y, yaw, span, height, osm_id}`` for each mapped crane."""
    elements = osm.get("elements") or []
    nodes = {e["id"]: e for e in elements if e.get("type") == "node"}
    out: list[dict[str, Any]] = []
    for el in elements:
        tags = el.get("tags") or {}
        if tags.get("man_made") != "crane":
            continue
        ctype = str(tags.get("crane:type") or "portal_crane")
        if ctype in SKIP_CRANE_TYPES:
            continue
        yaw, span = 0.0, 0.0
        if el.get("type") == "node":
            if "lat" not in el:
                continue
            x, y = project(el["lat"], el["lon"], origin[0], origin[1])
        elif el.get("type") == "way":
            pts = [
                project(nodes[n]["lat"], nodes[n]["lon"], origin[0], origin[1])
                for n in el.get("nodes") or []
                if n in nodes and "lat" in nodes[n]
            ]
            if not pts:
                continue
            x = sum(p[0] for p in pts) / len(pts)
            y = sum(p[1] for p in pts) / len(pts)
            # Longest edge: the rail direction of a gantry, the jib line of a portal crane.
            best = 0.0
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                d = math.hypot(bx - ax, by - ay)
                if d > best:
                    best, yaw = d, math.atan2(by - ay, bx - ax)
            span = best
        else:
            continue
        kind = "gantry" if ctype in GANTRY_TYPES else "portal"
        out.append(
            {
                "kind": kind,
                "type": ctype,
                "x": round(x, 2),
                "y": round(y, 2),
                "yaw": round(yaw, 4),
                "span": round(min(max(span, 12.0 if kind == "gantry" else 0.0), 60.0), 2),
                "height": round(_height(tags, ctype), 2),
                "osm_id": el.get("id"),
            }
        )
        if len(out) >= MAX_CRANES:
            break
    return out


def _in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _on_footprint(layout: dict[str, Any], x: float, y: float) -> bool:
    for b in layout.get("buildings") or []:
        ring = b.get("ring") or []
        if len(ring) >= 3 and _in_ring(x, y, ring):
            return True
    return False


def plan_port_containers(layout: dict[str, Any], osm: dict[str, Any], origin: tuple[float, float]) -> list[dict[str, Any]]:
    """Place container stacks on port / container-yard areas; also plans ``port_cranes``."""
    if not layout.get("port_props"):
        return []
    layout["port_cranes"] = plan_port_cranes(osm, origin)
    nodes = {e["id"]: e for e in osm.get("elements") or [] if e.get("type") == "node"}
    out: list[dict[str, Any]] = []
    for el in osm.get("elements") or []:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        yard = (
            tags.get("landuse") == "port"
            or tags.get("industrial") in {"port", "container_terminal"}
            or tags.get("cargo") == "container"
        )
        if not yard:
            continue
        coords = []
        for nid in el.get("nodes") or []:
            n = nodes.get(nid)
            if n and "lat" in n:
                coords.append((n["lat"], n["lon"]))
        if len(coords) < 3:
            continue
        pts = [project(lat, lon, origin[0], origin[1]) for lat, lon in coords]
        x = sum(p[0] for p in pts) / len(pts)
        y = sum(p[1] for p in pts) / len(pts)
        if _on_footprint(layout, x, y):
            continue
        yaw, best = 0.0, 0.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            d = math.hypot(bx - ax, by - ay)
            if d > best:
                best, yaw = d, math.atan2(by - ay, bx - ax)
        seed = zlib.crc32(str(el.get("id")).encode())
        out.append(
            {
                "kind": "container_stack",
                "x": round(x, 2),
                "y": round(y, 2),
                "yaw": round(yaw, 4),
                "count": 2 + seed % 3,
                "rows": 2 + (seed >> 4) % 3,
                "seed": seed,
                "osm_id": el.get("id"),
            }
        )
        if len(out) >= MAX_CONTAINER_STACKS:
            break
    layout["port_containers"] = out
    return out
