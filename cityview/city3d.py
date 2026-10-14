"""Antwerpen in 3D: LOD2 buildings from the city's open CityJSON, per statistical sector.

Source: ``https://s3-ant1.antwerpen.be/prd-3d/3d.geojson`` indexes 320 statistical
sectors; each sector ships ``3D/json/seccode_<SECCODE>.city.json`` (CityJSON 2.0,
EPSG:31370 Belgian Lambert 72, integer vertices with ``transform.scale = 0.001``).
Every building is an LOD2 ``Solid`` with Roof/Wall/GroundSurface semantics plus GRB
attributes (``POSTCODE``, ``StoreysAGr``, ``RoofType``, ``Height_max``, ``ZMIN`` …).

Sectors are only download units. Buildings are assigned to a district by their own
``POSTCODE`` attribute, reprojected into the district's local metres, flattened so the
ground sits at z = 0 (``z - ZMIN``), and stripped of party walls hidden by a
neighbour. The result plugs into ``osm.layout_from_osm(city3d=…)``.
"""

from __future__ import annotations

import json
import math
import ssl
import urllib.parse
import urllib.request
import zlib
from pathlib import Path
from typing import Any, Iterable

from cityview.geo import project
from cityview.paths import ASSETS

SECTOR_INDEX_URL = "https://s3-ant1.antwerpen.be/prd-3d/3d.geojson"
CITYJSON_URL = "https://s3-ant1.antwerpen.be/prd-open-data-datatank/3D/json/seccode_{seccode}.city.json"
CACHE_DIR = ASSETS / "antwerp3d"
SECTOR_INDEX_PATH = CACHE_DIR / "3d.geojson"
_USER_AGENT = "metropolis/0.1 (Antwerp procedural city)"

# Ids for LOD2 buildings: clear of OSM way ids (< 2e9) and the 9e8 custom landmark range.
CITY3D_ID_BASE = 6_000_000_000

# A wall is hidden when a neighbour's eaves reach this close to the wall top (metres).
PARTY_WALL_HIDE_SLACK = 0.25
# Footprint edge must lie within this distance of the wall line to count as shared.
PARTY_WALL_LINE_TOL = 0.25
# Share of the wall length that must be covered by the neighbour's edge.
PARTY_WALL_COVER = 0.9
# Lowest vertex this far above the ground = floating part (passage underneath).
FLOATING_MIN_Z = 2.0

# ---------------------------------------------------------------------------
# Belgian Lambert 72 (EPSG:31370) -> WGS84
# ---------------------------------------------------------------------------

_HAYFORD_A = 6378388.0
_HAYFORD_F = 1.0 / 297.0
_WGS_A = 6378137.0
_WGS_F = 1.0 / 298.257223563
_L72_LAT1 = math.radians(49.8333339)
_L72_LAT2 = math.radians(51.16666723333333)
_L72_LON0 = math.radians(4.367486666666666)
_L72_X0 = 150000.013
_L72_Y0 = 5400088.438
# Belge 1972 -> WGS84, position-vector Helmert (EPSG:15929; arcsec, ppm).
_HELMERT = (-106.8686, 52.2978, -103.7239, 0.3366, -0.457, 1.8422, -1.2747)


def _lcc_consts() -> tuple[float, float, float]:
    e = math.sqrt(_HAYFORD_F * (2 - _HAYFORD_F))

    def m(phi: float) -> float:
        return math.cos(phi) / math.sqrt(1 - (e * math.sin(phi)) ** 2)

    def t(phi: float) -> float:
        s = math.sin(phi)
        return math.tan(math.pi / 4 - phi / 2) / ((1 - e * s) / (1 + e * s)) ** (e / 2)

    n = (math.log(m(_L72_LAT1)) - math.log(m(_L72_LAT2))) / (math.log(t(_L72_LAT1)) - math.log(t(_L72_LAT2)))
    big_f = m(_L72_LAT1) / (n * t(_L72_LAT1) ** n)
    return e, n, big_f


_E, _N, _F = _lcc_consts()


def _geodetic_to_ecef(lat: float, lon: float, h: float, a: float, f: float) -> tuple[float, float, float]:
    e2 = f * (2 - f)
    s = math.sin(lat)
    nu = a / math.sqrt(1 - e2 * s * s)
    return (
        (nu + h) * math.cos(lat) * math.cos(lon),
        (nu + h) * math.cos(lat) * math.sin(lon),
        (nu * (1 - e2) + h) * s,
    )


