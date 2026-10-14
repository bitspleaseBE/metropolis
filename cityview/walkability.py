"""Player collision policy and post-build reachability checks.

The walker is free in XZ, then pushed out of building rings (minus courtyard
holes), props, Velo rails and vehicles. Streets, parks and squares must stay
reachable from spawn. Building outlines that are underground, canopies, or
open pavilions are not solids. This module is the generator-side contract:
export uses it, ``district check`` verifies the files the viewer will load.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from cityview.geo import project

PLAYER_R = 0.34
WALK_SAMPLE_M = 1.0
SEALED_STRETCH_M = 3.0
GATE_CLEAR_M = 1.2
VELO_HALF_WIDTH = 0.45
VELO_END_PAD = 0.3
TERRACE_RADIUS = 0.48

# OSM building=* / leisure that the walker should pass through or under.
SKIP_BUILDING = frozenset({"roof", "carport", "canopy", "ruins", "construction", "bridge"})
OPEN_PAVILION = frozenset({"bandstand", "bleachers"})
GATE_KINDS = frozenset(
    {
        "gate",
        "entrance",
        "kissing_gate",
        "lift_gate",
        "swing_gate",
        "stile",
        "wicket_gate",
        "turnstile",
    }
)
def walker_gate_from_tags(tags: dict[str, str] | None) -> bool:
    """True when a mapped gate is a public opening the walker should pass."""
    tags = tags or {}
    if tags.get("barrier") not in GATE_KINDS:
        return False
    if tags.get("location") in {"underground", "underwater"}:
        return False
    try:
        if float(str(tags.get("layer", "0")).split(";")[0]) < 0:
            return False
    except ValueError:
        pass
    if tags.get("parking") or tags.get("amenity") == "parking_entrance":
        return False
    if tags.get("foot") in {"yes", "designated", "permissive"}:
        return True
    if tags.get("access") in {"no", "private", "customers"}:
        return False
    return True


def walker_solid_from_tags(tags: dict[str, str] | None) -> bool:
    """False when the OSM footprint is not a wall the walker should hit."""
    tags = tags or {}
    if tags.get("location") in {"underground", "underwater"}:
        return False
    try:
        if float(str(tags.get("layer", "0")).split(";")[0]) < 0:
            return False
    except ValueError:
        pass
    if tags.get("building") in SKIP_BUILDING:
        return False
    if tags.get("leisure") in OPEN_PAVILION or tags.get("historic") == "bandstand":
        return False
    raw_min = str(tags.get("min_height") or "").replace(",", ".").replace("m", "").strip()
    if raw_min:
        try:
            if float(raw_min) >= 2.0:
                return False
        except ValueError:
            pass
    try:
        if int(str(tags.get("building:min_level", "0")).split(";")[0]) > 0:
            return False
    except ValueError:
        pass
    return True


def _point_in_ring(x: float, y: float, ring: list) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-18) + xi):
            inside = not inside
        j = i
    return inside


def inside_building_ring(x: float, y: float, ring: list, holes: list | None = None) -> bool:
    if not _point_in_ring(x, y, ring):
        return False
    for hole in holes or []:
        if _point_in_ring(x, y, hole):
            return False
    return True


def _seg_dist(px: float, py: float, x0: float, y0: float, x1: float, y1: float) -> float:
    vx, vy = x1 - x0, y1 - y0
    ll = vx * vx + vy * vy or 1e-9
    t = max(0.0, min(1.0, ((px - x0) * vx + (py - y0) * vy) / ll))
    return math.hypot(px - (x0 + vx * t), py - (y0 + vy * t))


def _box_hit(px: float, py: float, cx: float, cy: float, ax: float, ay: float, hl: float, hd: float, r: float) -> bool:
    dx, dy = px - cx, py - cy
    a = dx * ax + dy * ay
    b = -dx * ay + dy * ax
    return abs(a) < hl + r and abs(b) < hd + r


class _Grid:
    def __init__(self, cell: float = 16.0):
        self.cell = cell
        self.cells: dict[tuple[int, int], list[Any]] = {}

    def insert(self, item: Any, x0: float, y0: float, x1: float, y1: float) -> None:
        c = self.cell
        for gx in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for gy in range(int(math.floor(y0 / c)), int(math.floor(y1 / c)) + 1):
                self.cells.setdefault((gx, gy), []).append(item)

    def nearby(self, x: float, y: float, pad: float = 0.0) -> list[Any]:
        c = self.cell
        seen: list[Any] = []
        found: set[int] = set()
        for gx in range(int(math.floor((x - pad) / c)), int(math.floor((x + pad) / c)) + 1):
            for gy in range(int(math.floor((y - pad) / c)), int(math.floor((y + pad) / c)) + 1):
                for item in self.cells.get((gx, gy), ()):
                    i = id(item)
                    if i in found:
                        continue
                    found.add(i)
                    seen.append(item)
        return seen


def _load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _collider_reason(
    x: float,
    y: float,
    buildings: _Grid,
    props: _Grid,
    velos: list[tuple],
    radius: float = PLAYER_R,
) -> str | None:
    passages = getattr(buildings, "passages", None)
    open_passage = passages is not None and in_passage(passages, x, y)
    for b in () if open_passage else buildings.nearby(x, y, pad=2.0):
        ring, holes, x0, y0, x1, y1 = b
        if x < x0 or x > x1 or y < y0 or y > y1:
            continue
        if inside_building_ring(x, y, ring, holes):
            return "building"
    for item in props.nearby(x, y, pad=2.0):
        kind = item[0]
        if kind == "seg":
            _, x0, y0, x1, y1, ht = item
            if _seg_dist(x, y, x0, y0, x1, y1) < ht + radius:
                return "fence" if ht <= 0.2 else "hedge"
        elif kind == "trunk":
            _, tx, ty, tr = item
            if math.hypot(x - tx, y - ty) < tr + radius:
                return "prop"
        elif kind == "box":
            _, cx, cy, ax, ay, hl, hd = item
            if _box_hit(x, y, cx, cy, ax, ay, hl, hd, radius):
                return "prop"
    for cx, cy, ax, ay, hl, hd, _name in velos:
        if _box_hit(x, y, cx, cy, ax, ay, hl, hd, radius):
            return "velo"
    return None


def _index_viewer_solids(
    buildings_doc: dict[str, Any],
    props_doc: dict[str, Any],
    velo_doc: dict[str, Any],
) -> tuple[_Grid, _Grid, list[tuple]]:
    buildings = _Grid()
    for b in buildings_doc.get("buildings") or []:
        ring = b.get("ring") or []
        if len(ring) < 3:
            continue
        xs = [float(p[0]) for p in ring]
        ys = [float(p[1]) for p in ring]
        item = (ring, b.get("holes") or [], min(xs), min(ys), max(xs), max(ys))
        buildings.insert(item, min(xs), min(ys), max(xs), max(ys))
    if buildings_doc.get("passages"):
        buildings.passages = _passage_grid(buildings_doc["passages"])
    props = _Grid()
    for x0, y0, x1, y1, ht in props_doc.get("segments") or []:
        item = ("seg", float(x0), float(y0), float(x1), float(y1), float(ht))
        props.insert(item, min(x0, x1) - ht, min(y0, y1) - ht, max(x0, x1) + ht, max(y0, y1) + ht)
    for tx, ty, tr in props_doc.get("trunks") or []:
        item = ("trunk", float(tx), float(ty), float(tr))
        props.insert(item, tx - tr, ty - tr, tx + tr, ty + tr)
    for bx, by, yaw, hl, hd in props_doc.get("boxes") or []:
        ax, ay = math.cos(float(yaw)), math.sin(float(yaw))
        e = float(hl) + float(hd)
        item = ("box", float(bx), float(by), ax, ay, float(hl), float(hd))
        props.insert(item, bx - e, by - e, bx + e, by + e)
    velos = []
    for st in velo_doc.get("stations") or []:
        yaw = float(st.get("yaw") or 0.0)
        velos.append(
            (
                float(st["x"]),
                -float(st["z"]),
                math.cos(yaw),
                math.sin(yaw),
                (float(st.get("railLength") or 8.0) * 0.5) + VELO_END_PAD,
                VELO_HALF_WIDTH,
                st.get("name") or st.get("id"),
            )
        )
    return buildings, props, velos


def _osm_gates_and_areas(
    osm: dict[str, Any],
    origin: tuple[float, float],
) -> tuple[list[tuple[float, float]], list[tuple[str, str, list]], list[tuple[float, float]]]:
    elements = osm.get("elements") or []
    nodes = {int(e["id"]): e for e in elements if e.get("type") == "node"}
    ways = {int(e["id"]): e for e in elements if e.get("type") == "way"}
    gates: list[tuple[float, float]] = []
    for n in nodes.values():
        tags = {k: str(v) for k, v in (n.get("tags") or {}).items()}
        if walker_gate_from_tags(tags):
            gates.append(project(float(n["lat"]), float(n["lon"]), origin[0], origin[1]))
    highway_nodes: set[int] = set()
    barrier_nodes: set[int] = set()
    walk_highways = {
        "footway",
        "path",
        "pedestrian",
        "steps",
        "cycleway",
        "living_street",
        "residential",
        "unclassified",
    }
    for way in ways.values():
        tags = way.get("tags") or {}
        ids = [int(n) for n in way.get("nodes") or []]
        hw = tags.get("highway")
        if hw in walk_highways and tags.get("tunnel") not in {"yes", "culvert"} and tags.get("foot") not in {"no", "private"}:
            try:
                buried = float(str(tags.get("layer", "0")).split(";")[0]) < 0
            except ValueError:
                buried = False
            if not buried:
                highway_nodes.update(ids)
        if tags.get("barrier") in {"fence", "hedge"}:
            barrier_nodes.update(ids)
    crossings: list[tuple[float, float]] = []
    for nid in highway_nodes & barrier_nodes:
        n = nodes.get(nid)
        if not n:
            continue
        crossings.append(project(float(n["lat"]), float(n["lon"]), origin[0], origin[1]))

    def ring_of(way: dict[str, Any]) -> list[list[float]]:
        return [list(project(float(nodes[i]["lat"]), float(nodes[i]["lon"]), origin[0], origin[1])) for i in way.get("nodes") or [] if i in nodes]

    def area_kind(tags: dict[str, str]) -> str | None:
        if tags.get("leisure") in {"park", "garden"} or tags.get("landuse") in {"grass", "recreation_ground"}:
            return "park"
        if tags.get("place") == "square" or tags.get("area:highway"):
            return "square"
        if tags.get("highway") in {"pedestrian", "footway"} and tags.get("area") == "yes":
            return "square"
        return None

    areas: list[tuple[str, str, list]] = []
    for e in elements:
        tags = {k: str(v) for k, v in (e.get("tags") or {}).items()}
        kind = area_kind(tags)
        if not kind:
            continue
        name = tags.get("name") or f"{e.get('type')} {e.get('id')}"
        if e.get("type") == "way" and (e.get("nodes") or [None])[0] == (e.get("nodes") or [None])[-1]:
            ring = ring_of(e)
            if len(ring) >= 3:
                areas.append((kind, name, ring))
        elif e.get("type") == "relation":
            for m in e.get("members") or []:
                if m.get("type") != "way" or m.get("role") not in {"outer", ""}:
                    continue
                way = ways.get(int(m["ref"]))
                if not way or (way.get("nodes") or [None])[0] != (way.get("nodes") or [None])[-1]:
                    continue
                ring = ring_of(way)
                if len(ring) >= 3:
                    areas.append((kind, name, ring))
    return gates, areas, crossings


FULL_RING_SAMPLE_M = 2.0
PASSAGE_SAMPLE_M = 0.5
PASSAGE_HALF_W = 1.2  # walker corridor through a footprint (2.4 m opening)
MAX_PASSAGE_M = 40.0
# OSM walk ways a building footprint may legitimately sit on top of.
_COVERED = frozenset({"yes", "arcade", "colonnade", "building_passage"})
FULL_RING_HIGHWAYS = frozenset(
    {
        "footway",
        "path",
        "pedestrian",
        "steps",
        "cycleway",
        "living_street",
        "residential",
        "unclassified",
        "tertiary",
        "secondary",
        "primary",
        "service",
    }
)


def _osm_walk_lines(
    osm: dict[str, Any],
    origin: tuple[float, float],
    *,
    include_covered: bool = False,
) -> list[tuple[int, str, list[tuple[float, float]]]]:
    """Outdoor, ground-level OSM ways the walker must be able to follow.

    ``include_covered`` also keeps arcades and building passages (ground level, under a roof).
    Squares mapped as ``area=yes`` are outlines, not lines anyone walks along.
    """
    elements = osm.get("elements") or []
    nodes = {int(e["id"]): e for e in elements if e.get("type") == "node"}
    lines = []
    for way in elements:
        if way.get("type") != "way":
            continue
        tags = way.get("tags") or {}
        hw = tags.get("highway")
        if hw not in FULL_RING_HIGHWAYS or tags.get("area") == "yes":
            continue
        covered = tags.get("covered") in _COVERED or tags.get("tunnel") == "building_passage"
        if covered and not include_covered:
            continue
        if (tags.get("tunnel") and not covered) or tags.get("indoor") not in {None, "no"}:
            continue
        if tags.get("access") in {"private", "no"} or tags.get("foot") in {"no", "private"}:
            continue
        try:
            if float(str(tags.get("layer", "0")).split(";")[0]) != 0:
                continue
        except ValueError:
            continue
        if tags.get("level") not in {None, "0"}:
            continue
        pts = []
        for nid in way.get("nodes") or []:
            n = nodes.get(int(nid))
            if n is not None and "lat" in n:
                pts.append(project(float(n["lat"]), float(n["lon"]), origin[0], origin[1]))
        if len(pts) >= 2:
            lines.append((int(way["id"]), hw, pts))
    return lines


def osm_passages(
    buildings_doc: dict[str, Any],
    osm: dict[str, Any],
    origin: tuple[float, float],
) -> list[list[float]]:
    """``[x0, y0, x1, y1, half_w]`` corridors where an OSM walk way runs through a footprint.

    LOD2 blocks run to the ground under arcades, overhanging storeys and canopies, so a
    mapped footway or driveway through them would be a dead end. A stretch counts as a
    passage when the way enters and leaves the solid within ``MAX_PASSAGE_M``; a way that
    ends inside a building (an entrance) or stays inside longer is left sealed.
    """
    buildings, _, _ = _index_viewer_solids({"buildings": buildings_doc.get("buildings") or []}, {}, {})

    def solid(x: float, y: float) -> bool:
        for b in buildings.nearby(x, y):
            ring, holes, x0, y0, x1, y1 = b
            if x0 <= x <= x1 and y0 <= y <= y1 and inside_building_ring(x, y, ring, holes):
                return True
        return False

    out: list[list[float]] = []
    for _wid, _hw, pts in _osm_walk_lines(osm, origin, include_covered=True):
        samples: list[tuple[float, float, int]] = []
        for si, ((ax, ay), (bx, by)) in enumerate(zip(pts, pts[1:])):
            n = max(1, int(math.ceil(math.hypot(bx - ax, by - ay) / PASSAGE_SAMPLE_M)))
            for i in range(n + (1 if si == len(pts) - 2 else 0)):
                t = i / n
                samples.append((ax + (bx - ax) * t, ay + (by - ay) * t, si))
        inside = [solid(x, y) for x, y, _ in samples]
        i = 0
        while i < len(samples):
            if not inside[i]:
                i += 1
                continue
            j = i
            while j + 1 < len(samples) and inside[j + 1]:
                j += 1
            if i > 0 and j < len(samples) - 1:
                a, b = samples[i - 1], samples[j + 1]
                run = [a] + samples[i : j + 1] + [b]
                length = sum(math.hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(run, run[1:]))
                if length <= MAX_PASSAGE_M:
                    # Entry, the way's own vertices inside the solid, exit: one corridor per leg.
                    poly = [run[0]] + [q for p, q in zip(run[:-1], run[1:-1]) if q[2] != p[2]] + [run[-1]]
                    for p, q in zip(poly, poly[1:]):
                        out.append([round(p[0], 2), round(p[1], 2), round(q[0], 2), round(q[1], 2), PASSAGE_HALF_W])
            i = j + 1
    return out


def _passage_grid(passages: list) -> _Grid:
    grid = _Grid()
    for x0, y0, x1, y1, hw in passages or []:
        grid.insert((float(x0), float(y0), float(x1), float(y1), float(hw)), min(x0, x1) - hw, min(y0, y1) - hw, max(x0, x1) + hw, max(y0, y1) + hw)
    return grid


def in_passage(grid: _Grid, x: float, y: float) -> bool:
    return any(_seg_dist(x, y, x0, y0, x1, y1) <= hw for x0, y0, x1, y1, hw in grid.nearby(x, y))


def check_full_ring_walkability(
    buildings_doc: dict[str, Any],
    osm: dict[str, Any],
    origin: tuple[float, float],
    *,
    tolerance: float = 0.01,
) -> tuple[list[str], dict[str, Any]]:
    """Every outdoor OSM street / path in the postcode, sampled against building solids.

    A way counts as sealed when a footprint covers its full width for at least
    ``SEALED_STRETCH_M``. Mapping noise (an OSM footway nicking a LOD2 wall) is
    tolerated up to ``tolerance`` of the checked ways; above that it is an error.
    """
    buildings, _, _ = _index_viewer_solids(buildings_doc, {}, {})
    passages = getattr(buildings, "passages", None)

    def solid(x: float, y: float) -> bool:
        if passages is not None and in_passage(passages, x, y):
            return False
        for b in buildings.nearby(x, y):
            ring, holes, x0, y0, x1, y1 = b
            if x0 <= x <= x1 and y0 <= y <= y1 and inside_building_ring(x, y, ring, holes):
                return True
        return False

    lines = _osm_walk_lines(osm, origin)
    sealed: list[tuple[int, str, float, float]] = []
    sampled_m = 0.0
    for wid, hw, pts in lines:
        half = 0.9 if hw in {"footway", "path", "steps", "cycleway"} else 2.0
        run = 0.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            length = math.hypot(bx - ax, by - ay)
            if length < 1e-6:
                continue
            sampled_m += length
            nx, ny = -(by - ay) / length, (bx - ax) / length
            steps = max(1, int(math.ceil(length / FULL_RING_SAMPLE_M)))
            hit = False
            for i in range(steps + 1):
                t = i / steps
                x, y = ax + (bx - ax) * t, ay + (by - ay) * t
                if solid(x, y) and solid(x + nx * half, y + ny * half) and solid(x - nx * half, y - ny * half):
                    run += length / steps
                    if run >= SEALED_STRETCH_M:
                        sealed.append((wid, hw, x, y))
                        hit = True
                        break
                else:
                    run = 0.0
            if hit:
                break
    stats = {"ways": len(lines), "km": round(sampled_m / 1000.0, 1), "sealed": len(sealed)}
    errors: list[str] = []
    if lines and len(sealed) > int(len(lines) * tolerance):
        ex = ", ".join(f"{hw} {wid} at ({x:.0f},{y:.0f})" for wid, hw, x, y in sealed[:5])
        errors.append(
            f"full ring: {len(sealed)} of {len(lines)} OSM walk ways sealed by building footprints, e.g. {ex}"
        )
    return errors, stats


def check_viewer_walkability(
    viewer_dir: Path,
    *,
    osm: dict[str, Any] | None = None,
    origin: tuple[float, float] | None = None,
    radius: float = 280.0,
) -> list[str]:
    """Return error strings if exported viewer solids seal streets, parks or gates."""
    buildings_doc = _load_json(viewer_dir / "buildings.json")
    roads_doc = _load_json(viewer_dir / "roads.json")
    props_doc = _load_json(viewer_dir / "props.json")
    velo_doc = _load_json(viewer_dir / "velo.json")
    if not buildings_doc and not roads_doc and not props_doc:
        return []

    spawn = roads_doc.get("spawn") or buildings_doc.get("spawn") or {}
    try:
        sx, sy = float(spawn["x"]), float(spawn["y"])
    except (KeyError, TypeError, ValueError):
        return []

    buildings, props, velos = _index_viewer_solids(buildings_doc, props_doc, velo_doc)
    errors: list[str] = []

    def blocked(x: float, y: float) -> str | None:
        return _collider_reason(x, y, buildings, props, velos)

    # Walk / sidewalk centrelines: a stretch sealed across its full width is a wall on the street.
    for walk in list(roads_doc.get("walks") or []) + list(roads_doc.get("roads") or []):
        pts = walk.get("points") or []
        if len(pts) < 2:
            continue
        half = max(0.8, float(walk.get("width") or 2.0) * 0.45)
        kind = walk.get("kind") or "walk"
        sealed_m = 0.0
        worst: tuple[float, float, str] | None = None
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            length = math.hypot(bx - ax, by - ay)
            if length < 1e-6:
                continue
            nx, ny = -(by - ay) / length, (bx - ax) / length
            steps = max(1, int(math.ceil(length / WALK_SAMPLE_M)))
            for i in range(steps + 1):
                t = i / steps
                x, y = ax + (bx - ax) * t, ay + (by - ay) * t
                if math.hypot(x - sx, y - sy) > radius:
                    sealed_m = 0.0
                    continue
                offs = (0.0, -half * 0.5, half * 0.5, -half * 0.9, half * 0.9)
                hits = [blocked(x + nx * o, y + ny * o) for o in offs]
                if all(hits):
                    sealed_m += length / steps
                    if worst is None:
                        worst = (x, y, hits[0] or "solid")
                    if sealed_m >= SEALED_STRETCH_M:
                        errors.append(
                            f"{kind} {walk.get('id')} sealed for {sealed_m:.0f} m "
                            f"at ({worst[0]:.1f},{worst[1]:.1f}) by {worst[2]}"
                        )
                        sealed_m = -1e9  # one report per way
                else:
                    sealed_m = 0.0
                    worst = None

    if osm and origin and buildings_doc.get("coverage") == "district":
        ring_errors, ring_stats = check_full_ring_walkability(buildings_doc, osm, origin)
        print(
            f"Full-ring walk check: {ring_stats['ways']} OSM ways, {ring_stats['km']} km, "
            f"{ring_stats['sealed']} sealed"
        )
        errors.extend(ring_errors)

    if osm and origin:
        gates, areas, crossings = _osm_gates_and_areas(osm, origin)
        sealed_gates = 0
        example = ""
        for gx, gy in gates:
            if math.hypot(gx - sx, gy - sy) > radius:
                continue
            hit = blocked(gx, gy)
            if hit in {"fence", "hedge"}:
                sealed_gates += 1
                if not example:
                    example = f"({gx:.1f},{gy:.1f}) by {hit}"
        if sealed_gates:
            errors.append(f"{sealed_gates} OSM gate(s) still sealed by a barrier collider, e.g. {example}")
        sealed_cross = 0
        cross_ex = ""
        for cx, cy in crossings:
            if math.hypot(cx - sx, cy - sy) > radius:
                continue
            hit = blocked(cx, cy)
            if hit in {"fence", "hedge"}:
                sealed_cross += 1
                if not cross_ex:
                    cross_ex = f"({cx:.1f},{cy:.1f}) by {hit}"
        if sealed_cross:
            errors.append(
                f"{sealed_cross} path/street crossing(s) still sealed by a barrier, e.g. {cross_ex}"
            )

        # A few interior samples per named park/square must have a free cell next to them.
        # Full flood-fill is the rebuild guarantee; this catches a fenced-off lawn with no gap.
        for kind, name, ring in areas:
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            if max(xs) < sx - radius or min(xs) > sx + radius or max(ys) < sy - radius or min(ys) > sy + radius:
                continue
            area = 0.5 * abs(sum(xs[i] * ys[(i + 1) % len(xs)] - xs[(i + 1) % len(xs)] * ys[i] for i in range(len(xs))))
            if area < 400:
                continue
            cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
            if not _point_in_ring(cx, cy, ring):
                continue
            if math.hypot(cx - sx, cy - sy) > radius:
                continue
            if blocked(cx, cy):
                # centroid on a fountain / kiosk is fine; look for any free neighbour
                free = False
                for dx, dy in ((8, 0), (-8, 0), (0, 8), (0, -8), (12, 12), (-12, 12)):
                    px, py = cx + dx, cy + dy
                    if _point_in_ring(px, py, ring) and not blocked(px, py):
                        free = True
                        break
                if not free:
                    errors.append(f"{kind} {name!r} has no open ground near its centre")

    # Dedup while keeping order — one way can trip the stretch counter once.
    out: list[str] = []
    seen: set[str] = set()
    for err in errors:
        if err in seen:
            continue
        seen.add(err)
        out.append(err)
    return out
