"""Kerb / pavement trimming at street mouths and the 3-D kerb profile maths.

Pure stdlib (no bpy) so ``blender/build_city.py`` can use it inside Blender and the
unit tests can run without it.

Why: kerbs and pavement ribbons are laid parallel to every road. Where a side street
joins, the main road's ribbon would run straight across the mouth of that street.
With a flat 8 cm bump that was barely noticeable; with a real 12 cm kerb and a raised
pavement it reads as a wall across the junction. ``split_at_carriageways`` cuts the
ribbon centreline wherever it enters another road's carriageway at a real angle (so
gentle bends of the *same* street, whose neighbouring way starts right at the node,
never cut), leaving the mouth open like a dropped kerb.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Callable, Iterable

NON_CARRIAGEWAY = frozenset({"footway", "path", "cycleway", "steps", "pedestrian", "track"})

# Vertical profile (metres above the world datum; road surface is ~0.04).
Z_ROAD_SURFACE = 0.04
KERB_TOP = 0.15  # ~11 cm reveal above the asphalt (Antwerp natuursteen kerbs run 10-14 cm)
PAVEMENT_TOP = 0.12  # pavement just under the kerb top; keeps surveyed benches' seat height sane
KERB_WIDTH = 0.28
# Pavement runs from the kerb to the doorstep. A fixed 2 m ribbon leaves a
# trench of bare ground wherever the façade sits further back (Mechelsesteenweg
# is ~4–6 m from the carriageway edge). Beyond this, leave the gap — a square
# or park, not a pavement.
FRONTAGE_NOMINAL_M = 2.0
FRONTAGE_MAX_FROM_EDGE_M = 8.0
FRONTAGE_TUCK_M = 0.22  # slip under the façade skin so the tiles meet the door
FRONTAGE_MIN_W_M = 0.75
FRONTAGE_SAMPLE_M = 1.35
MIN_CROSS_ANGLE_SIN = math.sin(math.radians(35.0))
CELL = 40.0


def _seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    if len2 < 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


class CarriagewayIndex:
    """Grid index of driveable road segments (centreline + half width)."""

    def __init__(self, roads: Iterable[dict]):
        self.segments: list[tuple[float, float, float, float, float, int]] = []
        self._grid: dict[tuple[int, int], list[int]] = defaultdict(list)
        for ri, road in enumerate(roads):
            if (road.get("kind") or "residential") in NON_CARRIAGEWAY:
                continue
            pts = road.get("points") or []
            half = float(road.get("width") or 6.0) * 0.5
            for i in range(len(pts) - 1):
                ax, ay = float(pts[i][0]), float(pts[i][1])
                bx, by = float(pts[i + 1][0]), float(pts[i + 1][1])
                if math.hypot(bx - ax, by - ay) < 0.05:
                    continue
                idx = len(self.segments)
                self.segments.append((ax, ay, bx, by, half, ri))
                pad = half + 1.0
                gx0, gx1 = int((min(ax, bx) - pad) // CELL), int((max(ax, bx) + pad) // CELL)
                gy0, gy1 = int((min(ay, by) - pad) // CELL), int((max(ay, by) + pad) // CELL)
                for gx in range(gx0, gx1 + 1):
                    for gy in range(gy0, gy1 + 1):
                        self._grid[(gx, gy)].append(idx)

    def __bool__(self) -> bool:
        return bool(self.segments)

    def blocked(
        self, x: float, y: float, tx: float, ty: float, margin: float, exclude: int | None = None
    ) -> bool:
        """True if (x, y) lies inside another road's carriageway (+margin) that meets
        the ribbon tangent (tx, ty) at a genuine angle (> ~35 degrees)."""
        for si in self._grid.get((int(x // CELL), int(y // CELL)), ()):
            ax, ay, bx, by, half, ri = self.segments[si]
            if ri == exclude:
                continue
            if _seg_dist(x, y, ax, ay, bx, by) >= half + margin:
                continue
            sl = math.hypot(bx - ax, by - ay)
            cross = abs((bx - ax) * ty - (by - ay) * tx) / sl  # sin of the angle between them
            if cross >= MIN_CROSS_ANGLE_SIN:
                return True
        return False

    def contains(self, x: float, y: float, margin: float = 0.0, exclude: int | None = None) -> bool:
        """True inside another road's carriageway, parallel roads included.

        ``blocked`` ignores gentle angles so a street is not cut by its own
        continuation. Frontage paving needs the opposite test: a parallel
        carriageway (the other half of a boulevard) must stop the pavement
        before it crosses the median.
        """
        for si in self._grid.get((int(x // CELL), int(y // CELL)), ()):
            ax, ay, bx, by, half, ri = self.segments[si]
            if ri == exclude:
                continue
            if _seg_dist(x, y, ax, ay, bx, by) < half + margin:
                return True
        return False


def _densify(points: list[list[float]], step: float) -> list[list[float]]:
    out = [[float(points[0][0]), float(points[0][1])]]
    for i in range(len(points) - 1):
        ax, ay = float(points[i][0]), float(points[i][1])
        bx, by = float(points[i + 1][0]), float(points[i + 1][1])
        n = max(1, int(math.ceil(math.hypot(bx - ax, by - ay) / step)))
        for k in range(1, n + 1):
            t = k / n
            out.append([ax + (bx - ax) * t, ay + (by - ay) * t])
    return out


def split_at_carriageways(
    points: list[list[float]],
    index: CarriagewayIndex,
    own_road: int | None,
    margin: float,
    step: float = 1.5,
) -> list[list[list[float]]]:
    """Split a ribbon centreline into runs that stay out of crossing carriageways.

    ``margin`` is added to the other road's half width (negative: allow a little
    overlap, so a kerb stops at the crossing road's edge rather than inside it).
    A polyline that never meets another road is returned untouched.
    """
    if len(points) < 2:
        return []
    if not index:
        return [points]
    dense = _densify(points, step)
    flags: list[bool] = []
    for i, (x, y) in enumerate(dense):
        j0, j1 = max(0, i - 1), min(len(dense) - 1, i + 1)
        tx, ty = dense[j1][0] - dense[j0][0], dense[j1][1] - dense[j0][1]
        tl = math.hypot(tx, ty) or 1.0
        flags.append(index.blocked(x, y, tx / tl, ty / tl, margin, own_road))
    if not any(flags):
        return [points]
    runs: list[list[list[float]]] = []
    cur: list[list[float]] = []
    for p, bad in zip(dense, flags):
        if bad:
            if len(cur) >= 2:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) >= 2:
        runs.append(cur)
    return runs


def kerb_strips(
    points: list[list[float]], width: float, road_side_left: bool
) -> tuple[list[tuple[float, float]], list[tuple[float, float]], list[float]]:
    """Left/right edge points of a ribbon and cumulative distance along it.

    ``road_side_left`` only documents which edge faces the carriageway; callers
    index ``left`` / ``right`` accordingly.
    """
    half = width / 2.0
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    along = [0.0]
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[1][0] - x, points[1][1] - y
        elif i == len(points) - 1:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
        else:
            dx, dy = points[i + 1][0] - points[i - 1][0], points[i + 1][1] - points[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        left.append((x + nx * half, y + ny * half))
        right.append((x - nx * half, y - ny * half))
        if i:
            along.append(along[-1] + math.hypot(x - points[i - 1][0], y - points[i - 1][1]))
    return left, right, along


def kerb_profile(
    points: list[list[float]],
    width: float,
    z_bottom: float,
    z_top: float,
    road_edge_is_left: bool,
    uv_tile_m: float = 1.6,
) -> tuple[list[tuple[float, float, float]], list[list[int]], list[tuple[float, float]], list[int]]:
    """Closed kerb prism along ``points``: top face, road-facing face, pavement-facing
    face and two end caps. Returns (verts, faces, per-loop uv list parallel to faces'
    flattened vertex order, face kinds 0=top 1=road face 2=walk face 3=cap).

    Faces are wound so their normals point away from the prism.
    """
    left, right, along = kerb_strips(points, width, road_edge_is_left)
    n = len(points)
    inv = 1.0 / max(uv_tile_m, 0.1)
    verts: list[tuple[float, float, float]] = []
    for (lx, ly), (rx, ry) in zip(left, right):
        verts += [(lx, ly, z_top), (rx, ry, z_top), (lx, ly, z_bottom), (rx, ry, z_bottom)]
    # per point i: 4i = L top, 4i+1 = R top, 4i+2 = L bottom, 4i+3 = R bottom
    faces: list[list[int]] = []
    uvs: list[tuple[float, float]] = []
    kinds: list[int] = []
    h = max(0.01, z_top - z_bottom)
    for i in range(n - 1):
        a, b = 4 * i, 4 * (i + 1)
        u0, u1 = along[i] * inv, along[i + 1] * inv
        # Travelling +x with left = +y.  Top (CCW from above): R_i, R_j, L_j, L_i.
        faces.append([a + 1, b + 1, b, a])
        uvs += [(u0, 0.0), (u1, 0.0), (u1, width * inv), (u0, width * inv)]
        kinds.append(0)
        # Left face, outward +y: top_i, top_j, bottom_j, bottom_i.
        faces.append([a, b, b + 2, a + 2])
        uvs += [(u0, h * inv), (u1, h * inv), (u1, 0.0), (u0, 0.0)]
        kinds.append(1 if road_edge_is_left else 2)
        # Right face, outward -y: top_i, bottom_i, bottom_j, top_j.
        faces.append([a + 1, a + 3, b + 3, b + 1])
        uvs += [(u0, h * inv), (u0, 0.0), (u1, 0.0), (u1, h * inv)]
        kinds.append(2 if road_edge_is_left else 1)
    cap_uv = [(0.0, h * inv), (0.0, 0.0), (width * inv, 0.0), (width * inv, h * inv)]
    a = 0
    faces.append([a, a + 2, a + 3, a + 1])  # start cap, outward -x
    uvs += cap_uv
    kinds.append(3)
    b = 4 * (n - 1)
    faces.append([b + 1, b + 3, b + 2, b])  # end cap, outward +x
    uvs += cap_uv
    kinds.append(3)
    return verts, faces, uvs, kinds


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            inside = not inside
    return inside


class FootprintIndex:
    """Building rings for 'how far to the façade?' rays. Holes are ignored:
    a street ray hits the outer wall first."""

    CELL = 30.0

    def __init__(self, rings: Iterable[list[list[float]]]):
        self.rings: list[list[list[float]]] = []
        self._grid: dict[tuple[int, int], list[int]] = defaultdict(list)
        c = self.CELL
        for ring in rings:
            if len(ring) < 3:
                continue
            idx = len(self.rings)
            pts = [[float(p[0]), float(p[1])] for p in ring]
            self.rings.append(pts)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            for gx in range(int(math.floor(min(xs) / c)), int(math.floor(max(xs) / c)) + 1):
                for gy in range(int(math.floor(min(ys) / c)), int(math.floor(max(ys) / c)) + 1):
                    self._grid[(gx, gy)].append(idx)

    def __bool__(self) -> bool:
        return bool(self.rings)

    def ray(self, x: float, y: float, dx: float, dy: float, max_t: float) -> float:
        """Distance along unit (dx, dy) to the first wall. 0 if inside, inf if none."""
        ex, ey = x + dx * max_t, y + dy * max_t
        c = self.CELL
        best = math.inf
        seen: set[int] = set()
        gx0, gx1 = int(math.floor(min(x, ex) / c)), int(math.floor(max(x, ex) / c))
        gy0, gy1 = int(math.floor(min(y, ey) / c)), int(math.floor(max(y, ey) / c))
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                for i in self._grid.get((gx, gy), ()):
                    if i in seen:
                        continue
                    seen.add(i)
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


def _frames(points: list[list[float]], step: float) -> list[tuple[float, float, float, float]]:
    """(x, y, tx, ty) along ``points``, at every vertex and at most ``step`` apart."""
    if len(points) < 2:
        return []
    out: list[tuple[float, float, float, float]] = []
    for i in range(len(points) - 1):
        ax, ay = float(points[i][0]), float(points[i][1])
        bx, by = float(points[i + 1][0]), float(points[i + 1][1])
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        if seg < 1e-6:
            continue
        tx, ty = dx / seg, dy / seg
        n = max(1, int(math.ceil(seg / step)))
        for k in range(n):
            t = k / n
            out.append((ax + dx * t, ay + dy * t, tx, ty))
    lx, ly = float(points[-1][0]), float(points[-1][1])
    px, py = float(points[-2][0]), float(points[-2][1])
    dx, dy = lx - px, ly - py
    seg = math.hypot(dx, dy) or 1.0
    out.append((lx, ly, dx / seg, dy / seg))
    return out


def _foreign_distance(
    x: float,
    y: float,
    ox: float,
    oy: float,
    start: float,
    end: float,
    index: CarriagewayIndex | None,
    own_road: int | None,
) -> float:
    """Distance from the centreline along the outward normal to another carriageway."""
    if index is None or not index or end <= start:
        return math.inf
    d = start
    while d <= end + 1e-6:
        if index.contains(x + ox * d, y + oy * d, 0.05, own_road):
            return d
        d += 0.5
    return math.inf


def _split_pair(
    inner: list[list[float]], outer: list[list[float]], max_len: float
) -> list[tuple[list[list[float]], list[list[float]]]]:
    if len(inner) < 2:
        return []
    out: list[tuple[list[list[float]], list[list[float]]]] = []
    cur_i = [inner[0]]
    cur_o = [outer[0]]
    acc = 0.0
    for i in range(1, len(inner)):
        acc += math.hypot(inner[i][0] - inner[i - 1][0], inner[i][1] - inner[i - 1][1])
        cur_i.append(inner[i])
        cur_o.append(outer[i])
        if acc >= max_len and i < len(inner) - 1:
            out.append((cur_i, cur_o))
            cur_i, cur_o, acc = [inner[i]], [outer[i]], 0.0
    if len(cur_i) >= 2:
        out.append((cur_i, cur_o))
    return out


def frontage_sidewalk_runs(
    points: list[list[float]],
    half_width: float,
    sign: float,
    footprints: FootprintIndex | None,
    carriageways: CarriagewayIndex | None,
    own_road: int | None,
    *,
    nominal: float = FRONTAGE_NOMINAL_M,
    max_from_edge: float = FRONTAGE_MAX_FROM_EDGE_M,
    tuck: float = FRONTAGE_TUCK_M,
    min_width: float = FRONTAGE_MIN_W_M,
    sample: float = FRONTAGE_SAMPLE_M,
    extra_blocked: Callable[[float, float], bool] | None = None,
) -> list[tuple[list[list[float]], list[list[float]]]]:
    """Pavement from the kerb to the nearest façade.

    Each run is ``(kerb_edge, wall_edge)`` in the same XY as ``points``.
    ``sign`` +1 is left of travel, −1 is right — the same convention as
    ``offset_polyline``. Where no façade stands within ``max_from_edge``, the
    strip keeps the nominal width. A façade across another carriageway (the far
    side of a boulevard, or a house past a side-street mouth) does not pull the
    pavement across the road. Samples whose nominal ribbon sits in a crossing
    carriageway are dropped, so the junction mouth stays open.
    """
    if len(points) < 2 or half_width <= 0:
        return []
    max_d = half_width + max_from_edge
    nom_d = half_width + nominal
    runs: list[tuple[list[list[float]], list[list[float]]]] = []
    inner: list[list[float]] = []
    outer: list[list[float]] = []

    def flush() -> None:
        if len(inner) >= 2:
            # Short pieces stay under the viewer's ground-ray size cap (~200 m).
            runs.extend(_split_pair(inner, outer, 80.0))
        inner.clear()
        outer.clear()

    for x, y, tx, ty in _frames(points, sample):
        lx, ly = -ty, tx  # left of travel
        ox, oy = lx * sign, ly * sign
        reach = max_d + tuck + 0.4
        hit = footprints.ray(x, y, ox, oy, reach) if footprints else math.inf
        foreign = _foreign_distance(x, y, ox, oy, half_width + 0.25, reach, carriageways, own_road)
        if footprints and 0.4 < hit <= max_d and hit + tuck < foreign - 0.15:
            outer_d = min(max_d, hit + tuck)
        else:
            outer_d = nom_d if foreign > nom_d + 0.15 else max(half_width + 0.2, foreign - 0.25)
        if extra_blocked is not None and outer_d > nom_d + 0.05:
            d = nom_d
            while d <= outer_d + 1e-6:
                if extra_blocked(x + ox * d, y + oy * d):
                    outer_d = nom_d
                    break
                d += 0.6
        width = outer_d - half_width
        cx = x + ox * (half_width + nominal * 0.5)
        cy = y + oy * (half_width + nominal * 0.5)
        bad = width < min_width
        if not bad and carriageways and carriageways.blocked(cx, cy, tx, ty, 0.0, own_road):
            bad = True
        if not bad and extra_blocked is not None and extra_blocked(cx, cy):
            bad = True
        if bad:
            flush()
            continue
        inner.append([x + ox * half_width, y + oy * half_width])
        outer.append([x + ox * outer_d, y + oy * outer_d])
    flush()
    return runs


def sidewalk_strip(
    inner: list[list[float]],
    outer: list[list[float]],
    z: float,
    uv_tile_m: float = 2.4,
) -> tuple[list[tuple[float, float, float]], list[list[int]], list[tuple[float, float]]] | None:
    """Flat pavement between two polylines. Faces wind so the normal is +Z."""
    n = min(len(inner), len(outer))
    if n < 2:
        return None
    verts: list[tuple[float, float, float]] = []
    for i in range(n):
        verts.append((float(inner[i][0]), float(inner[i][1]), z))
        verts.append((float(outer[i][0]), float(outer[i][1]), z))
    faces: list[list[int]] = []
    uvs: list[tuple[float, float]] = []
    inv = 1.0 / max(uv_tile_m, 0.1)
    along = 0.0
    for i in range(n - 1):
        a, b = 2 * i, 2 * (i + 1)
        faces.append([a, b, b + 1, a + 1])  # inner_i, inner_next, outer_next, outer_i
        w0 = math.hypot(outer[i][0] - inner[i][0], outer[i][1] - inner[i][1])
        w1 = math.hypot(outer[i + 1][0] - inner[i + 1][0], outer[i + 1][1] - inner[i + 1][1])
        seg = math.hypot(inner[i + 1][0] - inner[i][0], inner[i + 1][1] - inner[i][1])
        u0, u1 = along * inv, (along + seg) * inv
        uvs += [(u0, 0.0), (u1, 0.0), (u1, w1 * inv), (u0, w0 * inv)]
        along += seg
    # Right-hand side of a +x road points the quad downward; flip the whole strip.
    ax, ay, _az = verts[faces[0][0]]
    bx, by, _bz = verts[faces[0][1]]
    cx, cy, _cz = verts[faces[0][2]]
    nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if nz < 0.0:
        faces = [list(reversed(f)) for f in faces]
        uvs = [uvs[i : i + 4][::-1] for i in range(0, len(uvs), 4)]
        uvs = [uv for face in uvs for uv in face]
    return verts, faces, uvs
