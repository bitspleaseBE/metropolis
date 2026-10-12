"""Shopfronts for the browser viewer from OpenStreetMap shop / amenity nodes.

Each ``shop=*`` (and street-facing amenity: café, bar, bank, pharmacy, ...) node is
snapped onto the street façade of the building it sits in (or the nearest one), so
the viewer can hang a named fascia + blade sign there and light it while the place
is open. ``opening_hours`` is reduced to a weekly table (Sunday first, like JS
``Date.getDay``); places without (parsable) hours get a typical schedule for their
category. Pure stdlib, Blender-free.
"""

from __future__ import annotations

import math
import re
from typing import Any, Iterable

from cityview.facade_kit import TARGET_HOUSE_M, TOWER_HOUSE_M, TOWER_LEVELS
from cityview.geo import project
from cityview.shop_brands import awning_for, front_for, normalize_shop_brand, shopfront_style

# OSM tag value → viewer category (colour + icon + default hours).
AMENITY_CATS = {
    "restaurant": "horeca",
    "cafe": "horeca",
    "bar": "horeca",
    "pub": "horeca",
    "fast_food": "horeca",
    "ice_cream": "horeca",
    "biergarten": "horeca",
    "nightclub": "horeca",
    "bank": "service",
    "pharmacy": "pharmacy",
    "dentist": "care",
    "doctors": "care",
    "veterinary": "care",
    "post_office": "service",
    "bureau_de_change": "service",
    "money_transfer": "service",
}
FOOD_SHOPS = frozenset(
    {
        "bakery", "butcher", "greengrocer", "deli", "convenience", "supermarket", "cheese",
        "chocolate", "confectionery", "pastry", "seafood", "alcohol", "beverages", "wine",
        "coffee", "tea", "spices", "frozen_food", "health_food", "farm",
    }
)
SERVICE_SHOPS = frozenset(
    {
        "hairdresser", "beauty", "massage", "tattoo", "laundry", "dry_cleaning", "copyshop",
        "optician", "travel_agency", "funeral_directors", "estate_agent", "mobile_phone",
        "computer", "electronics", "repair", "tailor", "photo", "pawnbroker",
    }
)
SKIP_SHOPS = frozenset({"vacant", "no", "yes"})

DEFAULT_HOURS: dict[str, list[list[tuple[float, float]]]] = {
    # Sunday .. Saturday
    "food": [[(8.0, 13.0)]] + [[(7.5, 19.0)]] * 6,
    "horeca": [[(11.0, 23.0)]] + [[(11.0, 23.0)]] * 4 + [[(11.0, 25.0)]] * 2,
    "retail": [[]] + [[(10.0, 18.0)]] * 6,
    "service": [[]] + [[(9.0, 18.0)]] * 5 + [[(9.0, 16.0)]],
    "pharmacy": [[]] + [[(8.5, 18.5)]] * 5 + [[(9.0, 12.5)]],
    "care": [[]] + [[(8.0, 18.0)]] * 5 + [[]],
}

FACADE_SEARCH_M = 18.0  # dense historic cores (Meir / Groenplaats) need a little slack
STREET_BONUS_M = 12.0  # a street-facing wall wins over a nearer side / courtyard wall
MIN_SPACING_M = 3.2  # two signs on one façade keep this far apart
SIGN_MAX_W = 5.6  # keep under one photo-façade house (~6.4 m)
SIGN_MIN_W = 2.4


def house_bays(length: float, floors: int = 4) -> list[tuple[float, float]]:
    """Same house cuts as ``facade_kit.plan_facade_quads`` (metres along the edge)."""
    target = TARGET_HOUSE_M if floors < TOWER_LEVELS else TOWER_HOUSE_M
    reps = max(1, int(round(length / target)))
    rep = length / reps
    return [(i * rep, (i + 1) * rep) for i in range(reps)]


def category_for(tags: dict[str, str]) -> tuple[str, str] | None:
    """(kind, category) for a tag dict, or None when it is not a shopfront."""
    shop = (tags.get("shop") or "").strip()
    if shop and shop not in SKIP_SHOPS:
        if shop in FOOD_SHOPS:
            return shop, "food"
        if shop in SERVICE_SHOPS:
            return shop, "service"
        return shop, "retail"
    amenity = (tags.get("amenity") or "").strip()
    if amenity in AMENITY_CATS:
        return amenity, AMENITY_CATS[amenity]
    return None


