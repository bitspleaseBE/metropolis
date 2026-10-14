"""Civic monument builders for the Nationale Bank seam and Antwerpen 2000.

Mesh + tiling materials only. Proportions follow Inventaris / Commons references
listed in each district's landmarks/manifest.json.
"""

from __future__ import annotations

import math

from cityview.landmark_kit import (
    Edge,
    Frame,
    Mesh,
    Vec2,
    Vec3,
    arch_points,
    archivolt,
    band,
    cell,
    centroid,
    cylinder,
    extrude_ring,
    front_edge,
    frustum,
    gable_roof,
    hip_roof,
    ngon,
    opening,
    pane,
    point_in_ring,
    profile_slab,
    rbox,
    ring_edges,
    simplify_ring,
    wbox,
)

TRI_BUDGET = {
    "nationale_bank": 45000,
    "olv_cathedral": 80000,
    "stadhuis": 50000,
    "het_steen": 35000,
}


def _span(ring: list[Vec2], lm: dict):
    pts = [(float(p[0]), float(p[1])) for p in ring]
    outline = simplify_ring(pts, 0.55, 9.0) if len(pts) > 8 else pts
    if len(outline) < 3:
        outline = pts
    anchor = lm.get("anchor_xy")
    if anchor:
        edge = front_edge(outline, tuple(anchor), 18.0)
    else:
        edges = ring_edges(outline)
        edge = max(edges, key=lambda e: e.length) if edges else front_edge(outline, outline[0], 18.0)
    f = edge.frame()
    locs = [f.local(*p) for p in outline]
    a0, a1 = min(p[0] for p in locs), max(p[0] for p in locs)
    d_back, d_front = min(p[1] for p in locs), max(p[1] for p in locs)
    width_all = max(0.5, a1 - a0)
    if edge.length >= 0.5 * width_all:
        return f, outline, edge.length, max(2.0, -d_back), edge
    f = f.shifted(a0, d_front)
    return f, outline, width_all, max(2.0, d_front - d_back), edge


def _skip_facing(normal: Vec2):
    def pred(e: Edge) -> bool:
        return e.outward[0] * normal[0] + e.outward[1] * normal[1] > 0.72

    return pred


def _win(m: Mesh, f: Frame, a0: float, a1: float, z0: float, z1: float, wall: str = "stone_white") -> None:
    ca = (a0 + a1) * 0.5
    w = a1 - a0
    if w < 0.3 or z1 - z0 < 0.4:
        return
    hole = opening(ca, z0 + 0.05, max(0.28, w * 0.72), z0 + (z1 - z0) * 0.7, "rect", 4)
    cell(m, f, a0, a1, z0, z1, hole, 0.14, 0.02, wall, "stone_white")
    pane(m, f, hole, 0.05, "glass")


def _sub_frame(f: Frame, a: float, d: float, ua: float, ud: float, na: float, nd: float) -> Frame:
    """Frame at local (a, d) of ``f`` with axes given as local directions."""
    x, y, _ = f.p(a, d, 0.0)
    u = f.vec(ua, ud, 0.0)
    n = f.vec(na, nd, 0.0)
    return Frame(x, y, u[0], u[1], n[0], n[1])


def _yaw(f: Frame) -> float:
    return math.atan2(f.uy, f.ux)


def _strut(m: Mesh, p0: Vec3, p1: Vec3, r: float, mat: str, sides: int = 4) -> None:
    """Prism between two 3-D points (limbs, flying buttresses)."""
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    ln = math.sqrt(dx * dx + dy * dy + dz * dz)
    if ln < 1e-6:
        return
    ax = (dx / ln, dy / ln, dz / ln)
    ref = (0.0, 0.0, 1.0) if abs(ax[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = (ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0])
    l1 = math.sqrt(sum(c * c for c in e1)) or 1.0
    e1 = (e1[0] / l1, e1[1] / l1, e1[2] / l1)
    e2 = (ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0])

    def ring(p: Vec3) -> list[Vec3]:
        out = []
        for i in range(sides):
            t = math.tau * i / sides
            c, s = math.cos(t) * r, math.sin(t) * r
            out.append((p[0] + c * e1[0] + s * e2[0], p[1] + c * e1[1] + s * e2[1], p[2] + c * e1[2] + s * e2[2]))
        return out

    r0, r1 = ring(p0), ring(p1)
    mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5)
    for i in range(sides):
        j = (i + 1) % sides
        m.face([r0[i], r0[j], r1[j], r1[i]], mat, center=mid)
    m.face(r0, mat, normal=(-ax[0], -ax[1], -ax[2]))
    m.face(r1, mat, normal=ax)


def _pinnacle(m: Mesh, x: float, y: float, z: float, r: float, h: float, mat: str, yaw: float = 0.0) -> None:
    """Gothic pinnacle: short square shaft + four-sided spirelet."""
    ph = yaw + math.pi / 4
    frustum(m, x, y, z, z + h * 0.3, r, r, 4, mat, phase=ph, top=False)
    frustum(m, x, y, z + h * 0.3, z + h, r * 1.18, 0.0, 4, mat, phase=ph)


def _lancet(m: Mesh, f: Frame, ca: float, z0: float, w: float, z1: float, glass: str = "glass_dark") -> None:
    """Pointed tracery window laid on a wall face at d=0 (pane + archivolt + mullion + sill)."""
    hw = w * 0.5
    rise = hw * 1.6
    zs = z1 - rise
    if w < 0.5 or zs <= z0 + 0.3:
        return
    hole = opening(ca, z0, w, zs, "pointed", 6)
    pane(m, f, hole, 0.03, glass)
    archivolt(m, f, hole, max(0.16, w * 0.07), 0.0, 0.16, "stone_white")
    if w > 1.4:
        rbox(m, f, ca - 0.07, ca + 0.07, 0.0, 0.1, z0, zs + rise * 0.5, "stone_white")
    rbox(m, f, ca - hw - 0.2, ca + hw + 0.2, 0.0, 0.24, z0 - 0.22, z0, "stone_white")


def _shaft(
    m: Mesh,
    pts: list[Vec2],
    z0: float,
    z1: float,
    mat: str,
    n_open: int = 0,
    kind: str = "pointed",
    glass: str = "glass_dark",
    depth: float = 0.5,
) -> None:
    """Walls of a convex prism; each face carries ``n_open`` recessed tall openings."""
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    for i in range(n):
        p0, p1 = pts[i], pts[(i + 1) % n]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        if n_open <= 0 or L < 1.2:
            quad = [(p0[0], p0[1], z0), (p1[0], p1[1], z0), (p1[0], p1[1], z1), (p0[0], p0[1], z1)]
            m.face(quad, mat, normal=(fe.nx, fe.ny, 0.0))
            continue
        cw = L / n_open
        for k in range(n_open):
            b0, b1 = k * cw, (k + 1) * cw
            w = cw * 0.5
            rise = w * 0.8 if kind == "pointed" else w * 0.5
            zb = z0 + (z1 - z0) * 0.14
            zs = z1 - (z1 - z0) * 0.1 - rise
            if zs < zb + 0.4:
                cell(m, fe, b0, b1, z0, z1, None, 0.0, 0.0, mat)
                continue
            hole = opening((b0 + b1) * 0.5, zb, w, zs, kind, 6)
            cell(m, fe, b0, b1, z0, z1, hole, 0.0, -depth, mat, mat)
            pane(m, fe, hole, -depth, glass)


def _rect_pts(f: Frame, a0: float, a1: float, d0: float, d1: float) -> list[Vec2]:
    return [f.p(a, d, 0.0)[:2] for a, d in ((a0, d0), (a1, d0), (a1, d1), (a0, d1))]


def _oct_pts(f: Frame, a: float, d: float, r: float) -> list[Vec2]:
    return [f.p(a + r * math.cos(t), d + r * math.sin(t), 0.0)[:2] for t in (math.pi / 8 + k * math.pi / 4 for k in range(8))]


def _crenel(m: Mesh, f: Frame, L: float, z: float, mat: str, h: float = 0.9, w: float = 0.75, gap: float = 0.7, dep: float = 0.55) -> None:
    """Merlons along a wall top running 0..L at depth -dep..0."""
    if L <= 0.2:
        return
    w = min(w, L)
    n = max(1, int((L + gap) / (w + gap)))
    pitch = L / n
    for k in range(n):
        c = (k + 0.5) * pitch
        rbox(m, f, c - w * 0.5, c + w * 0.5, -dep, 0.0, z, z + h, mat)


def _crenel_poly(m: Mesh, pts: list[Vec2], z: float, mat: str) -> None:
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    for i in range(n):
        p0, p1 = pts[i], pts[(i + 1) % n]
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        _crenel(m, fe, math.hypot(p1[0] - p0[0], p1[1] - p0[1]), z, mat)


def _portal(m: Mesh, f: Frame, ca: float, w: float, z_spring: float, wall: str, depth: float = 1.4, kind: str = "pointed") -> None:
    """Proud gabled porch on a wall face at d=0 with a moulded arched doorway."""
    hw = w * 0.5
    rise = hw * 1.6 if kind == "pointed" else hw
    bw = hw + 1.1
    bh = z_spring + rise + 1.0
    rbox(m, f, ca - bw, ca + bw, 0.0, depth, 0.0, bh, wall, skip=("+d", "bottom"))
    hole = opening(ca, 0.05, w, z_spring, kind, 8)
    cell(m, f, ca - bw, ca + bw, 0.0, bh, hole, depth, 0.05, wall, "stone_white")
    pane(m, f, hole, 0.06, "door")
    archivolt(m, f, hole, 0.3, depth, depth + 0.16, "stone_white")
    archivolt(m, f, opening(ca, 0.05, w + 0.6, z_spring, kind, 8), 0.22, depth, depth + 0.1, "stone_white")
    profile_slab(m, f, [(ca - bw - 0.1, bh), (ca + bw + 0.1, bh), (ca, bh + bw * 1.15)], 0.0, depth + 0.1, wall)
    yaw = _yaw(f)
    for sa in (-1.0, 1.0):
        x, y, _ = f.p(ca + sa * bw, depth * 0.5, 0.0)
        _pinnacle(m, x, y, bh, 0.3, 2.4, "stone_white", yaw)
    x, y, _ = f.p(ca, depth * 0.5, 0.0)
    _pinnacle(m, x, y, bh + bw * 1.15 - 0.2, 0.22, 1.6, "stone_white", yaw)


def _turret(m: Mesh, x: float, y: float, r: float, h: float, wall: str, cone: float = 2.8) -> None:
    """Round tower: corbelled crenellated parapet + steep conical slate roof."""
    cylinder(m, x, y, 0.0, h, r, 12, wall, top=False)
    frustum(m, x, y, h, h + 0.7, r, r + 0.4, 12, "bluestone")
    rr = r + 0.22
    for k in range(8):
        t = math.tau * k / 8
        wbox(m, x + rr * math.cos(t), y + rr * math.sin(t), h + 0.7, 0.7, 0.42, 0.9, t + math.pi / 2, wall)
    top = h + 0.7 + r * cone
    frustum(m, x, y, h + 0.7, top, r + 0.12, 0.0, 12, "slate")
    frustum(m, x, y, top - 0.15, top + 0.9, 0.07, 0.0, 4, "iron")


# ------------------------------------------------------------------ Gothic detail kit


def _circle(cx: float, cz: float, r: float, segs: int = 16) -> list[Vec2]:
    return [(cx + r * math.cos(math.tau * i / segs), cz + r * math.sin(math.tau * i / segs)) for i in range(segs)]


def _ring_band(m: Mesh, f: Frame, cx: float, cz: float, r0: float, r1: float, d0: float, d1: float, mat: str, segs: int = 16) -> None:
    inner = _circle(cx, cz, r0, segs)
    outer = _circle(cx, cz, r1, segs)
    band(m, f, inner + inner[:1], outer + outer[:1], d0, d1, mat, (cx, cz))


