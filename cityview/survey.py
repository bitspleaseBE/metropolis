"""One Stad Antwerpen survey cache per district.

Pull-once layers (poles, speeds, markings, bays, furniture, markets, quay,
share-zones) land in ``districts/<id>/cache/survey.json``. Live occupancy
(Velo, dockless fleets) is not stored here — the viewer fetches a station
when the player walks up to it.

The cache is keyed by layer name so a build reads only what it needs.
"""

from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path
from typing import Any

from cityview.geo import bbox_covers, project
from cityview.gis import compact_feature, query_features
from cityview.paths import SURVEY_CACHE, is_allowed_cache_json
from cityview.signals import POLE_KERB_M, in_carriageway

PORTAL = "https://geodata.antwerpen.be/arcgissql/rest/services/P_Portal"
ATTRIBUTION = (
    "Street survey: (c) Stad Antwerpen open data "
    "(https://www.antwerpen.be/info/gratis-open-data-licentie)."
)
FETCH_PAD_DEG = 0.0004
POLE_SNAP_M = 12.0
SPEED_MATCH_M = 14.0
MARKING_EXPORT_M = 420.0
BAY_EXPORT_M = 420.0

# name -> (query url, outFields, geom, keep-fields)
_LAYERS: dict[str, tuple[str, str, str, tuple[str, ...]]] = {
    "signal_poles": (
        f"{PORTAL}/portal_publiek1/MapServer/610/query",
        "OBJECTID,PID,Kruispunt,Paaltype",
        "point",
        ("PID", "Kruispunt", "Paaltype"),
    ),
    "speeds": (
        f"{PORTAL}/portal_publiek2/MapServer/83/query",
        "OBJECTID,SNELHEID,LSTRNM,RSTRNM,WEGCAT",
        "line",
        ("SNELHEID", "LSTRNM", "RSTRNM"),
    ),
    "markings": (
        f"{PORTAL}/portal_publiek4/MapServer/251/query",
        "OBJECTID,Type,Kleur,Materie",
        "ring",
        ("Type", "Kleur", "Materie"),
    ),
    "parking_bays": (
        f"{PORTAL}/portal_publiek10/MapServer/970/query",
        "OBJECTID,GISID,Orientatie,Belijnd,Capaciteit,Bestemming,STATUS",
        "ring",
        ("GISID", "Orientatie", "Belijnd", "Capaciteit", "Bestemming", "STATUS"),
    ),
    "chargers": (
        f"{PORTAL}/portal_publiek5/MapServer/572/query",
        "OBJECTID,GISID,Type,AC_DC,Exploitant,Publiek,NAAM",
        "point",
        ("GISID", "Type", "AC_DC", "Exploitant", "Publiek", "NAAM"),
    ),
    "bike_racks": (
        f"{PORTAL}/portal_publiek6/MapServer/583/query",
        "OBJECTID,GISID,Type,Capaciteit,NAAM",
        "point",
        ("GISID", "Type", "Capaciteit", "NAAM"),
    ),
    "bike_lockers": (
        f"{PORTAL}/portal_publiek2/MapServer/145/query",
        "OBJECTID,Objectcode,Type_fietsstalling,Aantal_plaatsen",
        "point",
        ("Objectcode", "Type_fietsstalling", "Aantal_plaatsen"),
    ),
    "shelters": (
        f"{PORTAL}/portal_publiek4/MapServer/270/query",
        "OBJECTID,Objectcode,Type_Wachthuisje,Naam",
        "point",
        ("Objectcode", "Type_Wachthuisje", "Naam"),
    ),
    "posters": (
        f"{PORTAL}/portal_publiek4/MapServer/278/query",
        "OBJECTID,Objectcode,Straatnaam",
        "point",
        ("Objectcode", "Straatnaam"),
    ),
    "city_boards": (
        f"{PORTAL}/portal_publiek4/MapServer/272/query",
        "OBJECTID,Objectcode,Straatnaam",
        "point",
        ("Objectcode", "Straatnaam"),
    ),
    "info_boards": (
        f"{PORTAL}/portal_publiek4/MapServer/271/query",
        "OBJECTID,Objectcode,Straatnaam",
        "point",
        ("Objectcode", "Straatnaam"),
    ),
    "markets": (
        f"{PORTAL}/portal_publiek1/MapServer/38/query",
        "OBJECTID,id,type,locatie,marktdag1,marktdag2,van,tot,soort,postcode",
        "point",
        ("id", "type", "locatie", "marktdag1", "marktdag2", "van", "tot", "soort", "postcode"),
    ),
    "market_grounds": (
        f"{PORTAL}/portal_publiek3/MapServer/202/query",
        "OBJECTID,id,type,locatie",
        "ring",
        ("id", "type", "locatie"),
    ),
    "jetties": (
        f"{PORTAL}/portal_publiek10/MapServer/994/query",
        "OBJECTID,GISID,NAAM",
        "ring",
        ("GISID", "NAAM"),
    ),
    "mooring_posts": (
        f"{PORTAL}/portal_publiek10/MapServer/993/query",
        "OBJECTID,GISID,NUMMER,HOEK",
        "point",
        ("GISID", "NUMMER", "HOEK"),
    ),
    "berths": (
        f"{PORTAL}/portal_publiek10/MapServer/996/query",
        "OBJECTID,MP_NUMMER,KAAINUMMER,DOKNAAM",
        "point",
        ("MP_NUMMER", "KAAINUMMER", "DOKNAAM"),
    ),
    "quay_numbers": (
        f"{PORTAL}/portal_publiek6/MapServer/590/query",
        "OBJECTID,kaainummer,label,straatnaam",
        "point",
        ("kaainummer", "label", "straatnaam"),
    ),
    "harbour_bridges": (
        f"{PORTAL}/portal_publiek13/MapServer/8/query",
        "OBJECTID,GISID,NAAM,DRAAITIJDEN",
        "ring",
        ("GISID", "NAAM", "DRAAITIJDEN"),
    ),
    "waterbus": (
        f"{PORTAL}/portal_publiek7/MapServer/800/query",
        "OBJECTID,GISID,HALTE,EXPLOITANT",
        "point",
        ("GISID", "HALTE", "EXPLOITANT"),
    ),
}

