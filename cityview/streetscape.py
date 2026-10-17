"""Street-facing edges, roof shapes, and spawn helpers for district LOD2."""

from __future__ import annotations

import math
from typing import Any

from cityview.building_heights import FLOOR_H, MAX_EAVES_M, MAX_LEVELS
from cityview.directions import infer_parallel_track_directions, mark_dual_carriageways
from cityview.passages import apply_building_passages
from cityview.signals import in_carriageway, junction_approaches, pedestrian_signal_yaw, vehicle_signal_yaw


def _dist(ax: float, ay: float, bx: float, by: float) -> float:
    return math.hypot(bx - ax, by - ay)


def _point_segment_dist(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 < 1e-9:
        return _dist(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return _dist(px, py, ax + t * dx, ay + t * dy)


def _centroid(ring: list[list[float]]) -> tuple[float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    n = max(1, len(ring))
    return (sum(xs) / n, sum(ys) / n)


def floors_from_height(height: float, tags: dict[str, str] | None = None) -> int:
    tags = tags or {}
    raw = tags.get("building:levels")
    if raw:
        try:
            return max(1, min(MAX_LEVELS, int(round(float(raw.split(";")[0])))))
        except ValueError:
            pass
    return max(1, min(MAX_LEVELS, int(round(height / FLOOR_H))))


def roof_shape_for(tags: dict[str, str], style: str, osm_id: int) -> str:
    tagged = (tags.get("roof:shape") or "").lower().strip()
    aliases = {
        "gabled": "gable",
        "hipped": "hip",
        "pyramidal": "hip",
        "skillion": "flat",
        "flat": "flat",
        "mansard": "mansard",
        "gambrel": "mansard",
        "half-hipped": "hip",
        "round": "hip",
    }
    if tagged in aliases:
        return aliases[tagged]
    if tagged in {"gable", "hip", "mansard", "flat"}:
        return tagged

    if style in {
        "international",
        "art-deco",
        "modern-infill",
        "white-modern",
        "prefab-70s",
        "supermarket",
        "hospital",
    }:
        return "flat"
    if style in {"neo-flemish", "art-nouveau", "red-brick"}:
        return "gable" if (osm_id % 3) else "mansard"
    if style == "yellow-brick":
        return "gable" if (osm_id % 2) else "mansard"
    if style in {"neo-gothic", "church", "school"}:
        return "hip"
    if style == "restaurant":
        return "mansard" if (osm_id % 5) < 3 else "gable"
    # neoclassical / eclectic / cream-tile default: mansard or gable
    return "mansard" if (osm_id % 5) < 3 else "gable"


def ring_signed_area(ring: list[list[float]]) -> float:
    n = len(ring)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return area * 0.5


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1):
            inside = not inside
    return inside


def footprint_supports_prism_roof(ring: list[list[float]], min_fill: float = 0.82) -> bool:
    """True when an OBB gable/hip prism stays mostly inside the wall ring.

    L-shaped / concave / highly irregular footprints fail — use mansard/flat instead.
    """
    if len(ring) < 3:
        return False
    cx, cy = _centroid(ring)
    cov_xx = cov_xy = cov_yy = 0.0
    for x, y in ring:
        dx, dy = x - cx, y - cy
        cov_xx += dx * dx
        cov_xy += dx * dy
        cov_yy += dy * dy
    n = max(1, len(ring))
    cov_xx /= n
    cov_xy /= n
    cov_yy /= n
    trace = cov_xx + cov_yy
    det = cov_xx * cov_yy - cov_xy * cov_xy
    gap = math.sqrt(max(0.0, trace * trace * 0.25 - det))
    l1 = trace * 0.5 + gap
    if abs(cov_xy) > 1e-9:
        ux, uy = l1 - cov_yy, cov_xy
    else:
        ux, uy = (1.0, 0.0) if cov_xx >= cov_yy else (0.0, 1.0)
    ulen = math.hypot(ux, uy) or 1.0
    ux, uy = ux / ulen, uy / ulen
    vx, vy = -uy, ux
    hu = hv = 0.0
    for x, y in ring:
        dx, dy = x - cx, y - cy
        hu = max(hu, abs(dx * ux + dy * uy))
        hv = max(hv, abs(dx * vx + dy * vy))
    if hu < hv:
        ux, uy, vx, vy = vx, vy, ux, uy
        hu, hv = hv, hu
    hu = max(hu, 0.8)
    hv = max(hv, 0.8)
    ring_area = abs(ring_signed_area(ring))
    obb_area = 4.0 * hu * hv
    if obb_area < 1e-3:
        return False
    if ring_area / obb_area < min_fill:
        return False
    # Near-corner samples of the OBB must lie inside the footprint.
    for su, sv in ((-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)):
        ix = cx + su * hu * 0.92 * ux + sv * hv * 0.92 * vx
        iy = cy + su * hu * 0.92 * uy + sv * hv * 0.92 * vy
        if not point_in_ring(ix, iy, ring):
            return False
    return True


def safe_roof_shape(shape: str, ring: list[list[float]]) -> str:
    """Demote gable/hip to mansard when the footprint cannot host an OBB prism."""
    if shape in {"gable", "hip"} and not footprint_supports_prism_roof(ring):
        return "mansard"
    return shape


def height_truth(tags: dict[str, str]) -> tuple[float, float, int]:
    """Return (eaves_height_m, roof_height_m, floors) from OSM tags."""
    floor_h = 3.15
    floors: int | None = None
    eaves: float | None = None
    roof_h = 0.0

    raw_h = tags.get("height")
    if raw_h:
        try:
            total = float(raw_h.replace("m", "").split()[0])
            eaves = max(4.0, min(MAX_EAVES_M, total))
        except ValueError:
            pass

    levels = tags.get("building:levels")
    if levels:
        try:
            floors = max(1, min(MAX_LEVELS, int(round(float(levels.split(";")[0])))))
        except ValueError:
            pass

    roof_levels = tags.get("roof:levels")
    if roof_levels:
        try:
            roof_h = max(0.0, float(roof_levels.split(";")[0]) * 2.4)
        except ValueError:
            pass

    raw_roof = tags.get("roof:height")
    if raw_roof:
        try:
            roof_h = max(0.0, float(raw_roof.replace("m", "").split()[0]))
        except ValueError:
            pass

    kind = tags.get("building", "yes")
    defaults = {
        "house": 11.2,
        "terrace": 12.0,
        "residential": 12.4,
        "apartments": 16.5,
        "commercial": 14.0,
        "retail": 11.0,
        "industrial": 10.0,
        "warehouse": 9.0,
        "church": 28.0,
        "cathedral": 42.0,
        "basilica": 32.0,
        "chapel": 18.0,
        "school": 14.0,
        "hospital": 18.0,
        "supermarket": 8.0,
        "garage": 4.5,
        "shed": 3.5,
        "semidetached_house": 11.5,
        "detached": 11.0,
    }

    if floors is None and eaves is not None:
        floors = max(1, min(MAX_LEVELS, int(round(eaves / floor_h))))
    if floors is None:
        eaves = eaves if eaves is not None else defaults.get(kind, 12.0)
        floors = max(1, min(MAX_LEVELS, int(round(eaves / floor_h))))
    if eaves is None:
        eaves = floors * floor_h

    # If total height included roof, peel a bit for roof mass when roof:shape suggests it.
    if roof_h <= 0.0 and tags.get("roof:shape") not in {None, "", "flat"}:
        roof_h = min(4.0, max(1.2, eaves * 0.16))
        eaves = max(4.0, eaves - roof_h * 0.35)

    return (float(eaves), float(roof_h), int(floors))


def _road_segments(roads: list[dict[str, Any]]) -> list[tuple[float, float, float, float, float]]:
    segs: list[tuple[float, float, float, float, float]] = []
    for road in roads:
        pts = road.get("points") or []
        half = float(road.get("width") or 6.0) * 0.5
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i + 1]
            segs.append((x1, y1, x2, y2, half + 5.5))
    return segs


class _SegmentGrid:
    """Uniform grid over road segments (bbox grown by reach) for point-in-reach queries."""

    CELL = 32.0

    def __init__(self, segments: list[tuple[float, float, float, float, float]]) -> None:
        self.cells: dict[tuple[int, int], list[tuple[float, float, float, float, float]]] = {}
        c = self.CELL
        for seg in segments:
            ax, ay, bx, by, reach = seg
            for ix in range(math.floor((min(ax, bx) - reach) / c), math.floor((max(ax, bx) + reach) / c) + 1):
                for iy in range(math.floor((min(ay, by) - reach) / c), math.floor((max(ay, by) + reach) / c) + 1):
                    self.cells.setdefault((ix, iy), []).append(seg)

    def __bool__(self) -> bool:
        return bool(self.cells)

    def near(self, x: float, y: float) -> list[tuple[float, float, float, float, float]]:
        return self.cells.get((math.floor(x / self.CELL), math.floor(y / self.CELL)), [])


def street_facing_edges(
    ring: list[list[float]],
    segments: list[tuple[float, float, float, float, float]] | _SegmentGrid,
    min_length: float = 2.8,
) -> list[dict[str, Any]]:
    """Return ring edge indices that face a nearby road (outward toward asphalt)."""
    if len(ring) < 3 or not segments:
        return []
    grid = segments if isinstance(segments, _SegmentGrid) else None
    cx, cy = _centroid(ring)
    edges: list[dict[str, Any]] = []
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        length = _dist(x1, y1, x2, y2)
        if length < min_length:
            continue
        mx, my = (x1 + x2) * 0.5, (y1 + y2) * 0.5
        ex, ey = x2 - x1, y2 - y1
        # Left normal; flip so it points away from centroid.
        nx, ny = -ey / length, ex / length
        if (mx - cx) * nx + (my - cy) * ny < 0:
            nx, ny = -nx, -ny
        probe_x, probe_y = mx + nx * 3.0, my + ny * 3.0
        for ax, ay, bx, by, reach in grid.near(probe_x, probe_y) if grid else segments:
            if _point_segment_dist(probe_x, probe_y, ax, ay, bx, by) <= reach:
                edges.append(
                    {
                        "i0": i,
                        "i1": (i + 1) % n,
                        "length": round(length, 3),
                        "outward": [round(nx, 5), round(ny, 5)],
                    }
                )
                break
    return edges


class _RingGrid:
    """Uniform grid over polygon bounding boxes for point-in-polygon queries."""

    CELL = 64.0

    def __init__(self, rings: list[list[list[float]]]) -> None:
        self.cells: dict[tuple[int, int], list[list[list[float]]]] = {}
        c = self.CELL
        for ring in rings:
            if len(ring) < 3:
                continue
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            for ix in range(math.floor(min(xs) / c), math.floor(max(xs) / c) + 1):
                for iy in range(math.floor(min(ys) / c), math.floor(max(ys) / c) + 1):
                    self.cells.setdefault((ix, iy), []).append(ring)

    def __bool__(self) -> bool:
        return bool(self.cells)

    def contains(self, x: float, y: float) -> bool:
        cell = self.cells.get((math.floor(x / self.CELL), math.floor(y / self.CELL)), [])
        return any(point_in_ring(x, y, ring) for ring in cell)


# Probes (metres out from the wall): one must land in a park / water polygon (front
# gardens sit between many walls and the park edge).
OPEN_SPACE_PROBES_M = (3.0, 8.0, 15.0)
# The first probe inside another footprint means the wall is against a neighbour.
OPEN_SPACE_CLEAR_M = 3.0


def open_space_edges(
    ring: list[list[float]],
    open_space: _RingGrid,
    skip: set[int],
    blockers: _RingGrid | None = None,
    min_length: float = 4.0,
) -> list[dict[str, Any]]:
    """Ring edges (not already street edges) that look out over a park or water."""
    if len(ring) < 3 or not open_space:
        return []
    cx, cy = _centroid(ring)
    n = len(ring)
    edges: list[dict[str, Any]] = []
    for i in range(n):
        if i in skip:
            continue
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        length = _dist(x1, y1, x2, y2)
        if length < min_length:
            continue
        mx, my = (x1 + x2) * 0.5, (y1 + y2) * 0.5
        nx, ny = -(y2 - y1) / length, (x2 - x1) / length
        if (mx - cx) * nx + (my - cy) * ny < 0:
            nx, ny = -nx, -ny
        if blockers and blockers.contains(mx + nx * OPEN_SPACE_CLEAR_M, my + ny * OPEN_SPACE_CLEAR_M):
            continue
        if any(open_space.contains(mx + nx * d, my + ny * d) for d in OPEN_SPACE_PROBES_M):
            edges.append(
                {"i0": i, "i1": (i + 1) % n, "length": round(length, 3), "outward": [round(nx, 5), round(ny, 5)]}
            )
    return edges


def annotate_layout(layout: dict[str, Any]) -> dict[str, Any]:
    """Cut building passages, then attach street_edges from road proximity and
    open_edges (walls over a park or water, which also get an elevation)."""
    apply_building_passages(layout)
    segments = _SegmentGrid(_road_segments(layout.get("roads") or []))
    open_space = _RingGrid(
        [p.get("ring") or [] for p in layout.get("parks") or []]
        + [w.get("ring") or [] for w in layout.get("water") or []]
    )
    buildings = layout.get("buildings") or []
    blockers = _RingGrid([b.get("ring") or [] for b in buildings]) if open_space else None
    for bldg in buildings:
        ring = bldg.get("ring") or []
        bldg["street_edges"] = street_facing_edges(ring, segments)
        bldg["open_edges"] = open_space_edges(
            ring, open_space, {int(e["i0"]) for e in bldg["street_edges"]}, blockers
        )
    return layout


def nearest_road_pose(
    x: float, y: float, roads: list[dict[str, Any]]
) -> tuple[float, float, float]:
    """Snap (x,y) to the nearest road centreline; return (sx, sy, yaw)."""
    best = 1e18
    sx, sy, yaw = x, y, 0.0
    for road in roads:
        pts = road.get("points") or []
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            dx, dy = bx - ax, by - ay
            len2 = dx * dx + dy * dy
            if len2 < 1e-9:
                continue
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / len2))
            px, py = ax + t * dx, ay + t * dy
            d = _dist(x, y, px, py)
            if d < best:
                best = d
                # Stand on the carriageway near the address, not inside the footprint.
                sx, sy = px, py
                yaw = math.atan2(dy, dx)
    return sx, sy, yaw