def _ecef_to_geodetic(x: float, y: float, z: float, a: float, f: float) -> tuple[float, float]:
    e2 = f * (2 - f)
    lon = math.atan2(y, x)
    p = math.hypot(x, y)
    lat = math.atan2(z, p * (1 - e2))
    for _ in range(6):
        s = math.sin(lat)
        nu = a / math.sqrt(1 - e2 * s * s)
        h = p / math.cos(lat) - nu
        lat = math.atan2(z, p * (1 - e2 * nu / (nu + h)))
    return lat, lon


def lambert72_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """EPSG:31370 metres -> (lat, lon) WGS84 degrees (sub-metre accuracy)."""
    dx = x - _L72_X0
    dy = _L72_Y0 - y  # rho0 - (y - y0) with rho0 = a F t(90°)^n = 0 … plus y0 offset
    rho = math.copysign(math.hypot(dx, dy), _N)
    t = (rho / (_HAYFORD_A * _F)) ** (1 / _N)
    theta = math.atan2(dx, dy)
    lon = theta / _N + _L72_LON0
    lat = math.pi / 2 - 2 * math.atan(t)
    for _ in range(8):
        s = math.sin(lat)
        lat = math.pi / 2 - 2 * math.atan(t * ((1 - _E * s) / (1 + _E * s)) ** (_E / 2))
    tx, ty, tz, rx, ry, rz, ds = _HELMERT
    rx, ry, rz = (math.radians(v / 3600.0) for v in (rx, ry, rz))
    k = 1 + ds * 1e-6
    X, Y, Z = _geodetic_to_ecef(lat, lon, 0.0, _HAYFORD_A, _HAYFORD_F)
    X2 = tx + k * (X - rz * Y + ry * Z)
    Y2 = ty + k * (rz * X + Y - rx * Z)
    Z2 = tz + k * (-ry * X + rx * Y + Z)
    lat_w, lon_w = _ecef_to_geodetic(X2, Y2, Z2, _WGS_A, _WGS_F)
    return math.degrees(lat_w), math.degrees(lon_w)


class AffineL72:
    """Least-squares affine Lambert 72 -> district local metres over one sector extent.

    Lambert 72 is conformal and the local tangent plane is near-linear at sector scale
    (≲ 2 km), so a 5×5 control grid fit stays well under a centimetre while avoiding
    per-vertex trigonometry for millions of vertices.
    """

    def __init__(self, extent: tuple[float, float, float, float], origin: tuple[float, float]) -> None:
        x0, y0, x1, y1 = extent
        rows: list[tuple[float, float, float, float]] = []
        for i in range(5):
            for j in range(5):
                lx = x0 + (x1 - x0) * i / 4
                ly = y0 + (y1 - y0) * j / 4
                lat, lon = lambert72_to_wgs84(lx, ly)
                ex, ny = project(lat, lon, origin[0], origin[1])
                rows.append((lx - x0, ly - y0, ex, ny))
        self.ox, self.oy = x0, y0
        self.cx = _lstsq3(rows, 2)
        self.cy = _lstsq3(rows, 3)
        self.max_err = max(
            math.hypot(self(r[0] + x0, r[1] + y0)[0] - r[2], self(r[0] + x0, r[1] + y0)[1] - r[3]) for r in rows
        )

    def __call__(self, x: float, y: float) -> tuple[float, float]:
        u, v = x - self.ox, y - self.oy
        a, b, c = self.cx
        d, e, f = self.cy
        return (a * u + b * v + c, d * u + e * v + f)


def _lstsq3(rows: list[tuple[float, float, float, float]], col: int) -> tuple[float, float, float]:
    """Solve [u v 1] · k = rows[col] in the least-squares sense (normal equations)."""
    s = [[0.0] * 3 for _ in range(3)]
    r = [0.0] * 3
    for row in rows:
        vec = (row[0], row[1], 1.0)
        for i in range(3):
            r[i] += vec[i] * row[col]
            for j in range(3):
                s[i][j] += vec[i] * vec[j]
    # Gaussian elimination.
    m = [s[i] + [r[i]] for i in range(3)]
    for i in range(3):
        piv = max(range(i, 3), key=lambda k: abs(m[k][i]))
        m[i], m[piv] = m[piv], m[i]
        for k in range(i + 1, 3):
            fct = m[k][i] / m[i][i]
            for j in range(i, 4):
                m[k][j] -= fct * m[i][j]
    out = [0.0] * 3
    for i in (2, 1, 0):
        out[i] = (m[i][3] - sum(m[i][j] * out[j] for j in range(i + 1, 3))) / m[i][i]
    return (out[0], out[1], out[2])