_SHARE_LAYERS: dict[str, tuple[str, str]] = {
    "drop": (f"{PORTAL}/extern_Deelmobiliteit/MapServer/4/query", "drop"),
    "nogo": (f"{PORTAL}/extern_Deelmobiliteit/MapServer/1/query", "nogo"),
    "nopark": (f"{PORTAL}/extern_Deelmobiliteit/MapServer/0/query", "nopark"),
    "slow": (f"{PORTAL}/extern_Deelmobiliteit/MapServer/5/query", "slow"),
}

_SPEED_RE = re.compile(r"(\d+)")


def _checked_cache_path(path: Path) -> Path:
    resolved = Path(path).resolve()
    if not is_allowed_cache_json(resolved, SURVEY_CACHE):
        raise ValueError(
            f"survey cache must be a .json file under {SURVEY_CACHE.resolve()} "
            f"or districts/*/cache/"
        )
    return resolved


def fetch_layer(name: str, bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    url, fields, geom, keep = _LAYERS[name]
    feats = query_features(url, bbox, out_fields=fields)
    out: list[dict[str, Any]] = []
    for feat in feats:
        rec = compact_feature(feat, geom=geom, keep=keep)
        if rec is not None:
            out.append(rec)
    return out


def fetch_share_zones(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for url, kind in _SHARE_LAYERS.values():
        for feat in query_features(url, bbox, out_fields="OBJECTID"):
            rec = compact_feature(feat, geom="ring", keep=())
            if rec is None:
                continue
            rec["kind"] = kind
            out.append(rec)
    return out


def fetch_survey_sources(
    bbox: tuple[float, float, float, float],
    cache_path: Path,
    refresh: bool = False,
) -> dict[str, Any]:
    """Load or download the municipal survey payload for a tile."""
    cache_path = _checked_cache_path(cache_path)
    cached = json.loads(cache_path.read_text()) if cache_path.exists() and not refresh else None
    if cached is not None and bbox_covers(cached.get("bbox"), bbox) and cached.get("layers"):
        return cached
    south, west, north, east = bbox
    padded = (south - FETCH_PAD_DEG, west - FETCH_PAD_DEG, north + FETCH_PAD_DEG, east + FETCH_PAD_DEG)
    payload: dict[str, Any] = {
        "bbox": list(padded),
        "attribution": ATTRIBUTION,
        "fetched": time.strftime("%Y-%m-%d"),
        "layers": {},
        "errors": [],
    }
    for name in _LAYERS:
        try:
            payload["layers"][name] = fetch_layer(name, padded)
        except Exception as exc:  # noqa: BLE001
            payload["layers"][name] = []
            payload["errors"].append(f"{name}: {exc}")
    try:
        payload["layers"]["share_zones"] = fetch_share_zones(padded)
    except Exception as exc:  # noqa: BLE001
        payload["layers"]["share_zones"] = []
        payload["errors"].append(f"share_zones: {exc}")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, separators=(",", ":")))  # nosemgrep
    return payload