def nearest_road_yaw(x: float, y: float, roads: list[dict[str, Any]]) -> float:
    """Yaw (radians around Z) along the nearest road tangent at (x, y)."""
    _sx, _sy, yaw = nearest_road_pose(x, y, roads)
    return yaw


DRIVEABLE_ROAD_KINDS = frozenset(
    {
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
        "primary",
        "primary_link",
        "secondary",
        "secondary_link",
        "tertiary",
        "tertiary_link",
        "unclassified",
        "residential",
        "living_street",
    }
)

# Never put these on the car graph (tram/rail/pedestrian/service alleys).
NON_DRIVEABLE_ROAD_KINDS = frozenset(
    {
        "tram",
        "rail",
        "light_rail",
        "subway",
        "narrow_gauge",
        "platform",
        "footway",
        "path",
        "cycleway",
        "steps",
        "pedestrian",
        "service",
        "bus_guideway",
        "corridor",
        "construction",
        "proposed",
        "raceway",
        "bridleway",
        "elevator",
    }
)

_TRAM_TRANSIT_MODES = frozenset({"tram", "subway", "light_rail", "rail"})

# Belgian urban defaults (km/h) when OSM carries no maxspeed. Antwerp centre is
# largely a 30 zone; arterials are 50.
DEFAULT_URBAN_SPEED_KMH = {
    "motorway": 70.0,
    "motorway_link": 50.0,
    "trunk": 50.0,
    "trunk_link": 50.0,
    "primary": 50.0,
    "primary_link": 40.0,
    "secondary": 50.0,
    "secondary_link": 40.0,
    "tertiary": 50.0,
    "tertiary_link": 40.0,
    "unclassified": 30.0,
    "residential": 30.0,
    "living_street": 20.0,
}
_MIN_SPEED_KMH = 5.0
_MAX_SPEED_KMH = 120.0


def parse_maxspeed_kmh(tags: dict[str, str] | None) -> float | None:
    """Parse an OSM ``maxspeed`` tag to km/h, or ``None`` if absent/unusable.

    Handles ``"30"``, ``"50 km/h"``, ``"20 mph"``, ``"walk"`` and ``"BE:urban"``
    style implicit values. Lists (``"30;50"``) take the lowest value.
    """
    if not tags:
        return None
    raw = tags.get("maxspeed") or tags.get("maxspeed:forward") or tags.get("maxspeed:backward")
    if not raw:
        return None
    best: float | None = None
    for part in str(raw).replace(",", ";").split(";"):
        text = part.strip().lower()
        if not text:
            continue
        value: float | None = None
        if text == "walk":
            value = 7.0
        elif text.endswith("urban") or text.endswith(":urban"):
            value = 50.0
        else:
            num = ""
            for ch in text:
                if ch.isdigit() or (ch == "." and "." not in num):
                    num += ch
                elif num:
                    break
            if num:
                try:
                    value = float(num)
                except ValueError:
                    value = None
                if value is not None and "mph" in text:
                    value *= 1.609344
        if value is None or value <= 0:
            continue
        value = max(_MIN_SPEED_KMH, min(_MAX_SPEED_KMH, value))
        best = value if best is None else min(best, value)
    return best


def road_speed_kmh(kind: str, maxspeed_kmh: float | None) -> float:
    """Effective cruising limit: tagged maxspeed, else a Belgian urban default."""
    if maxspeed_kmh is not None and maxspeed_kmh > 0:
        return float(maxspeed_kmh)
    return DEFAULT_URBAN_SPEED_KMH.get(str(kind or "").lower(), 30.0)


def _tram_way_ids(layout: dict[str, Any]) -> set[Any]:
    ids: set[Any] = set()
    for line in layout.get("transit_lines") or []:
        mode = (line.get("mode") or "").lower()
        if mode in _TRAM_TRANSIT_MODES:
            ids.add(line.get("id"))
    return ids


def _road_near_tram(
    pts: list[list[float]],
    tram_segs: list[tuple[float, float, float, float]],
    *,
    sample_n: int = 6,
    avg_thresh: float = 3.5,
) -> bool:
    """True when a highway centreline hugs tram rails (shared corridor)."""
    if not tram_segs or len(pts) < 2:
        return False
    samples: list[tuple[float, float]] = []
    for i in range(sample_n):
        t = i / max(1, sample_n - 1)
        idx = t * (len(pts) - 1)
        i0 = int(idx)
        i1 = min(len(pts) - 1, i0 + 1)
        f = idx - i0
        samples.append(
            (
                float(pts[i0][0]) * (1 - f) + float(pts[i1][0]) * f,
                float(pts[i0][1]) * (1 - f) + float(pts[i1][1]) * f,
            )
        )
    total = 0.0
    for px, py in samples:
        best = min(
            _point_segment_dist(px, py, ax, ay, bx, by) for ax, ay, bx, by in tram_segs
        )
        total += best
    return (total / len(samples)) <= avg_thresh