# ---------------------------------------------------------------------------
# Download + cache
# ---------------------------------------------------------------------------


_ALLOWED_HOSTS = {"s3-ant1.antwerpen.be"}


def _ssl_context() -> ssl.SSLContext:
    """Verified TLS; prefer certifi (the city S3 chains to HARICA, absent in some stores)."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _download(url: str, dest: Path, *, timeout: int = 180) -> Path:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_HOSTS:
        raise ValueError(f"refusing to fetch 3D data from {parsed.hostname!r}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:  # nosemgrep  (https + host allowlist)
        data = resp.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def load_sector_index(*, refresh: bool = False) -> list[dict[str, Any]]:
    """``[{seccode, name, rings: [[lon, lat]…]…}]`` for all 320 sectors."""
    if refresh or not SECTOR_INDEX_PATH.exists():
        _download(SECTOR_INDEX_URL, SECTOR_INDEX_PATH)
    doc = json.loads(SECTOR_INDEX_PATH.read_text())
    out = []
    for feat in doc.get("features") or []:
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        if geom.get("type") == "Polygon":
            rings = [geom["coordinates"][0]]
        else:
            rings = [poly[0] for poly in geom.get("coordinates") or []]
        out.append({"seccode": str(props.get("SECCODE")), "name": props.get("SECNAAM") or "", "rings": rings})
    return out


def sector_path(seccode: str) -> Path:
    return CACHE_DIR / "json" / f"seccode_{seccode}.city.json"


def fetch_sector(seccode: str, *, refresh: bool = False) -> dict[str, Any]:
    path = sector_path(seccode)
    if refresh or not path.exists():
        _download(CITYJSON_URL.format(seccode=seccode), path)
    return json.loads(path.read_text())


def _ring_bbox(ring: list[list[float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def _segments_intersect(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def rings_overlap(a: list[list[float]], b: list[list[float]]) -> bool:
    """True when two [lon, lat] rings intersect or one contains the other."""
    from cityview.districts import point_in_ring

    ax0, ay0, ax1, ay1 = _ring_bbox(a)
    bx0, by0, bx1, by1 = _ring_bbox(b)
    if ax1 < bx0 or bx1 < ax0 or ay1 < by0 or by1 < ay0:
        return False
    if point_in_ring(a[0][1], a[0][0], b) or point_in_ring(b[0][1], b[0][0], a):
        return True
    for i in range(len(a) - 1):
        for j in range(len(b) - 1):
            if _segments_intersect(a[i], a[i + 1], b[j], b[j + 1]):
                return True
    return False


def sectors_for_ring(ring: list[list[float]], *, refresh: bool = False) -> list[dict[str, Any]]:
    """Sectors whose polygon touches the district ring."""
    return [s for s in load_sector_index(refresh=refresh) if any(rings_overlap(r, ring) for r in s["rings"])]


def sector_postcode_votes(seccode: str) -> dict[str, int]:
    doc = fetch_sector(seccode)
    votes: dict[str, int] = {}
    for obj in (doc.get("CityObjects") or {}).values():
        pc = (obj.get("attributes") or {}).get("POSTCODE")
        if pc:
            votes[str(pc)] = votes.get(str(pc), 0) + 1
    return votes


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def polygon_area_2d(pts: Iterable[Iterable[float]]) -> float:
    p = [(q[0], q[1]) for q in pts]
    if len(p) < 3:
        return 0.0
    acc = 0.0
    for i in range(len(p)):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % len(p)]
        acc += x1 * y2 - x2 * y1
    return acc * 0.5


def _wall_segment(pts: list[tuple[float, float, float]]) -> tuple[tuple[float, float], tuple[float, float]]:
    """2D end points of a vertical wall polygon (farthest pair of its XY projections)."""
    best = (0.0, 0, 0)
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            d = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2
            if d > best[0]:
                best = (d, i, j)
    _, i, j = best
    return (pts[i][0], pts[i][1]), (pts[j][0], pts[j][1])


def _point_line_dist(p, a, b) -> tuple[float, float]:
    """(distance from p to line ab, projection parameter t along ab)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    ll = dx * dx + dy * dy
    if ll == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1]), 0.0
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / ll
    return abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / math.sqrt(ll), t


