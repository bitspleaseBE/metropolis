"""Enterable shop interiors for the viewer: which doors open and what room is behind them.

Each shopfront whose ``kind`` has an interior template gets a record in
``viewer/districts/<id>/interiors.json``: template + variant, a room ``w x d`` sized
from the façade bay and the building footprint behind it, the door offset along the
façade (shared with the shopfront and the door glow), how many staff and customers
the viewer spawns, and the brand colours for uniforms. The viewer builds the actual
room procedurally from ``seed``. Churches and everything without a template stay shut.

``districts/<id>/interiors.json`` holds curated overrides (``by_osm`` / ``by_name``,
like ``shop_overrides.json``) for places that deserve a hand-tuned room.
Pure stdlib, Blender-free.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

TEMPLATE_BY_KIND = {
    "supermarket": "supermarket",
    "convenience": "grocery",
    "greengrocer": "grocery",
    "deli": "grocery",
    "bakery": "grocery",
    "butcher": "grocery",
    "restaurant": "restaurant",
    "fast_food": "restaurant",
    "cafe": "bar_coffee",
    "bar": "bar_coffee",
    "pub": "bar_coffee",
    "biergarten": "bar_coffee",
    "ice_cream": "bar_coffee",
    "bank": "bank",
    "hospital": "care",
    "clinic": "care",
    "doctors": "care",
    "pharmacy": "care",
    "car_repair": "garage",
    "car": "garage",
}
NEVER_ENTERABLE = frozenset({"place_of_worship", "church", "chapel", "cathedral"})
FORMER_NAME = re.compile(r"^\s*(voormalig|vroeger|former|ex-)", re.I)
TEMPLATES = ("supermarket", "grocery", "restaurant", "bar_coffee", "bank", "care", "garage")

DEPTH_MIN_M = 5.0
DEPTH_MAX_M = 30.0
WIDTH_MIN_M = 4.0
# Templates that take the whole street wall of their building, capped per template.
WIDE_TEMPLATES = {"supermarket": 24.0, "care": 20.0, "garage": 16.0, "bank": 14.0}
# Public room depth; the rest of a deep Antwerp plot is stock rooms and kitchens.
DEPTH_CAP_M = {
    "supermarket": 30.0, "grocery": 16.0, "restaurant": 20.0, "bar_coffee": 18.0,
    "bank": 16.0, "care": 24.0, "garage": 24.0,
}
VARIANT_MIN_M = {"hospital": (14.0, 18.0), "pharmacy": (4.0, 6.0), "workshop": (8.0, 10.0)}
SIZE_S_M2 = 50.0
SIZE_L_M2 = 150.0

# Pilaster widths per shopfront archetype (viewer/shops.js FRONTS[*].pil).
FRONT_PIL = {
    "boutique": 0.08, "bar": 0.24, "cafe": 0.2, "restaurant": 0.18, "bakery": 0.16,
    "chocolatier": 0.2, "heritage": 0.22, "market": 0.12, "frituur": 0.14, "kebab": 0.12,
    "pizza": 0.16, "newsstand": 0.1, "fastfood": 0.12, "bank": 0.22, "pharmacy": 0.14,
    "office": 0.14, "plain": 0.16,
}
DOOR_W_M = 1.0
DOOR_MIN_FRONT_M = 2.6  # narrower fronts have no side door in the viewer

OVERRIDE_KEYS = ("template", "variant", "size", "staff", "customers", "seed", "locked", "w", "d")


def interior_template(kind: str | None) -> str | None:
    if not kind or kind in NEVER_ENTERABLE:
        return None
    return TEMPLATE_BY_KIND.get(kind)


def interior_variant(template: str, shop: dict[str, Any]) -> str:
    kind = shop.get("kind") or ""
    front = shop.get("front") or ""
    name = (shop.get("name") or "").lower()
    if template == "grocery":
        if kind == "greengrocer":
            return "greengrocer"
        if kind in {"bakery", "butcher", "deli"}:
            return "counter"
        return "convenience"
    if template == "restaurant":
        if front == "frituur":
            return "frituur"
        if kind == "fast_food" or front in {"fastfood", "kebab"}:
            return "fastfood"
        return "dining"
    if template == "bar_coffee":
        if kind in {"cafe", "ice_cream"}:
            return "coffee"
        if "cocktail" in name or kind == "bar":
            return "cocktail"
        return "brown"
    if template == "care":
        if kind == "pharmacy":
            return "pharmacy"
        if kind == "hospital":
            return "hospital"
        return "practice"
    if template == "garage":
        return "workshop" if kind == "car_repair" else "showroom"
    if template == "bank":
        return "branch"
    return "market"


def js_hash(n: int) -> float:
    """``hash`` from viewer/shops.js (uint32 mix, 0..1) so both sides pick the same door."""
    h = (int(n) % 4294967296) ^ 0x9E3779B9
    h = ((h ^ (h >> 16)) * 0x85EBCA6B) & 0xFFFFFFFF
    return ((h ^ (h >> 13)) & 0xFFFFFFFF) / 4294967296


def door_offset(shop: dict[str, Any]) -> float:
    """Door centre along the façade tangent (metres from the bay centre, viewer frame)."""
    fw = max(1.6, float(shop.get("houseW") or shop.get("w") or 3.0) * 0.92)
    if fw < DOOR_MIN_FRONT_M:
        return 0.0
    h = fw / 2.0
    pil = FRONT_PIL.get(shop.get("front") or "plain", FRONT_PIL["plain"])
    left = js_hash(int(shop["id"]) * 7 + 3) < 0.5
    a = -h + pil + DOOR_W_M / 2.0 if left else h - pil - DOOR_W_M / 2.0
    return round(a, 3)


# ---------------------------------------------------------------- footprint depth


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


def _ray_exit(px: float, py: float, dx: float, dy: float, ring: list[list[float]]) -> float | None:
    """Distance along (dx, dy) from (px, py) to the first ring edge, or None."""
    best = None
    n = len(ring)
    for i in range(n):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-9:
            continue
        t = ((ax - px) * ey - (ay - py) * ex) / den
        u = ((ax - px) * dy - (ay - py) * dx) / den
        if t > 0.05 and -1e-6 <= u <= 1 + 1e-6 and (best is None or t < best):
            best = t
    return best


def _seg_dist(px: float, py: float, a: list[float], b: list[float]) -> tuple[float, float]:
    dx, dy = b[0] - a[0], b[1] - a[1]
    ll = dx * dx + dy * dy
    if ll < 1e-9:
        return math.hypot(px - a[0], py - a[1]), 0.0
    t = max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / ll))
    return math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)), math.sqrt(ll)


class FootprintIndex:
    """Grid of building rings for the façade-to-footprint rejoin (ids are not exported)."""

    def __init__(self, buildings: list[dict[str, Any]], cell: float = 25.0) -> None:
        self.cell = cell
        self.grid: dict[tuple[int, int], list[list[list[float]]]] = {}
        for b in buildings:
            ring = b.get("ring") or []
            if len(ring) < 3:
                continue
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            for gx in range(int(math.floor(min(xs) / cell)), int(math.floor(max(xs) / cell)) + 1):
                for gy in range(int(math.floor(min(ys) / cell)), int(math.floor(max(ys) / cell)) + 1):
                    self.grid.setdefault((gx, gy), []).append(ring)

    def near(self, x: float, y: float) -> list[list[list[float]]]:
        gx, gy = int(math.floor(x / self.cell)), int(math.floor(y / self.cell))
        seen: dict[int, list[list[float]]] = {}
        for ix in (gx - 1, gx, gx + 1):
            for iy in (gy - 1, gy, gy + 1):
                for ring in self.grid.get((ix, iy), ()):
                    seen[id(ring)] = ring
        return list(seen.values())


def room_extent(shop: dict[str, Any], index: FootprintIndex | None) -> tuple[float | None, float | None]:
    """(depth behind the façade, street-wall length) of the building the shop sits on."""
    if index is None:
        return None, None
    x, y = float(shop["x"]), float(shop["y"])
    nx, ny = float(shop["nx"]), float(shop["ny"])
    px, py = x - nx * 0.3, y - ny * 0.3
    rings = index.near(x, y)
    host = next((r for r in rings if _point_in_ring(px, py, r)), None)
    if host is None:
        return None, None
    depth = _ray_exit(px, py, -nx, -ny, host)
    wall = None
    best = None
    for i in range(len(host)):
        d, length = _seg_dist(x, y, host[i], host[(i + 1) % len(host)])
        if best is None or d < best:
            best, wall = d, length
    return (depth + 0.3 if depth is not None else None), wall


def size_class(area: float) -> str:
    if area < SIZE_S_M2:
        return "S"
    return "M" if area < SIZE_L_M2 else "L"


def npc_counts(template: str, variant: str, size: str, area: float) -> tuple[int, int]:
    """(staff, customers) for a room; the viewer spawns exactly these."""
    big = size == "L"
    mid = size != "S"
    if template == "supermarket":
        return 2 + big, max(3, min(10, round(area / 30.0)))
    if template == "grocery":
        return 1 + (variant == "counter" and mid), max(1, min(4, round(area / 20.0)))
    if template == "restaurant":
        return 2 + big, max(2, min(10, round(area / 12.0)))
    if template == "bar_coffee":
        return 1 + mid, max(2, min(8, round(area / 10.0)))
    if template == "bank":
        return 2, max(1, min(3, round(area / 30.0)))
    if template == "care":
        if variant == "pharmacy":
            return 1 + mid, max(1, min(3, round(area / 20.0)))
        return 2 + big, max(2, min(8, round(area / 15.0)))
    if template == "garage":
        return 2, 1 if variant == "showroom" else max(0, min(1, round(area / 80.0)))
    return 1, 1


# ---------------------------------------------------------------- overrides + export


def load_interior_overrides(path: Path) -> dict[str, Any]:
    """``districts/<id>/interiors.json`` (``by_osm`` keys like ``node/123``; ``by_name`` lowercase)."""
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _override_for(overrides: dict[str, Any], shop: dict[str, Any]) -> dict[str, Any] | None:
    if not overrides:
        return None
    sid = str(shop.get("id"))
    for key, val in (overrides.get("by_osm") or {}).items():
        if str(key).split("/")[-1] == sid and isinstance(val, dict):
            return val
    name = (shop.get("name") or "").strip().lower()
    hit = (overrides.get("by_name") or {}).get(name) if name else None
    return hit if isinstance(hit, dict) else None


def plan_interior(
    shop: dict[str, Any], index: FootprintIndex | None, overrides: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    """Interior record for one shopfront, or None when its door stays shut."""
    ov = _override_for(overrides or {}, shop) or {}
    template = ov.get("template") or interior_template(shop.get("kind"))
    if template not in TEMPLATES or (shop.get("kind") in NEVER_ENTERABLE):
        return None
    if not ov and FORMER_NAME.match(shop.get("name") or ""):
        return None
    variant = str(ov.get("variant") or interior_variant(template, shop))
    depth, wall = room_extent(shop, index)
    house = float(shop.get("houseW") or shop.get("w") or 5.0)
    w = house
    if template in WIDE_TEMPLATES and wall:
        w = max(house, min(wall, WIDE_TEMPLATES[template]))
    d = depth if depth is not None else (14.0 if template in WIDE_TEMPLATES else 9.0)
    d = min(d, DEPTH_CAP_M.get(template, DEPTH_MAX_M))
    min_w, min_d = VARIANT_MIN_M.get(variant, (WIDTH_MIN_M, DEPTH_MIN_M))
    w = float(ov.get("w") or max(min_w, WIDTH_MIN_M, w))
    d = float(ov.get("d") or max(min_d, DEPTH_MIN_M, min(DEPTH_MAX_M, d)))
    area = w * d
    size = str(ov.get("size") or size_class(area))
    staff, customers = npc_counts(template, variant, size, area)
    rec: dict[str, Any] = {
        "id": int(shop["id"]),
        "name": shop.get("name") or "",
        "kind": shop.get("kind"),
        "template": template,
        "variant": variant,
        "size": size,
        "w": round(w, 2),
        "d": round(d, 2),
        "doorA": door_offset(shop),
        "seed": int(ov.get("seed") or shop["id"]) % 2147483647,
        "staff": int(ov.get("staff", staff)),
        "customers": int(ov.get("customers", customers)),
        "fascia": shop.get("fascia"),
        "accent": shop.get("accent"),
    }
    if shop.get("atm") or template == "bank":
        rec["atm"] = True
    if ov:
        rec["curated"] = True
        if ov.get("locked"):
            rec["locked"] = True
    return rec


def export_interiors_for_viewer(
    shops: list[dict[str, Any]],
    buildings: list[dict[str, Any]] | None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """``interiors.json`` payload; also stamps ``doorA`` / ``enter`` onto the shop records."""
    index = FootprintIndex(buildings) if buildings else None
    out = []
    for shop in shops:
        rec = plan_interior(shop, index, overrides)
        if rec is None:
            shop.pop("doorA", None)
            shop.pop("enter", None)
            continue
        shop["doorA"] = rec["doorA"]
        shop["enter"] = rec["template"]
        out.append(rec)
    return {"attribution": "Interiors: procedural from (c) OpenStreetMap contributors (ODbL)", "interiors": out}


def district_interior_overrides(paths) -> dict[str, Any]:
    path = paths.root / "interiors.json"
    return load_interior_overrides(path) if path.exists() else {}
