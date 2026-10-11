"""District boundaries from committed postcode polygons and place bboxes.

Postcode rings live in ``assets/boundaries/be_postcodes.geojson`` (simplified
Statbel-style polygons, WGS84, GeoJSON [lon, lat] rings). The 2018 Harmonie
tile is not the full 2018 postcode: it starts from the place bbox in
``scenes/antwerp_places.json`` and can be extended north to the Nationale Bank.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cityview.districts import bbox_of_ring, point_in_ring
from cityview.paths import ASSETS, ROOT

BOUNDARIES_PATH = ASSETS / "boundaries" / "be_postcodes.geojson"
PLACES_PATH = ROOT / "scenes" / "antwerp_places.json"

# Nationale Bank van België, Leopoldplaats — seam between 2018 and 2000.
NATIONALE_BANK_QUERY = ("nationale bank", "nationale-bank", "national bank")
# Fallback lat/lon when OSM is unavailable during add.
NATIONALE_BANK_FALLBACK = (51.21285, 4.40655)


def load_postcodes(path: Path | None = None) -> dict[str, Any]:
    path = Path(path or BOUNDARIES_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Missing postcode boundaries at {path}")
    return json.loads(path.read_text())


def postcode_ring(postcode: str, doc: dict[str, Any] | None = None) -> list[list[float]]:
    doc = doc or load_postcodes()
    features = doc.get("features") or []
    for feat in features:
        props = feat.get("properties") or {}
        if str(props.get("postcode") or props.get("postal_code") or "") == str(postcode):
            geom = feat.get("geometry") or {}
            if geom.get("type") == "Polygon":
                return list(geom["coordinates"][0])
            if geom.get("type") == "MultiPolygon":
                # Largest ring by vertex count.
                rings = [poly[0] for poly in geom["coordinates"]]
                return list(max(rings, key=len))
    raise KeyError(f"Postcode {postcode!r} not in {BOUNDARIES_PATH}")


def load_place(place_name: str) -> dict[str, Any]:
    places = json.loads(PLACES_PATH.read_text())
    place = places.get(place_name)
    if not place:
        raise KeyError(f"Unknown place {place_name!r}")
    return place


def bbox_to_ring(bbox: tuple[float, float, float, float]) -> list[list[float]]:
    """(south, west, north, east) → closed [lon, lat] ring."""
    south, west, north, east = bbox
    return [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
    ]


def extend_bbox_north(
    bbox: tuple[float, float, float, float],
    north_lat: float,
    *,
    pad_deg: float = 0.0015,
) -> tuple[float, float, float, float]:
    south, west, north, east = bbox
    return (south, west, max(north, north_lat + pad_deg), east)


def find_nationale_bank_anchor(osm: dict[str, Any] | None = None) -> tuple[float, float]:
    """Return (lat, lon) of the Nationale Bank from OSM tags, or the fallback."""
    if not osm:
        return NATIONALE_BANK_FALLBACK
    nodes = {n["id"]: n for n in osm.get("elements", []) if n.get("type") == "node"}
    ways = [e for e in osm.get("elements", []) if e.get("type") == "way"]
    rels = [e for e in osm.get("elements", []) if e.get("type") == "relation"]

    def _name_hit(tags: dict[str, Any]) -> bool:
        blob = " ".join(
            str(tags.get(k) or "").lower()
            for k in ("name", "name:nl", "name:fr", "official_name", "operator")
        )
        return any(q in blob for q in NATIONALE_BANK_QUERY)

    for el in ways + rels:
        tags = el.get("tags") or {}
        if not _name_hit(tags):
            continue
        if el.get("type") == "way":
            coords = []
            for nid in el.get("nodes") or []:
                n = nodes.get(nid)
                if n and "lat" in n and "lon" in n:
                    coords.append((n["lat"], n["lon"]))
            if coords:
                lat = sum(c[0] for c in coords) / len(coords)
                lon = sum(c[1] for c in coords) / len(coords)
                return (lat, lon)
        # Relation: use any member node with coords, else fallback.
        for m in el.get("members") or []:
            if m.get("type") == "node":
                n = nodes.get(m.get("ref"))
                if n and "lat" in n:
                    return (n["lat"], n["lon"])
    for n in nodes.values():
        if _name_hit(n.get("tags") or {}) and "lat" in n:
            return (n["lat"], n["lon"])
    return NATIONALE_BANK_FALLBACK


def clip_osm_to_ring(osm: dict[str, Any], ring: list[list[float]]) -> dict[str, Any]:
    """Keep nodes inside the ring; keep ways/relations that reference kept nodes.

    Ways with at least one node inside are kept (so roads crossing the seam survive).
    """
    elements = osm.get("elements") or []
    nodes_in: dict[int, dict] = {}
    for el in elements:
        if el.get("type") != "node":
            continue
        lat, lon = el.get("lat"), el.get("lon")
        if lat is None or lon is None:
            continue
        if point_in_ring(float(lat), float(lon), ring):
            nodes_in[el["id"]] = el

    kept: list[dict] = list(nodes_in.values())
    way_ids: set[int] = set()
    for el in elements:
        if el.get("type") != "way":
            continue
        nids = el.get("nodes") or []
        if any(nid in nodes_in for nid in nids):
            kept.append(el)
            way_ids.add(el["id"])
            # Pull in way nodes that fell just outside so geometry stays intact.
            for nid in nids:
                if nid not in nodes_in:
                    for src in elements:
                        if src.get("type") == "node" and src.get("id") == nid:
                            kept.append(src)
                            nodes_in[nid] = src
                            break
    for el in elements:
        if el.get("type") != "relation":
            continue
        members = el.get("members") or []
        if any(
            (m.get("type") == "way" and m.get("ref") in way_ids)
            or (m.get("type") == "node" and m.get("ref") in nodes_in)
            for m in members
        ):
            kept.append(el)
    return {"version": osm.get("version", 0.6), "generator": "cityview.district_boundary", "elements": kept}


def ring_excluding_bank_block(
    postcode_ring_coords: list[list[float]],
    bank_lat: float,
    bank_lon: float,
    *,
    half_m: float = 90.0,
) -> list[list[float]]:
    """Return the postcode ring unchanged; bank exclusion is applied via bbox seam.

    The bank block is owned by 2018. For 2000 we keep the official polygon and
    mark the bank OSM id as belonging to the neighbour in district.json so it is
    not extruded twice. Geometry clipping of the polygon itself is optional.
    """
    _ = (bank_lat, bank_lon, half_m)
    return list(postcode_ring_coords)


def district_bbox_from_doc(doc: dict[str, Any]) -> tuple[float, float, float, float]:
    if doc.get("bbox"):
        b = doc["bbox"]
        return (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
    ring = doc.get("boundary") or doc.get("ring")
    if ring:
        return bbox_of_ring(ring)
    raise ValueError("district.json needs bbox or boundary ring")