def _crockets(m: Mesh, p0: Vec3, p1: Vec3, n: int, r: float, mat: str) -> None:
    """Leaf knobs strung along an arris (tiny four-sided spikes)."""
    for k in range(1, n + 1):
        t = k / (n + 1)
        x, y, z = (p0[i] + (p1[i] - p0[i]) * t for i in range(3))
        frustum(m, x, y, z - r * 0.6, z + r * 1.4, r, 0.0, 4, mat, top=False)


def _fine_pinnacle(m: Mesh, x: float, y: float, z: float, r: float, h: float, mat: str, yaw: float = 0.0, crockets: bool = True) -> None:
    """Pinnacle with collar, crocketed spirelet and finial knob."""
    ph = yaw + math.pi / 4
    zc, zt = z + h * 0.34, z + h
    frustum(m, x, y, z, zc, r, r, 4, mat, phase=ph, top=False)
    frustum(m, x, y, zc, zc + h * 0.04, r * 1.25, r * 1.25, 4, mat, phase=ph, bottom=True)
    frustum(m, x, y, zc + h * 0.04, zt, r * 1.1, 0.0, 4, mat, phase=ph)
    if crockets and h > 2.0:
        for k in range(4):
            t = ph + k * math.pi / 2
            base = (x + math.cos(t) * r * 1.1, y + math.sin(t) * r * 1.1, zc + h * 0.04)
            _crockets(m, base, (x, y, zt), 3, max(0.07, r * 0.24), mat)
    frustum(m, x, y, zt - h * 0.05, zt + h * 0.07, r * 0.28, 0.0, 4, mat, phase=ph)


def _statue(m: Mesh, f: Frame, ca: float, d: float, z: float, h: float, mat: str = "stone_white", canopy: bool = True) -> None:
    """Saint on a corbel under a spired canopy, standing proud of a wall at depth ``d``."""
    x, y, _ = f.p(ca, d, 0.0)
    r = h * 0.12
    ph = _yaw(f)
    rbox(m, f, ca - r * 1.5, ca + r * 1.5, d - r * 1.5, d + r * 1.5, z, z + h * 0.08, mat)
    frustum(m, x, y, z + h * 0.08, z + h * 0.8, r * 1.25, r * 0.85, 6, mat, phase=ph, top=False)
    frustum(m, x, y, z + h * 0.8, z + h, r * 0.6, r * 0.45, 6, mat, phase=ph)
    if canopy:
        zc = z + h + 0.12
        rbox(m, f, ca - r * 1.8, ca + r * 1.8, d - r * 1.8, d + r * 1.8, zc, zc + h * 0.07, mat)
        frustum(m, x, y, zc + h * 0.07, zc + h * 0.5, r * 2.1, 0.0, 4, mat, phase=ph + math.pi / 4)


def _balustrade(m: Mesh, f: Frame, a0: float, a1: float, z: float, d0: float, d1: float, mat: str = "stone_white", h: float = 1.0, pitch: float = 0.6) -> None:
    """Openwork parapet: plinth rail, coping and a run of colonnettes."""
    L = a1 - a0
    if L < 0.4:
        return
    rbox(m, f, a0, a1, d0, d1, z, z + 0.16, mat, skip=("bottom",))
    rbox(m, f, a0, a1, d0 - 0.03, d1 + 0.03, z + h - 0.14, z + h, mat)
    dm = (d0 + d1) * 0.5
    n = max(1, int(L / pitch))
    for k in range(n + 1):
        a = a0 + L * k / n
        rbox(m, f, a - 0.065, a + 0.065, dm - 0.065, dm + 0.065, z + 0.16, z + h - 0.14, mat, skip=("top", "bottom"))


def _wimperg(m: Mesh, f: Frame, ca: float, hw: float, z0: float, z_apex: float, d0: float, d1: float, trim: str, crockets: bool = True) -> None:
    """Openwork gablet: crocketed coping rakes, a blind oculus and a finial."""
    t = max(0.16, hw * 0.08)
    inner = [(ca - hw, z0), (ca, z_apex), (ca + hw, z0)]
    outer = [(ca - hw - t * 0.3, z0 + t), (ca, z_apex + t * 1.2), (ca + hw + t * 0.3, z0 + t)]
    band(m, f, inner, outer, d0, d1, trim, (ca, z0))
    rr = min(hw * 0.26, (z_apex - z0) * 0.15)
    if rr > 0.3:
        _ring_band(m, f, ca, z0 + (z_apex - z0) * 0.58, rr, rr + t * 0.6, d0, d1 - 0.03, trim, 12)
    dm = (d0 + d1) * 0.5
    if crockets:
        n = max(2, int(math.hypot(hw, z_apex - z0) / 0.9))
        for s in (-1.0, 1.0):
            _crockets(m, f.p(ca + s * (hw + t * 0.15), dm, z0 + t), f.p(ca, dm, z_apex + t * 1.2), n, max(0.09, t * 0.55), trim)
    x, y, _ = f.p(ca, dm, 0.0)
    _fine_pinnacle(m, x, y, z_apex + t * 0.9, max(0.14, t * 0.8), max(1.0, hw * 0.6), trim, _yaw(f), crockets=False)