class _EdgeGrid:
    """Spatial hash of footprint edges (building index, a, b) for party-wall lookups."""

    CELL = 4.0

    def __init__(self) -> None:
        self.cells: dict[tuple[int, int], list[tuple[int, tuple[float, float], tuple[float, float]]]] = {}

    def add(self, idx: int, ring: list[list[float]]) -> None:
        n = len(ring)
        for i in range(n):
            a = (ring[i][0], ring[i][1])
            b = (ring[(i + 1) % n][0], ring[(i + 1) % n][1])
            for key in self._keys(a, b):
                self.cells.setdefault(key, []).append((idx, a, b))

    def _keys(self, a, b) -> set[tuple[int, int]]:
        c = self.CELL
        x0, x1 = sorted((a[0], b[0]))
        y0, y1 = sorted((a[1], b[1]))
        return {
            (ix, iy)
            for ix in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1)
            for iy in range(int(math.floor(y0 / c)), int(math.floor(y1 / c)) + 1)
        }

    def near(self, a, b) -> list[tuple[int, tuple[float, float], tuple[float, float]]]:
        seen: set[tuple[int, tuple[float, float], tuple[float, float]]] = set()
        out = []
        for key in self._keys(a, b):
            for item in self.cells.get(key, ()):
                if item not in seen:
                    seen.add(item)
                    out.append(item)
        return out


def _merge_spans(spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for lo, hi in sorted(spans):
        if out and lo <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], hi))
        else:
            out.append((lo, hi))
    return out


def _neighbour_spans(a, b, edges, self_idx: int) -> dict[int, list[tuple[float, float]]]:
    """Other buildings' footprint edges along segment ab, as merged [0, 1] spans per building."""
    if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05:
        return {}
    by_bldg: dict[int, list[tuple[float, float]]] = {}
    for idx, e0, e1 in edges:
        if idx == self_idx:
            continue
        d0, t0 = _point_line_dist(e0, a, b)
        d1, t1 = _point_line_dist(e1, a, b)
        if d0 > PARTY_WALL_LINE_TOL or d1 > PARTY_WALL_LINE_TOL:
            continue
        lo, hi = sorted((max(0.0, min(1.0, t0)), max(0.0, min(1.0, t1))))
        if hi > lo:
            by_bldg.setdefault(idx, []).append((lo, hi))
    return {k: _merge_spans(v) for k, v in by_bldg.items()}


def _covered(a, b, edges, self_idx: int) -> set[int]:
    """Indices of other buildings whose footprint edges cover segment ab."""
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    if length < 0.05:
        return set()
    by_bldg: dict[int, list[tuple[float, float]]] = {}
    for idx, e0, e1 in edges:
        if idx == self_idx:
            continue
        d0, t0 = _point_line_dist(e0, a, b)
        d1, t1 = _point_line_dist(e1, a, b)
        if d0 > PARTY_WALL_LINE_TOL or d1 > PARTY_WALL_LINE_TOL:
            continue
        lo, hi = sorted((max(0.0, min(1.0, t0)), max(0.0, min(1.0, t1))))
        if hi > lo:
            by_bldg.setdefault(idx, []).append((lo, hi))
    out = set()
    for idx, spans in by_bldg.items():
        spans.sort()
        cover = 0.0
        cur_lo, cur_hi = spans[0]
        for lo, hi in spans[1:]:
            if lo <= cur_hi:
                cur_hi = max(cur_hi, hi)
            else:
                cover += cur_hi - cur_lo
                cur_lo, cur_hi = lo, hi
        cover += cur_hi - cur_lo
        if cover >= PARTY_WALL_COVER:
            out.add(idx)
    return out


# ---------------------------------------------------------------------------
# CityJSON -> building records
# ---------------------------------------------------------------------------


def _roof_shape_from_type(roof_type: str) -> str:
    """GRB ``RoofType`` -> layout roof_shape (flat / gable / hip / lod2 for mixed forms)."""
    rt = (roof_type or "").lower()
    if "flat" in rt or "plat" in rt:
        return "flat"
    if "hip" in rt or "schild" in rt:
        return "hip"
    if "mansard" in rt:
        return "mansard"
    if "gable" in rt or "zadel" in rt or "sloped" in rt or "lessenaar" in rt or "shed" in rt:
        return "gable"
    return "lod2"


def _signed_volume(surfaces: list[list[list[int]]], verts: list[list[float]]) -> float:
    """Divergence-theorem volume of a shell (outer rings fanned); > 0 when wound outward."""
    vol = 0.0
    for surf in surfaces:
        ring = surf[0]
        if len(ring) < 3:
            continue
        x0, y0, z0 = verts[ring[0]]
        for k in range(1, len(ring) - 1):
            x1, y1, z1 = verts[ring[k]]
            x2, y2, z2 = verts[ring[k + 1]]
            vol += x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2)
    return vol / 6.0


