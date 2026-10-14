"""Grote Markt set: the guild houses round the square, the Hansahuis on Suikerrui and
the Brabo fountain.

Every house is one OSM plot built by :func:`build_guild_house` from a spec in
``districts/<id>/landmarks/grote_markt_houses.json`` (storeys, bays, glazing, gable,
gilt crown figure), read off the on-site photos in ``references/grote-markt-photos/``
and the Commons pack. ``python -m cityview.landmark_grote_markt sync <id>`` turns the
specs into manifest entries and records which footprint edges face open street, so a
corner house gets windows on both fronts and party walls stay blind.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from cityview.landmark_civic import (
    _balustrade,
    _crockets,
    _fine_pinnacle,
    _strut,
    _sub_frame,
    _yaw,
)
from cityview.landmark_kit import (
    Edge,
    Frame,
    Mesh,
    Vec2,
    Vec3,
    archivolt,
    band,
    cell,
    extrude_ring,
    frustum,
    gable_roof,
    merged_edges,
    ngon,
    opening,
    oriented,
    pane,
    point_in_ring,
    profile_slab,
    rbox,
    ring_roof,
    wbox,
)

TRI_BUDGET = {
    "guild_house": 16000,
    "hansahuis": 30000,
    "brabo_fountain": 22000,
}

SPEC_NAME = "grote_markt_houses.json"


# ------------------------------------------------------------------ footprint fronts


def _seg_frame(seg: list[float]) -> tuple[Frame, float]:
    x0, y0, x1, y1, nx, ny = (float(v) for v in seg[:6])
    return Frame.from_edge((x0, y0), (x1, y1), (nx, ny)), math.hypot(x1 - x0, y1 - y0)


def _on_segments(segs: list[list[float]], tol: float = 0.35):
    """``extrude_ring(skip=)`` predicate: footprint edges lying on a dressed front."""

    def on(e: Edge) -> bool:
        for s in segs:
            f, L = _seg_frame(s)
            a0, d0 = f.local(*e.p0)
            a1, d1 = f.local(*e.p1)
            if abs(d0) < tol and abs(d1) < tol and min(a0, a1) > -tol and max(a0, a1) < L + tol:
                return True
        return False

    return on


def _fallback_front(ring: list[Vec2]) -> list[float]:
    e = max(merged_edges(ring), key=lambda e: e.length)
    return [*e.p0, *e.p1, *e.outward]


def _depth_behind(ring: list[Vec2], f: Frame) -> float:
    return max(2.0, max(-f.local(*p)[1] for p in ring))


# ------------------------------------------------------------------ figures (gilt / bronze)


def _ball(m: Mesh, c: Vec3, r: float, mat: str, sides: int = 7) -> None:
    x, y, z = c
    frustum(m, x, y, z - r, z, r * 0.55, r, sides, mat, bottom=True, top=False)
    frustum(m, x, y, z, z + r, r, r * 0.55, sides, mat)


def _figure(m: Mesh, j: dict[str, Vec3], s: float, mat: str) -> None:
    """Human figure strung between joints: torso, head, limbs (statue scale ``s`` ≈ height / 1.8)."""
    _strut(m, j["pelvis"], j["chest"], 0.17 * s, mat, 6)
    _strut(m, j["l_sh"], j["r_sh"], 0.09 * s, mat, 5)
    _strut(m, j["chest"], j["neck"], 0.07 * s, mat, 5)
    _ball(m, j["head"], 0.12 * s, mat)
    for side in ("l", "r"):
        _strut(m, j[f"{side}_sh"], j[f"{side}_el"], 0.06 * s, mat, 5)
        _strut(m, j[f"{side}_el"], j[f"{side}_hand"], 0.05 * s, mat, 5)
        _strut(m, j[f"{side}_hip"], j[f"{side}_knee"], 0.085 * s, mat, 5)
        _strut(m, j[f"{side}_knee"], j[f"{side}_foot"], 0.065 * s, mat, 5)


def _standing(P, s: float, raise_r: bool = False, raise_l: bool = False, lean: float = 0.0) -> dict[str, Vec3]:
    """Joints for an upright figure in a local (a, d, z) frame callable ``P``."""
    z = lambda k: k * s  # noqa: E731
    j = {
        "pelvis": P(0.0, lean * 0.2, z(0.95)),
        "chest": P(0.0, lean * 0.5, z(1.38)),
        "neck": P(0.0, lean * 0.6, z(1.52)),
        "head": P(0.0, lean * 0.65, z(1.64)),
        "l_sh": P(-0.2 * s, lean * 0.5, z(1.42)),
        "r_sh": P(0.2 * s, lean * 0.5, z(1.42)),
        "l_hip": P(-0.1 * s, 0.0, z(0.92)),
        "r_hip": P(0.1 * s, 0.0, z(0.92)),
        "l_knee": P(-0.12 * s, 0.05 * s, z(0.5)),
        "r_knee": P(0.12 * s, 0.0, z(0.5)),
        "l_foot": P(-0.13 * s, 0.05 * s, z(0.04)),
        "r_foot": P(0.13 * s, 0.0, z(0.04)),
    }
    j["l_el"], j["l_hand"] = (P(-0.38 * s, 0.05 * s, z(1.75)), P(-0.42 * s, 0.1 * s, z(2.08))) if raise_l else (P(-0.27 * s, 0.05 * s, z(1.13)), P(-0.3 * s, 0.1 * s, z(0.86)))
    j["r_el"], j["r_hand"] = (P(0.38 * s, 0.05 * s, z(1.75)), P(0.42 * s, 0.1 * s, z(2.08))) if raise_r else (P(0.27 * s, 0.05 * s, z(1.13)), P(0.3 * s, 0.1 * s, z(0.86)))
    return j


def _crown(m: Mesh, f: Frame, a: float, z: float, kind: str | None, s: float = 1.0, d: float = -0.25) -> float:
    """Gilt figure on a gable top; returns the top height."""
    if not kind or kind == "none":
        return z
    yaw = _yaw(f)
    x, y, _ = f.p(a, d, 0.0)
    frustum(m, x, y, z, z + 0.35 * s, 0.32 * s, 0.26 * s, 6, "bluestone", phase=yaw)
    z0 = z + 0.35 * s

    def P(da: float, dd: float, dz: float) -> Vec3:
        return f.p(a + da, d + dd, z0 + dz)

    if kind == "ball":
        _ball(m, P(0, 0, 0.45 * s), 0.42 * s, "gold", 8)
        frustum(m, x, y, z0 + 0.85 * s, z0 + 1.6 * s, 0.07 * s, 0.0, 4, "gold")
        return z0 + 1.6 * s
    if kind == "eagle":
        frustum(m, x, y, z0, z0 + 0.25 * s, 0.22 * s, 0.22 * s, 6, "gold", phase=yaw)
        _strut(m, P(0, 0, 0.25 * s), P(0, 0.05, 1.05 * s), 0.2 * s, "gold", 6)
        _ball(m, P(0, 0.12 * s, 1.2 * s), 0.13 * s, "gold")
        _strut(m, P(0, 0.12 * s, 1.2 * s), P(0, 0.35 * s, 1.15 * s), 0.05 * s, "gold", 4)
        for sg in (-1.0, 1.0):
            profile_slab(
                m, f,
                [(a + sg * 0.12 * s, z0 + 0.55 * s), (a + sg * 1.05 * s, z0 + 1.55 * s), (a + sg * 0.95 * s, z0 + 0.75 * s)],
                d - 0.05, d + 0.05, "gold", back=True,
            )
        return z0 + 1.6 * s
    if kind == "rider":
        # St George on a rearing horse, lance down at the dragon.
        hb0, hb1 = P(-0.55 * s, 0, 0.95 * s), P(0.45 * s, 0, 1.15 * s)
        _strut(m, hb0, hb1, 0.26 * s, "gold", 6)
        _strut(m, hb1, P(0.75 * s, 0, 1.75 * s), 0.13 * s, "gold", 5)
        _strut(m, P(0.75 * s, 0, 1.75 * s), P(1.0 * s, 0, 1.6 * s), 0.11 * s, "gold", 5)
        for da, dd, lift in ((-0.45, -0.12, 0.0), (-0.45, 0.12, 0.0), (0.4, -0.12, 0.4), (0.4, 0.12, 0.3)):
            top = P(da * s, dd * s, 0.95 * s)
            _strut(m, top, P((da + (0.25 if lift else 0.0)) * s, dd * s, lift * s), 0.07 * s, "gold", 4)
        _strut(m, hb0, P(-0.95 * s, 0, 0.55 * s), 0.06 * s, "gold", 4)
        _strut(m, P(0, 0, 1.3 * s), P(0.05 * s, 0, 1.95 * s), 0.14 * s, "gold", 6)
        _ball(m, P(0.06 * s, 0, 2.12 * s), 0.11 * s, "gold")
        _strut(m, P(-0.2 * s, 0.1 * s, 1.85 * s), P(1.15 * s, 0.25 * s, 0.6 * s), 0.035 * s, "gold", 4)
        for sg in (-1.0, 1.0):
            _strut(m, P(0, sg * 0.12 * s, 1.35 * s), P(0.15 * s, sg * 0.28 * s, 0.85 * s), 0.06 * s, "gold", 4)
        return z0 + 2.25 * s
    if kind == "peacock":
        _strut(m, P(0, 0, 0.1 * s), P(0, 0.1 * s, 0.75 * s), 0.16 * s, "gold", 6)
        _ball(m, P(0, 0.18 * s, 0.95 * s), 0.1 * s, "gold")
        fan = [(a + 0.95 * s * math.cos(t), z0 + 0.3 * s + 0.95 * s * math.sin(t)) for t in (math.pi * k / 8 for k in range(9))]
        profile_slab(m, f, [(a, z0 + 0.3 * s)] + fan[::-1], d - 0.18, d - 0.1, "gold", back=True)
        return z0 + 1.3 * s
    # Standing figure (saint, guild patron); "angel" adds wings.
    j = _standing(P, s * 0.95, raise_r=True)
    _figure(m, j, s * 0.95, "gold")
    frustum(m, x, y, z0, z0 + 0.9 * s, 0.24 * s, 0.14 * s, 6, "gold", phase=yaw)
    if kind == "angel":
        for sg in (-1.0, 1.0):
            profile_slab(
                m, f,
                [(a + sg * 0.1 * s, z0 + 1.0 * s), (a + sg * 0.75 * s, z0 + 1.9 * s), (a + sg * 0.55 * s, z0 + 0.7 * s)],
                d - 0.18, d - 0.12, "gold", back=True,
            )
    return z0 + 2.0 * s


# ------------------------------------------------------------------ facade rows


def _window(m: Mesh, f: Frame, b0: float, b1: float, z0: float, z1: float, style: str, wall: str, trim: str, glaze: float) -> None:
    """One bay of an upper storey: pierced wall panel, glass, stone cross / tracery."""
    bw = b1 - b0
    c = 0.5 * (b0 + b1)
    sill = min(0.55, (z1 - z0) * 0.16)
    head = min(0.45, (z1 - z0) * 0.12)
    w = max(0.45, bw * glaze)
    zs = z1 - head
    kind = {"gothic": "pointed", "arched": "round", "segmental": "segmental"}.get(style, "rect")
    if kind == "pointed":
        zs -= w * 0.5 * 1.1
    elif kind == "round":
        zs -= w * 0.5
    elif kind == "segmental":
        zs -= w * 0.18
    if zs <= z0 + sill + 0.3:
        cell(m, f, b0, b1, z0, z1, None, 0.0, 0.0, wall)
        return
    hole = opening(c, z0 + sill, w, zs, kind, 6, rise=w * 0.55 if kind == "pointed" else None)
    dep = -0.24
    cell(m, f, b0, b1, z0, z1, hole, 0.0, dep, wall, trim)
    pane(m, f, hole, dep, "glass")
    zt0 = z0 + sill
    if style in ("cross", "gothic", "arched"):
        if w > 0.8:
            rbox(m, f, c - 0.06, c + 0.06, dep, dep + 0.12, zt0, zs, trim, skip=("bottom",))
        zt = zt0 + (zs - zt0) * 0.62
        rbox(m, f, c - w * 0.5, c + w * 0.5, dep, dep + 0.12, zt - 0.06, zt + 0.06, trim)
    elif style == "plain":
        rbox(m, f, c - 0.04, c + 0.04, dep, dep + 0.06, zt0, zs, "frame_white", skip=("bottom",))
        zt = zt0 + (zs - zt0) * 0.7
        rbox(m, f, c - w * 0.5, c + w * 0.5, dep, dep + 0.06, zt - 0.04, zt + 0.04, "frame_white")
    if style == "gothic" and w > 0.9:
        spring = zs
        inner = [(x, z) for x, z in hole if z > spring + 1e-3]
        if len(inner) >= 3:
            rr = min(w * 0.18, 0.35)
            pane(m, f, opening(c, spring + 0.1, rr * 2, spring + 0.1, "circle", 5), dep + 0.05, trim)
    rbox(m, f, c - w * 0.5 - 0.12, c + w * 0.5 + 0.12, 0.0, 0.16, zt0 - 0.14, zt0, trim)
    if style == "gothic":
        archivolt(m, f, hole, 0.1, 0.0, 0.08, trim)


def _ground(m: Mesh, f: Frame, W: float, z1: float, p: dict, wall: str, trim: str) -> None:
    style = p.get("ground") or "arcade"
    nb = int(p.get("ground_bays") or p.get("bays") or max(2, round(W / 2.6)))
    mat = p.get("ground_mat") or ("bluestone" if style in ("arcade", "gothic") else wall)
    door = int(p.get("door", 0))
    door = door % nb if door >= 0 else -1
    bw = W / nb
    for k in range(nb):
        b0, b1 = k * bw, (k + 1) * bw
        c = 0.5 * (b0 + b1)
        if style in ("arcade", "gothic"):
            w = bw * 0.72
            kind = "pointed" if style == "gothic" else "round"
            zs = z1 - 0.45 - (w * 0.55 if kind == "pointed" else w * 0.5)
            hole = opening(c, 0.05, w, max(1.6, zs), kind, 8, rise=w * 0.55 if kind == "pointed" else None)
            cell(m, f, b0, b1, 0.0, z1, hole, 0.0, -0.45, mat, mat)
            pane(m, f, hole, -0.45, "door" if k == door else "glass_dark")
            archivolt(m, f, hole, 0.14, 0.0, 0.1, trim if style == "gothic" else mat)
        else:
            w = bw * 0.84
            zs = z1 - 0.95
            hole = opening(c, 0.05, w, zs, "rect", 4)
            cell(m, f, b0, b1, 0.0, z1, hole, 0.0, -0.3, mat, mat)
            pane(m, f, hole, -0.3, "door" if k == door else "glass_dark")
    if style == "shop":
        rbox(m, f, 0.05, W - 0.05, 0.0, 0.16, z1 - 0.85, z1 - 0.2, p.get("fascia") or "frame_dark")
    if style == "veranda":
        # Glazed restaurant veranda proud of the facade (Bella Patio).
        dv, hv = float(p.get("veranda_depth", 3.0)), min(3.6, z1 - 0.2)
        n = max(2, round(W / 1.6))
        for k in range(n + 1):
            a = 0.1 + (W - 0.2) * k / n
            rbox(m, f, a - 0.05, a + 0.05, dv - 0.1, dv, 0.0, hv, "iron")
        pane(m, f, [(0.1, 0.45), (W - 0.1, 0.45), (W - 0.1, hv), (0.1, hv)], dv - 0.05, "glass")
        rbox(m, f, 0.1, W - 0.1, dv - 0.15, dv, 0.0, 0.45, "frame_dark")
        for sa in (0.1, W - 0.1):
            fs = _sub_frame(f, sa, 0.0, 0.0, 1.0, -1.0 if sa < 1 else 1.0, 0.0)
            pane(m, fs, [(0.0, 0.02), (dv, 0.02), (dv, hv), (0.0, hv)], 0.0, "glass")
        # Dark lean-to roof sloping off the facade.
        zt = min(z1 - 0.3, hv + 1.0)
        rbox(m, f, 0.0, W, dv - 0.05, dv + 0.15, hv, hv + 0.3, "frame_dark")
        quad = [f.p(-0.05, dv + 0.15, hv + 0.3), f.p(W + 0.05, dv + 0.15, hv + 0.3), f.p(W + 0.05, 0.0, zt), f.p(-0.05, 0.0, zt)]
        m.face(quad, "frame_dark", normal=f.vec(0.0, zt - hv, dv))
        for sa, sg in ((-0.05, -1.0), (W + 0.05, 1.0)):
            tri = [f.p(sa, 0.0, hv), f.p(sa, dv + 0.15, hv), f.p(sa, dv + 0.15, hv + 0.3), f.p(sa, 0.0, zt)]
            m.face(tri, "frame_dark", normal=f.vec(sg, 0.0, 0.0))
    rbox(m, f, -0.02, W + 0.02, 0.0, 0.28, z1 - 0.18, z1, trim)


def _storeys(m: Mesh, f: Frame, W: float, storeys: list[float], p: dict, wall: str, trim: str, ground: bool = True) -> None:
    nb = int(p.get("bays") or max(2, round(W / 2.2)))
    bw = W / nb
    style = p.get("windows") or "cross"
    glaze = float(p.get("glaze", 0.74))
    pil = bool(p.get("pilasters"))
    carys = set(p.get("caryatids") or [])
    balconies = set(p.get("balconies") or [])
    z = 0.0
    for i, h in enumerate(storeys):
        z0, z1 = z, z + h
        z = z1
        if i == 0 and ground:
            _ground(m, f, W, z1, p, wall, trim)
            continue
        for k in range(nb):
            _window(m, f, k * bw, (k + 1) * bw, z0, z1, style, wall, trim, glaze)
        if pil or i in carys:
            for k in range(nb + 1):
                a = min(W - 0.2, max(0.2, k * bw))
                if i in carys and 0 < k < nb:
                    x, y, _ = f.p(a, 0.32, 0.0)
                    frustum(m, x, y, z0 + 0.3, z0 + h * 0.62, 0.17, 0.13, 6, trim, phase=_yaw(f))
                    frustum(m, x, y, z0 + h * 0.62, z0 + h * 0.74, 0.11, 0.1, 6, trim)
                    rbox(m, f, a - 0.3, a + 0.3, 0.0, 0.45, z1 - 0.5, z1 - 0.15, trim)
                    rbox(m, f, a - 0.25, a + 0.25, 0.0, 0.4, z0, z0 + 0.3, trim)
                else:
                    rbox(m, f, a - 0.15, a + 0.15, 0.0, 0.16, z0 + 0.12, z1 - 0.12, trim, skip=("bottom",))
        rbox(m, f, -0.02, W + 0.02, 0.0, 0.24 if pil else 0.16, z0 - 0.12, z0 + 0.12, trim)
        if i in balconies:
            _balustrade(m, f, 0.15, W - 0.15, z0, 0.0, 0.62, trim, 0.9, 0.4)
    H = sum(storeys)
    rbox(m, f, -0.05, W + 0.05, 0.0, 0.42, H - 0.32, H + 0.05, trim)


# ------------------------------------------------------------------ gables & roofs


def _gable_windows(m: Mesh, f: Frame, c: float, half: float, z0: float, z1: float, wall: str, trim: str, style: str) -> None:
    n = max(1, min(4, int((2 * half) / 1.45)))
    span = 2 * half
    if span < 1.0 or z1 - z0 < 1.4:
        return
    bw = span / n
    for k in range(n):
        b0 = c - half + k * bw
        _window(m, f, b0, b0 + bw, z0, z1, style, wall, trim, 0.66)


def _volute(m: Mesh, f: Frame, x_in: float, x_out: float, z: float, h: float, mat: str) -> None:
    """S-scroll shoulder between gable tiers: quarter-ellipse slab with a curled eye."""
    sg = 1.0 if x_out > x_in else -1.0
    rx = abs(x_out - x_in)
    if rx < 0.25:
        return
    arc = [(x_in + sg * rx * math.cos(t), z + h * math.sin(t)) for t in (math.pi / 2 * k / 6 for k in range(7))]
    outline = [(x_in, z)] + arc
    if sg < 0:
        outline = list(reversed(outline))
    profile_slab(m, f, outline, -0.48, 0.12, mat, back=True)
    er = min(0.32, rx * 0.22, h * 0.2)
    if er > 0.08:
        pane(m, f, opening(x_out - sg * er * 1.1, z + 0.05, er * 2, z + 0.05, "circle", 5), 0.14, mat)


def _obelisk(m: Mesh, f: Frame, a: float, z: float, h: float, mat: str, d: float = -0.15) -> None:
    x, y, _ = f.p(a, d, 0.0)
    ph = _yaw(f) + math.pi / 4
    frustum(m, x, y, z, z + h * 0.18, h * 0.16, h * 0.16, 4, mat, phase=ph)
    frustum(m, x, y, z + h * 0.18, z + h, h * 0.1, 0.0, 4, mat, phase=ph)
    _ball(m, f.p(a, d, z + h), h * 0.06, "gold", 5)


def _gable_stepped(m: Mesh, f: Frame, W: float, H: float, p: dict, wall: str, trim: str) -> float:
    steps = int(p.get("steps") or 5)
    gh = float(p.get("gable_h") or min(W * 1.15, 9.0))
    pinn = bool(p.get("step_pinnacles"))
    mid, half = W * 0.5, W * 0.5 - 0.05
    sh = gh / steps
    coping = p.get("coping") or ("bluestone" if wall.startswith("brick") else trim)
    yaw = _yaw(f)
    for s in range(steps):
        hk = half * (1.0 - s / steps)
        nxt = half * (1.0 - (s + 1) / steps) if s < steps - 1 else 0.0
        z0 = H + s * sh
        rbox(m, f, mid - hk, mid + hk, -0.45, 0.04, z0, z0 + sh, wall, skip=("bottom",))
        for sg in (-1.0, 1.0):
            lo, hi = sorted((mid + sg * hk, mid + sg * nxt))
            rbox(m, f, lo - (0.06 if sg < 0 else 0.0), hi + (0.06 if sg > 0 else 0.0), -0.5, 0.1, z0 + sh, z0 + sh + 0.16, coping)
            if pinn and s < steps - 1:
                x, y, _ = f.p(mid + sg * (hk - 0.2), -0.2, 0.0)
                _fine_pinnacle(m, x, y, z0 + sh + 0.16, 0.16, 1.3, trim, yaw, crockets=False)
    rows = int(p.get("gable_rows") or max(1, min(3, int(gh / 2.6))))
    rh = gh * 0.72 / rows
    for r in range(rows):
        z0 = H + r * rh
        hk = half * (1.0 - (z0 + rh - H) / gh) - 0.3
        if hk > 0.45:
            _gable_windows(m, f, mid, hk, z0 + 0.05, z0 + rh - 0.1, wall, trim, p.get("gable_windows") or "cross")
        rbox(m, f, mid - half * (1.0 - (z0 - H) / gh), mid + half * (1.0 - (z0 - H) / gh), 0.04, 0.16, z0 - 0.07, z0 + 0.07, trim)
    return H + gh + 0.16


def _gable_tiers(m: Mesh, f: Frame, W: float, H: float, p: dict, wall: str, trim: str) -> float:
    """Renaissance / Baroque tiered gable: storeys narrowing upward, scrolls, obelisks."""
    tiers = p.get("tiers") or [[0.82, 3.0], [0.56, 2.8], [0.32, 2.3]]
    mid = W * 0.5
    z = H
    prev = W
    style = p.get("gable_windows") or p.get("windows") or "cross"
    for i, (frac, th) in enumerate(tiers):
        tw, th = W * float(frac), float(th)
        t0, t1 = mid - tw / 2, mid + tw / 2
        rbox(m, f, t0, t1, -0.5, 0.0, z, z + th, wall, skip=("+d", "bottom"))
        nb = max(1, min(4, int(tw / 1.45)))
        bw = tw / nb
        for k in range(nb):
            _window(m, f, t0 + k * bw, t0 + (k + 1) * bw, z, z + th, style, wall, trim, 0.66)
        for k in range(nb + 1):
            a = min(t1 - 0.12, max(t0 + 0.12, t0 + k * bw))
            rbox(m, f, a - 0.12, a + 0.12, 0.0, 0.14, z + 0.1, z + th - 0.25, trim, skip=("bottom",))
        rbox(m, f, t0 - 0.12, t1 + 0.12, 0.0, 0.3, z + th - 0.3, z + th, trim)
        for sg in (-1.0, 1.0):
            x_in = mid + sg * tw / 2
            x_out = mid + sg * max(tw / 2 + 0.35, prev / 2 - 0.15)
            _volute(m, f, x_in, x_out, z, th * 0.82, trim)
            _obelisk(m, f, x_out - sg * 0.18, z, min(1.6, th * 0.55), trim)
        prev = tw
        z += th
    tw = W * float(tiers[-1][0])
    top_kind = p.get("gable_top") or "pediment"
    if top_kind == "segmental":
        arc = [(mid + tw / 2 * math.cos(t), z + tw * 0.28 * math.sin(t)) for t in (math.pi * k / 8 for k in range(9))]
        profile_slab(m, f, [(mid + tw / 2 + 0.15, z)] + arc + [(mid - tw / 2 - 0.15, z)], -0.5, 0.15, trim, back=True)
        z += tw * 0.28
    else:
        profile_slab(m, f, [(mid - tw / 2 - 0.2, z), (mid + tw / 2 + 0.2, z), (mid, z + tw * 0.38)], -0.5, 0.15, trim, back=True)
        z += tw * 0.38
    return z


def _gable_gothic(m: Mesh, f: Frame, W: float, H: float, p: dict, wall: str, trim: str) -> float:
    """Late-Gothic pointed gable: crocketed rakes, pinnacles, tiers of lancets (Den Arend)."""
    gh = float(p.get("gable_h") or W * 0.95)
    mid = W * 0.5
    yaw = _yaw(f)
    profile_slab(m, f, [(0.05, H), (W - 0.05, H), (mid, H + gh)], -0.5, 0.0, wall, back=True)
    t = 0.24
    inner = [(0.05, H), (mid, H + gh), (W - 0.05, H)]
    outer = [(0.05 - t * 0.3, H + t), (mid, H + gh + t * 1.2), (W - 0.05 + t * 0.3, H + t)]
    band(m, f, inner, outer, -0.5, 0.18, trim, (mid, H))
    for sg in (-1.0, 1.0):
        _crockets(m, f.p(mid + sg * (mid + 0.02), -0.15, H + t), f.p(mid, -0.15, H + gh + t), max(3, int(gh / 0.9)), 0.12, trim)
        x, y, _ = f.p(mid + sg * (mid - 0.25), -0.15, 0.0)
        _fine_pinnacle(m, x, y, H, 0.22, 2.6, trim, yaw)
    rows = int(p.get("gable_rows") or 2)
    rh = gh * 0.7 / rows
    for r in range(rows):
        z0 = H + 0.25 + r * rh
        hk = mid * (1.0 - (z0 + rh - H) / gh) - 0.25
        if hk > 0.4:
            _gable_windows(m, f, mid, hk, z0, z0 + rh - 0.15, wall, trim, "gothic")
    return H + gh + t * 1.2


def _roof_behind(m: Mesh, f: Frame, W: float, H: float, top: float, dep: float, wall: str) -> None:
    gable_roof(m, f, 0.05, W - 0.05, -dep, -0.45, H, H + (top - H) * 0.82, "slate", ridge="d", gable_mat=wall, overhang=0.05)


def _roof_cornice(m: Mesh, f: Frame, W: float, H: float, p: dict, dep: float, wall: str, trim: str) -> float:
    rh = float(p.get("roof_h") or min(6.0, dep * 0.45))
    d1 = min(dep, 11.0)
    gable_roof(m, f, 0.0, W, -d1, 0.15, H, H + rh, "slate", ridge="a", gable_mat=wall, overhang=0.2)
    n = int(p.get("dormers") or max(1, round(W / 3.4)))
    for k in range(n):
        c = (k + 0.5) * W / n
        zr = H + 0.6
        rbox(m, f, c - 0.55, c + 0.55, -1.6, -0.6, zr, zr + 1.5, wall, skip=("bottom",))
        pane(m, f, opening(c, zr + 0.2, 0.7, zr + 1.2, "rect", 4), -0.57, "glass_dark")
        gable_roof(m, f, c - 0.55, c + 0.55, -1.6, -0.6, zr + 1.5, zr + 2.1, "slate", ridge="d", gable_mat=wall, overhang=0.08)
    return H + rh


def _roof_mansard(m: Mesh, f: Frame, W: float, H: float, p: dict, dep: float, wall: str, trim: str) -> float:
    """Neoclassical attic: balustrade, steep slate mansard, one big arched dormer."""
    _balustrade(m, f, 0.1, W - 0.1, H, -0.3, 0.3, trim, 1.0, 0.45)
    d1 = min(dep, 11.0)
    h1, k = float(p.get("roof_h") or 4.2), 1.3
    zt = H + h1
    corners = [f.p(0.0, -0.4, H), f.p(W, -0.4, H), f.p(W, -0.4 - k, zt), f.p(0.0, -0.4 - k, zt)]
    m.face(corners, "slate", normal=f.vec(0.0, 1.0, 0.6))
    back = [f.p(0.0, -d1, H), f.p(W, -d1, H), f.p(W, -d1 + k, zt), f.p(0.0, -d1 + k, zt)]
    m.face(back, "slate", normal=f.vec(0.0, -1.0, 0.6))
    m.face([f.p(0.0, -0.4 - k, zt), f.p(W, -0.4 - k, zt), f.p(W, -d1 + k, zt), f.p(0.0, -d1 + k, zt)], "zinc", normal=(0.0, 0.0, 1.0))
    for a, sg in ((0.0, -1.0), (W, 1.0)):
        m.face([f.p(a, -0.4, H), f.p(a, -0.4 - k, zt), f.p(a, -d1 + k, zt), f.p(a, -d1, H)], wall, normal=f.vec(sg, 0.0, 0.0))
    c = W * 0.5
    big = bool(p.get("central_dormer", True))
    if big:
        dw = min(2.6, W * 0.32)
        rbox(m, f, c - dw / 2, c + dw / 2, -1.3, -0.35, H + 0.9, H + 3.3, trim, skip=("bottom",))
        hole = opening(c, H + 1.15, dw * 0.62, H + 2.4, "round", 6)
        pane(m, f, hole, -0.33, "glass_dark")
        archivolt(m, f, hole, 0.14, -0.35, -0.22, trim)
        profile_slab(m, f, [(c - dw / 2 - 0.25, H + 3.3), (c + dw / 2 + 0.25, H + 3.3), (c, H + 4.1)], -1.3, -0.2, trim, back=True)
    n = int(p.get("dormers") or 2)
    for i in range(n):
        cc = (i + 0.5) * W / n
        if big and abs(cc - c) < 1.8:
            continue
        rbox(m, f, cc - 0.5, cc + 0.5, -1.4, -0.6, H + 1.0, H + 2.4, trim, skip=("bottom",))
        pane(m, f, opening(cc, H + 1.15, 0.6, H + 2.0, "round", 4), -0.57, "glass_dark")
    return zt + (0.8 if big else 0.0)


# ------------------------------------------------------------------ guild house


def build_guild_house(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """One house on the Grote Markt from its photo spec (see module docstring)."""
    m = Mesh()
    p = lm.get("params") or {}
    pts = oriented([(float(x), float(y)) for x, y in ring], ccw=True)
    front = p.get("front") or _fallback_front(pts)
    sides = p.get("sides") or []
    f, W = _seg_frame(front)
    storeys = [float(s) for s in p.get("storeys") or [4.2, 3.4, 3.2, 3.0]]
    H = sum(storeys)
    wall = p.get("wall") or "stone_white"
    trim = p.get("trim") or ("stone_white" if wall.startswith("brick") else "stone_white")
    side_wall = p.get("side_wall") or wall
    dep = _depth_behind(pts, f)

    extrude_ring(m, pts, holes, 0.0, H, side_wall, "slate", skip=_on_segments([front] + sides))
    _storeys(m, f, W, storeys, p, wall, trim)
    for s in sides:
        fs, Ls = _seg_frame(s)
        if Ls < 1.0:
            continue
        ps = dict(p, bays=max(1, round(Ls / 2.4)), ground="shop" if p.get("ground") in ("shop", "veranda") else p.get("ground") or "arcade", pilasters=False, caryatids=[], balconies=[], door=-1)
        _storeys(m, fs, Ls, storeys, ps, side_wall, trim)

    gable = p.get("gable") or "stepped"
    top = H
    if gable == "stepped":
        top = _gable_stepped(m, f, W, H, p, wall, trim)
        _roof_behind(m, f, W, H, top, dep, side_wall)
    elif gable in ("tiers", "volute", "baroque"):
        top = _gable_tiers(m, f, W, H, p, wall, trim)
        _roof_behind(m, f, W, H, top, dep, side_wall)
    elif gable == "gothic":
        top = _gable_gothic(m, f, W, H, p, wall, trim)
        _roof_behind(m, f, W, H, top, dep, side_wall)
    elif gable == "mansard":
        top = _roof_mansard(m, f, W, H, p, dep, wall, trim)
    else:
        top = _roof_cornice(m, f, W, H, p, dep, wall, trim)
    crown = p.get("crown")
    if crown and gable not in ("cornice", "mansard"):
        _crown(m, f, W * 0.5, top, crown, float(p.get("crown_scale", 1.0)))
    for a, kind in p.get("corner_crowns") or []:
        _crown(m, f, float(a) * W, H + 0.05, kind, 0.6)
    return m


# ------------------------------------------------------------------ Hansahuis


def _rotunda(m: Mesh, cx: float, cy: float, r: float, storeys: list[float], p: dict, main: bool) -> None:
    """Corner tower: round body with storey windows, drum, scaled dome, lantern and spire."""
    sides = 12
    pts = ngon(cx, cy, r, sides, 0.0)
    wall, trim = "stone_white", "stone_white"
    z = 0.0
    for i, h in enumerate(storeys):
        for k in range(sides):
            p0, p1 = pts[k], pts[(k + 1) % sides]
            mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
            fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            if L > 0.7:
                hole = opening(L * 0.5, z + 0.6, L * 0.6, z + h - 0.6 - (L * 0.31 if i == 0 else 0.0), "round" if i == 0 else "rect", 4)
                cell(m, fe, 0.0, L, z, z + h, hole, 0.0, -0.25, wall, trim)
                pane(m, fe, hole, -0.25, "glass_dark" if i == 0 else "glass")
            else:
                cell(m, fe, 0.0, L, z, z + h, None, 0.0, 0.0, wall)
        frustum(m, cx, cy, z + h - 0.15, z + h + 0.15, r + 0.2, r + 0.2, sides, trim, bottom=True)
        z += h
    frustum(m, cx, cy, z, z + 0.6, r + 0.45, r + 0.45, sides, trim, bottom=True)
    zb = z + 0.6
    # Balustraded walk round the drum.
    for k in range(sides * 2):
        t = math.tau * k / (sides * 2)
        frustum(m, cx + (r + 0.3) * math.cos(t), cy + (r + 0.3) * math.sin(t), zb, zb + 0.85, 0.06, 0.06, 4, trim, top=False)
    frustum(m, cx, cy, zb + 0.85, zb + 1.0, r + 0.42, r + 0.42, sides, trim, bottom=True)
    rd = r * 0.86
    zd = zb + (3.4 if main else 2.2)
    dpts = ngon(cx, cy, rd, sides, 0.0)
    for k in range(sides):
        p0, p1 = dpts[k], dpts[(k + 1) % sides]
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if k % 2 == 0:
            hole = opening(L * 0.5, zb + 0.5, L * 0.7, zd - 0.6 - L * 0.35, "round", 4)
            cell(m, fe, 0.0, L, zb, zd, hole, 0.0, -0.2, wall, trim)
            pane(m, fe, hole, -0.2, "glass_dark")
        else:
            cell(m, fe, 0.0, L, zb, zd, None, 0.0, 0.0, wall)
            x, y, _ = fe.p(L * 0.5, 0.2, 0.0)
            frustum(m, x, y, zb, zd, 0.16, 0.16, 6, trim, top=False)
    frustum(m, cx, cy, zd, zd + 0.4, rd + 0.3, rd + 0.3, sides, trim, bottom=True)
    # Dome: stacked rings on a raised (slightly ogival) profile, silver slate scales.
    zc = zd + 0.4
    rise = rd * (1.4 if main else 1.25)
    prev_r, prev_z = rd + 0.1, zc
    for k in range(1, 8):
        t = math.pi / 2 * k / 8
        rr = (rd + 0.1) * math.cos(t)
        zz = zc + rise * math.sin(t)
        frustum(m, cx, cy, prev_z, zz, prev_r, rr, sides, "zinc", top=False)
        prev_r, prev_z = rr, zz
    for k in range(8):
        t = math.tau * k / 8
        _strut(m, (cx + (rd + 0.12) * math.cos(t), cy + (rd + 0.12) * math.sin(t), zc), (cx + prev_r * math.cos(t), cy + prev_r * math.sin(t), prev_z), 0.07, trim, 4)
    # Lantern with columns, cupola, spire and gilt ball.
    lr = max(0.55, prev_r)
    zl = prev_z
    frustum(m, cx, cy, zl, zl + 0.25, lr + 0.25, lr + 0.25, 8, trim, bottom=True)
    lh = 1.9 if main else 1.4
    for k in range(8):
        t = math.tau * k / 8
        frustum(m, cx + lr * math.cos(t), cy + lr * math.sin(t), zl + 0.25, zl + 0.25 + lh, 0.07, 0.07, 4, trim, top=False)
    frustum(m, cx, cy, zl + 0.25, zl + 0.25 + lh, lr * 0.7, lr * 0.7, 8, "glass_dark")
    frustum(m, cx, cy, zl + 0.25 + lh, zl + 0.45 + lh, lr + 0.25, lr + 0.25, 8, trim, bottom=True)
    zq = zl + 0.45 + lh
    frustum(m, cx, cy, zq, zq + lr * 1.2, lr + 0.1, 0.12, 8, "zinc")
    _ball(m, (cx, cy, zq + lr * 1.2 + 0.2), 0.22, "gold", 6)
    frustum(m, cx, cy, zq + lr * 1.2 + 0.4, zq + lr * 1.2 + (2.6 if main else 1.6), 0.06, 0.0, 4, "iron")


def build_hansahuis(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """Hansahuis (1904) at Suikerrui / Ernest Van Dijckkaai: neo-Baroque limestone block,
    rusticated arcaded ground floor, balconies, slate mansard with dormers and the domed
    corner rotundas (big one at the Kaasstraat corner, small one at the quay)."""
    m = Mesh()
    p = lm.get("params") or {}
    pts = oriented([(float(x), float(y)) for x, y in ring], ccw=True)
    front = p.get("front") or _fallback_front(pts)
    fronts = [front] + list(p.get("sides") or [])
    storeys = [float(s) for s in p.get("storeys") or [4.8, 3.7, 3.5, 3.3]]
    H = sum(storeys)
    wall, trim = "stone_white", "stone_white"
    extrude_ring(m, pts, holes, 0.0, H, "render_cream", None, skip=_on_segments(fronts))
    for s in fronts:
        fs, Ls = _seg_frame(s)
        if Ls < 1.0:
            continue
        ps = {
            "bays": max(1, round(Ls / 3.0)),
            "ground": "arcade",
            "ground_mat": "stone_grey",
            "windows": "plain",
            "glaze": 0.5,
            "pilasters": True,
            "balconies": [1, 3],
            "door": 1,
        }
        _storeys(m, fs, Ls, storeys, ps, wall, trim)
        for k in range(max(1, round(Ls / 3.0))):
            c = (k + 0.5) * Ls / max(1, round(Ls / 3.0))
            rbox(m, fs, c - 0.55, c + 0.55, 0.0, 0.25, storeys[0] + storeys[1] - 0.55, storeys[0] + storeys[1] - 0.1, trim)
    inset = ring_roof(m, pts, holes, H, 4.2, 1.8, "slate", insets=(1.8, 1.2, 0.8))
    for s in fronts:
        fs, Ls = _seg_frame(s)
        n = int(Ls / 3.0)
        for k in range(n):
            c = (k + 0.5) * Ls / n
            if c < 1.2 or c > Ls - 1.2 or inset <= 0.0:
                continue
            zr = H + 0.6
            rbox(m, fs, c - 0.6, c + 0.6, -1.3, -0.45, zr, zr + 1.9, trim, skip=("bottom",))
            hole = opening(c, zr + 0.25, 0.75, zr + 1.3, "round", 5)
            pane(m, fs, hole, -0.43, "glass_dark")
            profile_slab(m, fs, [(c - 0.75, zr + 1.9), (c + 0.75, zr + 1.9), (c, zr + 2.5)], -1.3, -0.35, trim, back=True)
    dome = p.get("dome")
    corner = p.get("dome_xy")
    if dome and corner:
        main = dome == "main"
        r = 4.2 if main else 3.0
        cx, cy = float(corner[0]), float(corner[1])
        ccx = sum(q[0] for q in pts) / len(pts)
        ccy = sum(q[1] for q in pts) / len(pts)
        dl = math.hypot(ccx - cx, ccy - cy) or 1.0
        cx, cy = cx + (ccx - cx) / dl * r * 0.55, cy + (ccy - cy) / dl * r * 0.55
        _rotunda(m, cx, cy, r, storeys, p, main)
    return m


# ------------------------------------------------------------------ Brabo fountain


def _rand(i: int) -> float:
    """Deterministic 0..1 hash so the rock pile is the same every build."""
    v = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return v - math.floor(v)


def build_brabo_fountain(node: dict) -> Mesh:
    """Brabo fountain (Jef Lambeaux, 1887): a heap of dark rock straight on the paving with
    water running off it, a twisting verdigris-bronze column of naiads, sea creatures and
    a ship's prow, the giant Antigoon slumped on top, and Silvius Brabo striding over him
    with the severed hand flung up toward the Scheldt."""
    m = Mesh()
    x, y = float(node["x"]), float(node["y"])
    fx, fy = node.get("facing_xy") or (x + 1.0, y)
    nx, ny = fx - x, fy - y
    ln = math.hypot(nx, ny) or 1.0
    nx, ny = nx / ln, ny / ln
    # a: across Brabo (his right = +a), d: the way he faces (toward the Scheldt).
    f = Frame(x, y, ny, -nx, nx, ny)
    yaw = _yaw(f)

    def P(a: float, d: float, z: float) -> Vec3:
        return f.p(a, d, z)

    def surf(r: float) -> float:
        """Height of the rock heap at radius r."""
        return 3.7 * max(0.0, 1.0 - (r / 3.7) ** 1.7)

    # Shallow water sheet round the rock, at paving level.
    pool = [f.p(4.3 * math.cos(t) * (0.92 + 0.1 * _rand(k)), 3.9 * math.sin(t) * (0.92 + 0.1 * _rand(k + 40)), 0.0)[:2] for k, t in enumerate(math.tau * i / 18 for i in range(18))]
    m.cap(pool, [], 0.03, "water")
    # Rock heap: craggy blocks stacked into a steep mound, slightly longer across Brabo.
    i = 0
    for ring_r, n in ((3.5, 15), (2.9, 13), (2.2, 11), (1.5, 8), (0.8, 5), (0.0, 1)):
        for k in range(n):
            t = math.tau * (k + 0.6 * _rand(i)) / n
            rr = ring_r * (0.9 + 0.18 * _rand(i + 1))
            ax, ad = rr * math.cos(t) * 1.08, rr * math.sin(t) * 0.92
            bx, by, _ = P(ax, ad, 0.0)
            top = surf(rr) + 0.25 + 0.35 * _rand(i + 2)
            bot = max(0.0, surf(rr + 0.9) - 0.2)
            r0 = 0.75 + 0.45 * _rand(i + 3)
            frustum(m, bx, by, bot, top, r0, r0 * (0.45 + 0.3 * _rand(i + 4)), 5 + (i % 2), "rock", phase=t + _rand(i + 5) * 2.0, bottom=False)
            if _rand(i + 6) > 0.5 and top > 0.6:
                wbox(m, bx + 0.35 * math.cos(t), by + 0.35 * math.sin(t), top - 0.45, r0 * 1.2, r0 * 0.8, 0.5, t + 0.7, "rock")
            i += 7
    for k in range(4):  # loose blocks people sit on
        t = yaw + 0.6 + k * 1.55
        wbox(m, x + 5.8 * math.cos(t), y + 5.8 * math.sin(t), 0.0, 1.4, 0.8, 0.55, t, "rock")

    # Twisting bronze column of figures, 3.4 m → 7.0 m.
    z = 3.4
    for k, (h, r0, r1) in enumerate(((0.8, 1.05, 0.95), (0.75, 0.95, 0.85), (0.7, 0.85, 0.75), (0.7, 0.75, 0.66), (0.65, 0.66, 0.58))):
        off = 0.15 * math.sin(k * 1.7)
        cx, cy, _ = P(off, 0.1 * math.cos(k * 1.3), 0.0)
        frustum(m, cx, cy, z, z + h, r0, r1, 7, "bronze", phase=yaw + k * 0.45, bottom=(k == 0))
        z += h
    ztop = z
    # Naiads leaning out round the column, fish tails wrapping down onto the rock.
    for k, t in enumerate((0.4, 2.2, 3.9, 5.4)):
        zb = 3.8 + 0.5 * (k % 2)
        base = P(0.85 * math.cos(t), 0.85 * math.sin(t), zb)
        hip = P(1.1 * math.cos(t), 1.1 * math.sin(t), zb + 0.55)
        chest = P(1.15 * math.cos(t), 1.15 * math.sin(t), zb + 1.2)
        _strut(m, base, hip, 0.17, "bronze", 6)
        _strut(m, hip, chest, 0.15, "bronze", 6)
        _ball(m, P(1.18 * math.cos(t), 1.18 * math.sin(t), zb + 1.45), 0.13, "bronze")
        for sg in (-1.0, 1.0):
            arm = P(1.0 * math.cos(t + sg * 0.35), 1.0 * math.sin(t + sg * 0.35), zb + 1.75)
            _strut(m, P(1.12 * math.cos(t), 1.12 * math.sin(t), zb + 1.15), arm, 0.06, "bronze", 5)
        tr = 1.6
        tail_end = P(tr * math.cos(t + 0.5), tr * math.sin(t + 0.5), surf(tr) + 0.3)
        _strut(m, base, tail_end, 0.12, "bronze", 5)
        _strut(m, tail_end, P(1.95 * math.cos(t + 0.75), 1.95 * math.sin(t + 0.75), surf(1.95) + 0.45), 0.05, "bronze", 4)
    # Sea monster sprawled down the rock to Brabo's right, head raised.
    sm = [(0.8, -0.3), (1.5, -0.55), (2.2, -0.65), (2.8, -0.35), (3.2, 0.15)]
    pts3 = [P(a, d, surf(math.hypot(a, d)) + 0.35) for a, d in sm]
    for k in range(len(pts3) - 1):
        _strut(m, pts3[k], pts3[k + 1], 0.36 - 0.06 * k, "bronze", 6)
    _strut(m, pts3[-1], P(3.35, 0.45, surf(3.4) + 0.9), 0.16, "bronze", 5)
    _ball(m, P(3.4, 0.55, surf(3.4) + 1.05), 0.24, "bronze")
    # Ship's prow nosing out of the rock on Brabo's left.
    pr = [P(-0.9, 0.1, 3.5), P(-1.6, 0.25, 3.2), P(-2.3, 0.45, 3.05)]
    _strut(m, pr[0], pr[1], 0.32, "bronze", 6)
    _strut(m, pr[1], pr[2], 0.2, "bronze", 5)
    _strut(m, pr[2], P(-2.55, 0.55, 3.5), 0.07, "bronze", 4)
    # Dolphins spouting at the foot of the column.
    for t in (1.2, 3.0, 4.8):
        h0 = P(1.25 * math.cos(t), 1.25 * math.sin(t), surf(1.25) + 0.2)
        h1 = P(1.75 * math.cos(t), 1.75 * math.sin(t), surf(1.75) + 0.75)
        _strut(m, h0, h1, 0.14, "bronze", 5)
        _strut(m, h0, P(1.05 * math.cos(t + 0.4), 1.05 * math.sin(t + 0.4), surf(1.05) + 0.7), 0.06, "bronze", 4)

    # Antigoon slumped over the top, head and arm hanging down Brabo's left front.
    zf = ztop
    frustum(m, *P(0.0, 0.0, 0.0)[:2], zf, zf + 0.35, 0.5, 0.42, 6, "bronze", phase=yaw)
    zf += 0.35
    _strut(m, P(-0.6, 0.15, zf + 0.1), P(0.45, -0.15, zf + 0.25), 0.26, "bronze", 6)
    _ball(m, P(-0.85, 0.4, zf - 0.1), 0.2, "bronze")
    _strut(m, P(-0.6, 0.15, zf + 0.1), P(-0.85, 0.4, zf - 0.1), 0.1, "bronze", 5)
    _strut(m, P(-0.5, 0.3, zf + 0.1), P(-0.9, 0.8, zf - 0.75), 0.08, "bronze", 5)
    _strut(m, P(0.45, -0.15, zf + 0.25), P(0.85, 0.1, zf - 0.45), 0.12, "bronze", 5)
    _strut(m, P(0.4, -0.25, zf + 0.2), P(0.75, -0.75, zf - 0.55), 0.11, "bronze", 5)
    zf += 0.4

    # Brabo: left foot on Antigoon's back, right leg braced behind, torso twisting back,
    # right arm high with the hand, left arm low and back.
    s = 1.75

    def B(a: float, d: float, z: float) -> Vec3:
        return P(a, d, zf + z)

    j = {
        "l_foot": B(-0.22, 0.42, 0.05),
        "l_knee": B(-0.18, 0.55, 0.75),
        "l_hip": B(-0.14, 0.05, 1.45),
        "r_hip": B(0.14, -0.02, 1.45),
        "r_knee": B(0.2, -0.4, 0.8),
        "r_foot": B(0.24, -0.72, 0.02),
        "pelvis": B(0.0, 0.0, 1.5),
        "chest": B(0.03, -0.12, 2.25),
        "neck": B(0.05, -0.16, 2.48),
        "head": B(0.07, -0.18, 2.66),
        "l_sh": B(-0.32, -0.08, 2.32),
        "r_sh": B(0.33, -0.15, 2.36),
        "l_el": B(-0.58, -0.32, 1.88),
        "l_hand": B(-0.72, -0.5, 1.45),
        "r_el": B(0.55, -0.15, 2.95),
        "r_hand": B(0.58, -0.02, 3.55),
    }
    _figure(m, j, s, "bronze")
    _strut(m, B(-0.18, 0.0, 1.5), B(0.2, 0.02, 1.5), 0.2, "bronze", 6)  # hip cloth
    hand = B(0.58, -0.02, 3.55)
    _strut(m, hand, B(0.66, 0.1, 3.85), 0.1, "bronze", 5)  # Antigoon's severed hand
    _strut(m, B(-0.72, -0.5, 1.45), B(-0.6, 0.2, 0.55), 0.04, "bronze", 4)  # sword
    return m


BUILDERS = {
    "guild_house": build_guild_house,
    "hansahuis": build_hansahuis,
}
NODE_BUILDERS = {
    "brabo_fountain": build_brabo_fountain,
}


# ------------------------------------------------------------------ sync specs → manifest


def _open_edges(ring: list[Vec2], others: list[list[Vec2]], min_len: float = 1.8) -> list[Edge]:
    """Footprint runs whose outside is open street (not another building)."""
    out = []
    for e in merged_edges(ring, 10.0):
        if e.length < min_len:
            continue
        probes = []
        for t in (0.25, 0.5, 0.75):
            px = e.p0[0] + (e.p1[0] - e.p0[0]) * t + e.outward[0] * 1.2
            py = e.p0[1] + (e.p1[1] - e.p0[1]) * t + e.outward[1] * 1.2
            probes.append((px, py))
        blocked = 0
        for px, py in probes:
            for o in others:
                if point_in_ring(px, py, o):
                    blocked += 1
                    break
        if blocked <= 1:
            out.append(e)
    return out


def _pick_front(edges: list[Edge], facing: Vec2) -> Edge | None:
    best, best_s = None, -1e9
    for e in edges:
        dx, dy = facing[0] - e.mid[0], facing[1] - e.mid[1]
        dl = math.hypot(dx, dy) or 1.0
        dot = (e.outward[0] * dx + e.outward[1] * dy) / dl
        if dot < 0.2:
            continue
        s = dot * min(e.length, 9.0) - 0.01 * dl
        if s > best_s:
            best, best_s = e, s
    return best


def _seg(e: Edge) -> list[float]:
    return [round(v, 3) for v in (*e.p0, *e.p1, *e.outward)]


def _line_corner(a: Edge, b: Edge) -> Vec2 | None:
    """Where the wall lines of two fronts meet (the true corner behind a chamfer)."""
    ax, ay = a.p1[0] - a.p0[0], a.p1[1] - a.p0[1]
    bx, by = b.p1[0] - b.p0[0], b.p1[1] - b.p0[1]
    den = ax * by - ay * bx
    if abs(den) < 1e-6:
        return None
    t = ((b.p0[0] - a.p0[0]) * by - (b.p0[1] - a.p0[1]) * bx) / den
    return (a.p0[0] + ax * t, a.p0[1] + ay * t)


def manifest_entries(spec: dict[str, Any], layout: dict[str, Any], origin: tuple[float, float]) -> dict[str, dict[str, Any]]:
    from cityview.geo import project

    rings = {int(b["id"]): oriented([(float(p[0]), float(p[1])) for p in b["ring"]], ccw=True) for b in layout["buildings"]}
    rows = spec.get("rows") or {}
    out: dict[str, dict[str, Any]] = {}
    for h in spec["houses"]:
        hid = int(h["id"])
        ring = rings.get(hid)
        if ring is None:
            raise KeyError(f"house {hid} ({h.get('addr')}) not in the layout")
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        others = [r for oid, r in rings.items() if oid != hid and abs(r[0][0] - cx) < 60 and abs(r[0][1] - cy) < 60]
        edges = _open_edges(ring, others)
        facing_at = h.get("facing_at") or (rows.get(h.get("row")) or {}).get("facing_at")
        facing = project(float(facing_at[0]), float(facing_at[1]), origin[0], origin[1]) if facing_at else (cx, cy)
        front = _pick_front(edges, facing) or max(merged_edges(ring), key=lambda e: e.length)
        sides: list[Edge] = []
        for e in edges:
            if e is front or e.length < float(h.get("min_side", 3.0)):
                continue
            if e.outward[0] * front.outward[0] + e.outward[1] * front.outward[1] < -0.3:
                continue  # back yard, not street
            if any(_seg(e) == _seg(o) for o in sides + [front]):
                continue
            sides.append(e)
        params = dict(h.get("params") or {})
        params["front"] = _seg(front)
        params["sides"] = [_seg(e) for e in sides]
        turned = [e for e in sides if abs(e.outward[0] * front.outward[0] + e.outward[1] * front.outward[1]) < 0.7]
        if params.get("dome") and turned:
            corner = _line_corner(front, max(turned, key=lambda e: e.length))
            if corner:
                params["dome_xy"] = [round(corner[0], 3), round(corner[1], 3)]
        storeys = params.get("storeys") or [4.2, 3.4, 3.2, 3.0]
        out[str(hid)] = {
            "id": str(hid),
            "name": h.get("name") or h.get("addr") or str(hid),
            "kind": "civic",
            "custom": h.get("custom") or "guild_house",
            "levels": len(storeys),
            "height_m": round(sum(storeys), 2),
            "stream": True,
            "params": params,
            "attribution": f"{h.get('addr', '')} — {h.get('source', 'Grote Markt photos')}".strip(" —"),
        }
    return out


def sync(district_id: str, layout_path: Path | None = None) -> int:
    from cityview.districts import district_paths

    paths = district_paths(district_id)
    spec = json.loads((paths.landmarks / SPEC_NAME).read_text())
    if layout_path is None:
        name = f"district_{district_id.replace('-', '_')}_layout.json"
        per_district = Path("output") / district_id / name
        layout_path = per_district if per_district.exists() else Path("output") / name
    layout = json.loads(Path(layout_path).read_text())
    origin = tuple(layout.get("origin") or json.loads(paths.district_json.read_text())["origin"])
    entries = manifest_entries(spec, layout, origin)
    manifest = json.loads(paths.landmarks_manifest.read_text())
    by_id = manifest.setdefault("by_id", {})
    stale = [k for k, v in by_id.items() if v.get("custom") in ("guild_house", "hansahuis", "grote_markt_terrace") and k not in entries]
    for k in stale:
        del by_id[k]
    by_id.update(entries)
    by_name = manifest.setdefault("by_name", {})
    for k in [k for k, v in by_name.items() if v.get("custom") == "grote_markt_terrace"]:
        by_name[k] = {**by_name[k], "custom": "guild_house"}
    paths.landmarks_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return len(entries)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["sync"])
    ap.add_argument("district")
    ap.add_argument("--layout", type=Path, default=None)
    args = ap.parse_args()
    n = sync(args.district, args.layout)
    print(f"Synced {n} Grote Markt houses into the {args.district} landmark manifest")


if __name__ == "__main__":
    main()