def attach_survey(
    layout: dict[str, Any],
    bbox: tuple[float, float, float, float],
    origin: tuple[float, float],
    cache_path: Path,
    refresh: bool = False,
) -> dict[str, Any]:
    """Store the survey payload on ``layout`` (network only on cache miss / refresh)."""
    payload = fetch_survey_sources(bbox, cache_path, refresh=refresh)
    layout["survey"] = payload
    layout["survey_origin"] = [origin[0], origin[1]]
    return payload


def summarize(payload: dict[str, Any]) -> str:
    layers = payload.get("layers") or {}
    bits = [f"{k}={len(v)}" for k, v in layers.items() if v]
    errors = payload.get("errors") or []
    extra = f"; errors: {'; '.join(errors)}" if errors else ""
    return f"{sum(len(v) for v in layers.values())} records ({', '.join(bits) or 'empty'}){extra}"


# ---------------------------------------------------------------- project / classify


def _xy(rec: dict[str, Any], origin: tuple[float, float]) -> tuple[float, float] | None:
    if rec.get("lat") is None or rec.get("lon") is None:
        return None
    return project(float(rec["lat"]), float(rec["lon"]), origin[0], origin[1])


def project_line(line: list[list[float]], origin: tuple[float, float]) -> list[list[float]]:
    # Cache lines are lon, lat (GeoJSON order).
    return [list(project(p[1], p[0], origin[0], origin[1])) for p in line]


def project_ring(ring: list[list[float]], origin: tuple[float, float]) -> list[list[float]]:
    # Cache rings are lon, lat (GeoJSON order).
    return [[round(x, 2), round(y, 2)] for x, y in (project(p[1], p[0], origin[0], origin[1]) for p in ring)]


def parse_speed_kmh(raw: Any) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if not text:
        return None
    hit = _SPEED_RE.search(text)
    if not hit:
        return None
    value = float(hit.group(1))
    return value if 5 <= value <= 120 else None


def classify_marking(type_name: Any, colour: Any = None) -> str:
    """Short enum from the city's ``Type`` / ``Kleur`` strings."""
    text = f"{type_name or ''} {colour or ''}".lower()
    if any(k in text for k in ("zebra", "zebrapad", "voetganger", "oversteek")):
        return "zebra"
    if any(k in text for k in ("stopstreep", "stop ", "wachtlijn", "haalstreep")):
        return "stop"
    if any(k in text for k in ("haai", "give", "haaientand", "voorrang")):
        return "give_way"
    if any(k in text for k in ("pijl", "voorsort", "afslag")):
        return "arrow"
    if "fiets" in text:
        return "bike"
    if "bus" in text:
        return "bus"
    if any(k in text for k in ("blok", "keervak", "gele")):
        return "box"
    if any(k in text for k in ("aslijn", "midden", "onderbroken", "vollijn", "belijn")):
        return "dash"
    return "other"


