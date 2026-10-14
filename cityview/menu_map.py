"""Maps-menu assets: the Antwerp postcode map and one mini-map per playable district.

``viewer/menu/antwerp_postcodes.json``
    Every Antwerp postcode as an SVG path in a shared metric frame (x east, y south,
    metres from the map centre). Registry districts carry ``district`` / ``unlocked`` /
    ``standalone``; the rest (Ekeren, Merksem …) are drawn but not selectable.

``viewer/menu/minimap-<district>.json``
    The district outline plus its OSM streets, normalised to a 1000-unit square, for the
    preview panel. Districts without an OSM cache yet get the outline only.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from cityview.paths import ASSETS, VIEWER

MENU_DIR = VIEWER / "menu"
WATER_CACHE = ASSETS / "boundaries" / "antwerp_water.json"
# Big water only: the Scheldt, the docks and canals; ponds would just be noise at this scale.
WATER_MIN_M2 = 25_000.0
WATER_SIMPLIFY_M = 12.0
_WATER_KINDS = "river|dock|canal|basin|harbour|lake|reservoir"
MINIMAP_SIZE = 1000
# Keyboard / gamepad order across the map: north-west harbour to the south-west bank.
MENU_ORDER = ("2030", "2060", "2000", "2140", "2018", "2020", "2050")
_MINIMAP_ROADS = {
    "motorway": 3,
    "trunk": 3,
    "primary": 3,
    "secondary": 2,
    "tertiary": 2,
    "residential": 1,
    "living_street": 1,
    "unclassified": 1,
    "pedestrian": 1,
}


def _frame(bbox: list[float]) -> tuple[float, float, float, float]:
    south, west, north, east = bbox
    lat0, lon0 = (south + north) / 2, (west + east) / 2
    return lat0, lon0, 111320.0 * math.cos(math.radians(lat0)), 110540.0


def _path(rings: list[list[list[float]]], fr: tuple[float, float, float, float]) -> str:
    lat0, lon0, kx, ky = fr
    parts = []
    for ring in rings:
        pts = [((lon - lon0) * kx, -(lat - lat0) * ky) for lon, lat in ring]
        parts.append("M" + "L".join(f"{x:.0f},{y:.0f}" for x, y in pts) + "Z")
    return "".join(parts)


def _overpass_water() -> dict[str, Any]:
    import urllib.parse
    import urllib.request

    from cityview.osm import OVERPASS_URLS
    from cityview.postcodes import _ANTWERP_BBOX, _USER_AGENT

    s, w, n, e = _ANTWERP_BBOX
    bb = f"({s},{w},{n},{e})"
    query = (
        "[out:json][timeout:180];("
        f'way["natural"="water"]["water"~"^({_WATER_KINDS})$"]{bb};'
        f'rel["natural"="water"]["water"~"^({_WATER_KINDS})$"]{bb};'
        f'way["waterway"~"^(riverbank|dock)$"]{bb};'
        f'rel["waterway"~"^(riverbank|dock)$"]{bb};'
        ");out geom;"
    )
    body = urllib.parse.urlencode({"data": query}).encode()
    last: Exception | None = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(url, data=body, headers={"User-Agent": _USER_AGENT}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=200) as resp:
                return json.loads(resp.read().decode())
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"Overpass water fetch failed: {last}") from last


def water_rings(osm: dict[str, Any]) -> list[list[list[float]]]:
    """Outer rings ([lon, lat]) of the large water bodies, simplified."""
    from cityview.postcodes import assemble_rings, ring_area_m2, simplify_ring

    rings: list[list[list[float]]] = []
    for el in osm.get("elements") or []:
        if el.get("type") == "way":
            geom = [(g["lon"], g["lat"]) for g in el.get("geometry") or []]
            cand = assemble_rings([geom])
        elif el.get("type") == "relation":
            outers = [
                [(g["lon"], g["lat"]) for g in m.get("geometry") or []]
                for m in el.get("members") or []
                if m.get("type") == "way" and m.get("role") in ("outer", "")
            ]
            cand = assemble_rings(outers)
        else:
            continue
        for ring in cand:
            if ring_area_m2(ring) >= WATER_MIN_M2:
                rings.append(simplify_ring(ring, WATER_SIMPLIFY_M))
    return rings


def load_water(*, refresh: bool = False) -> list[list[list[float]]]:
    if WATER_CACHE.exists() and not refresh:
        return json.loads(WATER_CACHE.read_text())["rings"]
    rings = water_rings(_overpass_water())
    WATER_CACHE.parent.mkdir(parents=True, exist_ok=True)
    WATER_CACHE.write_text(json.dumps({"source": "OpenStreetMap (ODbL)", "rings": rings}) + "\n")
    return rings


def menu_map_payload(index: dict[str, Any], water: list[list[list[float]]] | None = None) -> dict[str, Any]:
    from cityview.postcodes import menu_postcodes_payload

    districts = index.get("districts") or []
    raw = menu_postcodes_payload(districts)
    fr = _frame(raw["bbox"])
    lat0, lon0, kx, ky = fr
    meta = {str(d["postcode"]): d for d in districts}
    areas = []
    xs: list[float] = []
    ys: list[float] = []
    for a in raw["areas"]:
        d = meta.get(a["postcode"]) or {}
        lat, lon = a["label"]  # _label_point returns [lat, lon]
        for ring in a["rings"]:
            for plon, plat in ring:
                xs.append((plon - lon0) * kx)
                ys.append(-(plat - lat0) * ky)
        areas.append(
            {
                "postcode": a["postcode"],
                "name": a["name"],
                "district": a["district"],
                "selectable": bool(a["district"]),
                "unlocked": bool(d.get("unlocked")),
                "built": bool(d.get("built")),
                "standalone": bool(d.get("standalone")),
                "access": d.get("access") or "",
                "summary": d.get("summary") or "",
                "label": [round((lon - lon0) * kx), round(-(lat - lat0) * ky)],
                "path": _path(a["rings"], fr),
            }
        )
    order = [pc for pc in MENU_ORDER if any(a["postcode"] == pc and a["selectable"] for a in areas)]
    # Frame the city districts; the port (2030) and the northern polders run off the edge.
    fx: list[float] = []
    fy: list[float] = []
    for a in raw["areas"]:
        if a["district"] and not (meta.get(a["postcode"]) or {}).get("standalone"):
            for ring in a["rings"]:
                fx.extend((p[0] - lon0) * kx for p in ring)
                fy.extend(-(p[1] - lat0) * ky for p in ring)
    if not fx:
        fx, fy = xs, ys
    pad = 1800.0
    x0, x1, y0, y1 = min(fx) - pad, max(fx) + pad, min(fy) - pad, max(fy) + pad
    return {
        "viewBox": [round(x0), round(y0), round(x1 - x0), round(y1 - y0)],
        "order": order,
        "areas": sorted(areas, key=lambda a: (a["selectable"], a["postcode"])),
        "water": _path(water, fr) if water else "",
    }


def minimap_payload(district_id: str, ring: list[list[float]], osm: dict[str, Any] | None) -> dict[str, Any]:
    """District outline + streets in a ``MINIMAP_SIZE`` square (y down, north up)."""
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    fr = _frame([min(lats), min(lons), max(lats), max(lons)])
    lat0, lon0, kx, ky = fr
    w = (max(lons) - min(lons)) * kx
    h = (max(lats) - min(lats)) * ky
    scale = MINIMAP_SIZE * 0.92 / max(w, h, 1.0)

    def to_px(lon: float, lat: float) -> list[int]:
        return [
            round(MINIMAP_SIZE / 2 + (lon - lon0) * kx * scale),
            round(MINIMAP_SIZE / 2 - (lat - lat0) * ky * scale),
        ]

    from cityview.districts import point_in_ring

    roads: list[dict[str, Any]] = []
    if osm:
        nodes = {e["id"]: e for e in osm.get("elements") or [] if e.get("type") == "node"}
        for way in osm.get("elements") or []:
            if way.get("type") != "way":
                continue
            rank = _MINIMAP_ROADS.get((way.get("tags") or {}).get("highway", ""))
            if not rank:
                continue
            pts = []
            for nid in way.get("nodes") or []:
                n = nodes.get(nid)
                if n is None:
                    continue
                if not point_in_ring(float(n["lat"]), float(n["lon"]), ring):
                    continue
                p = to_px(float(n["lon"]), float(n["lat"]))
                if not pts or abs(p[0] - pts[-1][0]) + abs(p[1] - pts[-1][1]) >= 3:
                    pts.append(p)
            if len(pts) >= 2:
                roads.append({"r": rank, "p": pts})
    return {
        "district": district_id,
        "size": MINIMAP_SIZE,
        "outline": [to_px(lon, lat) for lon, lat in ring],
        "roads": roads,
    }


def write_menu_map(index: dict[str, Any] | None = None, *, out_dir: Path | None = None) -> list[Path]:
    from cityview.districts import DISTRICT_REGISTRY, district_paths, load_index
    from cityview.postcodes import postcode_main_ring

    index = index or load_index()
    out_dir = Path(out_dir or MENU_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    path = out_dir / "antwerp_postcodes.json"
    try:
        water = load_water()
    except RuntimeError as exc:
        print(f"menu water skipped: {exc}")
        water = None
    path.write_text(json.dumps(menu_map_payload(index, water), separators=(",", ":")) + "\n")
    written.append(path)
    for did, entry in DISTRICT_REGISTRY.items():
        try:
            ring = postcode_main_ring(entry["postcode"])
        except KeyError:
            continue
        osm = None
        cache = district_paths(did).osm_cache
        if cache.exists():
            try:
                osm = json.loads(cache.read_text())
            except json.JSONDecodeError:
                osm = None
        mpath = out_dir / f"minimap-{did}.json"
        mpath.write_text(json.dumps(minimap_payload(did, ring, osm), separators=(",", ":")) + "\n")
        written.append(mpath)
    for p in written:
        print(f"Wrote {p} ({p.stat().st_size / 1024:.0f} KB)")
    return written
