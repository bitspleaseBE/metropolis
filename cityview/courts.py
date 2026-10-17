"""Outdoor ball courts and playgrounds from Stad Antwerpen.

The sport inventory draws the actual rectangle, not the park around it:

* ``voetbalveld`` — full pitch, scaled markings, full-size goals
* ``trapveld`` / ``pannaveld`` / ``agora-minipitch`` — a kickabout square, halfway line, small goals
* ``basketbalveld`` — key, centre circle, a hoop at each end

``Speelterreinen`` are the city's play areas (equipment sits inside the polygon; the
polygon itself is the sand pad). Indoor halls are skipped.

Published to ``viewer/districts/<id>/pitches.json`` by ``district courts``. The viewer
draws the lines and goals; Blender does not.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from cityview.courtyards import ring_area
from cityview.geo import bbox_covers, project
from cityview.gis import compact_feature, query_features

SPORT_URL = (
    "https://geodata.antwerpen.be/arcgissql/rest/services/P_Publiek/Astad_20160208/MapServer/4/query"
)
PLAY_URL = (
    "https://geodata.antwerpen.be/arcgissql/rest/services/P_Publiek/Astad_20160208/MapServer/68/query"
)
ATTRIBUTION = (
    "Courts and playgrounds: (c) Stad Antwerpen open data "
    "(https://www.antwerpen.be/info/gratis-open-data-licentie)."
)

# subtype -> drawn kind
COURT_KINDS = {
    "voetbalveld": "football",
    "trapveld": "trap",
    "pannaveld": "trap",
    "agora-minipitch": "trap",
    "basketbalveld": "basket",
    "basketbalveld (openbaar)": "basket",
}
_COURT_WHERE = "subtype IN ({})".format(
    ",".join(f"'{name}'" for name in sorted(COURT_KINDS))
)

MIN_LENGTH = 8.0
MIN_WIDTH = 5.0
MAX_LENGTH = 180.0
MIN_PLAY_M2 = 40.0
MAX_PLAY_M2 = 8000.0

# Line widths (metres).
LINE_FOOTBALL = 0.12
LINE_TRAP = 0.10
LINE_BASKET = 0.08


def court_kind(subtype: str | None) -> str | None:
    return COURT_KINDS.get(str(subtype or "").strip().lower())


def _unit(dx: float, dy: float) -> tuple[float, float] | None:
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return None
    return dx / length, dy / length


def court_frame(ring: list[list[float]]) -> dict[str, float] | None:
    """Length axis from the longest edge. ``u`` runs along the pitch, ``v`` across it."""
    if len(ring) < 4:
        return None
    best: tuple[float, float, float] | None = None
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        edge = _unit(b[0] - a[0], b[1] - a[1])
        if edge is None:
            continue
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        if best is None or length > best[0]:
            best = (length, edge[0], edge[1])
    if best is None:
        return None
    ux, uy = best[1], best[2]
    vx, vy = -uy, ux
    dots_u = [p[0] * ux + p[1] * uy for p in ring]
    dots_v = [p[0] * vx + p[1] * vy for p in ring]
    if (max(dots_v) - min(dots_v)) > (max(dots_u) - min(dots_u)):
        ux, uy, vx, vy = vx, vy, -ux, -uy
        dots_u = [p[0] * ux + p[1] * uy for p in ring]
        dots_v = [p[0] * vx + p[1] * vy for p in ring]
    u0, u1 = min(dots_u), max(dots_u)
    v0, v1 = min(dots_v), max(dots_v)
    length = u1 - u0
    width = v1 - v0
    if length < MIN_LENGTH or width < MIN_WIDTH or length > MAX_LENGTH:
        return None
    cu = (u0 + u1) * 0.5
    cv = (v0 + v1) * 0.5
    return {
        "cx": cu * ux + cv * vx,
        "cy": cu * uy + cv * vy,
        "ux": ux,
        "uy": uy,
        "vx": vx,
        "vy": vy,
        "length": length,
        "width": width,
    }


def _at(frame: dict[str, float], u: float, v: float) -> tuple[float, float]:
    return (
        frame["cx"] + frame["ux"] * u + frame["vx"] * v,
        frame["cy"] + frame["uy"] * u + frame["vy"] * v,
    )


def _stroke(a: tuple[float, float], b: tuple[float, float], width: float) -> list[list[float]] | None:
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 0.05:
        return None
    px, py = -dy / length * width * 0.5, dx / length * width * 0.5
    return [
        [round(a[0] + px, 2), round(a[1] + py, 2)],
        [round(b[0] + px, 2), round(b[1] + py, 2)],
        [round(b[0] - px, 2), round(b[1] - py, 2)],
        [round(a[0] - px, 2), round(a[1] - py, 2)],
    ]


def _seg(frame: dict[str, float], u0: float, v0: float, u1: float, v1: float, width: float) -> list[list[float]] | None:
    return _stroke(_at(frame, u0, v0), _at(frame, u1, v1), width)


def _arc(
    frame: dict[str, float],
    u: float,
    v: float,
    radius: float,
    a0: float,
    a1: float,
    width: float,
    steps: int,
) -> list[list[list[float]]]:
    pts = []
    for i in range(steps + 1):
        t = a0 + (a1 - a0) * i / steps
        pts.append(_at(frame, u + math.cos(t) * radius, v + math.sin(t) * radius))
    out = []
    for i in range(len(pts) - 1):
        stroke = _stroke(pts[i], pts[i + 1], width)
        if stroke:
            out.append(stroke)
    return out


def _box_lines(
    frame: dict[str, float],
    u_line: float,
    sign: float,
    depth: float,
    half_w: float,
    width: float,
) -> list[list[list[float]]]:
    """Three sides of a penalty / goal box. ``sign`` points from the goal line into the pitch."""
    front = u_line + sign * depth
    lines = [
        _seg(frame, u_line, -half_w, front, -half_w, width),
        _seg(frame, front, -half_w, front, half_w, width),
        _seg(frame, front, half_w, u_line, half_w, width),
    ]
    return [line for line in lines if line]


def _goal(frame: dict[str, float], u: float, sign: float, width: float, height: float, kind: str) -> dict[str, Any]:
    """A goal or hoop at ``u``, mouth facing ``sign`` (into the pitch) along the length axis.

    ``yaw`` is the viewer rotation that turns a mesh facing world +Z onto that mouth.
    World z is local north flipped (``z = -y``), matching the road-paint decals.
    """
    x, y = _at(frame, u, 0.0)
    fx = frame["ux"] * sign
    fy = frame["uy"] * sign
    # Local (fx, fy) -> world xz (fx, -fy).
    yaw = math.atan2(fx, -fy)
    return {
        "k": kind,
        "x": round(x, 2),
        "y": round(y, 2),
        "yaw": round(yaw, 4),
        "w": round(width, 2),
        "h": round(height, 2),
    }


def _outline(frame: dict[str, float], width: float) -> list[list[list[float]]]:
    hl = frame["length"] * 0.5
    hw = frame["width"] * 0.5
    lines = [
        _seg(frame, -hl, -hw, hl, -hw, width),
        _seg(frame, hl, -hw, hl, hw, width),
        _seg(frame, hl, hw, -hl, hw, width),
        _seg(frame, -hl, hw, -hl, -hw, width),
    ]
    return [line for line in lines if line]


def football_markings(frame: dict[str, float], *, trap: bool) -> tuple[list[list[list[float]]], list[dict[str, Any]]]:
    hl = frame["length"] * 0.5
    hw = frame["width"] * 0.5
    width = LINE_TRAP if trap else LINE_FOOTBALL
    lines = _outline(frame, width)
    halfway = _seg(frame, 0.0, -hw, 0.0, hw, width)
    if halfway:
        lines.append(halfway)
    if not trap:
        scale = min(frame["length"] / 105.0, frame["width"] / 68.0, 1.0)
        pen_d = 16.5 * scale
        pen_hw = min(20.16 * scale, hw * 0.92)
        goal_d = 5.5 * scale
        goal_hw = min(9.16 * scale, pen_hw * 0.7)
        circle_r = min(9.15 * scale, hw * 0.45, hl * 0.35)
        lines.extend(_box_lines(frame, hl, -1.0, pen_d, pen_hw, width))
        lines.extend(_box_lines(frame, -hl, 1.0, pen_d, pen_hw, width))
        if goal_d > 1.0:
            lines.extend(_box_lines(frame, hl, -1.0, goal_d, goal_hw, width))
            lines.extend(_box_lines(frame, -hl, 1.0, goal_d, goal_hw, width))
        if circle_r > 1.2:
            lines.extend(_arc(frame, 0.0, 0.0, circle_r, 0.0, math.tau, width, 20))
        goal_w = min(7.32 * max(scale, 0.55), frame["width"] * 0.55)
        goal_h = 2.44 * max(scale, 0.65)
    else:
        goal_w = min(4.5, frame["width"] * 0.42)
        goal_h = 2.0
    goals = [
        _goal(frame, hl, -1.0, goal_w, goal_h, "goal"),
        _goal(frame, -hl, 1.0, goal_w, goal_h, "goal"),
    ]
    return lines, goals


def basket_markings(frame: dict[str, float]) -> tuple[list[list[list[float]]], list[dict[str, Any]]]:
    hl = frame["length"] * 0.5
    hw = frame["width"] * 0.5
    width = LINE_BASKET
    scale = min(frame["length"] / 28.0, frame["width"] / 15.0, 1.0)
    lines = _outline(frame, width)
    halfway = _seg(frame, 0.0, -hw, 0.0, hw, width)
    if halfway:
        lines.append(halfway)
    circle_r = min(1.8 * scale, hw * 0.35)
    if circle_r > 0.6:
        lines.extend(_arc(frame, 0.0, 0.0, circle_r, 0.0, math.tau, width, 16))
    key_d = min(5.8 * scale, hl * 0.7)
    key_hw = min(2.45 * scale, hw * 0.7)
    if key_d > 1.0:
        lines.extend(_box_lines(frame, hl, -1.0, key_d, key_hw, width))
        lines.extend(_box_lines(frame, -hl, 1.0, key_d, key_hw, width))
        # Free-throw semicircle, bulging into the court.
        lines.extend(_arc(frame, hl - key_d, 0.0, key_hw, math.pi / 2, math.pi * 1.5, width, 10))
        lines.extend(_arc(frame, -hl + key_d, 0.0, key_hw, -math.pi / 2, math.pi / 2, width, 10))
    inset = min(1.575 * max(scale, 0.7), hl * 0.25)
    hoop_h = 3.05
    goals = [
        _goal(frame, hl - inset, -1.0, 1.8, hoop_h, "hoop"),
        _goal(frame, -hl + inset, 1.0, 1.8, hoop_h, "hoop"),
    ]
    return lines, goals


def plan_court(ring: list[list[float]], kind: str, name: str = "") -> dict[str, Any] | None:
    frame = court_frame(ring)
    if frame is None:
        return None
    if kind == "basket":
        lines, goals = basket_markings(frame)
    elif kind == "trap":
        lines, goals = football_markings(frame, trap=True)
    elif kind == "football":
        lines, goals = football_markings(frame, trap=False)
    else:
        return None
    return {
        "k": kind,
        "name": name,
        "lines": lines,
        "goals": goals,
    }


def _project_ring(ring_ll: list[list[float]], origin: tuple[float, float]) -> list[list[float]]:
    out = []
    for lon, lat in ring_ll:
        x, y = project(lat, lon, origin[0], origin[1])
        out.append([x, y])
    return out


def courts_from_records(
    courts: list[dict[str, Any]],
    playgrounds: list[dict[str, Any]],
    origin: tuple[float, float],
) -> dict[str, Any]:
    """Local-metre lines, goals and playground pads."""
    drawn: list[dict[str, Any]] = []
    for rec in courts:
        kind = court_kind(rec.get("subtype"))
        ring = _project_ring(rec.get("ring") or [], origin)
        if kind is None:
            continue
        planned = plan_court(ring, kind, str(rec.get("naam") or ""))
        if planned:
            drawn.append(planned)
    pads = []
    for rec in playgrounds:
        ring = _project_ring(rec.get("ring") or [], origin)
        area = abs(ring_area(ring))
        if area < MIN_PLAY_M2 or area > MAX_PLAY_M2:
            continue
        pads.append(
            {
                "name": str(rec.get("NAAM") or ""),
                "n": int(rec.get("TOESTELLEN") or 0),
                "ring": [[round(p[0], 2), round(p[1], 2)] for p in ring],
            }
        )
    return {
        "attribution": ATTRIBUTION,
        "courts": drawn,
        "playgrounds": pads,
    }


def fetch_courts(bbox: tuple[float, float, float, float]) -> dict[str, Any]:
    """Pull sport rectangles and playground polygons for a south,west,north,east box."""
    courts = []
    for feat in query_features(
        SPORT_URL,
        bbox,
        out_fields="OBJECTID,naam,type,subtype,straat,postcode",
        where=_COURT_WHERE,
        order_by="OBJECTID",
    ):
        rec = compact_feature(feat, geom="ring", keep=("naam", "type", "subtype", "straat", "postcode"))
        if rec and court_kind(rec.get("subtype")):
            courts.append(rec)
    playgrounds = []
    for feat in query_features(
        PLAY_URL,
        bbox,
        out_fields="OBJECTID,NAAM,STRAAT,POSTCODE,TOESTELLEN,TERREIN_TYPE",
        where="1=1",
        order_by="OBJECTID",
    ):
        rec = compact_feature(
            feat, geom="ring", keep=("NAAM", "STRAAT", "POSTCODE", "TOESTELLEN", "TERREIN_TYPE")
        )
        if rec:
            playgrounds.append(rec)
    return {"bbox": list(bbox), "courts": courts, "playgrounds": playgrounds}


def load_cache(path: Path, bbox: tuple[float, float, float, float], *, refresh: bool) -> dict[str, Any]:
    if not refresh and path.is_file():
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError:
            doc = None
        if isinstance(doc, dict) and bbox_covers(doc.get("bbox"), bbox):
            return doc
    doc = fetch_courts(bbox)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc) + "\n")
    return doc


def publish_courts(
    district_id: str,
    bbox: tuple[float, float, float, float],
    origin: tuple[float, float],
    cache_path: Path,
    dest: Path,
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    cached = load_cache(cache_path, bbox, refresh=refresh)
    payload = courts_from_records(cached.get("courts") or [], cached.get("playgrounds") or [], origin)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload) + "\n")
    kinds: dict[str, int] = {}
    for court in payload["courts"]:
        kinds[court["k"]] = kinds.get(court["k"], 0) + 1
    summary = ", ".join(f"{k}={n}" for k, n in sorted(kinds.items())) or "none"
    print(
        f"Wrote {dest} ({len(payload['courts'])} courts [{summary}], "
        f"{len(payload['playgrounds'])} playgrounds)"
    )
    return payload