def _parse_sector(
    doc: dict[str, Any],
    origin: tuple[float, float],
    postcode: str | None,
) -> tuple[list[dict[str, Any]], float]:
    tr = doc.get("transform") or {"scale": [1, 1, 1], "translate": [0, 0, 0]}
    sx, sy, sz = tr["scale"]
    tx, ty, tz = tr["translate"]
    verts = doc.get("vertices") or []
    ext = (doc.get("metadata") or {}).get("geographicalExtent")
    if ext:
        extent = (ext[0], ext[1], ext[3], ext[4])
    else:
        xs = [v[0] * sx + tx for v in verts] or [0.0]
        ys = [v[1] * sy + ty for v in verts] or [0.0]
        extent = (min(xs), min(ys), max(xs), max(ys))
    if extent[2] - extent[0] < 1 or extent[3] - extent[1] < 1:
        extent = (extent[0] - 50, extent[1] - 50, extent[2] + 50, extent[3] + 50)
    affine = AffineL72(extent, origin)
    out: list[dict[str, Any]] = []
    for key, obj in (doc.get("CityObjects") or {}).items():
        attrs = obj.get("attributes") or {}
        if postcode and str(attrs.get("POSTCODE") or "") != str(postcode):
            continue
        geoms = [g for g in obj.get("geometry") or [] if g.get("type") in {"Solid", "MultiSurface", "CompositeSurface"}]
        if not geoms:
            continue
        geom = max(geoms, key=lambda g: float(g.get("lod") or 0))
        zmin = float(attrs.get("ZMIN") or 0.0)
        local_idx: dict[int, int] = {}
        v_out: list[list[float]] = []

        def vid(i: int) -> int:
            j = local_idx.get(i)
            if j is None:
                vx, vy, vz = verts[i]
                lx, ly = affine(vx * sx + tx, vy * sy + ty)
                j = len(v_out)
                v_out.append([round(lx, 2), round(ly, 2), round(vz * sz + tz - zmin, 2)])
                local_idx[i] = j
            return j

        sem = geom.get("semantics") or {}
        surf_types = [s.get("type") for s in sem.get("surfaces") or []]
        values = sem.get("values")
        if geom["type"] == "Solid":
            shells = geom["boundaries"]
            vals = values or [[None] * len(sh) for sh in shells]
        else:
            shells = [geom["boundaries"]]
            vals = [values or [None] * len(geom["boundaries"])]
        roofs: list[list[list[int]]] = []
        walls: list[list[list[int]]] = []
        grounds: list[list[list[int]]] = []
        for shell, svals in zip(shells, vals):
            for surf, sv in zip(shell, svals or [None] * len(shell)):
                rings = [[vid(i) for i in r] for r in surf if len(r) >= 3]
                if not rings:
                    continue
                kind = surf_types[sv] if sv is not None and sv < len(surf_types) else None
                if kind == "RoofSurface":
                    roofs.append(rings)
                elif kind == "GroundSurface":
                    grounds.append(rings)
                elif kind in {"WallSurface", "ClosureSurface", None}:
                    walls.append(rings)
                else:
                    walls.append(rings)
        if not grounds and not roofs:
            continue
        if _signed_volume(roofs + walls + grounds, v_out) < 0:
            # Some GRB solids are wound inward: flip every ring so normals face out.
            roofs = [[r[::-1] for r in s] for s in roofs]
            walls = [[r[::-1] for r in s] for s in walls]
            grounds = [[r[::-1] for r in s] for s in grounds]
        zs = [v[2] for v in v_out]
        floating = bool(zs) and min(zs) > FLOATING_MIN_Z
        # Footprint: the ground surface. Some solids ship it as many facets (often
        # triangles) or not at all (parts on pilotis): use the plan outline of all
        # ground (else roof) facets. A concave part may not close cleanly; then
        # walkable parts keep their largest facet (a hull would block real space)
        # and floating parts, which never collide, take the convex hull.
        holes = []
        ring = plan_outline(grounds or roofs, v_out) if len(grounds) != 1 else None
        if ring is None and grounds:
            base = max(grounds, key=lambda s: abs(polygon_area_2d(v_out[i] for i in s[0])))
            if len(grounds) == 1 or not floating:
                ring = [[v_out[i][0], v_out[i][1]] for i in base[0]]
                holes = [[[v_out[i][0], v_out[i][1]] for i in h] for h in base[1:] if len(h) >= 3]
        if ring is None:
            ring = _convex_hull([(p[0], p[1]) for p in v_out])
        if abs(polygon_area_2d(ring)) < 2.0:
            continue
        height_max = float(attrs.get("Height_max") or (max(zs) if zs else 0.0))
        z_min_roof = attrs.get("Z_min_roof")
        eaves = (float(z_min_roof) - zmin) if z_min_roof is not None else height_max
        eaves = max(1.0, min(eaves, height_max))
        uid = attrs.get("UIDN") or attrs.get("OBJECTID") or attrs.get("BUILDINGID")
        try:
            bid = CITY3D_ID_BASE + int(uid)
        except (TypeError, ValueError):
            bid = CITY3D_ID_BASE + (zlib.crc32(str(key).encode()) % 1_000_000_000)
        storeys = attrs.get("StoreysAGr")
        try:
            storeys = int(storeys) if storeys is not None else None
        except (TypeError, ValueError):
            storeys = None
        out.append(
            {
                "id": bid,
                "ring": ring,
                "holes": holes,
                "lod2": {"v": v_out, "roof": roofs, "wall": walls},
                "zmin_abs": round(zmin, 3),
                "z_min_roof_abs": round(float(z_min_roof), 3) if z_min_roof is not None else round(zmin + eaves, 3),
                "eaves": round(eaves, 2),
                "height_max": round(height_max, 2),
                "storeys": storeys,
                "roof_type": attrs.get("RoofType") or "",
                "roof_shape": _roof_shape_from_type(attrs.get("RoofType") or ""),
                "part": (attrs.get("LBLTYPE") or "").lower(),
                "street": attrs.get("STRAATNM") or "",
                "housenr": attrs.get("HUISNR") or "",
                "postcode": str(attrs.get("POSTCODE") or ""),
                "floating": floating,
            }
        )
    return out, affine.max_err