def classify_bay_orient(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if any(k in text for k in ("haaks", "dwars", "perpendicular")):
        return "perpendicular"
    if any(k in text for k in ("schuin", "diagonaal", "diagonal")):
        return "diagonal"
    return "parallel"


# ---------------------------------------------------------------- overlay onto roads


def _seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 < 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def overlay_speeds(
    roads: list[dict[str, Any]],
    speed_lines: list[dict[str, Any]],
    origin: tuple[float, float],
) -> dict[str, int]:
    """Set ``maxspeedKmh`` / ``speedKmh`` from city ``SNELHEID`` polylines.

    City wins over the urban default. A real OSM tag already on the road is kept
    when no city line is within ``SPEED_MATCH_M``.
    """
    projected: list[tuple[float, list[list[float]]]] = []
    for rec in speed_lines:
        kmh = parse_speed_kmh(rec.get("SNELHEID"))
        line = rec.get("line") or []
        if kmh is None or len(line) < 2:
            continue
        pts = project_line(line, origin)
        if len(pts) >= 2:
            projected.append((kmh, pts))
    stats = {"tagged": 0, "city": 0, "default": 0}
    if not projected:
        return stats
    for road in roads:
        pts = road.get("points") or []
        if len(pts) < 2:
            continue
        mid = len(pts) // 2
        mx = (float(pts[mid - 1][0]) + float(pts[mid][0])) * 0.5
        my = (float(pts[mid - 1][1]) + float(pts[mid][1])) * 0.5
        best_d = SPEED_MATCH_M
        best = None
        for kmh, line in projected:
            for i in range(len(line) - 1):
                d = _seg_dist(mx, my, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1])
                if d < best_d:
                    best_d = d
                    best = kmh
        tagged = road.get("maxspeedKmh")
        if best is not None:
            road["maxspeedKmh"] = best
            road["speedKmh"] = best
            stats["city"] += 1
        elif isinstance(tagged, (int, float)) and tagged > 0:
            stats["tagged"] += 1
        else:
            stats["default"] += 1
    return stats