# ---------------------------------------------------------------- opening_hours

_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
_TIME = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?")
_DAY_TOKEN = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$")


def _expand_days(spec: str) -> list[int] | None:
    days: list[int] = []
    for part in re.split(r"[,\s]+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)|,", spec):
        part = part.strip()
        if not part:
            continue
        m = _DAY_TOKEN.match(part)
        if not m:
            return None
        if m.group(1) == "PH":
            continue  # public holidays: ignored (the game has none)
        a = _DAYS.index(m.group(1))
        b = _DAYS.index(m.group(2)) if m.group(2) else a
        # OSM weeks run Mo..Su; a range like Fr-Mo wraps.
        i = a
        while True:
            days.append(i)
            if i == b:
                break
            i = (i + 1) % 7
    return days


def _split_rules(raw: str) -> list[str]:
    """Split on ';' and on ', <Day>' (a common shorthand for a new rule)."""
    out: list[str] = []
    for chunk in raw.split(";"):
        out.extend(re.split(r"(?<=\d),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)", chunk))
    return [c.strip() for c in out if c.strip()]


def parse_opening_hours(raw: str | None) -> list[list[tuple[float, float]]] | None:
    """Weekly table (Sunday first) of open intervals in hours, close may exceed 24.

    Supports the common subset: ``Mo-Fr 09:00-18:00``, day lists, ``off``,
    ``24/7``, several time ranges per rule, rules without days (= every day).
    Later rules override earlier ones for the days they name. Returns None when
    the value uses syntax outside that subset.
    """
    if not raw:
        return None
    raw = raw.strip()
    if raw == "24/7":
        return [[(0.0, 24.0)] for _ in range(7)]
    week: list[list[tuple[float, float]]] = [[] for _ in range(7)]
    any_rule = False
    for rule in _split_rules(raw):
        m = re.match(r"^([A-Za-z,\-\s]*?)\s*((?:\d|off|closed).*)$", rule)
        if not m:
            return None
        day_spec, body = m.group(1).strip(), m.group(2).strip()
        days = _expand_days(day_spec) if day_spec else list(range(7))
        if days is None:
            if day_spec.startswith("PH"):
                continue
            return None
        if not days:
            continue  # PH-only rule
        if body in ("off", "closed"):
            for d in days:
                week[d] = []
            any_rule = True
            continue
        spans = []
        for t in _TIME.finditer(body):
            o = int(t.group(1)) + int(t.group(2)) / 60.0
            c = int(t.group(3)) + int(t.group(4)) / 60.0
            if c <= o:
                c += 24.0  # past midnight
            spans.append((round(o, 3), round(c, 3)))
        if not spans:
            return None
        for d in days:
            week[d] = list(spans)
        any_rule = True
    return week if any_rule else None


# ---------------------------------------------------------------- façade snap


def _seg_project(px: float, py: float, ax: float, ay: float, bx: float, by: float):
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy
    if ll < 1e-9:
        return 0.0, math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
    return t, math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _signed_area(ring: list[list[float]]) -> float:
    return 0.5 * sum(
        ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1]
        for i in range(len(ring))
    )


def _point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _edges(bldg: dict[str, Any]) -> Iterable[tuple[int, int, tuple[float, float], bool]]:
    """(i0, i1, outward normal, street-facing) for every edge of the footprint."""
    ring = bldg["ring"]
    street = {}
    for e in bldg.get("street_edges") or []:
        street[(int(e["i0"]), int(e["i1"]))] = tuple(e.get("outward") or (0.0, 0.0))
    ccw = _signed_area(ring) > 0
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        if (i, j) in street:
            yield i, j, street[(i, j)], True
            continue
        dx, dy = ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = (dy / ln, -dx / ln) if ccw else (-dy / ln, dx / ln)
        yield i, j, (nx, ny), False