def _convex_hull(pts: list[tuple[float, float]]) -> list[list[float]]:
    pts = sorted(set(pts))
    if len(pts) < 3:
        return [list(p) for p in pts]

    def cross(o, a, b) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return [list(p) for p in lower[:-1] + upper[:-1]]


def plan_outline(polys: list, v: list, snap_m: float = 0.01) -> list[list[float]] | None:
    """Outer boundary in plan of a set of surface polygons (CCW ring of [x, y]).

    Edges shared by two facets cancel; the remaining edges chain into loops and the
    largest loop wins. None when the facets do not close into a clean loop
    (T-junctions, overlaps)."""

    def key(i: int) -> tuple[int, int]:
        return (round(v[i][0] / snap_m), round(v[i][1] / snap_m))

    xy: dict[tuple[int, int], tuple[float, float]] = {}
    count: dict[tuple, int] = {}
    for poly in polys:
        for r in poly:
            for a, b in zip(r, r[1:] + r[:1]):
                ka, kb = key(a), key(b)
                if ka == kb:
                    continue
                xy[ka] = (v[a][0], v[a][1])
                xy[kb] = (v[b][0], v[b][1])
                e = (ka, kb) if ka < kb else (kb, ka)
                count[e] = count.get(e, 0) + 1
    adj: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for (a, b), n in count.items():
        if n % 2:
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)
    if not adj or any(len(nb) != 2 for nb in adj.values()):
        return None
    loops: list[list[list[float]]] = []
    seen: set[tuple[int, int]] = set()
    for start in adj:
        if start in seen:
            continue
        loop = [start]
        seen.add(start)
        prev, cur = None, start
        while True:
            nxt = adj[cur][0] if adj[cur][0] != prev else adj[cur][1]
            if nxt == start:
                break
            if nxt in seen:
                return None
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        loops.append([list(xy[k]) for k in loop])
    best = max(loops, key=lambda r: abs(polygon_area_2d(r)))
    if polygon_area_2d(best) < 0:
        best.reverse()
    return best