def _tram_segments(layout: dict[str, Any]) -> list[tuple[float, float, float, float]]:
    segs: list[tuple[float, float, float, float]] = []
    for line in layout.get("transit_lines") or []:
        if (line.get("mode") or "").lower() not in _TRAM_TRANSIT_MODES:
            continue
        pts = line.get("points") or []
        for i in range(1, len(pts)):
            segs.append(
                (
                    float(pts[i - 1][0]),
                    float(pts[i - 1][1]),
                    float(pts[i][0]),
                    float(pts[i][1]),
                )
            )
    return segs


def _direction_code(value: Any) -> int:
    """Normalise a travel-direction code to 1 (along points) / -1 (against) / 0 (both)."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return 1 if n > 0 else (-1 if n < 0 else 0)


# Pedestrian-only OSM ways (centreline is the path). Living streets stay on
# sidewalk ribbons — their centreline is still a shared carriageway.
WALK_WAY_KINDS = frozenset({"footway", "path", "pedestrian", "steps"})
SIDEWALK_HOST_KINDS = frozenset(
    {
        "residential",
        "living_street",
        "unclassified",
        "secondary",
        "secondary_link",
        "tertiary",
        "tertiary_link",
        "primary",
        "primary_link",
    }
)
SIDEWALK_W = 2.0
# Half-width of the asphalt strip we refuse to walk on (host road excluded).
_WALK_CARRIAGE_MARGIN = 0.45
# Legacy soft threshold (kept for ``_walk_indoor_fraction`` callers). Export uses
# the hard rule instead: no sample may sit inside a footprint (+ margin).
_WALK_INDOOR_REJECT = 0.12
# Hard rule: no exported walk point / 1 m sample may be inside a building ring
# or closer than this to its edge.
_WALK_INDOOR_MARGIN = 0.4
# Spacing of indoor samples / clamped-ribbon samples along a walk.
_WALK_SAMPLE_M = 1.0
# Simplification tolerance when thinning densified runs back down.
_WALK_THIN_TOL_M = 0.03
# Sidewalk lateral clamp: keep this far from the nearest building along the
# normal; skip a side whose resulting clear half-width is below the minimum.
_WALK_BUILDING_GAP_M = 0.5
_WALK_MIN_CLEAR_HALF_M = 1.2
# Roads whose clear (building-to-building) width is below this are car-free.
_CAR_FREE_CLEAR_WIDTH_M = 4.5
_CAR_FREE_KINDS = frozenset({"living_street", "residential", "unclassified"})
# How far a clear-width / clamp ray looks for a building.
_CLEAR_RAY_MAX_M = 12.0
# OSM walk ways farther than this from a street carriageway are yard/plaza paths.
_WALK_STREET_MAX_M = 14.0
# Orphan stubs shorter than this only encourage sidewalk ping-pong.
_WALK_MIN_KEEP_M = 12.0


def _sidewalk_side_signs(road: dict[str, Any]) -> list[tuple[str, float]]:
    """Kerb sidewalks to emit: outer kerb only on dual carriageways (median is not a path)."""
    oneway = _direction_code(road.get("oneway"))
    if road.get("dualCarriageway"):
        # Traffic along ``points`` → right is the building kerb; against → left.
        if oneway == -1:
            return [("L", 1.0)]
        return [("R", -1.0)]
    return [("L", 1.0), ("R", -1.0)]


def _roads_for_walk_export(layout: dict[str, Any]) -> list[dict[str, Any]]:
    """Copy layout roads with normalised oneway + dual-carriageway flags for walk export."""
    roads: list[dict[str, Any]] = []
    for road in layout.get("roads") or []:
        r = dict(road)
        r["oneway"] = _direction_code(road.get("oneway"))
        roads.append(r)
    mark_dual_carriageways(roads)
    return roads


def _offset_polyline(points: list[list[float]], offset: float) -> list[list[float]]:
    """Offset a polyline to the left of travel by ``offset`` metres (Blender XY)."""
    if len(points) < 2:
        return []
    out: list[list[float]] = []
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[1][0] - x, points[1][1] - y
        elif i == len(points) - 1:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
        else:
            dx, dy = points[i + 1][0] - points[i - 1][0], points[i + 1][1] - points[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        out.append([x + nx * offset, y + ny * offset])
    return out


def _polyline_length(pts: list[list[float]]) -> float:
    return sum(_dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(len(pts) - 1))


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < ((x2 - x1) * (y - y1)) / ((y2 - y1) or 1e-12) + x1:
            inside = not inside
    return inside


def _building_rings(layout: dict[str, Any]) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for bldg in layout.get("buildings") or []:
        ring = bldg.get("ring") or []
        if len(ring) < 3:
            continue
        rings.append([[float(p[0]), float(p[1])] for p in ring])
    return rings


def _walk_indoor_fraction(pts: list[list[float]], buildings: list[list[list[float]]], step: float = 3.0) -> float:
    """Fraction of samples along ``pts`` that fall inside a building footprint."""
    if not buildings or len(pts) < 2:
        return 0.0
    length = _polyline_length(pts)
    if length <= 0:
        return 0.0
    hit = 0
    n = 0
    s = 0.0
    while s <= length + 1e-9:
        cum = 0.0
        x, y = float(pts[0][0]), float(pts[0][1])
        for i in range(len(pts) - 1):
            dx = float(pts[i + 1][0]) - float(pts[i][0])
            dy = float(pts[i + 1][1]) - float(pts[i][1])
            seg = math.hypot(dx, dy)
            if s <= cum + seg + 1e-6:
                t = 0.0 if seg <= 0 else (s - cum) / seg
                x = float(pts[i][0]) + dx * t
                y = float(pts[i][1]) + dy * t
                break
            cum += seg
        n += 1
        if any(_point_in_ring(x, y, ring) for ring in buildings):
            hit += 1
        s += step
    return hit / n if n else 0.0


class _RingIndex:
    """Grid-bucketed building rings for fast indoor / ray-distance queries."""

    CELL = 25.0

    def __init__(self, rings: list[list[list[float]]]) -> None:
        self.rings = rings
        self.bboxes: list[tuple[float, float, float, float]] = []
        self.cells: dict[tuple[int, int], list[int]] = {}
        c = self.CELL
        for i, ring in enumerate(rings):
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            bb = (min(xs), min(ys), max(xs), max(ys))
            self.bboxes.append(bb)
            for cx in range(int(math.floor(bb[0] / c)), int(math.floor(bb[2] / c)) + 1):
                for cy in range(int(math.floor(bb[1] / c)), int(math.floor(bb[3] / c)) + 1):
                    self.cells.setdefault((cx, cy), []).append(i)

    def near(self, x0: float, y0: float, x1: float, y1: float) -> list[int]:
        """Indices of rings whose bbox overlaps the query box."""
        if not self.rings:
            return []
        c = self.CELL
        seen: set[int] = set()
        out: list[int] = []
        for cx in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for cy in range(int(math.floor(y0 / c)), int(math.floor(y1 / c)) + 1):
                for i in self.cells.get((cx, cy), ()):
                    if i in seen:
                        continue
                    seen.add(i)
                    bx0, by0, bx1, by1 = self.bboxes[i]
                    if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1:
                        continue
                    out.append(i)
        return out

    def indoor(self, x: float, y: float, margin: float = _WALK_INDOOR_MARGIN) -> bool:
        """True inside any ring, or within ``margin`` metres of a ring edge."""
        for i in self.near(x - margin, y - margin, x + margin, y + margin):
            ring = self.rings[i]
            if _point_in_ring(x, y, ring):
                return True
            n = len(ring)
            for k in range(n):
                a, b = ring[k], ring[(k + 1) % n]
                if _point_segment_dist(x, y, a[0], a[1], b[0], b[1]) < margin:
                    return True
        return False

    def ray(self, x: float, y: float, dx: float, dy: float, max_t: float) -> float:
        """Distance along unit ``(dx, dy)`` to the first ring edge (0 if inside, inf if none ≤ ``max_t``)."""
        ex, ey = x + dx * max_t, y + dy * max_t
        best = math.inf
        for i in self.near(min(x, ex), min(y, ey), max(x, ex), max(y, ey)):
            ring = self.rings[i]
            if _point_in_ring(x, y, ring):
                return 0.0
            n = len(ring)
            for k in range(n):
                ax, ay = ring[k][0], ring[k][1]
                sx, sy = ring[(k + 1) % n][0] - ax, ring[(k + 1) % n][1] - ay
                den = -(dx * sy - dy * sx)
                if abs(den) < 1e-9:
                    continue
                qx, qy = ax - x, ay - y
                t = (-qx * sy + sx * qy) / den
                u = (dx * qy - dy * qx) / den
                if 0.0 <= u <= 1.0 and 0.0 <= t <= max_t and t < best:
                    best = t
        return best


def _sample_polyline(
    pts: list[list[float]], step: float = _WALK_SAMPLE_M
) -> list[tuple[float, float, float, float, bool]]:
    """Samples every ≤ ``step`` m: ``(x, y, tx, ty, is_vertex)`` with the local tangent.

    Vertices use the same averaged tangent as ``_offset_polyline``; samples inside a
    segment use that segment's direction.
    """
    n = len(pts)
    if n == 0:
        return []

    def vtan(i: int) -> tuple[float, float]:
        if n == 1:
            return 0.0, 0.0
        if i == 0:
            dx, dy = pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
        elif i == n - 1:
            dx, dy = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        return dx / length, dy / length

    out: list[tuple[float, float, float, float, bool]] = []
    tx, ty = vtan(0)
    out.append((float(pts[0][0]), float(pts[0][1]), tx, ty, True))
    for i in range(n - 1):
        ax, ay = float(pts[i][0]), float(pts[i][1])
        bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
        seg = math.hypot(bx - ax, by - ay)
        if seg < 1e-9:
            continue
        k = max(1, int(math.ceil(seg / step - 1e-9)))
        sdx, sdy = (bx - ax) / seg, (by - ay) / seg
        for j in range(1, k + 1):
            if j == k:
                tx, ty = vtan(i + 1)
                out.append((bx, by, tx, ty, True))
            else:
                t = j / k
                out.append((ax + (bx - ax) * t, ay + (by - ay) * t, sdx, sdy, False))
    return out


def _thin_run(pts: list[list[float]], tol: float = _WALK_THIN_TOL_M) -> list[list[float]]:
    """Douglas–Peucker thinning of a densified run (drops collinear samples)."""
    n = len(pts)
    if n <= 2:
        return [list(p) for p in pts]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        far, far_i = -1.0, -1
        for i in range(lo + 1, hi):
            d = _point_segment_dist(
                pts[i][0], pts[i][1], pts[lo][0], pts[lo][1], pts[hi][0], pts[hi][1]
            )
            if d > far:
                far, far_i = d, i
        if far > tol and far_i > 0:
            keep[far_i] = True
            stack.append((lo, far_i))
            stack.append((far_i, hi))
    return [list(p) for p, k in zip(pts, keep) if k]


def _walk_has_indoor_sample(run: list[list[float]], index: _RingIndex | None) -> bool:
    """True if any vertex or ~1 m sample of ``run`` is inside a ring (± margin)."""
    if index is None or not index.rings:
        return False
    return any(index.indoor(x, y) for x, y, _tx, _ty, _v in _sample_polyline(run))


def _split_indoor_runs(run: list[list[float]], index: _RingIndex | None) -> list[list[list[float]]]:
    """Split ``run`` at indoor samples (every ~1 m); each piece ends on the last clear sample."""
    if len(run) < 2:
        return []
    if index is None or not index.rings:
        return [run]
    out: list[list[list[float]]] = []
    cur: list[list[float]] = []
    last_clear: list[float] | None = None
    for x, y, _tx, _ty, is_vertex in _sample_polyline(run):
        if index.indoor(x, y):
            if cur:
                if last_clear is not None and last_clear is not cur[-1]:
                    cur.append(last_clear)
                if len(cur) >= 2:
                    out.append(cur)
            cur, last_clear = [], None
            continue
        p = [x, y]
        last_clear = p
        if is_vertex or not cur:
            cur.append(p)
    if len(cur) >= 2:
        out.append(cur)
    return out


def _clamped_sidewalk_runs(
    pts: list[list[float]],
    sign: float,
    nominal: float,
    index: _RingIndex | None,
    *,
    min_offset: float = 0.0,
) -> list[list[list[float]]]:
    """Kerb ribbon on one side of ``pts`` with the lateral offset clamped to the clear half-width.

    Per ~1 m sample: ``offset = min(nominal, dist_to_building_along_normal - 0.5)``.
    Samples whose clamped offset is below ``_WALK_MIN_CLEAR_HALF_M`` (or ``min_offset``)
    are dropped, splitting the ribbon there.
    """
    runs: list[list[list[float]]] = []
    cur: list[list[float]] = []
    gap = _WALK_BUILDING_GAP_M
    for x, y, tx, ty, _v in _sample_polyline(pts):
        length = math.hypot(tx, ty) or 1.0
        ux, uy = -ty / length * sign, tx / length * sign
        off = nominal
        if index is not None and index.rings:
            t = index.ray(x, y, ux, uy, nominal + gap)
            if t < nominal + gap:
                off = min(nominal, t - gap)
        clamped = off < nominal
        if clamped and (off < _WALK_MIN_CLEAR_HALF_M or off < min_offset):
            if len(cur) >= 2:
                runs.append(cur)
            cur = []
            continue
        cur.append([x + ux * off, y + uy * off])
    if len(cur) >= 2:
        runs.append(cur)
    return runs


def _road_clear_width(pts: list[list[float]], index: _RingIndex | None) -> float:
    """Lower quartile (25th pct) of finite both-sides building-to-building widths.

    Open-side samples (a ray that hits nothing) are ignored rather than counted as inf,
    so a mostly-narrow alley with a few gaps is still measured by its narrow part.
    Returns inf when fewer than 2 finite samples exist.
    """
    if index is None or not index.rings:
        return math.inf
    widths: list[float] = []
    for x, y, tx, ty, _v in _sample_polyline(pts, 2.0):
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        left = index.ray(x, y, nx, ny, _CLEAR_RAY_MAX_M)
        right = index.ray(x, y, -nx, -ny, _CLEAR_RAY_MAX_M)
        if math.isinf(left) or math.isinf(right):
            continue
        widths.append(left + right)
    if len(widths) < 2:
        return math.inf
    widths.sort()
    pos = 0.25 * (len(widths) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(widths) - 1)
    return widths[lo] + (widths[hi] - widths[lo]) * (pos - lo)


_MOTOR_ALLOWED_VALUES = frozenset(
    {"yes", "designated", "permissive", "destination", "delivery", "customers", "agricultural", "forestry"}
)


def _road_osm_tags(road: dict[str, Any]) -> dict[str, str]:
    """OSM-style access tags from ``road['tags']`` and/or top-level keys, lower-cased."""
    merged: dict[str, str] = {}
    raw = road.get("tags")
    if isinstance(raw, dict):
        for k, v in raw.items():
            merged[str(k).lower()] = str(v).strip().lower()
    for key in ("motor_vehicle", "motorcar", "motor_car", "vehicle", "access", "foot"):
        if key not in merged and road.get(key) is not None:
            merged[key] = str(road[key]).strip().lower()
    return merged


def _road_motor_denied_by_tags(road: dict[str, Any]) -> bool:
    """motor_vehicle=no / access=no (/ vehicle=no) — ``foot=designated`` confirms but is not required."""
    tags = _road_osm_tags(road)
    if tags.get("motor_vehicle") in _MOTOR_ALLOWED_VALUES:
        return False
    denied = (
        tags.get("motor_vehicle") == "no"
        or tags.get("motorcar", tags.get("motor_car")) == "no"
        or tags.get("vehicle") == "no"
        or tags.get("access") == "no"
    )
    return denied


def _road_is_car_free(road: dict[str, Any], pts: list[list[float]], index: _RingIndex | None) -> bool:
    """Car-free by OSM access tags, or a narrow (< 4.5 m clear) living street / residential / unclassified."""
    if _road_motor_denied_by_tags(road):
        return True
    kind = str(road.get("kind") or "").lower()
    if kind in _CAR_FREE_KINDS and _road_clear_width(pts, index) < _CAR_FREE_CLEAR_WIDTH_M:
        return True
    return False


def _dist_to_street_hosts(x: float, y: float, roads: list[dict[str, Any]]) -> float:
    """Metres to the nearest sidewalk-host carriageway centreline."""
    best = float("inf")
    for road in roads:
        kind = str(road.get("kind") or "").lower()
        if kind not in SIDEWALK_HOST_KINDS:
            continue
        pts = road.get("points") or []
        for i in range(len(pts) - 1):
            ax, ay = float(pts[i][0]), float(pts[i][1])
            bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
            dx, dy = bx - ax, by - ay
            len2 = dx * dx + dy * dy
            if len2 < 1e-8:
                d = _dist(x, y, ax, ay)
            else:
                t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / len2))
                d = _dist(x, y, ax + t * dx, ay + t * dy)
            if d < best:
                best = d
    return best


def _street_adjacent_walk(pts: list[list[float]], roads: list[dict[str, Any]], max_m: float = _WALK_STREET_MAX_M) -> bool:
    """True when most of the walk stays near a public street (not a yard path)."""
    if len(pts) < 2:
        return False
    length = _polyline_length(pts)
    if length <= 0:
        return False
    step = max(3.0, length / 8.0)
    far = 0
    n = 0
    s = 0.0
    while s <= length + 1e-9:
        cum = 0.0
        x, y = float(pts[0][0]), float(pts[0][1])
        for i in range(len(pts) - 1):
            dx = float(pts[i + 1][0]) - float(pts[i][0])
            dy = float(pts[i + 1][1]) - float(pts[i][1])
            seg = math.hypot(dx, dy)
            if s <= cum + seg + 1e-6:
                t = 0.0 if seg <= 0 else (s - cum) / seg
                x = float(pts[i][0]) + dx * t
                y = float(pts[i][1]) + dy * t
                break
            cum += seg
        n += 1
        if _dist_to_street_hosts(x, y, roads) > max_m:
            far += 1
        s += step
    return n > 0 and (far / n) <= 0.35


def _accept_walk_run(
    run: list[list[float]],
    roads: list[dict[str, Any]],
    index: _RingIndex | None,
    *,
    require_street: bool,
) -> bool:
    if len(run) < 2 or _polyline_length(run) < 4.0:
        return False
    # Hard rule: a single indoor sample (inside a ring or < 0.4 m from its edge)
    # rejects the run — no reliance on an indoor *fraction*.
    if _walk_has_indoor_sample(run, index):
        return False
    if require_street and not _street_adjacent_walk(run, roads):
        return False
    return True


def _finalize_walk_runs(
    runs: list[list[list[float]]],
    roads: list[dict[str, Any]],
    index: _RingIndex | None,
    *,
    require_street: bool,
) -> list[list[list[float]]]:
    """Split at indoor samples, drop short runs, thin, round, and re-verify outdoors."""
    out: list[list[list[float]]] = []
    for run in runs:
        for piece in _split_indoor_runs(run, index):
            if _polyline_length(piece) < _WALK_MIN_KEEP_M:
                continue
            # Round first: the exported (2 dp) points are what must clear the rings.
            dense = [[round(p[0], 2), round(p[1], 2)] for p in piece]
            for cand in (_thin_run(dense), dense):
                if _accept_walk_run(cand, roads, index, require_street=require_street):
                    out.append(cand)
                    break
    return out


def _safe_sidewalk_runs(
    walk: list[list[float]],
    roads: list[dict[str, Any]],
    host_idx: int,
) -> list[list[list[float]]]:
    """Split a kerb ribbon wherever it dips into a driveable carriageway."""
    runs: list[list[list[float]]] = []
    cur: list[list[float]] = []
    for p in walk:
        if in_carriageway(
            p[0],
            p[1],
            roads,
            DRIVEABLE_ROAD_KINDS,
            skip=host_idx,
            margin=_WALK_CARRIAGE_MARGIN,
        ):
            if len(cur) >= 2 and _polyline_length(cur) >= 6.0:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) >= 2 and _polyline_length(cur) >= 6.0:
        runs.append(cur)
    return runs


def _crossing_walks(
    layout: dict[str, Any],
    sx: float,
    sy: float,
    radius: float,
) -> list[dict[str, Any]]:
    """Short kerb-to-kerb links at OSM crossings — the only intentional road walks."""
    roads = layout.get("roads") or []
    out: list[dict[str, Any]] = []
    for cross in layout.get("crossings") or []:
        cx = float(cross.get("x") or 0.0)
        cy = float(cross.get("y") or 0.0)
        if _dist(sx, sy, cx, cy) > radius:
            continue
        best: tuple[float, float, float, float, float, float] | None = None  # d,hx,hy,tx,ty,half
        for road in roads:
            kind = str(road.get("kind") or "").lower()
            if kind not in SIDEWALK_HOST_KINDS:
                continue
            pts = road.get("points") or []
            half = float(road.get("width") or 6.0) * 0.5
            for i in range(len(pts) - 1):
                ax, ay = float(pts[i][0]), float(pts[i][1])
                bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
                dx, dy = bx - ax, by - ay
                len2 = dx * dx + dy * dy
                if len2 < 1e-6:
                    continue
                t = max(0.0, min(1.0, ((cx - ax) * dx + (cy - ay) * dy) / len2))
                px, py = ax + t * dx, ay + t * dy
                d = _dist(cx, cy, px, py)
                if d > half + 2.5:
                    continue
                if best is None or d < best[0]:
                    length = math.sqrt(len2)
                    best = (d, px, py, dx / length, dy / length, half)
        if best is None:
            continue
        _d, px, py, tx, ty, half = best
        nx, ny = -ty, tx  # left-hand normal
        inset = half + SIDEWALK_W * 0.5
        left = [round(px + nx * inset, 2), round(py + ny * inset, 2)]
        right = [round(px - nx * inset, 2), round(py - ny * inset, 2)]
        if _dist(left[0], left[1], right[0], right[1]) < 2.0:
            continue
        # Signalised when OSM says so, or a traffic-signal node sits on the zebra.
        signal = str(cross.get("kind") or "") == "signals"
        if not signal:
            for sig in layout.get("signals") or []:
                if _dist(cx, cy, float(sig.get("x") or 0), float(sig.get("y") or 0)) < 8.0:
                    signal = True
                    break
        out.append(
            {
                "id": f"cross{cross.get('id')}",
                "kind": "crossing",
                "safe": False,
                "signal": signal,
                "width": SIDEWALK_W,
                "points": [left, right],
            }
        )
    return out


# Walk graph for the crowd must cover border handoffs, not only the district
# spawn plaza. Driveable car roads stay spawn-clipped; pedestrians need sidewalks
# wherever the walker can arrive via ``enterDistrict(?at=…)``.
VIEWER_WALK_RADIUS_M = 2000.0
VIEWER_WALK_MAX = 900
VIEWER_WALK_CORE_M = 280.0
VIEWER_WALK_GRID_M = 160.0
VIEWER_WALK_PER_CELL = 3


def _walk_midpoint(points: list[list[float]]) -> tuple[float, float]:
    n = max(1, len(points))
    return (sum(p[0] for p in points) / n, sum(p[1] for p in points) / n)


def _select_walks_with_coverage(
    scored: list[tuple[float, dict[str, Any]]],
    *,
    max_walks: int,
    core_m: float = VIEWER_WALK_CORE_M,
    grid_m: float = VIEWER_WALK_GRID_M,
    per_cell: int = VIEWER_WALK_PER_CELL,
) -> list[dict[str, Any]]:
    """Dense sidewalks near spawn, plus a grid sample so border arrivals still have routes."""
    if max_walks <= 0 or not scored:
        return []
    scored = sorted(scored, key=lambda item: item[0])
    chosen: list[dict[str, Any]] = []
    seen: set[str] = set()

    def take(walk: dict[str, Any]) -> bool:
        wid = str(walk.get("id") or "")
        if wid in seen:
            return False
        seen.add(wid)
        chosen.append(walk)
        return True

    for _d, walk in scored:
        if _d > core_m or len(chosen) >= max_walks:
            break
        take(walk)

    cells: dict[tuple[int, int], list[tuple[float, dict[str, Any]]]] = {}
    for dmin, walk in scored:
        if dmin <= core_m:
            continue
        mx, my = _walk_midpoint(walk.get("points") or [[0.0, 0.0]])
        key = (int(math.floor(mx / grid_m)), int(math.floor(my / grid_m)))
        cells.setdefault(key, []).append((dmin, walk))

    # Round-robin across cells so distant seams are not starved by nearer rings.
    cell_lists = [sorted(items, key=lambda item: item[0]) for items in cells.values()]
    cell_lists.sort(key=lambda items: items[0][0] if items else 0.0)
    for _ in range(per_cell):
        progress = False
        for items in cell_lists:
            if len(chosen) >= max_walks:
                break
            while items:
                _d, walk = items.pop(0)
                if take(walk):
                    progress = True
                    break
        if not progress or len(chosen) >= max_walks:
            break

    if len(chosen) < max_walks:
        for _d, walk in scored:
            if len(chosen) >= max_walks:
                break
            take(walk)
    return chosen


def export_walks_near_spawn(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    radius: float = VIEWER_WALK_RADIUS_M,
    max_walks: int = VIEWER_WALK_MAX,
) -> list[dict[str, Any]]:
    """Pedestrian-safe polylines for the walker crowd.

    Uses street-adjacent OSM footways / paths / plazas, plus kerb-side sidewalk
    ribbons along ordinary streets (same offset as the Blender pavement).
    Building passages (``tunnel=building_passage``), indoor corridors, and yard
    paths through courtyards are dropped. Carriageway centrelines are never
    walked; short ``crossing`` links at OSM zebra / signal nodes are the only
    intentional road crossings.

    Default radius covers a full district (border handoffs included). A dense
    core near spawn is kept, then remaining slots are grid-sampled so arrivals
    far from the plaza still have a sidewalk network.
    """
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    roads = _roads_for_walk_export(layout)
    index = _RingIndex(_building_rings(layout))
    scored: list[tuple[float, dict[str, Any]]] = []
    for ri, road in enumerate(roads):
        kind = str(road.get("kind") or "").lower()
        pts = [[float(p[0]), float(p[1])] for p in (road.get("points") or [])]
        if len(pts) < 2:
            continue
        # Porte-cochères / covered building cuts are not sidewalk routes.
        if road.get("passage"):
            continue
        dmin = min(_dist(sx, sy, p[0], p[1]) for p in pts)
        if dmin > radius:
            continue
        length = _polyline_length(pts)
        if length < 4.0:
            continue
        if kind in WALK_WAY_KINDS:
            # Pedestrian plazas (Groenplaats etc.) are destinations, not yard stubs —
            # keep them even far from a carriageway. Footways/paths still need a
            # nearby street so courtyard cuts are dropped. Every run is then split
            # at indoor samples (hard rule: no exported point inside a footprint).
            runs = [pts] if kind == "pedestrian" else _safe_sidewalk_runs(pts, roads, ri)
            final = _finalize_walk_runs(
                runs, roads, index, require_street=(kind != "pedestrian")
            )
            walk_w = float(road.get("width") or SIDEWALK_W)
            for run_i, run in enumerate(final):
                scored.append(
                    (
                        dmin,
                        {
                            "id": f"w{road.get('id')}" + (f"_{run_i}" if run_i else ""),
                            "kind": kind,
                            "safe": True,
                            "width": walk_w,
                            "points": run,
                        },
                    )
                )
            continue
        if kind not in SIDEWALK_HOST_KINDS:
            continue
        half = float(road.get("width") or 6.0) * 0.5
        nominal = half + SIDEWALK_W * 0.5
        # Shared-space streets (living streets, car-free alleys) may be walked inside
        # the carriageway strip; on ordinary streets a ribbon squeezed below the
        # kerb line would put pedestrians in a driving lane, so skip those samples.
        shared = kind == "living_street" or _road_is_car_free(road, pts, index)
        min_offset = 0.0 if shared else half
        emitted = 0
        for side, sign in _sidewalk_side_signs(road):
            ribbons = _clamped_sidewalk_runs(pts, sign, nominal, index, min_offset=min_offset)
            runs = [r for ribbon in ribbons for r in _safe_sidewalk_runs(ribbon, roads, ri)]
            # Ribbons are already street-offset; only reject building cuts.
            final = _finalize_walk_runs(runs, roads, index, require_street=False)
            for run_i, run in enumerate(final):
                emitted += 1
                scored.append(
                    (
                        dmin,
                        {
                            "id": f"sw{road.get('id')}_{side}" + (f"_{run_i}" if run_i else ""),
                            "kind": "sidewalk",
                            "safe": True,
                            "side": side,
                            "width": SIDEWALK_W,
                            "points": run,
                        },
                    )
                )
        if emitted == 0 and kind == "living_street":
            # Both kerbs too tight (or blocked): walk the outdoor part of the centreline.
            runs = _safe_sidewalk_runs(pts, roads, ri)
            final = _finalize_walk_runs(runs, roads, index, require_street=False)
            for run_i, run in enumerate(final):
                scored.append(
                    (
                        dmin,
                        {
                            "id": f"sw{road.get('id')}_C" + (f"_{run_i}" if run_i else ""),
                            "kind": "pedestrian",
                            "safe": True,
                            "side": "C",
                            "width": SIDEWALK_W,
                            "points": run,
                        },
                    )
                )
    for cross in _crossing_walks(layout, sx, sy, radius):
        # Same hard rule for kerb-to-kerb links: never end up inside a footprint.
        if _walk_has_indoor_sample(cross["points"], index):
            continue
        scored.append((_dist(sx, sy, cross["points"][0][0], cross["points"][0][1]), cross))
    return _select_walks_with_coverage(scored, max_walks=max_walks)


def export_cycleways_near_spawn(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    radius: float = 280.0,
    max_ways: int = 80,
) -> list[dict[str, Any]]:
    """Dedicated OSM cycleways and lane tags for the micromobility graph.

    Riders use these geometries when present; otherwise they ride the kerb-side
    bike offset on driveable roads. Never mixed with pedestrian walks.
    """
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    scored: list[tuple[float, dict[str, Any]]] = []
    for road in layout.get("roads") or []:
        kind = str(road.get("kind") or "").lower()
        pts = road.get("points") or []
        if len(pts) < 2:
            continue
        dmin = min(_dist(sx, sy, float(p[0]), float(p[1])) for p in pts)
        if dmin > radius:
            continue
        # Standalone cycleway / shared path tagged for bikes.
        if kind == "cycleway":
            scored.append(
                (
                    dmin,
                    {
                        "id": f"cw{road.get('id')}",
                        "kind": "cycleway",
                        "side": None,
                        "width": float(road.get("width") or 2.4),
                        "oneway": _direction_code(road.get("oneway")),
                        "points": [[float(p[0]), float(p[1])] for p in pts],
                    },
                )
            )
            continue
        # Lane tags on a motor road: cycleway / cycleway:left / cycleway:right.
        lanes = road.get("cycleLanes") or {}
        if not lanes and kind in DRIVEABLE_ROAD_KINDS:
            continue
        half = float(road.get("width") or 6.0) * 0.5
        bike_off = half + 0.35
        for side, meta in lanes.items():
            if side not in {"L", "R", "both"}:
                continue
            sign = 1.0 if side == "L" else -1.0
            if side == "both":
                for both_side, both_sign in (("L", 1.0), ("R", -1.0)):
                    offset = _offset_polyline(
                        [[float(p[0]), float(p[1])] for p in pts], both_sign * bike_off
                    )
                    if len(offset) < 2:
                        continue
                    scored.append(
                        (
                            dmin,
                            {
                                "id": f"cl{road.get('id')}_{both_side}",
                                "kind": "lane",
                                "side": both_side,
                                "width": 1.5,
                                "oneway": int(meta.get("oneway", road.get("oneway") or 0)),
                                "contraflow": bool(meta.get("contraflow")),
                                "points": [[round(p[0], 2), round(p[1], 2)] for p in offset],
                            },
                        )
                    )
                continue
            offset = _offset_polyline([[float(p[0]), float(p[1])] for p in pts], sign * bike_off)
            if len(offset) < 2:
                continue
            scored.append(
                (
                    dmin,
                    {
                        "id": f"cl{road.get('id')}_{side}",
                        "kind": "lane",
                        "side": side,
                        "width": 1.5,
                        "oneway": int(meta.get("oneway", road.get("oneway") or 0)),
                        "contraflow": bool(meta.get("contraflow")),
                        "points": [[round(p[0], 2), round(p[1], 2)] for p in offset],
                    },
                )
            )
    scored.sort(key=lambda item: item[0])
    return [item[1] for item in scored[:max_ways]]


def export_roads_near_spawn(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    radius: float = 280.0,
    max_roads: int = 60,
) -> dict[str, Any]:
    """Lightweight driveable road centrelines + signals for runtime traffic."""
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    tram_ids = _tram_way_ids(layout)
    tram_segs = _tram_segments(layout)
    ring_index = _RingIndex(_building_rings(layout))
    scored: list[tuple[float, dict[str, Any]]] = []
    for road in layout.get("roads") or []:
        kind = str(road.get("kind") or "residential").lower()
        if kind in NON_DRIVEABLE_ROAD_KINDS or kind not in DRIVEABLE_ROAD_KINDS:
            continue
        rid = road.get("id")
        # Transit tram/rail polylines must never appear as car paths.
        if rid in tram_ids:
            continue
        pts = road.get("points") or []
        if len(pts) < 2:
            continue
        dmin = min(_dist(sx, sy, float(p[0]), float(p[1])) for p in pts)
        if dmin > radius:
            continue
        shared = _road_near_tram(pts, tram_segs)
        tagged = road.get("maxspeed_kmh")
        tagged_kmh = float(tagged) if isinstance(tagged, (int, float)) and tagged > 0 else None
        scored.append(
            (
                dmin,
                {
                    "id": rid,
                    "kind": kind,
                    "name": str(road.get("name") or ""),
                    "width": float(road.get("width") or 6.0),
                    "surface": str(road.get("surface") or "asphalt"),
                    # Posted limit from OSM (null when untagged) + the limit
                    # traffic actually uses (tagged or urban default), km/h.
                    "maxspeedKmh": tagged_kmh,
                    "speedKmh": road_speed_kmh(kind, tagged_kmh),
                    # Wider right-lane offset when highway hugs tram rails.
                    "laneOffset": 2.4 if shared else 1.15,
                    "tramShared": shared,
                    # Legal direction along `points` (1 / -1 / 0 = both ways) from OSM
                    # oneway tags; buses may be exempt (contraflow bus lane).
                    "oneway": _direction_code(road.get("oneway")),
                    "onewayBus": _direction_code(road.get("oneway_bus", road.get("oneway"))),
                    # No motor traffic: narrow (< 4.5 m building-to-building) living
                    # street / residential / unclassified, or OSM motor_vehicle=no /
                    # access=no (foot=designated). Viewer traffic should skip these.
                    "carFree": _road_is_car_free(
                        road, [[float(p[0]), float(p[1])] for p in pts], ring_index
                    ),
                    "points": [[float(p[0]), float(p[1])] for p in pts],
                },
            )
        )
    scored.sort(key=lambda item: item[0])

    signals = _export_signal_stop_lines(
        layout, sx, sy, radius=min(radius, 220.0), max_clusters=14
    )
    chosen_roads = [item[1] for item in scored[:max_roads]]
    mark_dual_carriageways(chosen_roads)

    # Ped walks use their own district-wide radius — car roads stay spawn-clipped.
    walks = export_walks_near_spawn(layout, spawn)
    cycleways = export_cycleways_near_spawn(layout, spawn, radius=radius)
    payload = {
        "spawn": {"x": sx, "y": sy},
        "radius": radius,
        "roads": chosen_roads,
        "walks": walks,
        "cycleways": cycleways,
        "signals": signals,
        "cycleSeconds": 30,
    }
    origin = layout.get("origin") or layout.get("survey_origin")
    if origin:
        payload["origin"] = [float(origin[0]), float(origin[1])]
    if layout.get("survey") and origin:
        from cityview.survey import enrich_roads_payload

        payload["_usedPoles"] = list(layout.get("_usedPoles") or [])
        enrich_roads_payload(payload, layout, (float(origin[0]), float(origin[1])))
    return payload


def export_buildings_near_spawn(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    radius: float = 280.0,
    max_buildings: int = 1500,
) -> dict[str, Any]:
    """Building footprint rings near spawn for runtime outdoors collision.

    Viewer keeps the walker outside these rings (solid extruded boxes have no
    interiors). Courtyard holes are walkable. Underground masses, canopies and
    open pavilions are omitted. Rings use the same Blender XY as roads.json.
    """
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    scored: list[tuple[float, dict[str, Any]]] = []
    for bldg in layout.get("buildings") or []:
        if bldg.get("walker_solid") is False:
            continue
        ring = bldg.get("ring") or []
        if len(ring) < 3:
            continue
        pts = [[float(p[0]), float(p[1])] for p in ring]
        dmin = min(_dist(sx, sy, p[0], p[1]) for p in pts)
        if dmin > radius:
            continue
        entry: dict[str, Any] = {"id": bldg.get("id"), "ring": pts}
        holes = []
        for hole in bldg.get("holes") or []:
            if len(hole) < 3:
                continue
            holes.append([[float(p[0]), float(p[1])] for p in hole])
        if holes:
            entry["holes"] = holes
        scored.append((dmin, entry))
    scored.sort(key=lambda item: item[0])
    return {
        "spawn": {"x": sx, "y": sy},
        "radius": radius,
        "buildings": [item[1] for item in scored[:max_buildings]],
    }


def _simplify_ring(pts: list[list[float]], tol: float) -> list[list[float]]:
    """Douglas-Peucker on a closed ring (keeps the two farthest-apart anchors)."""
    if len(pts) <= 4:
        return pts

    def dp(seg: list[list[float]]) -> list[list[float]]:
        ax, ay = seg[0]
        bx, by = seg[-1]
        dx, dy = bx - ax, by - ay
        ll = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, 0
        for i in range(1, len(seg) - 1):
            d = abs(dy * (seg[i][0] - ax) - dx * (seg[i][1] - ay)) / ll
            if d > best:
                best, idx = d, i
        if best <= tol:
            return [seg[0], seg[-1]]
        return dp(seg[: idx + 1])[:-1] + dp(seg[idx:])

    far = max(range(len(pts)), key=lambda i: _dist(pts[0][0], pts[0][1], pts[i][0], pts[i][1]))
    if far == 0:
        return pts
    out = dp(pts[: far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]
    return out if len(out) >= 3 else pts


def export_walker_buildings(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    simplify_m: float = 0.15,
) -> dict[str, Any]:
    """Every solid footprint in the district for runtime outdoors collision.

    Full postcode coverage (the walker can reach every street), LOD2 footprints
    where measured. Rings are simplified to ``simplify_m`` and rounded to 0.1 m so
    the file stays small; the viewer indexes them on a grid. Sorted by distance
    to spawn so near buildings come first.
    """
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    scored: list[tuple[float, dict[str, Any]]] = []

    def compact(ring: list) -> list[list[float]]:
        pts = [[float(p[0]), float(p[1])] for p in ring]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        return [[round(p[0], 1), round(p[1], 1)] for p in _simplify_ring(pts, simplify_m)]

    for bldg in layout.get("buildings") or []:
        if bldg.get("walker_solid") is False:
            continue
        ring = bldg.get("ring") or []
        if len(ring) < 3:
            continue
        pts = compact(ring)
        if len(pts) < 3:
            continue
        entry: dict[str, Any] = {"id": bldg.get("id"), "ring": pts}
        # LOD2 "height" is the lowest roof (often a rear annex); the skyline needs the top.
        height = max(float(bldg.get("height") or 0.0), float((bldg.get("city3d") or {}).get("height_max") or 0.0))
        if height > 0:
            entry["h"] = round(height, 1)
        if bldg.get("landmark") or bldg.get("landmark_id"):
            entry["lm"] = 1
        holes = [compact(h) for h in bldg.get("holes") or [] if len(h) >= 3]
        holes = [h for h in holes if len(h) >= 3]
        if holes:
            entry["holes"] = holes
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        scored.append((_dist(sx, sy, cx, cy), entry))
    scored.sort(key=lambda item: item[0])
    return {
        "spawn": {"x": sx, "y": sy},
        "radius": None,
        "coverage": "district",
        "buildings": [item[1] for item in scored],
        # Dropped from the layout after the GLBs were baked; the viewer hides their meshes.
        "removed": list(layout.get("dropped_on_road") or []),
    }


def _export_signal_stop_lines(
    layout: dict[str, Any],
    sx: float,
    sy: float,
    *,
    radius: float,
    max_clusters: int,
) -> list[dict[str, Any]]:
    """Deduped OSM signal clusters → curb poles + stop-lines for the viewer."""
    raw: list[tuple[float, float, Any]] = []
    for sig in layout.get("signals") or []:
        x = float(sig.get("x") or 0.0)
        y = float(sig.get("y") or 0.0)
        if _dist(sx, sy, x, y) > radius:
            continue
        raw.append((x, y, sig.get("id")))
    if not raw:
        return []

    # Greedy 12m clustering (same rule as Blender).
    clusters: list[list[tuple[float, float, Any]]] = []
    for item in sorted(raw, key=lambda p: _dist(sx, sy, p[0], p[1])):
        placed = False
        for cluster in clusters:
            cx = sum(p[0] for p in cluster) / len(cluster)
            cy = sum(p[1] for p in cluster) / len(cluster)
            if _dist(item[0], item[1], cx, cy) <= 12.0:
                cluster.append(item)
                placed = True
                break
        if not placed:
            clusters.append([item])
    clusters.sort(
        key=lambda c: _dist(
            sx, sy, sum(p[0] for p in c) / len(c), sum(p[1] for p in c) / len(c)
        )
    )

    roads = [
        r
        for r in (layout.get("roads") or [])
        if str(r.get("kind") or "").lower() in DRIVEABLE_ROAD_KINDS
    ]
    out: list[dict[str, Any]] = []
    used: list[tuple[float, float]] = []
    from cityview.survey import city_poles_xy, geometric_pole, pick_city_pole

    origin = layout.get("origin") or layout.get("survey_origin")
    poles = city_poles_xy(layout.get("survey") or {}, tuple(origin)) if origin else []
    used_poles: set[int] = set(layout.get("_usedPoles") or [])
    for cluster in clusters[:max_clusters]:
        jx = sum(p[0] for p in cluster) / len(cluster)
        jy = sum(p[1] for p in cluster) / len(cluster)
        approaches = junction_approaches(jx, jy, roads)
        if not approaches:
            hit = _runtime_nearest_road(jx, jy, roads)
            if hit is None:
                continue
            cx, cy, tx, ty, width = hit
            approaches = [
                {
                    "tx": tx,
                    "ty": ty,
                    "stop_x": cx - tx * 2.4,
                    "stop_y": cy - ty * 2.4,
                    "width": width,
                }
            ]
        for ap in approaches:
            stop_x, stop_y = float(ap["stop_x"]), float(ap["stop_y"])
            if any(_dist(stop_x, stop_y, ux, uy) < 5.5 for ux, uy in used):
                continue
            used.append((stop_x, stop_y))
            tx, ty = float(ap["tx"]), float(ap["ty"])
            width = float(ap["width"])
            rx, ry = ty, -tx
            pole_x = pole_y = None
            side = 1.0
            hit = pick_city_pole(stop_x, stop_y, rx, ry, width * 0.5, poles, roads, used_poles)
            if hit is not None:
                pole_x, pole_y, idx = hit
                used_poles.add(idx)
                side = 1.0 if (pole_x - stop_x) * rx + (pole_y - stop_y) * ry >= 0 else -1.0
            else:
                geo = geometric_pole(stop_x, stop_y, tx, ty, width, roads)
                if geo is None:
                    continue
                pole_x, pole_y, side = geo
            if in_carriageway(pole_x, pole_y, roads):
                continue
            yaw = vehicle_signal_yaw(tx, ty)
            ped_yaw = pedestrian_signal_yaw(rx, ry, side)
            out.append(
                {
                    "id": cluster[0][2],
                    "x": pole_x,
                    "y": pole_y,
                    "stopX": stop_x,
                    "stopY": stop_y,
                    "tx": tx,
                    "ty": ty,
                    "yaw": yaw,
                    "pedYaw": ped_yaw,
                    "width": width,
                    "kind": "traffic_signals",
                    "survey": hit is not None,
                }
            )
    layout["_usedPoles"] = sorted(used_poles)
    return out[:36]


def _runtime_nearest_road(
    px: float, py: float, roads: list[dict[str, Any]]
) -> tuple[float, float, float, float, float] | None:
    best: tuple[float, float, float, float, float, float] | None = None
    for road in roads:
        pts = road.get("points") or []
        width = float(road.get("width") or 6.0)
        for i in range(len(pts) - 1):
            ax, ay = float(pts[i][0]), float(pts[i][1])
            bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
            dx, dy = bx - ax, by - ay
            len2 = dx * dx + dy * dy
            if len2 < 1e-6:
                continue
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
            cx, cy = ax + t * dx, ay + t * dy
            dist = _dist(px, py, cx, cy)
            if best is None or dist < best[5]:
                length = math.sqrt(len2)
                best = (cx, cy, dx / length, dy / length, width, dist)
    if best is None:
        return None
    return best[0], best[1], best[2], best[3], best[4]


def export_transit_near_spawn(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    radius: float = 280.0,
    max_paths: int = 48,
    max_stops: int = 80,
    fallback_radius: float = 1500.0,
    fallback_paths: int = 8,
) -> dict[str, Any]:
    """Transit paths + stops near spawn for runtime trams/buses."""
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    path_scored: list[tuple[float, dict[str, Any]]] = []
    for line in layout.get("transit_lines") or []:
        pts = line.get("points") or []
        if len(pts) < 2:
            continue
        # Premetro/tunnel ways are underground: runtime vehicles must not
        # drive them at street level.
        if line.get("tunnel"):
            continue
        dmin = min(_dist(sx, sy, float(p[0]), float(p[1])) for p in pts)
        if dmin > fallback_radius:
            continue
        lines = list(line.get("lines") or line.get("refs") or [])
        direction = _direction_code(line.get("direction"))
        source = "relation" if direction else "none"
        if not direction and line.get("source") == "gtfs":
            # GTFS shapes are ordered stop-to-stop: always driven along their points.
            direction, source = 1, "gtfs"
        path_scored.append(
            (
                dmin,
                {
                    "id": line.get("id"),
                    "mode": line.get("mode") or "bus",
                    "lines": lines,
                    # Vehicles may only drive `points` forward (1) / backward (-1); 0 = both.
                    "direction": direction,
                    "directionSource": source,
                    "points": [[float(p[0]), float(p[1])] for p in pts],
                },
            )
        )
    path_scored.sort(key=lambda item: item[0])
    near = [item for item in path_scored if item[0] <= radius]
    near_modes = {item[1]["mode"] for item in near}
    # A mode with no line near spawn (Kiel's trams run ~400 m away) still gets its nearest
    # lines, so the district keeps every mode it really has.
    for mode in sorted({item[1]["mode"] for item in path_scored} - near_modes):
        near += [item for item in path_scored if item[1]["mode"] == mode][:fallback_paths]
    near.sort(key=lambda item: item[0])
    chosen_paths = [item[1] for item in near[:max_paths]]
    # Undirected tram tracks: a parallel partner (right-hand traffic) fixes the direction.
    infer_parallel_track_directions([p for p in chosen_paths if p["mode"] in {"tram", "subway"}])

    def _stop_near_paths(x: float, y: float, thresh: float = 35.0) -> bool:
        for path in chosen_paths:
            pts = path.get("points") or []
            for p in pts[:: max(1, len(pts) // 16)]:
                if _dist(x, y, float(p[0]), float(p[1])) <= thresh:
                    return True
        return False

    stop_scored: list[tuple[float, dict[str, Any]]] = []
    for stop in layout.get("transit_stops") or []:
        x = float(stop.get("x") or 0.0)
        y = float(stop.get("y") or 0.0)
        d = _dist(sx, sy, x, y)
        # Keep stops near spawn, or anywhere along an exported path (for halt dwell).
        if d > radius and not _stop_near_paths(x, y):
            continue
        stop_scored.append(
            (
                d,
                {
                    "id": stop.get("id"),
                    "mode": stop.get("mode") or "bus",
                    "name": stop.get("name") or "",
                    "lines": list(stop.get("lines") or stop.get("refs") or []),
                    "x": x,
                    "y": y,
                },
            )
        )
    stop_scored.sort(key=lambda item: item[0])
    origin = layout.get("origin")
    origin_t = (float(origin[0]), float(origin[1])) if origin and len(origin) >= 2 else None
    return {
        "spawn": {"x": sx, "y": sy},
        "radius": radius,
        "paths": chosen_paths,
        "stops": [item[1] for item in stop_scored[:max_stops]],
        "boards": export_boards(layout, spawn, origin=origin_t, radius=max(radius, 320.0)),
    }


# City wachthuisje / OSM shelter is the bus stop. Do not invent a pole+roof
# at every GTFS/OSM bus node. Tram still gets a slim pole+sign (no roof).
BOARD_NEAR_STOP_M = 14.0
CITY_MARKET_M = 420.0
DEFAULT_CITY_FACTS = (
    {"k": "Zone 30", "v": "Most streets in the centre"},
    {"k": "Velo", "v": "City bikes at the yellow racks"},
    {"k": "De Lijn", "v": "Tram and bus times at the shelters"},
)


def invent_stop_furniture(stop: dict[str, Any]) -> str | None:
    """What Blender may invent at an OSM/GTFS halt. ``None`` = surveyed furniture only."""
    mode = str(stop.get("mode") or "bus").lower()
    if mode in {"tram", "subway"}:
        return "sign"
    return None


def _nearest_stop(
    x: float, y: float, stops: list[dict[str, Any]], max_d: float
) -> tuple[dict[str, Any] | None, float]:
    best: dict[str, Any] | None = None
    best_d = max_d
    for st in stops:
        d = _dist(x, y, float(st.get("x") or 0.0), float(st.get("y") or 0.0))
        if d < best_d:
            best_d = d
            best = st
    return best, best_d


def _city_board_info(
    x: float,
    y: float,
    layout: dict[str, Any],
    origin: tuple[float, float] | None,
) -> dict[str, Any]:
    facts: list[dict[str, str]] = []
    survey = layout.get("survey") or {}
    layers = survey.get("layers") or {}
    if origin and layers.get("markets"):
        from cityview.survey import export_markets

        for market in export_markets(layers, origin):
            mx, my = float(market.get("x") or 0.0), float(market.get("y") or 0.0)
            if _dist(x, y, mx, my) > CITY_MARKET_M:
                continue
            days = " · ".join(str(d) for d in (market.get("days") or []) if d)
            hours = " ".join(p for p in (market.get("from") or "", market.get("until") or "") if p)
            when = " · ".join(p for p in (days, hours) if p)
            name = str(market.get("name") or "Markt")
            facts.append({"k": "Markt", "v": f"{name}{(' · ' + when) if when else ''}"})
            if len(facts) >= 2:
                break
    if not facts:
        facts = [dict(row) for row in DEFAULT_CITY_FACTS]
    return {"title": "Leven in de stad", "facts": facts}


def export_boards(
    layout: dict[str, Any],
    spawn: dict[str, Any] | None,
    *,
    origin: tuple[float, float] | None = None,
    radius: float = 320.0,
    max_boards: int = 96,
) -> list[dict[str, Any]]:
    """Real boards you can walk up to: city info plates, shelters, posters, tram signs."""
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    stops = list(layout.get("transit_stops") or [])
    boards: list[dict[str, Any]] = []
    used: set[tuple[int, int]] = set()

    def _take(x: float, y: float) -> bool:
        key = (round(x * 4), round(y * 4))
        if key in used:
            return False
        used.add(key)
        return True

    def _with_stop(rec: dict[str, Any], stop: dict[str, Any] | None) -> dict[str, Any]:
        if not stop:
            return rec
        rec["stopId"] = stop.get("id")
        rec["stopName"] = stop.get("name") or ""
        rec["mode"] = stop.get("mode") or rec.get("mode") or "bus"
        rec["lines"] = list(stop.get("lines") or stop.get("refs") or [])
        return rec

    for rec in layout.get("clutter") or []:
        kind = rec.get("kind")
        if kind not in {"city_board", "poster", "shelter"}:
            continue
        x = float(rec.get("x") or 0.0)
        y = float(rec.get("y") or 0.0)
        if spawn and _dist(sx, sy, x, y) > radius:
            continue
        if not _take(x, y):
            continue
        stop, _d = _nearest_stop(x, y, stops, BOARD_NEAR_STOP_M)
        if kind == "poster" and stop is None:
            continue
        board: dict[str, Any] = {
            "kind": kind,
            "x": round(x, 2),
            "y": round(y, 2),
            "yaw": float(rec.get("yaw") or 0.0),
        }
        if kind == "city_board":
            board["info"] = _city_board_info(x, y, layout, origin)
        else:
            _with_stop(board, stop)
        boards.append(board)

    for stop in stops:
        if invent_stop_furniture(stop) != "sign":
            continue
        x = float(stop.get("x") or 0.0)
        y = float(stop.get("y") or 0.0)
        if spawn and _dist(sx, sy, x, y) > radius:
            continue
        shelter_near, _d = _nearest_stop(
            x,
            y,
            [
                {"x": b["x"], "y": b["y"]}
                for b in boards
                if b.get("kind") in {"shelter", "poster"}
            ],
            8.0,
        )
        if shelter_near is not None:
            continue
        if not _take(x, y):
            continue
        boards.append(
            _with_stop(
                {
                    "kind": "tram_sign",
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "yaw": 0.0,
                },
                stop,
            )
        )

    boards.sort(key=lambda b: _dist(sx, sy, float(b["x"]), float(b["y"])))
    return boards[:max_boards]


def spawn_from_place(
    place: dict[str, Any],
    origin: tuple[float, float],
    layout: dict[str, Any],
) -> dict[str, Any] | None:
    """Project place.spawn lat/lon into local metres with human eye height.

    The OSM address point is usually the building centroid — we snap onto the
    nearest road centreline so the human camera is in the street, not inside a wall.
    """
    from cityview.geo import project

    spawn = place.get("spawn")
    if not spawn:
        return None
    lat = float(spawn["lat"])
    lon = float(spawn["lon"])
    bx, by = project(lat, lon, origin[0], origin[1])
    eye = float(spawn.get("eye_height", 1.7))
    roads = layout.get("roads") or []
    # Plazas / parks: keep the WGS84 point (do not pull onto a carriageway).
    snap_road = bool(spawn.get("snap_road", True))
    if not snap_road:
        x, y = bx, by
        if "yaw" in spawn:
            yaw = float(spawn["yaw"])
        else:
            _sx, _sy, yaw = nearest_road_pose(bx, by, roads)
    elif "yaw" in spawn:
        x, y, _auto_yaw = nearest_road_pose(bx, by, roads)
        yaw = float(spawn["yaw"])
    else:
        x, y, yaw = nearest_road_pose(bx, by, roads)
    return {
        "label": spawn.get("label") or "spawn",
        "lat": lat,
        "lon": lon,
        "x": x,
        "y": y,
        "z": eye,
        "yaw": yaw,
        "eye_height": eye,
        "building_xy": [bx, by],
    }