class _BuildingIndex:
    def __init__(self, buildings: list[dict[str, Any]], cell: float = 25.0) -> None:
        self.cell = cell
        self.grid: dict[tuple[int, int], list[dict[str, Any]]] = {}
        for b in buildings:
            ring = b.get("ring") or []
            if len(ring) < 3:
                continue
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            for gx in range(int(math.floor(min(xs) / cell)), int(math.floor(max(xs) / cell)) + 1):
                for gy in range(int(math.floor(min(ys) / cell)), int(math.floor(max(ys) / cell)) + 1):
                    self.grid.setdefault((gx, gy), []).append(b)

    def near(self, x: float, y: float, r: float) -> list[dict[str, Any]]:
        seen: dict[int, dict[str, Any]] = {}
        c = self.cell
        for gx in range(int(math.floor((x - r) / c)), int(math.floor((x + r) / c)) + 1):
            for gy in range(int(math.floor((y - r) / c)), int(math.floor((y + r) / c)) + 1):
                for b in self.grid.get((gx, gy), ()):
                    seen[id(b)] = b
        return list(seen.values())


def snap_to_facade(
    x: float, y: float, index: _BuildingIndex
) -> dict[str, Any] | None:
    """Nearest façade point (street-facing edges preferred) for a shop node."""
    best = None
    for b in index.near(x, y, FACADE_SEARCH_M):
        ring = b["ring"]
        inside = _point_in_ring(x, y, ring)
        for i0, i1, (nx, ny), street in _edges(b):
            a, c = ring[i0], ring[i1]
            length = math.hypot(c[0] - a[0], c[1] - a[1])
            if length < SIGN_MIN_W + 0.6:
                continue
            t, d = _seg_project(x, y, a[0], a[1], c[0], c[1])
            if d > FACADE_SEARCH_M:
                continue
            # A node outside a building must sit in front of the face it snaps to.
            if not inside and (x - a[0]) * nx + (y - a[1]) * ny < -0.5:
                continue
            # Only street edges carry a shopfront elevation; side / courtyard walls are blank.
            score = d - (STREET_BONUS_M if street else 0.0) - (2.0 if inside else 0.0)
            if best is None or score < best[0]:
                best = (score, b, i0, i1, t, length, (nx, ny), street)
    if best is None:
        return None
    _, b, i0, i1, t, length, (nx, ny), street = best
    ring = b["ring"]
    a, c = ring[i0], ring[i1]
    floors = int(b.get("floors") or 4)
    # Snap onto one photo-façade house so a sign never straddles two elevations.
    along = t * length
    bays = house_bays(length, floors)
    a0, a1 = min(bays, key=lambda bay: abs((bay[0] + bay[1]) * 0.5 - along))
    house_w = a1 - a0
    w = max(SIGN_MIN_W, min(SIGN_MAX_W, house_w * 0.88))
    t = ((a0 + a1) * 0.5) / length
    return {
        "x": a[0] + (c[0] - a[0]) * t,
        "y": a[1] + (c[1] - a[1]) * t,
        "nx": nx,
        "ny": ny,
        "w": w,
        "edge": (b.get("id"), i0),
        "t": t,
        "length": length,
        "street": street,
        "floors": floors,
        "houseW": round(house_w, 2),
    }


TERRACE_KINDS = frozenset({"cafe", "bar", "pub", "restaurant", "ice_cream", "biergarten"})


def has_terrace(tags: dict[str, str], kind: str, category: str) -> bool:
    """Antwerp horeca puts tables out unless OSM says otherwise; anyone tagged with seating does."""
    seating = (tags.get("outdoor_seating") or "").strip().lower()
    if seating == "no":
        return False
    return seating == "yes" or (category == "horeca" and kind in TERRACE_KINDS)