def _point_in_poly2(x: float, y: float, pts: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi:
            inside = not inside
        j = i
    return inside


def _plane_z(pts: list[tuple[float, float, float]], x: float, y: float) -> float | None:
    """z of the (planar) polygon's plane at (x, y); None for near-vertical polygons."""
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        x1, y1, z1 = pts[i]
        x2, y2, z2 = pts[(i + 1) % len(pts)]
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    if abs(nz) < 1e-6 * (abs(nx) + abs(ny) + abs(nz) + 1e-12):
        return None
    px, py, pz = pts[0]
    return pz - (nx * (x - px) + ny * (y - py)) / nz


def _roof_z_at(b: dict[str, Any], x: float, y: float) -> float | None:
    """Height (relative to b's ground) of b's roof above (x, y); None when outside."""
    v = b["lod2"]["v"]
    best: float | None = None
    for poly in b["lod2"]["roof"]:
        pts3 = [tuple(v[k]) for k in poly[0]]
        if not _point_in_poly2(x, y, [(p[0], p[1]) for p in pts3]):
            continue
        z = _plane_z(pts3, x, y)
        if z is not None and (best is None or z > best):
            best = z
    return best


def _wall_top_z(pts: list[tuple[float, float, float]], a, c, t: float) -> float:
    """Top of a vertical wall polygon at parameter t along its base segment a→c."""
    dx, dy = c[0] - a[0], c[1] - a[1]
    ll = dx * dx + dy * dy or 1.0
    uz = [(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / ll, p[2]) for p in pts]
    top = -1e9
    for i in range(len(uz)):
        u1, z1 = uz[i]
        u2, z2 = uz[(i + 1) % len(uz)]
        lo, hi = sorted((u1, u2))
        if lo - 1e-6 <= t <= hi + 1e-6:
            z = max(z1, z2) if abs(u2 - u1) < 1e-9 else z1 + (z2 - z1) * (t - u1) / (u2 - u1)
            top = max(top, z)
    return top if top > -1e9 else max(p[2] for p in pts)


def roof_z_at(b: dict[str, Any], x: float, y: float) -> float | None:
    """Height above b's ground of its LOD2 roof over (x, y); None off the roof."""
    if not (b.get("lod2") or {}).get("roof"):
        return None
    return _roof_z_at(b, x, y)


# Wall polygon vertices within this distance of a footprint edge's line belong to it.
EDGE_WALL_TOL = 0.6
EDGE_SAMPLES = 9


def street_edge_eaves(b: dict[str, Any], p0, p1) -> float | None:
    """Eaves of b's LOD2 wall along the footprint edge p0→p1, metres above ground.

    The lowest wall top over the edge (gables above it stay plain wall). Falls back
    to the lowest roof just inside the edge when no wall polygon lies on it (party
    wall removed). None when neither is measured.
    """
    lod = b.get("lod2") or {}
    v = lod.get("v") or []
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ll = math.hypot(dx, dy)
    if ll < 0.5 or not v:
        return None
    ux, uy = dx / ll, dy / ll
    walls = []
    for poly in lod.get("wall") or []:
        pts = [tuple(v[k]) for k in poly[0]]
        if len(pts) < 3:
            continue
        if any(abs((p[0] - p0[0]) * uy - (p[1] - p0[1]) * ux) > EDGE_WALL_TOL for p in pts):
            continue
        ts = [((p[0] - p0[0]) * ux + (p[1] - p0[1]) * uy) / ll for p in pts]
        walls.append((min(ts), max(ts), pts))
    tops: list[float] = []
    for i in range(1, EDGE_SAMPLES + 1):
        t = i / (EDGE_SAMPLES + 1)
        best = None
        for lo, hi, pts in walls:
            if lo - 1e-3 <= t <= hi + 1e-3:
                z = _wall_top_z(pts, p0, p1, t)
                best = z if best is None else max(best, z)
        if best is None:
            # Just inside the footprint: either side, whichever lands on the roof.
            px, py = p0[0] + dx * t, p0[1] + dy * t
            for side in (1.0, -1.0):
                best = roof_z_at(b, px - uy * 0.5 * side, py + ux * 0.5 * side)
                if best is not None:
                    break
        if best is not None:
            tops.append(best)
    return min(tops) if tops else None


def facade_floors(storeys: int | None, floors: int, eaves: float, edge_eaves: float) -> int:
    """Storey count for a façade whose height differs from the building's eaves."""
    if abs(edge_eaves - eaves) < 1.5:
        return floors
    if storeys and 2.5 <= edge_eaves / storeys <= 4.2:
        return int(storeys)
    return max(1, min(20, int(round(edge_eaves / 3.15))))


def _hidden_by(
    b: dict[str, Any],
    pts,
    a,
    c,
    nb: dict[str, Any],
    samples: tuple[float, ...] = (0.08, 0.5, 0.92),
) -> bool:
    """True when neighbour ``nb``'s roof is at or above the wall top at every sample t."""
    dx, dy = c[0] - a[0], c[1] - a[1]
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length
    nb_ring = [(p[0], p[1]) for p in nb["ring"]]
    tm = samples[len(samples) // 2]
    mx, my = a[0] + dx * tm, a[1] + dy * tm
    side = 1.0 if _point_in_poly2(mx + nx * 0.3, my + ny * 0.3, nb_ring) else -1.0
    off = 0.3 * side
    dz = b["zmin_abs"] - nb["zmin_abs"]
    for t in samples:
        px = a[0] + dx * t + nx * off
        py = a[1] + dy * t + ny * off
        top = _wall_top_z(pts, a, c, t) + dz  # in nb's ground frame
        roof = _roof_z_at(nb, px, py)
        if roof is None:
            roof = nb["height_max"] if _point_in_poly2(px, py, nb_ring) else None
        if roof is None or roof < top - PARTY_WALL_HIDE_SLACK:
            return False
    return True


def remove_party_walls(buildings: list[dict[str, Any]]) -> int:
    """Drop wall polygons fully hidden behind a touching neighbour. Returns walls removed."""
    grid = _EdgeGrid()
    for i, b in enumerate(buildings):
        grid.add(i, b["ring"])
    removed = 0
    for i, b in enumerate(buildings):
        lod = b["lod2"]
        v = lod["v"]
        keep = []
        for poly in lod["wall"]:
            pts = [tuple(v[k]) for k in poly[0]]
            if len(pts) < 3:
                continue
            a, c = _wall_segment(pts)
            hiding: list[tuple[float, float]] = []
            for j, spans in _neighbour_spans(a, c, grid.near(a, c), i).items():
                nb = buildings[j]
                if nb.get("floating"):
                    continue
                for lo, hi in spans:
                    w = hi - lo
                    if w < 0.02:
                        continue
                    samples = (lo + w * 0.1, lo + w * 0.5, lo + w * 0.9)
                    if _hidden_by(b, pts, a, c, nb, samples):
                        hiding.append((lo, hi))
            cover = sum(hi - lo for lo, hi in _merge_spans(hiding))
            if cover >= PARTY_WALL_COVER:
                removed += 1
            else:
                keep.append(poly)
        lod["wall"] = keep
    return removed


def triangle_estimate(b: dict[str, Any]) -> int:
    lod = b.get("lod2") or {}
    n = 0
    for key in ("roof", "wall"):
        for poly in lod.get(key) or []:
            n += sum(max(0, len(r) - 2) for r in poly) + 2 * max(0, len(poly) - 1)
    return n


def load_buildings(doc: dict[str, Any], *, refresh: bool = False) -> dict[str, Any]:
    """LOD2 buildings for a district.json (postcode + boundary + origin)."""
    from cityview.districts import point_in_ring

    postcode = str(doc.get("postcode") or "")
    ring = doc.get("boundary") or []
    origin = (float(doc["origin"][0]), float(doc["origin"][1]))
    sectors = sectors_for_ring(ring, refresh=refresh) if ring else []
    buildings: list[dict[str, Any]] = []
    seen: set[int] = set()
    max_err = 0.0
    loaded: list[dict[str, Any]] = []
    for sec in sectors:
        try:
            cj = fetch_sector(sec["seccode"], refresh=refresh)
        except Exception as exc:  # noqa: BLE001 — one missing sector must not fail the district
            print(f"city3d: sector {sec['seccode']} unavailable ({exc})")
            continue
        loaded.append(sec)
        recs, err = _parse_sector(cj, origin, postcode or None)
        max_err = max(max_err, err)
        for r in recs:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            r["seccode"] = sec["seccode"]
            buildings.append(r)
    removed = remove_party_walls(buildings)
    # Coverage polygons (local metres) let the OSM join tell "no LOD2 here" from "gap in data".
    coverage = []
    for sec in loaded:
        for r in sec["rings"]:
            coverage.append([list(project(p[1], p[0], origin[0], origin[1])) for p in r])
    in_ring = sum(
        1 for b in buildings if ring and _centroid_in_lonlat_ring(b, origin, ring, point_in_ring)
    )
    return {
        "buildings": buildings,
        "sectors": [s["seccode"] for s in loaded],
        "coverage": coverage,
        "stats": {
            "buildings": len(buildings),
            "in_ring": in_ring,
            "party_walls_removed": removed,
            "affine_max_err_m": round(max_err, 4),
            "triangles_est": sum(triangle_estimate(b) for b in buildings),
        },
    }


def _centroid_in_lonlat_ring(b, origin, ring, point_in_ring) -> bool:
    from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon

    cx = sum(p[0] for p in b["ring"]) / len(b["ring"])
    cy = sum(p[1] for p in b["ring"]) / len(b["ring"])
    lat = origin[0] + cy / METERS_PER_DEG_LAT
    lon = origin[1] + cx / meters_per_deg_lon(origin[0])
    return point_in_ring(lat, lon, ring)