def _lights(m: Mesh, f: Frame, ca: float, zb: float, w: float, zs: float, rise: float, d0: float, d1: float, trim: str, rose: bool = False) -> None:
    """Tracery inside a pointed opening: mullions, paired sub-arches, light heads and an
    oculus (or a spoked rose) in the head."""
    hw = w * 0.5
    nl = 2 * max(1, min(3, round(w / 3.0)))
    lw = w / nl
    bar = max(0.08, min(0.18, w * 0.025))
    for i in range(1, nl):
        a = ca - hw + i * lw
        rbox(m, f, a - bar * 0.5, a + bar * 0.5, d0, d1, zb, zs, trim, skip=("bottom",))
    for g in (-1.0, 1.0):
        c = ca + g * w * 0.25
        inner = arch_points(c, zs, w * 0.25 - bar * 0.5, "pointed", 6)
        band(m, f, inner, [(x, z + bar * 1.3) for x, z in inner], d0, d1, trim, (c, zs))
        if nl > 2:
            for i in range(nl // 2):
                lc = c - w * 0.25 + (i + 0.5) * lw
                li = arch_points(lc, zs, lw * 0.5 - bar * 0.5, "pointed", 4)
                band(m, f, li, [(x, z + bar) for x, z in li], d0, d1, trim, (lc, zs))
            gr = w * 0.25 * 1.6
            orr = min(w * 0.25 * 0.36, gr * 0.22)
            if orr > 0.25:
                _ring_band(m, f, c, zs + gr * 0.62, orr, orr + bar, d0, d1, trim, 12)
    cz = zs + rise * 0.6
    rr = min(hw * 0.42, rise * 0.3)
    if rose and rr > 1.0:
        _rose(m, f, ca, cz, rr, d0 + 0.01, trim)
    elif rr > 0.25:
        _ring_band(m, f, ca, cz, rr, rr + bar, d0, d1, trim, 14)


def _rose(m: Mesh, f: Frame, cx: float, cz: float, r: float, d: float, trim: str, glass: str = "glass_dark", spokes: int = 12) -> None:
    """Spoked rose: glazed disc, moulded rim, stained hub, radial bars and petal foils."""
    pane(m, f, _circle(cx, cz, r, 24), d, glass)
    _ring_band(m, f, cx, cz, r, r + max(0.2, r * 0.09), d, d + 0.32, trim, 24)
    hub = r * 0.24
    pane(m, f, _circle(cx, cz, hub, 12), d + 0.02, "glass_amber")
    _ring_band(m, f, cx, cz, hub, hub + 0.14, d, d + 0.26, trim, 12)
    t = max(0.06, r * 0.03)
    pr = r * math.sin(math.pi / spokes) * 0.5
    for k in range(spokes):
        a = math.tau * k / spokes
        c, s = math.cos(a), math.sin(a)
        px, pz = -s * t, c * t
        r0 = hub + 0.12
        quad = [(cx + c * r0 - px, cz + s * r0 - pz), (cx + c * r - px, cz + s * r - pz), (cx + c * r + px, cz + s * r + pz), (cx + c * r0 + px, cz + s * r0 + pz)]
        profile_slab(m, f, quad, d, d + 0.22, trim)
        a2 = a + math.pi / spokes
        if pr > 0.15:
            _ring_band(m, f, cx + math.cos(a2) * r * 0.72, cz + math.sin(a2) * r * 0.72, pr, pr + t, d, d + 0.18, trim, 8)


def _tracery_bay(
    m: Mesh,
    f: Frame,
    a0: float,
    a1: float,
    z0: float,
    z1: float,
    n: int,
    wall: str,
    trim: str,
    glass: str = "glass_dark",
    depth: float = 0.6,
    gablet: bool = True,
) -> None:
    """Wall panel [a0,a1]x[z0,z1] at d=0 pierced by ``n`` deep traceried lancets under gablets."""
    cw = (a1 - a0) / n
    for k in range(n):
        b0, b1 = a0 + k * cw, a0 + (k + 1) * cw
        ca = (b0 + b1) * 0.5
        w = cw * 0.56
        hw = w * 0.5
        rise = hw * 1.6
        zb = z0 + max(0.6, (z1 - z0) * 0.07)
        zs = z1 - max(0.5, (z1 - z0) * 0.06) - rise
        if w < 0.6 or zs < zb + 0.6:
            cell(m, f, b0, b1, z0, z1, None, 0.0, 0.0, wall)
            continue
        hole = opening(ca, zb, w, zs, "pointed", 8, rise)
        cell(m, f, b0, b1, z0, z1, hole, 0.0, -depth, wall, wall)
        pane(m, f, hole, -depth, glass)
        archivolt(m, f, hole, max(0.14, w * 0.07), 0.0, 0.14, trim)
        _lights(m, f, ca, zb, w, zs, rise, -depth, -depth + 0.16, trim)
        rbox(m, f, ca - hw - 0.15, ca + hw + 0.15, 0.0, 0.22, zb - 0.18, zb, trim)
        if gablet:
            _wimperg(m, f, ca, hw + 0.3, zs + rise * 0.3, zs + rise + max(1.0, w * 0.7), 0.0, 0.16, trim, crockets=w > 1.5)


def _great_window(m: Mesh, f: Frame, ca: float, z0: float, w: float, z1: float, wall: str, trim: str, orders: int = 3, rose: bool = True) -> float:
    """Big traceried window laid on a wall at d=0 with a splayed, stepped surround;
    returns the outer half-width of the surround."""
    hw = w * 0.5
    rise = hw * 1.5
    zs = z1 - rise
    hole = opening(ca, z0, w, zs, "pointed", 14, rise)
    pane(m, f, hole, 0.05, "glass_dark")
    step = max(0.3, w * 0.035)
    for k in range(orders):
        o = opening(ca, z0, w + 2.0 * k * step * 1.15, zs, "pointed", 14, rise + k * step * 1.15)
        archivolt(m, f, o, step, 0.0, 0.24 + k * 0.28, trim if k % 2 == 0 else wall)
    _lights(m, f, ca, z0, w, zs, rise, 0.05, 0.32, trim, rose=rose)
    if zs - z0 > 5.5:
        zt = z0 + (zs - z0) * 0.48
        rbox(m, f, ca - hw, ca + hw, 0.05, 0.3, zt - 0.14, zt + 0.14, trim)
        nl = 2 * max(1, min(3, round(w / 3.0)))
        lw = w / nl
        for i in range(nl):
            c = ca - hw + (i + 0.5) * lw
            li = arch_points(c, zt - 0.14 - lw * 0.5, lw * 0.5 - 0.08, "pointed", 4, rise=lw * 0.42)
            band(m, f, li, [(x, z + 0.1) for x, z in li], 0.05, 0.26, trim, (c, zt - lw * 0.5))
    hw_out = hw + orders * step * 1.15
    rbox(m, f, ca - hw_out, ca + hw_out, 0.0, 0.45, z0 - 0.35, z0, trim)
    return hw_out


def _deep_portal(
    m: Mesh,
    f: Frame,
    ca: float,
    w: float,
    z_spring: float,
    wall: str,
    trim: str,
    orders: int = 4,
    step: float = 0.45,
    statues: bool = True,
    steps: bool = True,
) -> float:
    """Splayed Gothic portal on a wall at d=0: stepped archivolt orders (alternating lit
    limestone and sooty hollows), jamb saints, trumeau Madonna, tympanum, crocketed
    wimperg and flanking pinnacled piers. Returns the top of the wimperg."""
    hw = w * 0.5
    rise = hw * 1.6
    zl = z_spring - 0.15
    pane(m, f, opening(ca, 0.0, w, zl, "rect"), 0.04, "door")
    pane(m, f, opening(ca, zl, w, zl + 0.01, "pointed", 10, rise), 0.06, wall)
    rbox(m, f, ca - hw, ca + hw, 0.0, 0.32, zl - 0.45, zl, trim)
    for k in (-1.0, 0.0, 1.0):
        _statue(m, f, ca + k * hw * 0.45, 0.3, zl + 0.15, min(1.6, rise * 0.4) * (1.15 if k == 0.0 else 0.9), trim, canopy=False)
    if w > 3.4:
        rbox(m, f, ca - 0.28, ca + 0.28, 0.0, 0.5, 0.0, zl - 0.45, trim, skip=("bottom",))
        _statue(m, f, ca, 0.78, 1.5, min(2.2, zl * 0.42), trim)
    d_top = 0.0
    for k in range(orders):
        wk = w + 2.0 * k * step
        o = opening(ca, 0.0, wk, z_spring, "pointed", 10, rise + k * step * 1.2)
        d_top = 0.3 + k * 0.42
        archivolt(m, f, o, step * 0.9, 0.0, d_top, trim if k % 2 == 0 else wall)
        if statues and k % 2 == 0:
            for s in (-1.0, 1.0):
                _statue(m, f, ca + s * (wk * 0.5 + step * 0.45), d_top + 0.24, 1.3, min(2.3, z_spring * 0.36), trim)
    hw_out = hw + orders * step
    pier = 0.85
    ztop = z_spring + rise + orders * step * 1.2 + step
    yaw = _yaw(f)
    for s in (-1.0, 1.0):
        lo, hi = sorted((ca + s * hw_out, ca + s * (hw_out + pier)))
        rbox(m, f, lo, hi, 0.0, d_top + 0.25, 0.0, ztop, wall, skip=("bottom",))
        rbox(m, f, lo - 0.08, hi + 0.08, 0.0, d_top + 0.33, ztop, ztop + 0.25, trim)
        x, y, _ = f.p(ca + s * (hw_out + pier * 0.5), (d_top + 0.25) * 0.5, 0.0)
        _fine_pinnacle(m, x, y, ztop + 0.25, pier * 0.42, 3.2 + w * 0.3, trim, yaw)
    rbox(m, f, ca - hw_out - pier, ca + hw_out + pier, 0.0, d_top + 0.25, 0.0, 1.0, "bluestone", skip=("bottom",))
    z_ap = ztop + hw_out * 0.9
    _wimperg(m, f, ca, hw_out + 0.2, z_spring + rise * 0.55, z_ap, d_top - 0.1, d_top + 0.12, trim)
    for i, ext in enumerate((1.3, 0.75) if steps else ()):
        rbox(m, f, ca - hw_out - pier - ext * 0.6, ca + hw_out + pier + ext * 0.6, 0.0, d_top + 0.25 + ext, 0.16 * i, 0.16 * (i + 1), "bluestone", skip=("bottom",))
    return z_ap


def _face_frames(ft: Frame, h: float) -> list[tuple[Frame, tuple[float, float]]]:
    """Outward frames on the four faces of a square of half-side ``h`` (a in [-h, h])."""
    return [(_sub_frame(ft, na * h, nd * h, -nd, na, na, nd), (na, nd)) for na, nd in ((-1.0, 0.0), (0.0, 1.0), (1.0, 0.0), (0.0, -1.0))]


def _oct_stage(m: Mesh, ft: Frame, r: float, z0: float, z1: float, wall: str, trim: str, depth: float = 0.7) -> None:
    """Openwork octagonal belfry stage: every face a deep traceried lancet under a gablet."""
    pts = _oct_pts(ft, 0.0, 0.0, r)
    cx, cy, _ = ft.p(0.0, 0.0, 0.0)
    for i in range(8):
        p0, p1 = pts[i], pts[(i + 1) % 8]
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        _tracery_bay(m, fe, 0.0, math.hypot(p1[0] - p0[0], p1[1] - p0[1]), z0, z1, 1, wall, trim, depth=depth)


def _oct_balustrade(m: Mesh, ft: Frame, r: float, z: float, trim: str) -> None:
    pts = _oct_pts(ft, 0.0, 0.0, r)
    cx, cy, _ = ft.p(0.0, 0.0, 0.0)
    for i in range(8):
        p0, p1 = pts[i], pts[(i + 1) % 8]
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        _balustrade(m, fe, 0.0, math.hypot(p1[0] - p0[0], p1[1] - p0[1]), z, -0.4, -0.08, trim, h=0.9, pitch=0.55)


def _cross_d(cl: list[Vec2], a: float) -> list[float]:
    """Sorted d where the line a = const crosses a closed (a, d) outline."""
    out = []
    n = len(cl)
    for i in range(n):
        (a0, d0), (a1, d1) = cl[i], cl[(i + 1) % n]
        if (a0 <= a < a1) or (a1 <= a < a0):
            out.append(d0 + (d1 - d0) * (a - a0) / (a1 - a0))
    return sorted(out)


def _clusters(vals: list[float], gap: float) -> list[tuple[float, float]]:
    """(lo, hi) runs of sorted values split where consecutive values differ by > gap."""
    out: list[tuple[float, float]] = []
    for v in sorted(vals):
        if out and v - out[-1][1] <= gap:
            out[-1] = (out[-1][0], v)
        else:
            out.append((v, v))
    return out


def _nave_frame(outline: list[Vec2], anchor) -> Frame:
    """Frame with ``u`` along the dominant (rectilinear) edge direction of the plan's long
    axis, pointing away from the west front; ``n`` is 90 degrees left of ``u``.

    The west end is the end nearest ``anchor`` (the square in front of the facade), or
    the western end when there is no anchor or it falls inside the plan."""
    sx = sy = 0.0
    for e in ring_edges(outline):
        t = 4.0 * math.atan2(e.p1[1] - e.p0[1], e.p1[0] - e.p0[0])
        sx += e.length * math.cos(t)
        sy += e.length * math.sin(t)
    th = 0.25 * math.atan2(sy, sx)
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    best = None
    for t in (th, th + math.pi / 2):
        ux, uy = math.cos(t), math.sin(t)
        proj = [(p[0] - cx) * ux + (p[1] - cy) * uy for p in outline]
        ext = max(proj) - min(proj)
        if best is None or ext > best[0]:
            best = (ext, ux, uy, min(proj), max(proj))
    _, ux, uy, lo, hi = best
    if anchor is not None and not point_in_ring(anchor[0], anchor[1], outline):
        pa = (anchor[0] - cx) * ux + (anchor[1] - cy) * uy
        if pa > 0.5 * (lo + hi):
            ux, uy = -ux, -uy
    elif ux < 0.0:
        ux, uy = -ux, -uy
    return Frame(cx, cy, ux, uy, -uy, ux)


def _notch_ring(ring: list[Vec2], f: Frame, a0: float, a1: float, dend: float, side: float, rec: float):
    """Push the plan's front run at d≈dend (a0<=a<=a1, facing ``side``) back by ``rec``
    so a portal laid on the recessed face stays inside the legal outline.
    Returns (ring, (a_lo, a_hi) of the notch or None)."""
    loc = [f.local(*p) for p in ring]
    n = len(ring)

    def on_front(i: int) -> bool:
        (pa, pd), (qa, qd) = loc[i], loc[(i + 1) % n]
        return a0 <= pa <= a1 and a0 <= qa <= a1 and abs(pd - dend) < 0.6 and abs(qd - dend) < 0.6 and abs(qa - pa) > 0.3

    mark = [on_front(i) for i in range(n)]
    if not any(mark) or all(mark):
        return ring, None
    start = next(i for i in range(n) if not mark[i])
    out: list[Vec2] = []
    span: list[float] = []
    for k in range(n):
        i = (start + k) % n
        prev, cur = mark[(i - 1) % n], mark[i]
        a, d = loc[i]
        moved = f.p(a, d - side * rec, 0.0)[:2]
        if cur and not prev:
            out += [ring[i], moved]
        elif cur and prev:
            out.append(moved)
        elif prev:
            out += [moved, ring[i]]
        else:
            out.append(ring[i])
        if cur or prev:
            span.append(a)
    return out, (min(span), max(span))


def build_nationale_bank(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """Neoclassical National Bank block on Leopoldplaats — 2018 north gate."""
    m = Mesh()
    f, outline, W, D, front = _span(ring, lm)
    H = float(lm.get("height_m") or 18.0)
    wall = "stone_white"
    extrude_ring(m, outline, holes, 0.0, H, "stone_grey", "zinc", skip=_skip_facing(front.outward))
    # Plinth
    rbox(m, f, 0.0, W, -0.05, 0.22, 0.0, 4.0, "bluestone")
    # Facade skin
    rbox(m, f, 0.0, W, 0.0, 0.18, 4.0, H - 0.4, wall)
    cols = max(5, int(W / 3.2))
    for r in range(3):
        for c in range(cols):
            a0 = 0.7 + c * (W - 1.4) / cols
            a1 = a0 + (W - 1.4) / cols * 0.55
            z0 = 4.8 + r * 3.6
            z1 = z0 + 2.4
            if z1 < H - 1.5:
                _win(m, f, a0, a1, z0, z1, wall)
    # Cornice + pediment
    rbox(m, f, -0.2, W + 0.2, -0.15, 0.35, H - 0.55, H, wall)
    mid = W * 0.5
    ped_w = min(12.0, W * 0.35)
    rbox(m, f, mid - ped_w / 2, mid + ped_w / 2, -0.1, 0.4, H - 0.2, H + 2.6, wall)
    # The block is skewed and courtyarded: a W×D gable would hang over the side streets.
    # Slate only over the front range; the zinc cap follows the real plan behind it.
    gable_roof(m, f, 0.0, W, -min(D, 10.0), 0.2, H, H + 1.4, "slate", ridge="a", gable_mat=wall)
    return m


def build_olv_cathedral(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """Onze-Lieve-Vrouwekathedraal — Brabantine Gothic west front on Handschoenmarkt with
    ONE openwork north tower (123 m: square stages, clock, two octagonal lanterns, ribbed
    lace spire) and the unfinished south tower (flat top + pepper-pot rooflet); deep
    splayed portals with jamb saints, great traceried west window, crocketed gables,
    buttressed nave with double flyers, transept fronts and the baroque crossing lantern.
    Groenplaats sees the south flank + south transept."""
    m = Mesh()
    pts = [(float(p[0]), float(p[1])) for p in ring]
    # Tight simplification: a coarser one cuts corners up to ~0.4 m out into the alleys.
    outline = simplify_ring(pts, 0.2, 3.0) if len(pts) > 8 else pts
    if len(outline) < 3:
        outline = pts
    H = float(lm.get("height_m") or 30.0)
    rh = max(float(lm.get("roof_height_m") or H * 0.4), 6.0)
    # Lit bone limestone + sooty recesses (Handschoenmarkt reference).
    wall, soot, trim = "stone_white", "stone_grey", "stone_white"

    # Cathedral frame fc: a runs from the west front eastward, d is +north, d=0 on the
    # portal axis. Built from the footprint itself (the anchor only says which end is west).
    anchor = lm.get("anchor_xy")
    f0 = _nave_frame(outline, tuple(anchor) if anchor else None)
    loc = [f0.local(*p) for p in outline]
    amin = min(a for a, _ in loc)
    xs = _cross_d(loc, amin + 6.0) or [d for _, d in loc]
    dn, ds = max(xs), min(xs)
    # West-front buttress lobes: the plan's west-most tips. Four of them bracket the two
    # towers; the pair midpoints give the portal axis and the tower centres.
    lobes = [0.5 * (lo + hi) for lo, hi in _clusters([d for a, d in loc if a - amin <= 1.0], 2.5) if hi - lo < 4.0]
    if len(lobes) >= 4:
        dc = 0.25 * (lobes[0] + lobes[-1] + lobes[1] + lobes[-2])
        tcn, tcs = 0.5 * (lobes[-1] + lobes[-2]) - dc, 0.5 * (lobes[0] + lobes[1]) - dc
        s_t = 0.25 * ((lobes[-1] - lobes[-2]) + (lobes[1] - lobes[0])) + 0.85
        a_f = amin + 1.8  # tower buttresses (1.8 m) end on the surveyed buttress tips
    else:
        dc = 0.5 * (dn + ds)
        hf0 = 0.5 * (dn - ds)
        tcn, tcs = 0.42 * hf0, -0.42 * hf0
        s_t = 0.2 * hf0 + 0.85
        a_f = amin
    fc = _sub_frame(f0, a_f, dc, 1.0, 0.0, 0.0, 1.0)
    cl = [fc.local(*p) for p in outline]
    L = max(a for a, _ in cl)
    half = max(abs(d) for _, d in cl)
    hf = max(8.0, 0.5 * (dn - ds))
    s_t = max(4.0, min(7.5, s_t))
    ts = 2.0 * s_t  # tower side
    # Keep each tower's flank buttresses (1.8 m + coping) inside the plan.
    samples = [2.5 + (ts - 2.5) * k / 5.0 for k in range(6)]
    lim_n = min((max(c) for c in (_cross_d(cl, a) for a in samples) if c), default=hf)
    lim_s = max((min(c) for c in (_cross_d(cl, a) for a in samples) if c), default=-hf)
    tcn = min(tcn, lim_n + 0.25 - s_t - 1.9)
    tcs = max(tcs, lim_s - 0.25 + s_t + 1.9)
    tn0, ts1 = tcn - s_t, tcs + s_t  # inner tower faces = west-front central bay
    nw = max(5.0, min(9.0, 0.5 * (tn0 - ts1) + 0.8))  # half-width of the clerestory nave
    ha = H * 0.55  # aisle / chapel wall top
    hn = H * 0.97  # clerestory wall top
    T = H * 4.1  # north tower to the cross
    yaw = _yaw(fc)

    # Transept: the a-range where the footprint reaches furthest north/south.
    # Judged per side: where the chapels run almost as far out as the transept (the south
    # flank here), that side's far points smear along the nave, so use the compact side.
    tr_a: list[float] = []
    for sgn in (1.0, -1.0):
        far = max((sgn * d for _, d in cl), default=0.0)
        cand = sorted(a for a, d in cl if sgn * d >= max(far * 0.9, far - 3.0) and a > ts)
        if len(cand) >= 2 and cand[-1] - cand[0] > 4.0 and (not tr_a or cand[-1] - cand[0] < tr_a[-1] - tr_a[0]):
            tr_a = cand
    if tr_a and tr_a[-1] - tr_a[0] > 4.0:
        tc = 0.5 * (tr_a[0] + tr_a[-1])
        thw = max(0.5 * (tr_a[-1] - tr_a[0]) - 0.5, nw)
    else:
        tc, thw = L * 0.55, nw
    # Stair turrets: the far-reaching points form two clusters either side of the portal.
    t_off = thw * 0.8
    p_ca, p_half = 0.0, thw * 0.6
    gaps = [(tr_a[i + 1] - tr_a[i], i) for i in range(len(tr_a) - 1)]
    if gaps and max(gaps)[0] > 2.0:
        i = max(gaps)[1]
        c0 = sum(tr_a[: i + 1]) / (i + 1)
        c1 = sum(tr_a[i + 1 :]) / (len(tr_a) - i - 1)
        tc, t_off = 0.5 * (c0 + c1), 0.5 * (c1 - c0)
        thw = max(thw, t_off + 1.0)
        p_ca, p_half = 0.5 * (tr_a[i] + tr_a[i + 1]) - tc, 0.5 * (tr_a[i + 1] - tr_a[i]) - 0.9
    ta0, ta1 = tc - thw, tc + thw
    ext_n = max([d for a, d in cl if ta0 <= a <= ta1 and d > 0] or [nw + 8.0])
    ext_s = min([d for a, d in cl if ta0 <= a <= ta1 and d < 0] or [-nw - 8.0])
    xs = _cross_d(cl, tc)
    t_n = max(xs) if xs and max(xs) > nw + 2.0 else ext_n - 3.0
    t_s = min(xs) if xs and min(xs) < -nw - 2.0 else ext_s + 3.0

    # Aisles + chapels: the real footprint, lead-flat on top. The transept fronts are
    # notched back by the portal depth so the portals stay inside the legal outline; the
    # west faces behind the towers and the central bay are replaced by those walls.
    t_rec = 1.5
    plan = outline
    notches: dict[float, tuple[float, float]] = {}
    for side, dend in ((1.0, t_n), (-1.0, t_s)):
        plan, span = _notch_ring(plan, fc, ta0, ta1, dend, side, t_rec)
        if span:
            notches[side] = span
    t_n_w = t_n - t_rec if 1.0 in notches else t_n
    t_s_w = t_s + t_rec if -1.0 in notches else t_s
    d_wn, d_ws = tcn + s_t + 0.2, tcs - s_t - 0.2

    def west_covered(e: Edge) -> bool:
        a, d = fc.local(*e.mid)
        return a < 2.8 and d_ws <= d <= d_wn

    extrude_ring(m, plan, holes, 0.0, ha, wall, "zinc", skip=west_covered)

    # Choir apse centre (ambulatory + radiating chapels stay at aisle height).
    cend = max([a for a, d in cl if abs(d) < nw] or [L])
    ac = max(ta1 + 6.0, cend - min(14.0, L * 0.12) - nw)

    # Nave + choir clerestory and roof.
    rbox(m, fc, 0.4, ac, -nw, nw, ha - 0.5, hn, wall, skip=("bottom", "top", "-a", "+a"))
    gable_roof(m, fc, 0.4, ac, -nw, nw, hn, hn + rh, "slate", ridge="a", overhang=0.3)
    xr, yr, _ = fc.p(0.4, 0.0, 0.0)
    xe, ye, _ = fc.p(ac, 0.0, 0.0)
    _crockets(m, (xr, yr, hn + rh + 0.15), (xe, ye, hn + rh + 0.15), int((ac - 0.4) / 1.6), 0.16, "iron")
    # Polygonal apse with a half-cone roof.
    segs = 5
    ap = [(ac + nw * math.cos(t), nw * math.sin(t)) for t in (-math.pi / 2 + math.pi * i / segs for i in range(segs + 1))]
    apex = fc.p(ac, 0.0, hn + rh)
    for i in range(segs):
        (a0, d0), (a1, d1) = ap[i], ap[i + 1]
        p0, p1 = fc.p(a0, d0, 0.0), fc.p(a1, d1, 0.0)
        m.face([fc.p(a0, d0, ha - 0.5), fc.p(a1, d1, ha - 0.5), fc.p(a1, d1, hn), fc.p(a0, d0, hn)], wall, center=fc.p(ac, 0.0, hn))
        k0 = 1.0 + 0.3 / nw
        e0 = fc.p(ac + (a0 - ac) * k0, d0 * k0, hn)
        e1 = fc.p(ac + (a1 - ac) * k0, d1 * k0, hn)
        m.face([e0, e1, apex], "slate", center=fc.p(ac, 0.0, hn))
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        cx, cy, _ = fc.p(ac, 0.0, 0.0)
        fe = Frame.from_edge(p0[:2], p1[:2], (mid[0] - cx, mid[1] - cy))
        seg_l = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        _lancet(m, fe, seg_l * 0.5, ha + 3.0, min(2.6, seg_l * 0.55), hn - 1.0)
        _balustrade(m, fe, 0.0, seg_l, hn, 0.05, 0.4, trim, h=0.9)
        x, y, _ = fc.p(ac + (a0 - ac) * 1.04, d0 * 1.04, 0.0)
        _fine_pinnacle(m, x, y, hn, 0.3, 2.8, trim, yaw)

    # Nave + choir flanks: lean-to aisle roofs, clerestory lancets, parapet, double flyers.
    for s0, s1 in ((ts + 0.6, ta0), (ta1, ac)):
        nb = int((s1 - s0) / 6.5)
        if nb < 1:
            continue
        pitch = (s1 - s0) / nb
        for side in (1.0, -1.0):
            fs = _sub_frame(fc, 0.0, side * nw, 1.0, 0.0, 0.0, side)
            for k in range(nb):
                b0, b1 = s0 + k * pitch, s0 + (k + 1) * pitch
                outs = []
                for a in (b0 + 0.3, 0.5 * (b0 + b1), b1 - 0.3):
                    xs = [d * side for d in _cross_d(cl, a) if d * side > nw + 0.5]
                    if xs:
                        outs.append(min(xs))
                dout = (min(outs) - 0.35) if outs else 0.0
                if dout > nw + 1.5:
                    zt = ha + min(4.6, (dout - nw) * 0.42)
                    q = [fc.p(b0, side * nw, zt), fc.p(b1, side * nw, zt), fc.p(b1, side * dout, ha + 0.25), fc.p(b0, side * dout, ha + 0.25)]
                    m.face(q, "slate", normal=(0.0, 0.0, 1.0))
                    for a in (b0, b1):
                        m.face([fc.p(a, side * nw, ha + 0.25), fc.p(a, side * dout, ha + 0.25), fc.p(a, side * nw, zt)], wall, normal=fc.vec(a - 0.5 * (b0 + b1), 0.0, 0.0))
                _lancet(m, fs, 0.5 * (b0 + b1), ha + 5.4, min(3.2, pitch * 0.5), hn - 1.0)
                # Slate dormer a third of the way up the nave roof.
                dfr = nw * 0.62
                zb = hn + rh * (1.0 - dfr / nw)
                dep = 2.6 * nw / rh
                fd = _sub_frame(fc, 0.5 * (b0 + b1), side * dfr, 1.0, 0.0, 0.0, side)
                profile_slab(m, fd, [(-0.8, zb - 0.4), (0.8, zb - 0.4), (0.8, zb + 1.4), (0.0, zb + 2.2), (-0.8, zb + 1.4)], -dep, 0.0, wall)
                pane(m, fd, opening(0.0, zb + 0.15, 0.7, zb + 1.0, "pointed", 4), 0.03, "glass_dark")
                gable_roof(m, fd, -0.8, 0.8, -dep, 0.0, zb + 1.4, zb + 2.25, "slate", ridge="d", overhang=0.12)
            rbox(m, fs, s0 - 0.5, s1 + 0.5, 0.0, 0.6, hn - 0.45, hn, trim)
            _balustrade(m, fs, s0 - 0.5, s1 + 0.5, hn, 0.08, 0.5, trim, h=0.95)
            for k in range(nb + 1):
                a = s0 + k * pitch
                lo, hi = sorted((side * (nw + 2.6), side * (nw + 3.6)))
                rbox(m, fc, a - 0.5, a + 0.5, lo, hi, ha, hn - 1.5, wall, skip=("bottom",))
                rbox(m, fc, a - 0.58, a + 0.58, lo - 0.08, hi + 0.08, hn - 1.5, hn - 1.2, trim)
                x, y, _ = fc.p(a, side * (nw + 3.1), 0.0)
                _fine_pinnacle(m, x, y, hn - 1.2, 0.45, 5.2, trim, yaw)
                _strut(m, fc.p(a, side * (nw + 2.6), hn - 3.6), fc.p(a, side * (nw + 0.05), hn - 1.4), 0.3, wall)
                _strut(m, fc.p(a, side * (nw + 2.6), hn - 3.0), fc.p(a, side * (nw + 0.05), hn - 0.9), 0.1, trim)
                _strut(m, fc.p(a, side * (nw + 2.6), hn - 8.4), fc.p(a, side * (nw + 0.05), hn - 6.6), 0.26, wall)
                x, y, _ = fc.p(a, side * (nw + 0.3), 0.0)
                _fine_pinnacle(m, x, y, hn + 0.95, 0.24, 2.4, trim, yaw, crockets=False)

    # Aisle / chapel walls: plinth, pilaster buttresses with pinnacles, traceried windows,
    # parapet. The surveyed plan already carries the real buttress lobes and the flanks sit
    # on tight alleys and party walls, so nothing here stands more than 0.25 m proud.
    for e in ring_edges(outline):
        if e.length < 2.4:
            continue
        ma, md = fc.local(*e.mid)
        if (ma < ts + 0.5 and abs(md) < hf + 0.5) or ta0 - 0.5 <= ma <= ta1 + 0.5:
            continue
        fe = e.frame()
        rbox(m, fe, 0.0, e.length, 0.0, 0.2, 0.0, 1.0, "bluestone", skip=("bottom",))
        rbox(m, fe, 0.0, e.length, 0.0, 0.22, ha - 0.5, ha, trim)
        _balustrade(m, fe, 0.15, e.length - 0.15, ha, -0.42, -0.08, trim, h=0.9)
        nb = max(1, int(e.length / 6.0))
        pitch = e.length / nb
        for k in range(nb):
            _lancet(m, fe, (k + 0.5) * pitch, 3.2, min(3.0, pitch * 0.5), ha - 1.4)
        if e.length < 4.5:
            continue
        for k in range(nb + 1):
            b = min(max(k * pitch, 0.6), e.length - 0.6)
            rbox(m, fe, b - 0.45, b + 0.45, 0.0, 0.25, 0.0, ha * 0.65, wall, skip=("bottom",))
            rbox(m, fe, b - 0.52, b + 0.52, 0.0, 0.25, ha * 0.65, ha * 0.65 + 0.3, trim)
            rbox(m, fe, b - 0.38, b + 0.38, -0.3, 0.18, ha * 0.65 + 0.3, ha + 0.8, wall, skip=("bottom",))
            x, y, _ = fe.p(b, -0.12, 0.0)
            _fine_pinnacle(m, x, y, ha + 0.8, 0.24, 3.0, trim, _yaw(fe))

    # Transept fronts: deep portal, gallery, great rose-headed window, crocketed gable,
    # octagonal stair turrets (the south one faces Groenplaats).
    rbox(m, fc, ta0, ta1, t_s_w, t_n_w, 0.0, hn, wall, skip=("bottom", "top"))
    gable_roof(m, fc, ta0, ta1, t_s_w, t_n_w, hn, hn + rh, "slate", ridge="d", gable_mat=wall, overhang=0.3)
    for side, dend, dwall in ((1.0, t_n, t_n_w), (-1.0, t_s, t_s_w)):
        fe = _sub_frame(fc, tc, dwall, 1.0, 0.0, 0.0, side)
        # Stair turrets stand on the surveyed lobes either side of the front.
        turrets = []
        lobe_pts = [(a, d) for a, d in cl if ta0 - 4.0 <= a <= ta1 + 4.0 and side * (d - dend) > 0.8]
        for lo, hi in _clusters([a for a, _ in lobe_pts], 1.5):
            far = max(side * d for a, d in lobe_pts if lo <= a <= hi)
            hr = min(0.5 * (hi - lo), 0.5 * (far - side * dend))
            r = min(1.5, (hr - 0.05) / 1.12)
            if r >= 0.6:
                turrets.append((0.5 * (lo + hi), side * 0.5 * (far + side * dend), r))
        rbox(m, fe, -thw, thw, 0.0, 0.25, 0.0, 1.0, "bluestone", skip=("bottom",))
        if side in notches:
            n0, n1 = notches[side]
            pc, ph_ = 0.5 * (n0 + n1) - tc, 0.5 * (n1 - n0)
        else:
            pc, ph_ = p_ca, p_half
        _deep_portal(m, fe, pc, max(2.0, min(4.4, 2.0 * (ph_ + 0.4 - 0.85 - 2 * 0.32))), 5.2, soot, trim, orders=2, step=0.32, steps=side not in notches)
        zg = max(ha + 0.3, 12.4)
        rbox(m, fe, -thw, thw, 0.0, 0.8, zg - 0.4, zg, trim)
        _balustrade(m, fe, -thw, thw, zg, 0.08, 0.72, trim)
        gw = max(3.0, min(9.0, 2.0 * (t_off - 1.5) - 2.0))
        hw_out = _great_window(m, fe, 0.0, zg + 1.4, gw, hn + rh * 0.5, soot, trim, orders=3)
        for sa in (-1.0, 1.0):
            lo, hi = sorted((sa * (hw_out + 0.2), sa * thw))
            if hi - lo > 0.5:
                rbox(m, fe, lo, hi, 0.0, 0.45, hn - 0.6, hn, trim)
        gl = [(-thw - 0.2, hn), (0.0, hn + rh), (thw + 0.2, hn)]
        band(m, fe, gl, [(-thw - 0.5, hn + 0.45), (0.0, hn + rh + 0.55), (thw + 0.5, hn + 0.45)], 0.0, 0.45, trim, (0.0, hn))
        for sa in (-1.0, 1.0):
            _crockets(m, fe.p(sa * (thw + 0.3), 0.22, hn + 0.5), fe.p(0.0, 0.22, hn + rh + 0.6), int(math.hypot(thw, rh) / 1.1), 0.2, trim)
        for ta, td, r_t in turrets:
            x, y, _ = fc.p(ta, td, 0.0)
            ph = yaw + math.pi / 8
            frustum(m, x, y, 0.0, hn + 1.0, r_t, r_t * 0.92, 8, wall, phase=ph)
            for zr in (zg - 0.4, hn - 0.6):
                frustum(m, x, y, zr, zr + 0.35, r_t + 0.12, r_t + 0.12, 8, trim, phase=ph, bottom=True)
            frustum(m, x, y, hn + 1.0, hn + 1.3, r_t * 1.12, r_t * 1.12, 8, trim, phase=ph, bottom=True)
            _shaft(m, ngon(x, y, r_t * 0.85, 8, ph), hn + 1.3, hn + 4.6, wall, 1, depth=0.25)
            frustum(m, x, y, hn + 4.6, hn + 4.85, r_t, r_t, 8, trim, phase=ph, bottom=True)
            frustum(m, x, y, hn + 4.85, hn + 10.5, r_t * 0.95, 0.0, 8, trim, phase=ph)
            for k in range(0, 8, 2):
                t = ph + k * math.pi / 4
                _crockets(m, (x + r_t * 0.95 * math.cos(t), y + r_t * 0.95 * math.sin(t), hn + 4.85), (x, y, hn + 10.5), 4, 0.13, trim)
        x, y, _ = fe.p(0.0, 0.2, 0.0)
        _fine_pinnacle(m, x, y, hn + rh + 0.3, 0.38, 3.6, trim, yaw)

    # Baroque crossing lantern.
    xc, yc, _ = fc.p(tc, 0.0, 0.0)
    zl = hn + rh - 1.5
    ph = yaw + math.pi / 8
    _shaft(m, ngon(xc, yc, 3.4, 8, ph), zl, zl + 6.5, wall, 1)
    frustum(m, xc, yc, zl + 6.5, zl + 7.0, 3.8, 3.8, 8, trim, phase=ph)
    frustum(m, xc, yc, zl + 7.0, zl + 8.4, 3.3, 3.9, 8, "slate", phase=ph, top=False)
    frustum(m, xc, yc, zl + 8.4, zl + 10.4, 3.9, 1.5, 8, "slate", phase=ph, top=False)
    frustum(m, xc, yc, zl + 10.4, zl + 11.2, 1.5, 0.8, 8, "slate", phase=ph)
    _shaft(m, ngon(xc, yc, 0.8, 8, ph), zl + 11.2, zl + 13.0, wall, 0)
    frustum(m, xc, yc, zl + 13.0, zl + 17.0, 0.95, 0.0, 8, "slate", phase=ph)
    frustum(m, xc, yc, zl + 16.8, zl + 18.2, 0.06, 0.06, 4, "gold", phase=ph)

    # West front between the towers: plinth, deep central portal, gallery, great window
    # with rose head flanked by tiers of saints, balustraded gable with crockets.
    fw = _sub_frame(fc, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0)  # a_w = d (north +), facing west
    wm = 0.5 * (tn0 + ts1)
    zF = hn + 6.0
    bay = tn0 - ts1
    fo_s, fo_n = tcs - s_t, tcn + s_t  # outer tower faces
    rbox(m, fw, ts1, tn0, -0.8, 0.0, 0.0, zF, wall, skip=("bottom", "top"))
    rbox(m, fw, fo_s, fo_n, 0.0, 0.3, 0.0, 1.1, "bluestone", skip=("bottom",))
    profile_slab(m, fw, [(ts1, zF), (tn0, zF), (wm, zF + rh)], -0.8, 0.0, wall, back=True)
    p_ord, p_step = 4, 0.45
    p_w = max(3.4, min(5.6, 2.0 * (bay * 0.5 - 0.2 - 0.85 - p_ord * p_step)))
    _deep_portal(m, fw, wm, p_w, 7.2, soot, trim, orders=p_ord, step=p_step)
    zg = 15.4
    p_out = 0.5 * p_w + p_ord * p_step + 0.85
    for sa in (-1.0, 1.0):
        lo, hi = sorted((wm + sa * (p_out + 0.4), wm + sa * (bay * 0.5 - 0.3)))
        if hi - lo < 2.0:
            continue
        nb = max(1, int((hi - lo) / 2.4))
        pw = (hi - lo) / nb
        for k in range(nb):
            c = lo + (k + 0.5) * pw
            hole = opening(c, 1.6, pw * 0.62, 10.5, "pointed", 6)
            pane(m, fw, hole, 0.04, wall)
            archivolt(m, fw, hole, 0.14, 0.0, 0.2, trim)
            rbox(m, fw, c - 0.06, c + 0.06, 0.0, 0.14, 1.6, 10.5 + pw * 0.2, trim)
            _wimperg(m, fw, c, pw * 0.36, 10.5 + pw * 0.3, 13.6, 0.0, 0.16, trim, crockets=False)
    rbox(m, fw, fo_s, fo_n, 0.0, 0.85, zg - 0.45, zg, trim)
    _balustrade(m, fw, fo_s, fo_n, zg, 0.08, 0.78, trim)
    gw = min(10.0, bay * 0.6)
    hw_out = _great_window(m, fw, wm, zg + 1.6, gw, zF - 1.2, soot, trim, orders=3)
    for sa in (-1.0, 1.0):
        lo, hi = sorted((wm + sa * (hw_out + 0.3), wm + sa * bay * 0.5))
        if hi - lo < 1.6:
            continue
        c = 0.5 * (lo + hi)
        nw_ = min(1.8, (hi - lo) * 0.55)
        for z0 in (zg + 1.4, zg + 7.6):
            hole = opening(c, z0, nw_, z0 + 3.6, "pointed", 6)
            archivolt(m, fw, hole, 0.16, 0.0, 0.2, trim)
            _statue(m, fw, c, 0.36, z0 + 0.3, 2.6, trim)
        _lancet(m, fw, c, zg + 14.0, nw_, zF - 1.5)
        rbox(m, fw, lo - 0.1, lo + 0.45, 0.0, 0.7, zg, zF + 0.2, wall, skip=("bottom",))
    rbox(m, fw, ts1, tn0, 0.0, 0.95, zF - 0.5, zF, trim)
    _balustrade(m, fw, ts1, tn0, zF, 0.08, 0.85, trim)
    _rose(m, fw, wm, zF + rh * 0.4, min(2.4, rh * 0.2), 0.05, trim)
    for sa in (-1.0, 1.0):
        for j, off in enumerate((3.6, 6.6)):
            c = wm + sa * off
            ztop = zF + rh * (1.0 - off / (bay * 0.5)) - 1.6
            if ztop > zF + 3.0:
                hole = opening(c, zF + 1.4, 1.5, ztop - 1.2, "pointed", 6)
                pane(m, fw, hole, 0.04, wall)
                archivolt(m, fw, hole, 0.14, 0.0, 0.2, trim)
    gl = [(ts1 - 0.2, zF), (wm, zF + rh), (tn0 + 0.2, zF)]
    band(m, fw, gl, [(ts1 - 0.5, zF + 0.5), (wm, zF + rh + 0.6), (tn0 + 0.5, zF + 0.5)], -0.9, 0.35, trim, (wm, zF))
    for sa, a_end in ((-1.0, ts1), (1.0, tn0)):
        _crockets(m, fw.p(a_end, -0.25, zF + 0.55), fw.p(wm, -0.25, zF + rh + 0.65), int(math.hypot(bay * 0.5, rh) / 1.0), 0.22, trim)
    x, y, _ = fw.p(wm, -0.25, 0.0)
    _fine_pinnacle(m, x, y, zF + rh + 0.3, 0.42, 4.2, trim, yaw)
    frustum(m, x, y, zF + rh + 4.4, zF + rh + 5.6, 0.05, 0.05, 4, "iron", top=True)

    # Towers: north = full Brabantine Gothic lace spire, south = unfinished stump.
    def tower(dcen: float, full: bool) -> None:
        s = ts * 0.5
        ft = _sub_frame(fc, s, dcen, 1.0, 0.0, 0.0, 1.0)
        tx, ty, _ = ft.p(0.0, 0.0, 0.0)
        zA = 0.36 * T
        out_side = (0.0, 1.0 if dcen > 0 else -1.0)
        zw = 16.0

        # Stage A: walls, a traceried window pair on the outer flank, the west face dressed.
        for fe, dirn in _face_frames(ft, s):
            if dirn == out_side:
                cell(m, fe, -s, s, 0.0, zw, None, 0.0, 0.0, wall)
                _tracery_bay(m, fe, -s, s, zw, zA, 2, wall, trim, depth=0.55)
            else:
                cell(m, fe, -s, s, 0.0, zA, None, 0.0, 0.0, wall)
            if dirn == (-1.0, 0.0):
                _deep_portal(m, fe, 0.0, 3.2, 5.2, soot, trim, orders=3, step=0.42)
                _great_window(m, fe, 0.0, zw + 1.5, min(4.8, s * 0.66), zA - 6.0, soot, trim, orders=2, rose=False)
                for k in (-1.0, 0.0, 1.0):
                    c = k * s * 0.42
                    hole = opening(c, zA - 5.2, 1.3, zA - 2.0, "pointed", 6)
                    archivolt(m, fe, hole, 0.14, 0.0, 0.18, trim)
                    _statue(m, fe, c, 0.32, zA - 5.0, 2.2, trim)
            if dirn == out_side:
                rbox(m, fe, -s, s, 0.0, 0.85, zw - 0.6, zw - 0.15, trim)
                _balustrade(m, fe, -s, s, zw - 0.15, 0.08, 0.78, trim)
        rbox(m, ft, -s - 0.2, s + 0.2, -s - 0.2, s + 0.2, zA - 1.2, zA - 0.9, trim)

        # Stepped corner buttresses with crocketed pinnacles.
        for sa in (-1.0, 1.0):
            for sd in (-1.0, 1.0):
                for z0, z1, p in ((0.0, zA * 0.45, 1.8), (zA * 0.45, zA * 0.8, 1.25), (zA * 0.8, zA + 1.5, 0.7)):
                    a_lo, a_hi = sorted((sa * (s - 1.6), sa * (s - 0.1)))
                    d_lo, d_hi = sorted((sd * s, sd * (s + p)))
                    rbox(m, ft, a_lo, a_hi, d_lo, d_hi, z0, z1, wall, skip=("bottom",))
                    rbox(m, ft, a_lo - 0.06, a_hi + 0.06, d_lo - 0.06, d_hi + 0.06, z1 - 0.3, z1, trim)
                    a_lo, a_hi = sorted((sa * s, sa * (s + p)))
                    d_lo, d_hi = sorted((sd * (s - 1.6), sd * (s - 0.1)))
                    rbox(m, ft, a_lo, a_hi, d_lo, d_hi, z0, z1, wall, skip=("bottom",))
                    rbox(m, ft, a_lo - 0.06, a_hi + 0.06, d_lo - 0.06, d_hi + 0.06, z1 - 0.3, z1, trim)
                x, y, _ = ft.p(sa * (s + 0.25), sd * (s + 0.25), 0.0)
                _fine_pinnacle(m, x, y, zA + 1.5, 0.8, 8.0, trim, yaw)
        rbox(m, ft, -s - 0.4, s + 0.4, -s - 0.4, s + 0.4, zA, zA + 0.7, trim)
        for fe, _dirn in _face_frames(ft, s + 0.4):
            _balustrade(m, fe, -s - 0.4, s + 0.4, zA + 0.7, -0.42, -0.08, trim)

        # Stage B: belfry, two deep louvred lancets under gablets on every face.
        sB = s * 0.86
        zB = (0.56 if full else 0.5) * T
        z_open = zB - (7.6 if full else 1.4)
        for fe, _dirn in _face_frames(ft, sB):
            _tracery_bay(m, fe, -sB, sB, zA + 0.7, z_open, 2, wall, trim, depth=0.8)
            cell(m, fe, -sB, sB, z_open, zB, None, 0.0, 0.0, wall)
            if full:
                zc = zB - 3.8
                rc = min(2.5, sB * 0.4)
                pane(m, fe, _circle(0.0, zc, rc, 20), 0.06, "iron")
                _ring_band(m, fe, 0.0, zc, rc, rc + 0.3, 0.0, 0.22, trim, 20)
                profile_slab(m, fe, [(-0.07, zc), (0.07, zc), (0.07, zc + rc * 0.8), (-0.07, zc + rc * 0.8)], 0.06, 0.14, "gold")
                profile_slab(m, fe, [(0.0, zc - 0.06), (rc * 0.55, zc - 0.06), (rc * 0.55, zc + 0.06), (0.0, zc + 0.06)], 0.06, 0.14, "gold")
        for sa in (-1.0, 1.0):
            for sd in (-1.0, 1.0):
                for ka, kd in ((sa * (sB - 0.5), sd * (sB + 0.3)), (sa * (sB + 0.3), sd * (sB - 0.5))):
                    rbox(m, ft, ka - 0.45, ka + 0.45, kd - 0.3, kd + 0.3, zA + 0.7, zB, wall, skip=("bottom",))
        rbox(m, ft, -sB - 0.3, sB + 0.3, -sB - 0.3, sB + 0.3, zB, zB + 0.6, trim, skip=("top",))
        e = sB + 0.3
        m.face([ft.p(-e, -e, zB + 0.6), ft.p(e, -e, zB + 0.6), ft.p(e, e, zB + 0.6), ft.p(-e, e, zB + 0.6)], "zinc", normal=(0.0, 0.0, 1.0))

        if not full:
            # Unfinished south tower: flat lead deck, balustrade, corner pinnacles, pepper-pot.
            for fe, _dirn in _face_frames(ft, sB + 0.3):
                _balustrade(m, fe, -sB - 0.3, sB + 0.3, zB + 0.6, -0.42, -0.08, trim, h=1.1)
            for sa in (-1.0, 1.0):
                for sd in (-1.0, 1.0):
                    x, y, _ = ft.p(sa * (sB - 0.1), sd * (sB - 0.1), 0.0)
                    _fine_pinnacle(m, x, y, zB + 0.6, 0.5, 5.0, trim, yaw)
            rp = sB * 0.4
            _shaft(m, ngon(tx, ty, rp, 8, yaw + math.pi / 8), zB + 0.6, zB + 2.6, wall, 0)
            frustum(m, tx, ty, zB + 2.6, zB + 2.9, rp + 0.25, rp + 0.25, 8, trim, phase=yaw + math.pi / 8, bottom=True)
            frustum(m, tx, ty, zB + 2.9, zB + 9.0, rp + 0.15, 0.0, 8, "slate", phase=yaw + math.pi / 8)
            frustum(m, tx, ty, zB + 8.6, zB + 10.0, 0.06, 0.06, 4, "iron")
            return

        # North tower: corner turrets + flyers buttress the first octagonal lantern.
        rC = sB * 1.02
        zC = 0.72 * T
        for sa in (-1.0, 1.0):
            for sd in (-1.0, 1.0):
                x, y, _ = ft.p(sa * (sB - 0.1), sd * (sB - 0.1), 0.0)
                _shaft(m, ngon(x, y, 0.75, 8, yaw + math.pi / 8), zB + 0.6, zB + 7.0, wall, 0)
                frustum(m, x, y, zB + 7.0, zB + 7.25, 0.9, 0.9, 8, trim, phase=yaw + math.pi / 8, bottom=True)
                _fine_pinnacle(m, x, y, zB + 7.25, 0.6, 7.5, trim, yaw)
                _strut(m, ft.p(sa * (sB - 0.4), sd * (sB - 0.4), zB + 4.5), ft.p(sa * rC * 0.62, sd * rC * 0.62, zB + 8.5), 0.24, wall)
                _strut(m, ft.p(sa * (sB - 0.4), sd * (sB - 0.4), zB + 9.0), ft.p(sa * rC * 0.62, sd * rC * 0.62, zB + 12.5), 0.18, trim)
        for fe, _dirn in _face_frames(ft, sB + 0.3):
            _balustrade(m, fe, -sB - 0.3, sB + 0.3, zB + 0.6, -0.42, -0.08, trim)
        _oct_stage(m, ft, rC, zB + 0.6, zC, wall, trim, depth=0.8)
        frustum(m, tx, ty, zC, zC + 0.6, rC + 0.45, rC + 0.45, 8, trim, phase=yaw + math.pi / 8, bottom=True)
        rD = rC * 0.72
        zD = 0.82 * T
        _oct_balustrade(m, ft, rC + 0.4, zC + 0.6, trim)
        for k in range(8):
            t = math.pi / 8 + k * math.pi / 4
            x, y, _ = ft.p((rC - 0.1) * math.cos(t), (rC - 0.1) * math.sin(t), 0.0)
            _fine_pinnacle(m, x, y, zC + 0.6, 0.38, 5.4, trim, yaw + t)
            _strut(m, ft.p((rC - 0.3) * math.cos(t), (rC - 0.3) * math.sin(t), zC + 2.6), ft.p(rD * 0.85 * math.cos(t), rD * 0.85 * math.sin(t), zC + 5.6), 0.14, trim)
        _oct_stage(m, ft, rD, zC + 0.6, zD, wall, trim, depth=0.6)
        frustum(m, tx, ty, zD, zD + 0.5, rD + 0.35, rD + 0.35, 8, trim, phase=yaw + math.pi / 8, bottom=True)
        _oct_balustrade(m, ft, rD + 0.3, zD + 0.5, trim)

        # Lace spire: eight crocketed stone ribs round a recessed core, banded, gilt cross.
        zS = 0.975 * T
        r_sp = rD * 0.92
        z_sp = zD + 0.5
        sp_pts = _oct_pts(ft, 0.0, 0.0, r_sp)
        frustum(m, tx, ty, z_sp, zS - 1.0, r_sp * 0.62, 0.0, 8, wall, phase=yaw + math.pi / 8)
        for i in range(8):
            px, py = sp_pts[i]
            qx, qy = sp_pts[(i + 1) % 8]
            mid = ((px + qx) * 0.5, (py + qy) * 0.5)
            fe = Frame.from_edge((px, py), (qx, qy), (mid[0] - tx, mid[1] - ty))
            fl = math.hypot(qx - px, qy - py)
            _wimperg(m, fe, fl * 0.5, fl * 0.42, z_sp, z_sp + 3.2, -0.1, 0.1, trim, crockets=False)
            _strut(m, (px, py, z_sp), (tx, ty, zS), 0.2, trim)
            _crockets(m, (px, py, z_sp + 3.5), (tx, ty, zS), int((zS - z_sp) / 2.2), 0.2, trim)
        for frac in (0.22, 0.46, 0.7):
            zr = z_sp + (zS - z_sp) * frac
            rr = r_sp * (1.0 - frac)
            frustum(m, tx, ty, zr, zr + 0.5, rr + 0.25, rr + 0.12, 8, trim, phase=yaw + math.pi / 8, bottom=True)
        frustum(m, tx, ty, zS - 1.4, zS - 0.5, 0.35, 0.55, 8, trim, phase=yaw + math.pi / 8, bottom=True)
        frustum(m, tx, ty, zS - 0.5, zS + 0.1, 0.55, 0.12, 8, trim, phase=yaw + math.pi / 8)
        rbox(m, ft, -0.13, 0.13, -0.13, 0.13, zS - 0.1, T, "gold")
        rbox(m, ft, -0.9, 0.9, -0.11, 0.11, T - 1.9, T - 1.5, "gold")

    tower(tcn, True)
    tower(tcs, False)
    return m


_FLAGS = (
    ("frame_dark", "cloth_yellow", "cloth_red"),  # Belgium
    ("cloth_blue",),  # Europe
    ("cloth_red", "cloth_white", "cloth_red"),  # Antwerp
    ("cloth_yellow", "frame_dark", "cloth_yellow"),  # Flanders
    ("cloth_green", "cloth_white"),
)


def _flag(m: Mesh, f: Frame, a: float, z: float, k: int, length: float = 3.2) -> None:
    """Flag on a pole raked out of the façade; vertical stripes along the pole."""
    root = f.p(a, 0.15, z)
    tip = f.p(a, 0.15 + length * 0.62, z + length * 0.78)
    _strut(m, root, tip, 0.035, "iron", 4)
    stripes = _FLAGS[k % len(_FLAGS)]
    fw, fh = length * 0.55, length * 0.42
    for i, mat in enumerate(stripes):
        t0, t1 = i / len(stripes), (i + 1) / len(stripes)
        # The cloth hangs from the upper part of the pole, slightly offset along the wall.
        p0 = [root[j] + (tip[j] - root[j]) * (1.0 - t0 * fw / length) for j in range(3)]
        p1 = [root[j] + (tip[j] - root[j]) * (1.0 - t1 * fw / length) for j in range(3)]
        quad = [tuple(p0), tuple(p1), (p1[0], p1[1], p1[2] - fh), (p0[0], p0[1], p0[2] - fh)]
        nrm = f.vec(1.0, 0.0, 0.0)
        m.face(quad, mat, normal=nrm)
        m.face(list(reversed(quad)), mat, normal=(-nrm[0], -nrm[1], -nrm[2]))


def build_stadhuis(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """Antwerp City Hall (Cornelis Floris, 1561-65) on Grote Markt.

    Rusticated rose-stone arcade, two storeys of cross windows between pilasters, an open
    columned loggia under the cornice, a tall slate roof with two rows of dormers and
    chimneys, and the central frontispiece: three diminishing tiers with coloured marble
    columns, bronze obelisks, the coat of arms, the Virgin in her niche and a gilt eagle.
    A row of flags hangs from the first-floor balconies."""
    m = Mesh()
    f, outline, W, D, front = _span(ring, lm)
    p = lm.get("params") or {}
    H = float(p.get("cornice_m") or 22.8)
    rh = float(p.get("roof_m") or 9.0)
    sc = H / 22.8
    lv = (0.0, 6.0 * sc, 12.2 * sc, 17.8 * sc, H)
    wall, rust, trim, marble = "stone_white", "stone_rose", "stone_white", "stone_rose"
    zr = H + 0.8
    extrude_ring(m, outline, holes, 0.0, zr, "stone_grey", None, skip=_skip_facing(front.outward))

    fronts = [e for e in ring_edges(outline) if e.length > 2.0 and e.outward[0] * front.outward[0] + e.outward[1] * front.outward[1] > 0.72]
    if not fronts:
        fronts = [front]
    fwd = max(fronts, key=lambda e: f.local(*e.mid)[1])
    segments: list[tuple[Edge, float, float, bool]] = []
    if len(fronts) >= 2 and fwd.length < 0.6 * W:
        for e in fronts:
            segments.append((e, 0.0, e.length, e is fwd))
    else:
        for e in fronts:
            if e is fwd:
                Lf = e.length
                segments += [(e, 0.0, Lf * 0.38, False), (e, Lf * 0.38, Lf * 0.62, True), (e, Lf * 0.62, Lf, False)]
            else:
                segments.append((e, 0.0, e.length, False))

    flag_k = 0
    for e, a0, a1, centre in segments:
        fe = e.frame()
        n = max(1, round((a1 - a0) / (5.2 if centre else 3.2)))
        bw = (a1 - a0) / n
        for k in range(n):
            b0, b1 = a0 + k * bw, a0 + (k + 1) * bw
            c = 0.5 * (b0 + b1)
            door = centre and k == n // 2
            # Rusticated arcade.
            hole = opening(c, 0.05, bw * 0.56, lv[1] * 0.74, "round", 8)
            cell(m, fe, b0, b1, 0.0, lv[1], hole, 0.0, -0.8, rust, rust)
            pane(m, fe, hole, -0.8, "door" if door or k % 3 == 1 else "glass_dark")
            for r in range(1, 6):
                zj = lv[1] * r / 6.0
                if zj < lv[1] * 0.74 - bw * 0.28:
                    for lo, hi in ((b0, c - bw * 0.28), (c + bw * 0.28, b1)):
                        rbox(m, fe, lo + 0.02, hi - 0.02, 0.0, 0.06, zj - 0.05, zj + 0.05, "bluestone")
            # First and second floor cross windows.
            for z0, z1 in ((lv[1], lv[2]), (lv[2], lv[3])):
                zt0, zt1 = z0 + 0.9, z1 - 0.7
                hole = opening(c, zt0, bw * 0.5, zt1, "rect", 4)
                cell(m, fe, b0, b1, z0, z1, hole, 0.0, -0.3, wall, trim)
                pane(m, fe, hole, -0.3, "glass")
                rbox(m, fe, c - 0.07, c + 0.07, -0.3, -0.16, zt0, zt1, trim)
                zt = zt0 + (zt1 - zt0) * 0.62
                rbox(m, fe, c - bw * 0.25, c + bw * 0.25, -0.3, -0.16, zt - 0.07, zt + 0.07, trim)
                rbox(m, fe, c - bw * 0.31, c + bw * 0.31, 0.0, 0.25, zt0 - 0.2, zt0, trim)
                rbox(m, fe, c - bw * 0.33, c + bw * 0.33, 0.0, 0.3, zt1, zt1 + 0.22, trim)
            # Open loggia: two columns per bay in a deep gallery.
            z0, z1 = lv[3], lv[4]
            rbox(m, fe, b0, b1, -2.2, -2.0, z0, z1, "glass_dark", skip=("bottom", "top"))
            rbox(m, fe, b0, b1, -2.2, 0.0, z1 - 0.7, z1, wall, skip=("top",))
            for t in (0.18, 0.82) if bw > 2.4 else (0.5,):
                x, y, _ = fe.p(b0 + bw * t, -0.35, 0.0)
                frustum(m, x, y, z0 + 1.0, z1 - 0.7, 0.2, 0.17, 6, trim, top=False, bottom=False)
            for lo, hi in ((b0, b0 + 0.25), (b1 - 0.25, b1)):
                rbox(m, fe, lo, hi, -2.0, 0.0, z0, z1 - 0.7, wall, skip=("bottom", "top"))
            _balustrade(m, fe, b0 + 0.25, b1 - 0.25, z0, -0.4, -0.1, trim, h=1.0, pitch=0.35)
            rbox(m, fe, b0, b1, -2.2, 0.0, z0 - 0.1, z0 + 0.02, wall, skip=("bottom",))
            # Flags from the first-floor balustrade, every other bay of the flanks.
            if not centre and k % 2 == 1:
                _flag(m, fe, c, lv[1] + 0.9, flag_k, 4.6)
                flag_k += 1
        pil = marble if centre else trim
        for k in range(n + 1):
            b = a0 + k * bw
            rbox(m, fe, b - 0.24, b + 0.24, 0.0, 0.22, lv[1], lv[3], pil)
        for i, z in enumerate((lv[1], lv[2], lv[3])):
            rbox(m, fe, a0, a1, 0.0, 0.34, z - 0.18, z + 0.18, "bluestone" if i == 0 else trim)
        _balustrade(m, fe, a0, a1, lv[1] + 0.18, 0.15, 0.55, trim, h=0.85, pitch=0.3)
        rbox(m, fe, a0 - 0.05, a1 + 0.05, 0.0, 0.8, H, zr, trim)

    # Tall hipped slate roof with two rows of dormers and chimneys.
    d_wing = min(f.local(*e.mid)[1] for e in fronts)
    hip_roof(m, f, 0.3, W - 0.3, -D + 0.3, d_wing - 0.3, zr, zr + rh, "slate", overhang=0.3)
    slope = rh / max(1.0, (D - 0.6) * 0.5)
    for e, a0, a1, centre in segments:
        if centre:
            continue
        fe = e.frame()
        n = max(1, round((a1 - a0) / 3.2))
        bw = (a1 - a0) / n
        for row, (dd, dw, dh) in enumerate(((1.4, 1.5, 2.1), (1.4 + 3.4 / max(slope, 0.6), 1.0, 1.4))):
            zd = zr + (dd - 0.3) * slope - 0.3
            for k in range(row, n, 2 if row == 0 else 3):
                c = a0 + (k + 0.5) * bw
                if c < a0 + 1.2 or c > a1 - 1.2:
                    continue
                rbox(m, fe, c - dw / 2, c + dw / 2, -dd - 1.6, -dd, zd, zd + dh, wall, skip=("bottom",))
                pane(m, fe, opening(c, zd + 0.25, dw * 0.6, zd + dh - 0.3 - dw * 0.3, "round", 4), -dd + 0.02, "glass_dark")
                gable_roof(m, fe, c - dw / 2, c + dw / 2, -dd - 1.6, -dd, zd + dh, zd + dh + dw * 0.55, "slate", ridge="d", gable_mat=wall, overhang=0.1)
        for t in (0.2, 0.8):
            x, y, _ = fe.p(a0 + (a1 - a0) * t, -D * 0.42, 0.0)
            wbox(m, x, y, zr + rh * 0.45, 1.3, 0.8, rh * 0.75, _yaw(fe), "stone_white")
            wbox(m, x, y, zr + rh * 1.2, 1.5, 1.0, 0.3, _yaw(fe), "stone_white")

    # Central frontispiece: three diminishing tiers over the cornice.
    e, a0, a1, _ = next(s for s in segments if s[3])
    fe = e.frame()
    wc, cc = a1 - a0, 0.5 * (a0 + a1)
    yaw = _yaw(fe)
    # Balcony across the frontispiece at the first floor.
    rbox(m, fe, a0 + 0.3, a1 - 0.3, 0.0, 1.1, lv[1] - 0.1, lv[1] + 0.2, "bluestone")
    _balustrade(m, fe, a0 + 0.3, a1 - 0.3, lv[1] + 0.2, 0.75, 1.05, trim, h=0.9, pitch=0.3)
    tiers = ((wc * 0.9, 6.6 * sc), (wc * 0.62, 5.6 * sc), (wc * 0.36, 4.6 * sc))
    z = zr
    for i, (tw, th) in enumerate(tiers):
        t0, t1 = cc - tw / 2, cc + tw / 2
        rbox(m, fe, t0, t1, -7.0, 0.0, z, z + th, wall, skip=("+d", "bottom"))
        nb = 3 if i < 2 else 1
        bwt = tw / nb
        for k in range(nb):
            b0, b1 = t0 + k * bwt, t0 + (k + 1) * bwt
            c = 0.5 * (b0 + b1)
            if i == 2 or (i == 1 and k == 1):
                # Niche with the Virgin (top) / Justice and Prudence (middle).
                hole = opening(c, z + 0.4, bwt * 0.46, z + th - 0.7 - bwt * 0.23, "round", 8)
                cell(m, fe, b0, b1, z, z + th, hole, 0.0, -0.9, wall, trim)
                pane(m, fe, hole, -0.9, "render_shade")
                _statue(m, fe, c, -0.45, z + 0.45, min(2.4, th - 1.4), trim, canopy=False)
                continue
            if i == 0 and k == 1:
                # Coat of arms under a pediment.
                cell(m, fe, b0, b1, z, z + th, None, 0.0, 0.0, wall)
                rbox(m, fe, c - 1.1, c + 1.1, 0.0, 0.25, z + 1.2, z + th - 1.6, "gold")
                rbox(m, fe, c - 0.75, c + 0.75, 0.25, 0.32, z + 1.6, z + th - 2.0, "cloth_red")
                profile_slab(m, fe, [(c - 1.4, z + th - 1.6), (c + 1.4, z + th - 1.6), (c, z + th - 0.8)], 0.0, 0.35, trim, back=True)
                continue
            kind = "rect" if i == 0 else "round"
            ht = z + th - 0.9 - (bwt * 0.25 if kind == "round" else 0.0)
            hole = opening(c, z + 0.8, bwt * 0.5, ht, kind, 6)
            cell(m, fe, b0, b1, z, z + th, hole, 0.0, -0.25, wall, trim)
            pane(m, fe, hole, -0.25, "glass")
        for k in range(nb + 1):
            b = t0 + k * bwt
            x, y, _ = fe.p(b, 0.35, 0.0)
            frustum(m, x, y, z + 0.3, z + th - 0.5, 0.24, 0.2, 6, marble, top=False)
            rbox(m, fe, b - 0.32, b + 0.32, 0.05, 0.62, z, z + 0.3, trim)
        rbox(m, fe, t0 - 0.2, t1 + 0.2, 0.0, 0.7, z + th - 0.5, z + th, trim)
        prev_w = tiers[i - 1][0] if i > 0 else wc + 0.1
        for sgn in (-1.0, 1.0):
            x_in = cc + sgn * tw / 2
            x_out = cc + sgn * max(tw / 2 + 0.4, min(prev_w / 2 - 0.3, tw / 2 + th * 0.7))
            tri = [(x_out, z), (x_in, z), (x_in, z + th * 0.75)]
            if sgn > 0:
                tri = [(x_in, z), (x_out, z), (x_in, z + th * 0.75)]
            profile_slab(m, fe, tri, -0.6, 0.0, trim, back=True)
            # Verdigris obelisk on each shoulder (the tall green needles in the photos).
            x, y, _ = fe.p(cc + sgn * (prev_w / 2 - 0.45), -0.3, 0.0)
            oh = (5.5 if i == 0 else 3.8 if i == 1 else 2.8) * sc
            frustum(m, x, y, z, z + 0.7, 0.55, 0.55, 4, trim, phase=yaw + math.pi / 4)
            frustum(m, x, y, z + 0.7, z + 0.7 + oh, 0.36, 0.06, 4, "bronze", phase=yaw + math.pi / 4)
            zo = z + 0.7 + oh
            frustum(m, x, y, zo, zo + 0.35, 0.12, 0.0, 6, "gold")
        z += th
    tw = tiers[-1][0]
    profile_slab(m, fe, [(cc - tw / 2 - 0.3, z), (cc + tw / 2 + 0.3, z), (cc, z + tw * 0.35)], -0.6, 0.2, trim, back=True)
    top = z + tw * 0.35
    # Gilt eagle on a plinth.
    x, y, _ = fe.p(cc, -0.2, 0.0)
    frustum(m, x, y, top - 0.1, top + 0.6, 0.36, 0.3, 6, trim)
    frustum(m, x, y, top + 0.6, top + 1.5, 0.28, 0.14, 6, "gold")
    for sgn in (-1.0, 1.0):
        profile_slab(m, fe, [(cc, top + 0.9), (cc + sgn * 1.1, top + 1.9), (cc + sgn * 0.9, top + 1.2)], -0.26, -0.14, "gold", back=True)
    frustum(m, x, y, top + 1.5, top + 1.85, 0.13, 0.0, 6, "gold")
    return m


def build_het_steen(ring: list[Vec2], holes: list[list[Vec2]], lm: dict) -> Mesh:
    """Het Steen on the Scheldt: crenellated curtain walls on the real footprint, a
    distinct gatehouse with round portal and flanking turrets facing Steenplein (the
    south end), round corner towers with conical roofs, and the roofed keep behind."""
    m = Mesh()
    f, outline, W, D, front = _span(ring, lm)
    H = float(lm.get("height_m") or 16.0)
    rh = float(lm.get("roof_height_m") or 4.0)
    wall, trim = "stone_grey", "bluestone"
    body_h = H * 0.62
    loc = [f.local(*p) for p in outline]

    # Curtain walls: wall walk, corbel band, merlons, arrow slits.
    extrude_ring(m, outline, holes, 0.0, body_h, wall, "stone_grey")
    for e in ring_edges(outline):
        if e.length < 0.6:
            continue
        fe = e.frame()
        _crenel(m, fe, e.length, body_h, wall)
        rbox(m, fe, 0.0, e.length, 0.0, 0.35, body_h - 0.9, body_h - 0.45, trim)
        if e.length > 5.0:
            n = int(e.length / 4.5)
            for k in range(n):
                c = (k + 0.5) * e.length / n
                pane(m, fe, opening(c, body_h * 0.42, 0.32, body_h * 0.42 + 1.3, "round", 4), 0.03, "glass_dark")

    # Gatehouse at the end facing south (Steenplein / Lange Wapper).
    amin, amax = min(p[0] for p in loc), max(p[0] for p in loc)
    at_min = f.uy >= 0.0
    a_end = amin if at_min else amax
    into = 1.0 if at_min else -1.0
    end = [(a, d) for a, d in loc if abs(a - a_end) < 6.0]
    ds = [d for _, d in end]
    dmid = 0.5 * (min(ds) + max(ds))
    gw = max(4.5, min(8.0, 0.5 * (max(ds) - min(ds))))
    a_face = sum(a for a, _ in end) / len(end)
    fg = _sub_frame(f, a_face, dmid, 0.0, 1.0, -into, 0.0)
    gd = min(12.0, 0.3 * W)
    gh = H * 0.85
    rbox(m, fg, -gw, gw, -gd, 0.0, 0.0, gh, wall, skip=("+d", "bottom"))
    zsplit = 6.2
    hole = opening(0.0, 0.05, 3.6, 3.7, "round", 10)
    cell(m, fg, -gw, gw, 0.0, zsplit, hole, 0.0, -1.4, wall, trim)
    pane(m, fg, hole, -1.4, "door")
    archivolt(m, fg, hole, 0.45, 0.0, 0.25, trim)
    for sa in (-1.0, 1.0):
        a0, a1 = sorted((0.0, sa * gw))
        hole = opening(0.5 * (a0 + a1), zsplit + 1.6, 1.1, zsplit + 3.4, "rect", 4)
        cell(m, fg, a0, a1, zsplit, gh, hole, 0.0, -0.3, wall, trim)
        pane(m, fg, hole, -0.3, "glass_dark")
    rbox(m, fg, -0.75, 0.75, 0.0, 0.14, zsplit + 1.0, zsplit + 3.0, trim)
    # Machicolations: corbels under a proud parapet band, merlons on top.
    rbox(m, fg, -gw - 0.3, gw + 0.3, -gd, 0.6, gh - 1.0, gh, wall)
    n_c = max(3, int(2 * gw / 1.2))
    for k in range(n_c + 1):
        c = -gw + k * (2 * gw) / n_c
        rbox(m, fg, c - 0.2, c + 0.2, 0.0, 0.6, gh - 1.7, gh - 1.0, trim)
    _crenel(m, fg.shifted(-gw - 0.3, 0.6), 2 * gw + 0.6, gh, wall)
    for sa in (-1.0, 1.0):
        fs = _sub_frame(fg, sa * (gw + 0.3), 0.6, 0.0, -1.0, sa, 0.0)
        _crenel(m, fs, gd + 0.6, gh, wall)
    gable_roof(m, fg, -gw + 0.6, gw - 0.6, -gd + 0.6, -0.2, gh, gh + gw * 1.1, "slate", ridge="d", gable_mat=wall, overhang=0.1)
    x, y, _ = fg.p(0.0, -0.2, 0.0)
    frustum(m, x, y, gh + gw * 1.1 - 0.1, gh + gw * 1.1 + 1.2, 0.08, 0.0, 4, "iron")
    gate_t = []
    for sa in (-1.0, 1.0):
        x, y, _ = fg.p(sa * gw, -0.3, 0.0)
        _turret(m, x, y, 1.9, gh + 2.2, wall)
        gate_t.append(f.local(x, y))

    # Corner towers at the footprint extremes.
    picks = [
        max(loc, key=lambda p: p[0] + p[1]),
        max(loc, key=lambda p: p[0] - p[1]),
        min(loc, key=lambda p: p[0] + p[1]),
        min(loc, key=lambda p: p[0] - p[1]),
        min(loc, key=lambda p: p[1]),
    ]
    ca, cd = f.local(*centroid(outline))
    placed: list[Vec2] = list(gate_t)
    for a, d in picks:
        if any(math.hypot(a - q[0], d - q[1]) < 7.0 for q in placed):
            continue
        placed.append((a, d))
        dl = math.hypot(ca - a, cd - d) or 1.0
        x, y, _ = f.p(a + (ca - a) / dl * 1.2, d + (cd - d) / dl * 1.2, 0.0)
        _turret(m, x, y, 2.1, body_h + 3.5, wall)

    # Keep: tall block behind the walls with a steep hipped roof and a stair turret.
    kha, khd = min(11.0, 0.19 * W), min(9.5, 0.26 * D)
    ka0, ka1, kd0, kd1 = ca - kha, ca + kha, cd - khd, cd + khd
    kz = H * 0.95
    rbox(m, f, ka0, ka1, kd0, kd1, body_h, kz, wall, skip=("bottom", "top"))
    kp = _rect_pts(f, ka0, ka1, kd0, kd1)
    for i in range(4):
        p0, p1 = kp[i], kp[(i + 1) % 4]
        cx, cy = sum(p[0] for p in kp) / 4, sum(p[1] for p in kp) / 4
        mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5)
        fe = Frame.from_edge(p0, p1, (mid[0] - cx, mid[1] - cy))
        Lk = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        rbox(m, fe, -0.3, Lk + 0.3, 0.0, 0.4, kz - 0.8, kz, trim)
        for k in range(max(1, int(Lk / 3.5))):
            c = (k + 0.5) * Lk / max(1, int(Lk / 3.5))
            pane(m, fe, opening(c, kz - 3.6, 0.9, kz - 2.0, "round", 4), 0.03, "glass_dark")
            rbox(m, fe, c - 0.6, c + 0.6, 0.0, 0.2, kz - 3.8, kz - 3.6, trim)
    _crenel_poly(m, kp, kz, wall)
    hip_roof(m, f, ka0 + 0.7, ka1 - 0.7, kd0 + 0.7, kd1 - 0.7, kz, kz + rh + 3.0, "slate", overhang=0.0)
    x, y, _ = f.p(ka1 - 0.3, kd1 - 0.3, 0.0)
    _turret(m, x, y, 1.4, kz + 3.0, wall, cone=3.4)
    return m


BUILDERS = {
    "nationale_bank": build_nationale_bank,
    "olv_cathedral": build_olv_cathedral,
    "stadhuis": build_stadhuis,
    "het_steen": build_het_steen,
}

NODE_BUILDERS: dict = {}
