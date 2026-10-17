"""Shared Stad Antwerpen ArcGIS REST client.

Trees, benches and Velo each paged the same MapServer. New survey layers go
through here so a district has one fetch loop, one host allowlist, and one
compact record shape (point / line / ring).
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Callable, Iterable

ALLOWED_HOSTS = frozenset({"geodata.antwerpen.be"})
USER_AGENT = "metropolis/0.1 (Antwerp procedural city)"
PAGE = 1000


def http_json(url: str, timeout: float = 60.0) -> Any:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"refusing to fetch GIS data from {parsed.hostname!r}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosemgrep
        return json.loads(resp.read().decode())


def _exceeded(doc: dict[str, Any]) -> bool:
    return bool(doc.get("exceededTransferLimit") or (doc.get("properties") or {}).get("exceededTransferLimit"))


def query_features(
    layer_url: str,
    bbox: tuple[float, float, float, float],
    *,
    out_fields: str,
    where: str = "1=1",
    order_by: str = "OBJECTID",
    timeout: float = 60.0,
) -> list[dict[str, Any]]:
    """Page a MapServer ``/query`` for ``(south, west, north, east)`` as GeoJSON features."""
    south, west, north, east = bbox
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        params = urllib.parse.urlencode(
            {
                "f": "geojson",
                "where": where,
                "geometry": f"{west:.6f},{south:.6f},{east:.6f},{north:.6f}",
                "geometryType": "esriGeometryEnvelope",
                "inSR": 4326,
                "outSR": 4326,
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": out_fields,
                "orderByFields": order_by,
                "resultOffset": offset,
                "resultRecordCount": PAGE,
            }
        )
        doc = http_json(f"{layer_url}?{params}", timeout=timeout)
        feats = doc.get("features") or []
        out.extend(feats)
        if not feats or not _exceeded(doc):
            break
        offset += len(feats)
    return out


def _first_point(coords: Any) -> tuple[float, float] | None:
    if not isinstance(coords, (list, tuple)) or len(coords) < 2:
        return None
    if isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
        return float(coords[0]), float(coords[1])
    return _first_point(coords[0])


def _as_line(coords: Any) -> list[list[float]]:
    if not coords:
        return []
    if isinstance(coords[0], (int, float)):
        return [[round(float(coords[0]), 6), round(float(coords[1]), 6)]]
    if coords and isinstance(coords[0], (list, tuple)) and isinstance(coords[0][0], (int, float)):
        return [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in coords if len(p) >= 2]
    return _as_line(coords[0])


def _as_ring(coords: Any) -> list[list[float]]:
    if not coords:
        return []
    # Polygon: [ring, hole, …] or MultiPolygon: [[ring, …], …]
    first = coords[0]
    if first and isinstance(first[0], (int, float)):
        ring = [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in coords if len(p) >= 2]
    elif first and isinstance(first[0], (list, tuple)) and isinstance(first[0][0], (int, float)):
        ring = [[round(float(p[0]), 6), round(float(p[1]), 6)] for p in first if len(p) >= 2]
    else:
        return _as_ring(first)
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return ring if len(ring) >= 3 else []


def compact_feature(
    feat: dict[str, Any],
    *,
    geom: str,
    keep: Iterable[str] = (),
    rename: dict[str, str] | None = None,
    extra: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Turn a GeoJSON feature into a small record. ``geom`` is point / line / ring."""
    geometry = feat.get("geometry") or {}
    props = feat.get("properties") or {}
    rec: dict[str, Any] = {}
    mapping = rename or {}
    for key in keep:
        dest = mapping.get(key, key)
        val = props.get(key)
        if val not in (None, ""):
            rec[dest] = val
    if "id" not in rec:
        rec["id"] = props.get("OBJECTID") or props.get("GISID") or props.get("id")
    gtype = geometry.get("type") or ""
    coords = geometry.get("coordinates")
    if geom == "point":
        pt = _first_point(coords)
        if pt is None:
            return None
        lon, lat = pt
        rec["lat"] = round(lat, 7)
        rec["lon"] = round(lon, 7)
    elif geom == "line":
        line = _as_line(coords) if "Line" in gtype or gtype == "" else _as_line(coords)
        if len(line) < 2:
            return None
        rec["line"] = line
    elif geom == "ring":
        ring = _as_ring(coords)
        if len(ring) < 3:
            return None
        rec["ring"] = ring
    else:
        raise ValueError(f"unknown geom {geom!r}")
    if extra:
        rec.update(extra(props))
    return rec