def _poi_lat_lon(
    el: dict[str, Any], nodes_by_id: dict[int, dict[str, Any]]
) -> tuple[float, float] | None:
    """Lat/lon for a shop POI node, or way centroid / entrance node."""
    if el.get("type") == "node" and "lat" in el:
        return float(el["lat"]), float(el["lon"])
    if isinstance(el.get("center"), dict):
        return float(el["center"]["lat"]), float(el["center"]["lon"])
    if el.get("type") != "way":
        return None
    tags = el.get("tags") or {}
    # Prefer an explicit entrance node when mapped.
    for nid in el.get("nodes") or []:
        n = nodes_by_id.get(int(nid))
        if not n or "lat" not in n:
            continue
        nt = n.get("tags") or {}
        if nt.get("entrance") in {"yes", "main", "shop"}:
            return float(n["lat"]), float(n["lon"])
    coords = []
    for nid in el.get("nodes") or []:
        n = nodes_by_id.get(int(nid))
        if n and "lat" in n:
            coords.append((float(n["lat"]), float(n["lon"])))
    if not coords:
        return None
    # Closed ways: drop duplicate closing node for a cleaner centroid.
    if len(coords) > 2 and coords[0] == coords[-1]:
        coords = coords[:-1]
    return (
        sum(c[0] for c in coords) / len(coords),
        sum(c[1] for c in coords) / len(coords),
    )


OVERRIDE_KEYS = ("name", "fascia", "accent", "glass", "frame", "front", "awning", "terrace", "mood")


def load_shop_overrides(path) -> dict[str, Any]:
    """``shop_overrides.json``: per-place looks authored from picture references.

    ``{"by_osm": {"node/123": {...}}, "by_name": {"den engel": {...}}}`` with any of
    ``name, fascia, accent, glass, frame ([r,g,b] 0..1; frame = window joinery when it
    differs from the board), front, awning ({colour, stripe} | false), terrace, mood``;
    extra keys (``ref``, ``note``) are documentation.
    """
    try:
        import json

        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _override_for(overrides: dict[str, Any], el: dict[str, Any]) -> dict[str, Any] | None:
    if not overrides:
        return None
    hit = (overrides.get("by_osm") or {}).get(f"{el.get('type')}/{el.get('id')}")
    if hit is None:
        name = ((el.get("tags") or {}).get("name") or "").strip().lower()
        hit = (overrides.get("by_name") or {}).get(name) if name else None
    return hit if isinstance(hit, dict) else None


