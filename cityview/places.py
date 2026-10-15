"""Named places (shops, horeca, sights) for a district, beyond the geometry download.

The district geometry cache (``cache/osm.json``) only carries a short whitelist of
shop types, so the Meir showed four clothes shops. This stage pulls *every* shop,
street-facing amenity, sight and named heritage object in the bbox into
``cache/places.json`` (tags + one lat/lon each — no geometry), which feeds the
shopfront planner and the picture-reference stage.

Overpass first (one query); when every mirror is down, the OSM map API tile by tile.
Pure stdlib.
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from cityview.geo import bbox_covers
from cityview.osm import OVERPASS_URLS, _fetch_osm_map_tile

USER_AGENT = "metropolis/0.1 (Antwerp procedural city; city-view)"

PLACE_AMENITIES = frozenset(
    {
        "restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten",
        "nightclub", "bank", "pharmacy", "dentist", "doctors", "veterinary", "post_office",
        "bureau_de_change", "money_transfer", "theatre", "cinema", "arts_centre", "library",
        "townhall", "marketplace", "casino", "hospital", "clinic", "atm", "car_repair",
    }
)
PLACE_TOURISM = frozenset({"museum", "attraction", "artwork", "gallery", "hotel", "viewpoint"})
PLACE_HISTORIC = frozenset(
    {"monument", "memorial", "building", "castle", "church", "house", "warehouse", "city_gate"}
)
# Tags kept per place — enough for fascia, hours, and picture references.
KEEP_TAGS = (
    "name", "name:nl", "name:en", "brand", "brand:wikidata", "operator", "shop", "amenity",
    "tourism", "historic", "craft", "cuisine", "opening_hours", "outdoor_seating",
    "wikidata", "wikipedia", "image", "wikimedia_commons", "mapillary", "website",
    "addr:street", "addr:housenumber", "colour", "building:colour", "heritage",
    "ref:OnroerendErfgoed", "level",
)
MAP_TILE_DEG = 0.004


def is_place(tags: dict[str, str]) -> bool:
    if not tags:
        return False
    shop = tags.get("shop")
    if shop and shop not in {"vacant", "no"}:
        return True
    if tags.get("amenity") in PLACE_AMENITIES:
        return True
    if tags.get("craft") in {"brewery", "chocolatier", "confectionery", "jeweller"} and tags.get("name"):
        return True
    if tags.get("tourism") in PLACE_TOURISM and (tags.get("name") or tags.get("wikidata")):
        return True
    if tags.get("historic") in PLACE_HISTORIC and (tags.get("name") or tags.get("wikidata")):
        return True
    return False


def _slim(el: dict[str, Any], lat: float, lon: float) -> dict[str, Any]:
    tags = el.get("tags") or {}
    return {
        "type": el.get("type"),
        "id": int(el["id"]),
        "lat": round(lat, 7),
        "lon": round(lon, 7),
        "tags": {k: tags[k] for k in KEEP_TAGS if tags.get(k)},
    }


def places_from_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Slim place records (one lat/lon each) from raw OSM elements."""
    nodes = {int(e["id"]): e for e in elements if e.get("type") == "node" and "lat" in e}
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for el in elements:
        tags = el.get("tags") or {}
        if not is_place(tags):
            continue
        kind = el.get("type")
        if kind == "node" and "lat" in el:
            lat, lon = float(el["lat"]), float(el["lon"])
        elif isinstance(el.get("center"), dict):
            lat, lon = float(el["center"]["lat"]), float(el["center"]["lon"])
        elif kind == "way":
            pts = [nodes[int(n)] for n in el.get("nodes") or [] if int(n) in nodes]
            if not pts:
                continue
            if len(pts) > 2 and pts[0] is pts[-1]:
                pts = pts[:-1]
            lat = sum(float(p["lat"]) for p in pts) / len(pts)
            lon = sum(float(p["lon"]) for p in pts) / len(pts)
        else:
            continue
        out[(str(kind), int(el["id"]))] = _slim(el, lat, lon)
    return sorted(out.values(), key=lambda p: (p["type"], p["id"]))


def _overpass_places_query(south: float, west: float, north: float, east: float) -> str:
    bbox = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"
    amen = "|".join(sorted(PLACE_AMENITIES))
    tour = "|".join(sorted(PLACE_TOURISM))
    hist = "|".join(sorted(PLACE_HISTORIC))
    return f"""
[out:json][timeout:120];
(
  nwr["shop"]({bbox});
  nwr["amenity"~"^({amen})$"]({bbox});
  nwr["tourism"~"^({tour})$"]({bbox});
  nwr["historic"~"^({hist})$"]["name"]({bbox});
  nwr["craft"]["name"]({bbox});
);
out tags center;
""".strip()


def _fetch_overpass_places(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    body = urllib.parse.urlencode({"data": _overpass_places_query(*bbox)}).encode()
    last: Exception | None = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode()).get("elements") or []
        except Exception as exc:  # noqa: BLE001 — try the next mirror
            last = exc
    raise RuntimeError(f"Overpass places fetch failed: {last}")


def _fetch_map_tiles(bbox: tuple[float, float, float, float], step: float = MAP_TILE_DEG) -> list[dict[str, Any]]:
    south, west, north, east = bbox
    rows = max(1, math.ceil((north - south) / step))
    cols = max(1, math.ceil((east - west) / step))
    places: dict[tuple[str, int], dict[str, Any]] = {}
    for r in range(rows):
        for c in range(cols):
            s = south + r * step
            w = west + c * step
            tile = (s, w, min(north, s + step), min(east, w + step))
            for attempt in range(3):
                try:
                    els = _fetch_osm_map_tile(*tile)
                    break
                except Exception as exc:  # noqa: BLE001 — retry, then give the tile up
                    if attempt == 2:
                        print(f"places tile {tile} skipped: {exc}")
                        els = []
                    time.sleep(1.5 * (attempt + 1))
            for p in places_from_elements(els):
                places[(p["type"], p["id"])] = p
            time.sleep(0.2)  # be polite to api.openstreetmap.org
    return sorted(places.values(), key=lambda p: (p["type"], p["id"]))


def fetch_places(
    bbox: tuple[float, float, float, float],
    cache_path: Path,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    """``{"source", "fetched", "places": [...]}`` for the bbox, cached at ``cache_path``."""
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text())
        if bbox_covers(cached.get("bbox"), bbox):
            return cached
    try:
        places = places_from_elements(_fetch_overpass_places(bbox))
        source = "overpass"
    except Exception as exc:  # noqa: BLE001
        print(f"{exc}; falling back to the OSM map API")
        places = _fetch_map_tiles(bbox)
        source = "osm-map-api"
    payload = {
        "source": source,
        "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "attribution": "(c) OpenStreetMap contributors (ODbL)",
        "bbox": list(bbox),
        "places": places,
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload) + "\n")
    print(f"Wrote {cache_path} ({len(places)} places via {source})")
    return payload


def places_as_elements(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Places as OSM-like elements (``center`` for ways) for ``plan_shops``."""
    out = []
    for p in (payload or {}).get("places") or []:
        el = {"type": p["type"], "id": p["id"], "tags": p.get("tags") or {}}
        if p["type"] == "node":
            el["lat"], el["lon"] = p["lat"], p["lon"]
        else:
            el["center"] = {"lat": p["lat"], "lon": p["lon"]}
        out.append(el)
    return out
