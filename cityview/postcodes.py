"""Antwerp postcode rings: the organising key for district packages.

Rings come from OSM ``boundary=postal_code`` relations (one per Antwerp postcode),
assembled from their outer member ways. When Overpass is unavailable the
statistical sectors of the Antwerpen-in-3D index are dissolved per postcode
(majority ``POSTCODE`` of their buildings) as a coarse fallback.

Output: ``assets/boundaries/antwerp_postcodes.geojson`` (WGS84, ``[lon, lat]``).
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from cityview.paths import ASSETS

ANTWERP_POSTCODES_PATH = ASSETS / "boundaries" / "antwerp_postcodes.geojson"

# Every postcode of the city of Antwerp (municipality NIS 11002).
ANTWERP_POSTCODES = (
    "2000", "2018", "2020", "2030", "2040", "2050", "2060",
    "2100", "2140", "2170", "2180", "2600", "2610", "2660",
)

# Map names for postcodes that are not (yet) playable districts.
POSTCODE_NAMES = {
    "2000": "Antwerpen",
    "2018": "Klein Antwerpen",
    "2020": "'t Kiel",
    "2030": "Haven",
    "2040": "Berendrecht-Zandvliet-Lillo",
    "2050": "Linkeroever",
    "2060": "Noord",
    "2100": "Deurne",
    "2140": "Borgerhout",
    "2170": "Merksem",
    "2180": "Ekeren",
    "2600": "Berchem",
    "2610": "Wilrijk",
    "2660": "Hoboken",
}

_ANTWERP_BBOX = (51.10, 4.20, 51.40, 4.55)
_USER_AGENT = "metropolis/0.1 (Antwerp procedural city)"


def _overpass_postcodes() -> dict[str, Any]:
    from cityview.osm import OVERPASS_URLS

    codes = "|".join(ANTWERP_POSTCODES)
    s, w, n, e = _ANTWERP_BBOX
    query = (
        "[out:json][timeout:120];"
        f'rel["boundary"="postal_code"]["postal_code"~"^({codes})$"]({s},{w},{n},{e});'
        "out geom;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    last: Exception | None = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(url, data=body, headers={"User-Agent": _USER_AGENT}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=150) as resp:
                return json.loads(resp.read().decode())
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"Overpass postcode fetch failed: {last}") from last


def _key(pt: tuple[float, float]) -> tuple[int, int]:
    return (round(pt[0] * 1e7), round(pt[1] * 1e7))


def assemble_rings(ways: list[list[tuple[float, float]]]) -> list[list[list[float]]]:
    """Stitch way segments ([lon, lat] tuples) into closed rings."""
    pending = [list(w) for w in ways if len(w) >= 2]
    rings: list[list[list[float]]] = []
    while pending:
        ring = pending.pop(0)
        changed = True
        while _key(ring[0]) != _key(ring[-1]) and changed:
            changed = False
            for i, seg in enumerate(pending):
                if _key(seg[0]) == _key(ring[-1]):
                    ring.extend(seg[1:])
                elif _key(seg[-1]) == _key(ring[-1]):
                    ring.extend(list(reversed(seg))[1:])
                elif _key(seg[-1]) == _key(ring[0]):
                    ring = seg[:-1] + ring
                elif _key(seg[0]) == _key(ring[0]):
                    ring = list(reversed(seg))[:-1] + ring
                else:
                    continue
                pending.pop(i)
                changed = True
                break
        if len(ring) >= 4:
            if _key(ring[0]) != _key(ring[-1]):
                ring.append(ring[0])
            rings.append([[float(p[0]), float(p[1])] for p in ring])
    return rings


def ring_area_m2(ring: list[list[float]]) -> float:
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * kx, ring[i][1] * ky
        x2, y2 = ring[i + 1][0] * kx, ring[i + 1][1] * ky
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def simplify_ring(ring: list[list[float]], tol_m: float) -> list[list[float]]:
    """Douglas-Peucker in local metres; keeps the ring closed."""
    if len(ring) < 5 or tol_m <= 0:
        return ring
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    pts = [(p[0] * kx, p[1] * ky) for p in ring]

    def dp(lo: int, hi: int, keep: list[bool]) -> None:
        stack = [(lo, hi)]
        while stack:
            a, b = stack.pop()
            ax, ay = pts[a]
            bx, by = pts[b]
            dx, dy = bx - ax, by - ay
            ll = dx * dx + dy * dy
            best, idx = -1.0, -1
            for i in range(a + 1, b):
                px, py = pts[i]
                if ll == 0:
                    d = math.hypot(px - ax, py - ay)
                else:
                    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
                    d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
                if d > best:
                    best, idx = d, i
            if best > tol_m and idx > 0:
                keep[idx] = True
                stack.append((a, idx))
                stack.append((idx, b))

    n = len(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    mid = n // 2
    keep[mid] = True
    dp(0, mid, keep)
    dp(mid, n - 1, keep)
    out = [ring[i] for i in range(n) if keep[i]]
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def _features_from_overpass(doc: dict[str, Any]) -> list[dict[str, Any]]:
    feats: list[dict[str, Any]] = []
    for rel in doc.get("elements") or []:
        if rel.get("type") != "relation":
            continue
        code = str((rel.get("tags") or {}).get("postal_code") or "")
        if code not in ANTWERP_POSTCODES:
            continue
        outer = [
            [(g["lon"], g["lat"]) for g in m.get("geometry") or []]
            for m in rel.get("members") or []
            if m.get("type") == "way" and (m.get("role") or "outer") == "outer"
        ]
        rings = assemble_rings(outer)
        if not rings:
            continue
        rings.sort(key=ring_area_m2, reverse=True)
        geom: dict[str, Any]
        if len(rings) == 1:
            geom = {"type": "Polygon", "coordinates": [rings[0]]}
        else:
            geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "postcode": code,
                    "name": POSTCODE_NAMES.get(code, code),
                    "osm_relation": rel.get("id"),
                    "source": "OpenStreetMap boundary=postal_code (ODbL)",
                },
                "geometry": geom,
            }
        )
    return feats


def _features_from_sectors() -> list[dict[str, Any]]:
    """Fallback: dissolve statistical sectors by majority building postcode."""
    from cityview.city3d import load_sector_index, sector_postcode_votes

    by_code: dict[str, list[list[list[float]]]] = {}
    for sec in load_sector_index():
        votes = sector_postcode_votes(sec["seccode"])
        if not votes:
            continue
        code = max(votes, key=votes.get)
        if code in ANTWERP_POSTCODES:
            by_code.setdefault(code, []).extend(sec["rings"])
    feats = []
    for code, rings in sorted(by_code.items()):
        rings.sort(key=ring_area_m2, reverse=True)
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "postcode": code,
                    "name": POSTCODE_NAMES.get(code, code),
                    "source": "Antwerpen in 3D sectors (majority building postcode)",
                },
                "geometry": {"type": "MultiPolygon", "coordinates": [[r] for r in rings]},
            }
        )
    return feats


def refresh_postcodes(path: Path | None = None, *, use_osm: bool = True) -> Path:
    path = Path(path or ANTWERP_POSTCODES_PATH)
    feats: list[dict[str, Any]] = []
    if use_osm:
        try:
            feats = _features_from_overpass(_overpass_postcodes())
        except RuntimeError as exc:
            print(f"postcodes: {exc}; falling back to sector dissolve")
    if len(feats) < len(ANTWERP_POSTCODES) // 2:
        feats = _features_from_sectors()
    feats.sort(key=lambda f: f["properties"]["postcode"])
    doc = {"type": "FeatureCollection", "features": feats}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc) + "\n")
    print(f"Wrote {path} ({len(feats)} postcodes)")
    return path


def load_antwerp_postcodes(path: Path | None = None) -> dict[str, Any]:
    path = Path(path or ANTWERP_POSTCODES_PATH)
    if not path.exists():
        refresh_postcodes(path)
    return json.loads(path.read_text())


def postcode_rings(postcode: str, doc: dict[str, Any] | None = None) -> list[list[list[float]]]:
    """All outer rings of a postcode, largest first."""
    doc = doc or load_antwerp_postcodes()
    for feat in doc.get("features") or []:
        if str((feat.get("properties") or {}).get("postcode")) != str(postcode):
            continue
        geom = feat["geometry"]
        if geom["type"] == "Polygon":
            return [geom["coordinates"][0]]
        return [poly[0] for poly in geom["coordinates"]]
    raise KeyError(f"Postcode {postcode!r} not in {ANTWERP_POSTCODES_PATH}")


def postcode_main_ring(postcode: str, doc: dict[str, Any] | None = None) -> list[list[float]]:
    return postcode_rings(postcode, doc)[0]


def rings_share_border(a: list[list[float]], b: list[list[float]], *, tol_m: float = 12.0) -> list[float] | None:
    """Return a [lat, lon] midpoint of the shared border, or None when rings don't touch."""
    hits = shared_border(a, b, tol_m=tol_m)
    if not hits:
        return None
    mid = hits[len(hits) // 2]
    return [mid[0], mid[1]]


def shared_border(a: list[list[float]], b: list[list[float]], *, tol_m: float = 12.0) -> list[list[float]]:
    """Vertices of ``a`` (as ``[lat, lon]``, ring order) that lie on ``b``'s boundary.

    Two rings share a border when several vertices of one lie within ``tol_m`` of the
    other's vertices (OSM postcode relations reuse the same boundary ways). Fewer than
    3 shared vertices means the rings only touch at a corner: returns ``[]``.
    """
    lat0 = sum(p[1] for p in a) / len(a)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    cell = tol_m
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for p in b:
        x, y = p[0] * kx, p[1] * ky
        grid.setdefault((int(x // cell), int(y // cell)), []).append((x, y))
    hits: list[list[float]] = []
    for p in _ring_hits(a, grid, kx, ky, cell, tol_m):
        hits.append([p[1], p[0]])
    if len(hits) < 3:
        return []
    return hits


def shared_border_runs(a: list[list[float]], b: list[list[float]], *, tol_m: float = 12.0) -> list[list[list[float]]]:
    """Like :func:`shared_border`, split into runs of consecutive ring vertices.

    A border that wraps past the ring's start vertex stays one run; separate stretches
    (rings touching twice) stay separate, so joining them never cuts across a district.
    """
    lat0 = sum(p[1] for p in a) / len(a)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for p in b:
        x, y = p[0] * kx, p[1] * ky
        grid.setdefault((int(x // tol_m), int(y // tol_m)), []).append((x, y))
    ring = a[:-1] if len(a) > 1 and a[0] == a[-1] else a
    on = [bool(_ring_hits([p], grid, kx, ky, tol_m, tol_m)) for p in ring]
    if sum(on) < 3:
        return []
    n = len(ring)
    start = next((i for i in range(n) if not on[i]), None)
    if start is None:
        return [[[p[1], p[0]] for p in ring + ring[:1]]]
    runs: list[list[list[float]]] = []
    cur: list[list[float]] = []
    for k in range(1, n + 1):
        i = (start + k) % n
        if on[i]:
            cur.append([ring[i][1], ring[i][0]])
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) >= 2]


def _ring_hits(
    a: list[list[float]],
    grid: dict[tuple[int, int], list[tuple[float, float]]],
    kx: float,
    ky: float,
    cell: float,
    tol_m: float,
) -> list[list[float]]:
    hits: list[list[float]] = []
    for p in a:
        x, y = p[0] * kx, p[1] * ky
        gx, gy = int(x // cell), int(y // cell)
        near = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for qx, qy in grid.get((gx + dx, gy + dy), ()):
                    if math.hypot(qx - x, qy - y) <= tol_m:
                        near = True
                        break
                if near:
                    break
            if near:
                break
        if near:
            hits.append(p)
    return hits


def menu_postcodes_payload(
    districts: list[dict[str, Any]],
    *,
    tol_m: float = 25.0,
    doc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Simplified rings + labels for the viewer Maps menu."""
    doc = doc or load_antwerp_postcodes()
    by_pc = {str(d["postcode"]): d for d in districts}
    areas = []
    all_pts: list[list[float]] = []
    for feat in doc.get("features") or []:
        props = feat.get("properties") or {}
        code = str(props.get("postcode"))
        geom = feat["geometry"]
        rings = [geom["coordinates"][0]] if geom["type"] == "Polygon" else [p[0] for p in geom["coordinates"]]
        rings = [simplify_ring(r, tol_m) for r in rings if ring_area_m2(r) > 20000]
        if not rings:
            continue
        main = max(rings, key=ring_area_m2)
        label = _label_point(main)
        d = by_pc.get(code)
        areas.append(
            {
                "postcode": code,
                "name": (d or {}).get("menu_name") or POSTCODE_NAMES.get(code, code),
                "district": (d or {}).get("id"),
                "unlocked": bool((d or {}).get("unlocked")),
                "standalone": bool((d or {}).get("standalone")),
                "label": label,
                "rings": [[[round(p[0], 5), round(p[1], 5)] for p in r] for r in rings],
            }
        )
        for r in rings:
            all_pts.extend(r)
    lons = [p[0] for p in all_pts] or [0.0]
    lats = [p[1] for p in all_pts] or [0.0]
    return {
        "bbox": [min(lats), min(lons), max(lats), max(lons)],
        "areas": areas,
    }


def _label_point(ring: list[list[float]]) -> list[float]:
    """Area-weighted centroid, nudged to a vertex average when it falls outside."""
    from cityview.districts import point_in_ring

    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) > 1e-12:
        cx /= 3 * a
        cy /= 3 * a
    else:
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
    if not point_in_ring(cy, cx, ring):
        best = min(ring, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        cx, cy = best
    return [round(cy, 5), round(cx, 5)]