def _merge_elements(osm: dict[str, Any], places: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Geometry-cache elements + the places stage (places win: fuller tags)."""
    by_key: dict[tuple[str, int], dict[str, Any]] = {}
    for e in osm.get("elements") or []:
        if "id" in e:
            by_key[(str(e.get("type")), int(e["id"]))] = e
    for p in places or []:
        by_key[(str(p.get("type")), int(p["id"]))] = p
    return list(by_key.values())


def plan_shops(
    osm: dict[str, Any],
    layout: dict[str, Any],
    origin: tuple[float, float],
    *,
    places: list[dict[str, Any]] | None = None,
    overrides: dict[str, Any] | None = None,
    refs: dict[tuple[str, int], dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Shopfront records (Blender XY) for every shop node/way that snaps onto a façade.

    ``places`` (``places.places_as_elements``) adds every named shop / horeca the
    geometry download skipped; ``overrides`` re-colours specific places from photos;
    ``refs`` (``place_refs.references_by_osm``) flags places that have a reference.
    """
    index = _BuildingIndex(layout.get("buildings") or [])
    placed: list[dict[str, Any]] = []
    per_edge: dict[Any, list[float]] = {}
    elements = _merge_elements(osm, places)
    nodes_by_id = {int(e["id"]): e for e in elements if e.get("type") == "node" and "id" in e}
    pois = [
        e
        for e in elements
        if e.get("type") in {"node", "way"} and e.get("tags") and category_for(e["tags"]) is not None
    ]
    # Named places first so they win a crowded façade.
    pois.sort(key=lambda e: (not e["tags"].get("name"), e.get("type") != "node", int(e["id"])))
    seen_names: dict[str, list[tuple[float, float]]] = {}
    for el in pois:
        tags = el["tags"]
        cat = category_for(tags)
        if cat is None:
            continue
        lat_lon = _poi_lat_lon(el, nodes_by_id)
        if lat_lon is None:
            continue
        kind, category = cat
        x, y = project(lat_lon[0], lat_lon[1], origin[0], origin[1])
        # Same place mapped as a node and as its building way: keep the first.
        name_key = (tags.get("name") or "").strip().lower()
        if name_key:
            if any(math.hypot(x - ox, y - oy) < 20.0 for ox, oy in seen_names.get(name_key, ())):
                continue
            seen_names.setdefault(name_key, []).append((x, y))
        snap = snap_to_facade(x, y, index)
        if snap is None:
            continue
        along = snap["t"] * snap["length"]
        taken = per_edge.setdefault(snap["edge"], [])
        if any(abs(along - o) < MIN_SPACING_M for o in taken):
            continue
        taken.append(along)
        hours = parse_opening_hours(tags.get("opening_hours"))
        style = shopfront_style(tags, kind, category, int(el["id"]))
        brand = normalize_shop_brand(tags) or style.get("brand")
        rec = {
            "id": int(el["id"]),
            "name": (tags.get("name") or tags.get("brand") or "").strip()[:28],
            "kind": kind,
            "cat": category,
            "x": round(snap["x"], 2),
            "y": round(snap["y"], 2),
            "nx": round(snap["nx"], 4),
            "ny": round(snap["ny"], 4),
            "w": round(snap["w"], 2),
            "houseW": snap.get("houseW") or snap["w"],
            "hours": [[list(s) for s in day] for day in (hours or DEFAULT_HOURS[category])],
            "hoursKnown": hours is not None,
            "mood": style.get("mood") or "retail",
            "fascia": [round(c, 3) for c in style["fascia"][:3]],
            "accent": [round(c, 3) for c in style["accent"][:3]],
            "glass": [round(c, 3) for c in style["glass"][:3]],
        }
        if brand:
            rec["brand"] = brand
        terrace = bool(snap["street"] and has_terrace(tags, kind, category))
        front = style.get("front") or front_for(tags, kind, category)
        awning = awning_for(front, kind, style["fascia"], style["accent"], int(el["id"]), terrace)
        ov = _override_for(overrides or {}, el)
        if ov:
            for key in OVERRIDE_KEYS:
                if key not in ov:
                    continue
                if key == "name":
                    rec["name"] = str(ov["name"])[:28]
                elif key in {"fascia", "accent", "glass", "frame"}:
                    rec[key] = [round(float(c), 3) for c in ov[key][:3]]
                elif key == "front":
                    front = str(ov["front"])
                elif key == "awning":
                    awning = ov["awning"] or None
                elif key == "terrace":
                    terrace = bool(ov["terrace"])
                elif key == "mood":
                    rec["mood"] = str(ov["mood"])
            rec["override"] = True
        if terrace:
            rec["terrace"] = True
        # Street-facing places get a ground-floor shopfront under the fascia.
        if snap["street"] or front == "bank":
            rec["shopfront"] = True
            rec["front"] = front
            if awning:
                rec["awning"] = awning
        if refs and (str(el.get("type")), int(el["id"])) in refs:
            rec["ref"] = refs[(str(el.get("type")), int(el["id"]))].get("slug")
        placed.append(rec)
    return placed


def district_shop_inputs(paths) -> dict[str, Any]:
    """``plan_shops`` keyword inputs from a district package (places, overrides, refs)."""
    import json

    from cityview.place_refs import references_by_osm
    from cityview.places import places_as_elements

    out: dict[str, Any] = {}
    places_path = paths.cache / "places.json"
    if places_path.exists():
        out["places"] = places_as_elements(json.loads(places_path.read_text()))
    ov_path = paths.root / "shop_overrides.json"
    if ov_path.exists():
        out["overrides"] = load_shop_overrides(ov_path)
    refs_path = paths.root / "references" / "index.json"
    if refs_path.exists():
        out["refs"] = references_by_osm(json.loads(refs_path.read_text()))
    return out


# How far from spawn shops stay in the walker package. Beyond this the historic
# centre has thousands of POIs that crush GPU time for little gameplay value.
VIEWER_SHOP_RADIUS_M = 450.0


def export_shops_for_viewer(
    shops: list[dict[str, Any]],
    spawn: dict[str, Any] | None,
    radius: float = VIEWER_SHOP_RADIUS_M,
) -> dict[str, Any]:
    sx = float(spawn["x"]) if spawn else 0.0
    sy = float(spawn["y"]) if spawn else 0.0
    near = [s for s in shops if math.hypot(s["x"] - sx, s["y"] - sy) <= radius]
    return {
        "attribution": "Shops: (c) OpenStreetMap contributors (ODbL)",
        "shops": near,
    }