def _centroid(ring: list[list[float]]) -> tuple[float, float]:
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def _simplify(pts: list[list[float]], tol: float = 0.6) -> list[list[float]]:
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

    far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
    if far == 0:
        return pts
    out = dp(pts[: far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]
    return out if len(out) >= 3 else pts


def export_markings(
    markings: list[dict[str, Any]],
    origin: tuple[float, float],
    spawn: tuple[float, float] | None,
    radius: float = MARKING_EXPORT_M,
) -> list[dict[str, Any]]:
    sx, sy = spawn or (0.0, 0.0)
    out: list[dict[str, Any]] = []
    for rec in markings:
        ring_ll = rec.get("ring") or []
        if len(ring_ll) < 3:
            continue
        ring = _simplify(project_ring(ring_ll, origin))
        if len(ring) < 3:
            continue
        cx, cy = _centroid(ring)
        if math.hypot(cx - sx, cy - sy) > radius:
            continue
        kind = classify_marking(rec.get("Type"), rec.get("Kleur"))
        if kind == "other" and len(ring) < 4:
            continue
        out.append(
            {
                "k": kind,
                "c": str(rec.get("Kleur") or ""),
                "ring": ring,
            }
        )
    return out


def export_parking_bays(
    bays: list[dict[str, Any]],
    origin: tuple[float, float],
    spawn: tuple[float, float] | None,
    radius: float = BAY_EXPORT_M,
) -> list[dict[str, Any]]:
    sx, sy = spawn or (0.0, 0.0)
    out: list[dict[str, Any]] = []
    for rec in bays:
        status = str(rec.get("STATUS") or "").lower()
        if status and status not in {"actief", "active", "in gebruik", ""}:
            continue
        ring_ll = rec.get("ring") or []
        if len(ring_ll) < 3:
            continue
        ring = _simplify(project_ring(ring_ll, origin), tol=0.35)
        if len(ring) < 3:
            continue
        cx, cy = _centroid(ring)
        if math.hypot(cx - sx, cy - sy) > radius:
            continue
        lined = str(rec.get("Belijnd") or "").lower()
        out.append(
            {
                "o": classify_bay_orient(rec.get("Orientatie")),
                "lined": lined in {"ja", "yes", "1", "true", "belijnd"},
                "n": int(rec.get("Capaciteit") or 1),
                "use": str(rec.get("Bestemming") or ""),
                "ring": ring,
            }
        )
    return out


def compare_parking(layout: dict[str, Any], bays: list[dict[str, Any]], origin: tuple[float, float]) -> dict[str, int]:
    """How many OSM-tagged kerbs sit on a city bay (and the reverse gap)."""
    city_pts: list[tuple[float, float]] = []
    for rec in bays:
        ring = rec.get("ring") or []
        if len(ring) < 3:
            continue
        city_pts.append(_centroid(project_ring(ring, origin)))
    osm_sides = 0
    hit = 0
    for road in layout.get("roads") or []:
        if not road.get("parking"):
            continue
        osm_sides += 1
        pts = road.get("points") or []
        if len(pts) < 2 or not city_pts:
            continue
        mx = (float(pts[0][0]) + float(pts[-1][0])) * 0.5
        my = (float(pts[0][1]) + float(pts[-1][1])) * 0.5
        if any(math.hypot(mx - cx, my - cy) < 18.0 for cx, cy in city_pts):
            hit += 1
    return {"osm_tagged_roads": osm_sides, "osm_near_city_bay": hit, "city_bays": len(bays)}


def export_markets(layers: dict[str, Any], origin: tuple[float, float]) -> list[dict[str, Any]]:
    grounds = {str(g.get("id") or g.get("locatie") or ""): g for g in layers.get("market_grounds") or []}
    out: list[dict[str, Any]] = []
    for rec in layers.get("markets") or []:
        xy = _xy(rec, origin)
        if xy is None:
            continue
        key = str(rec.get("id") or rec.get("locatie") or "")
        ground = grounds.get(key)
        ring = project_ring(ground["ring"], origin) if ground and ground.get("ring") else None
        out.append(
            {
                "name": rec.get("locatie") or rec.get("type") or "",
                "kind": rec.get("soort") or rec.get("type") or "",
                "days": [d for d in (rec.get("marktdag1"), rec.get("marktdag2")) if d],
                "from": rec.get("van") or "",
                "until": rec.get("tot") or "",
                "x": round(xy[0], 2),
                "y": round(xy[1], 2),
                "ring": ring,
            }
        )
    return out


def export_share_zones(zones: list[dict[str, Any]], origin: tuple[float, float]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rec in zones:
        ring = rec.get("ring") or []
        if len(ring) < 3:
            continue
        out.append({"k": rec.get("kind") or "drop", "ring": _simplify(project_ring(ring, origin), tol=1.2)})
    return out


def export_quay(layers: dict[str, Any], origin: tuple[float, float]) -> dict[str, Any]:
    def pts(name: str, fields: dict[str, str]) -> list[dict[str, Any]]:
        rows = []
        for rec in layers.get(name) or []:
            xy = _xy(rec, origin)
            if xy is None:
                continue
            row = {"x": round(xy[0], 2), "y": round(xy[1], 2)}
            for src, dest in fields.items():
                if rec.get(src) not in (None, ""):
                    row[dest] = rec[src]
            if rec.get("HOEK") not in (None, ""):
                row["yaw"] = round(math.radians(float(rec["HOEK"])), 4)
            rows.append(row)
        return rows

    def rings(name: str) -> list[dict[str, Any]]:
        rows = []
        for rec in layers.get(name) or []:
            ring = rec.get("ring") or []
            if len(ring) < 3:
                continue
            rows.append(
                {
                    "name": rec.get("NAAM") or rec.get("name") or "",
                    "hours": rec.get("DRAAITIJDEN") or "",
                    "ring": _simplify(project_ring(ring, origin), tol=0.8),
                }
            )
        return rows

    return {
        "jetties": rings("jetties"),
        "bollards": pts("mooring_posts", {"NUMMER": "n"}),
        "berths": pts("berths", {"KAAINUMMER": "quay", "DOKNAAM": "dock", "MP_NUMMER": "n"}),
        "numbers": pts("quay_numbers", {"kaainummer": "n", "label": "label"}),
        "bridges": rings("harbour_bridges"),
        "waterbus": pts("waterbus", {"HALTE": "name", "EXPLOITANT": "op"}),
    }


# ---------------------------------------------------------------- poles + clutter


def city_poles_xy(payload: dict[str, Any], origin: tuple[float, float]) -> list[tuple[float, float, Any]]:
    out: list[tuple[float, float, Any]] = []
    for rec in (payload.get("layers") or {}).get("signal_poles") or []:
        xy = _xy(rec, origin)
        if xy is not None:
            out.append((xy[0], xy[1], rec.get("PID") or rec.get("id")))
    return out


def pick_city_pole(
    stop_x: float,
    stop_y: float,
    rx: float,
    ry: float,
    half: float,
    poles: list[tuple[float, float, Any]],
    roads: list[dict[str, Any]],
    used: set[int],
) -> tuple[float, float, int] | None:
    """Nearest unused city pole on the kerb of this stop, or None."""
    best_i = None
    best_d = POLE_SNAP_M
    for i, (px, py, _pid) in enumerate(poles):
        if i in used:
            continue
        d = math.hypot(px - stop_x, py - stop_y)
        if d >= best_d:
            continue
        # Prefer the side of the stop (not the far kerb across the junction).
        along = (px - stop_x) * rx + (py - stop_y) * ry
        if along < -1.0:
            continue
        if in_carriageway(px, py, roads, margin=0.05):
            continue
        best_d = d
        best_i = i
    if best_i is None:
        return None
    px, py, _ = poles[best_i]
    return px, py, best_i


def geometric_pole(
    stop_x: float,
    stop_y: float,
    tx: float,
    ty: float,
    width: float,
    roads: list[dict[str, Any]],
) -> tuple[float, float, float] | None:
    """Right-hand kerb first; skip if the point is still on asphalt."""
    rx, ry = ty, -tx
    half = width * 0.5 + POLE_KERB_M
    for sign in (1.0, -1.0):
        px = stop_x + rx * sign * half
        py = stop_y + ry * sign * half
        if in_carriageway(px, py, roads):
            continue
        return px, py, sign
    return None


def city_clutter_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Survey points as clutter items (city source wins the later dedupe)."""
    layers = payload.get("layers") or {}
    out: list[dict[str, Any]] = []

    def add(kind: str, rec: dict[str, Any], tags: dict[str, str] | None = None) -> None:
        if rec.get("lat") is None:
            return
        out.append(
            {
                "id": f"city-{kind}-{rec.get('id') or rec.get('GISID') or rec.get('Objectcode')}",
                "kind": kind,
                "lat": float(rec["lat"]),
                "lon": float(rec["lon"]),
                "tags": tags or {},
                "source": "city",
            }
        )

    for rec in layers.get("chargers") or []:
        if str(rec.get("Publiek") or "ja").lower() in {"nee", "no", "0", "false"}:
            continue
        add("charging", rec)
    for rec in layers.get("bike_racks") or []:
        cap = rec.get("Capaciteit")
        add("bike_rack", rec, {"capacity": str(int(cap))} if cap not in (None, "") else {})
    for rec in layers.get("bike_lockers") or []:
        # Covered lockers are not hoop racks; skip enclosed types.
        typ = str(rec.get("Type_fietsstalling") or "").lower()
        if any(k in typ for k in ("box", "locker", "gebouw", "stal")):
            continue
        cap = rec.get("Aantal_plaatsen")
        add("bike_rack", rec, {"capacity": str(int(cap))} if cap not in (None, "") else {})
    for rec in layers.get("shelters") or []:
        add("shelter", rec)
    for rec in layers.get("posters") or []:
        add("poster", rec)
    for rec in layers.get("city_boards") or []:
        add("city_board", rec)
    for rec in layers.get("info_boards") or []:
        add("city_board", rec)
    return out


def enrich_roads_payload(
    roads_payload: dict[str, Any],
    layout: dict[str, Any],
    origin: tuple[float, float],
) -> dict[str, Any]:
    """Fold survey overlays onto an exported ``roads.json`` document."""
    payload = layout.get("survey") or {}
    layers = payload.get("layers") or {}
    spawn = roads_payload.get("spawn") or layout.get("spawn") or {}
    spawn_xy = (float(spawn.get("x") or 0.0), float(spawn.get("y") or 0.0))
    if layers.get("speeds"):
        stats = overlay_speeds(roads_payload.get("roads") or [], layers["speeds"], origin)
        roads_payload["speedSource"] = stats
    if layers.get("markings"):
        roads_payload["markings"] = export_markings(layers["markings"], origin, spawn_xy)
    if layers.get("parking_bays"):
        roads_payload["parkingBays"] = export_parking_bays(layers["parking_bays"], origin, spawn_xy)
        roads_payload["parkingCompare"] = compare_parking(layout, layers["parking_bays"], origin)
    markets = export_markets(layers, origin)
    if markets:
        roads_payload["markets"] = markets
    zones = export_share_zones(layers.get("share_zones") or [], origin)
    if zones:
        roads_payload["shareZones"] = zones
    poles = city_poles_xy(payload, origin)
    used = set(roads_payload.get("_usedPoles") or [])
    spare = []
    for i, (x, y, pid) in enumerate(poles):
        if i in used:
            continue
        spare.append({"x": round(x, 2), "y": round(y, 2), "id": pid})
    if spare:
        roads_payload["sparePoles"] = spare
    roads_payload.pop("_usedPoles", None)
    if payload.get("attribution"):
        roads_payload.setdefault("attribution", payload["attribution"])
    roads_payload.setdefault("origin", [origin[0], origin[1]])
    return roads_payload
