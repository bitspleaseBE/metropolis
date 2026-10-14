"""Generate district-local facade elevations (procedural, distinct hashes).

Each district keeps its own ``facades/elevations/facade_NN.jpg``. This module
paints Antwerp street-image elevations from a facade brief so 2000 never reuses
2018 pixels. Run::

    python -m cityview.district_facades 2000-antwerpen
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
import zlib
from pathlib import Path
from typing import Any

from cityview.districts import district_paths, ensure_district_dirs, load_district
from cityview import facade_kit as kit

# 2000 street-image brief (overrides / merges with profile.facade_brief).
BRIEF_2000 = {
    "styles": [
        "brick_sandstone_band",
        "stepped_gable",
        "neck_gable",
        "baroque_civic",
        "narrow_plot",
        "shopfront_meir",
        "warehouse_quay",
        "neo_flemish",
    ],
    "palette": {
        "brick": [(0.55, 0.28, 0.22), (0.62, 0.35, 0.28), (0.48, 0.25, 0.20), (0.70, 0.42, 0.32)],
        "sandstone": [(0.78, 0.70, 0.55), (0.72, 0.65, 0.52), (0.85, 0.78, 0.62)],
        "render": [(0.90, 0.86, 0.78), (0.95, 0.92, 0.88), (0.82, 0.78, 0.70)],
        "quay": [(0.42, 0.38, 0.35), (0.50, 0.45, 0.40)],
        "concrete": [(0.66, 0.64, 0.60), (0.74, 0.72, 0.68), (0.58, 0.57, 0.55), (0.80, 0.76, 0.66)],
        "curtain": [(0.30, 0.38, 0.44), (0.24, 0.30, 0.36), (0.40, 0.46, 0.50)],
        "cladding": [(0.52, 0.56, 0.60), (0.70, 0.66, 0.58), (0.36, 0.42, 0.48), (0.62, 0.30, 0.24)],
    },
}

# Mid-rise / tower looks: painted on the atlas's 5-storey slots (the storey strip in
# facade_bands.json repeats them up to the measured LOD2 storey count).
MODERN_STYLES = ("postwar_block", "social_block", "glass_tower", "industrial_shed")


def _rng(seed: str):
    import random

    h = int(hashlib.blake2b(seed.encode(), digest_size=8).hexdigest(), 16)
    return random.Random(h)


def _rgb(t: tuple[float, float, float]) -> tuple[int, int, int]:
    return (int(t[0] * 255), int(t[1] * 255), int(t[2] * 255))


def _paint_modern(draw, w: int, h: int, storeys: int, style: str, pal: dict, rng) -> None:
    """Post-war slab, social block, curtain-wall tower or port shed: flat grids, no gable."""
    def pick(key: str) -> tuple[int, int, int]:
        return _rgb(rng.choice(pal.get(key) or BRIEF_2000["palette"][key]))

    glass = (34 + rng.randint(0, 20), 44 + rng.randint(0, 24), 56 + rng.randint(0, 30))
    if style == "glass_tower":
        draw.rectangle([0, 0, w, h], fill=pick("curtain"))
        mull = pick("cladding")
        cols = 6 + rng.randint(0, 3)
        for c in range(cols + 1):
            x = int(c * (w - 1) / cols)
            draw.rectangle([x - 2, 0, x + 2, h], fill=mull)
        for f in range(storeys + 1):
            y = int(f * (h - 1) / storeys)
            draw.rectangle([0, y - 3, w, y + 3], fill=mull)
        # Reflections: a few lighter panes.
        for _ in range(cols * storeys // 3):
            c, f = rng.randint(0, cols - 1), rng.randint(0, storeys - 1)
            x0, x1 = int(c * w / cols) + 3, int((c + 1) * w / cols) - 3
            y0, y1 = int(f * h / storeys) + 4, int((f + 1) * h / storeys) - 4
            draw.rectangle([x0, y0, x1, y1], fill=tuple(min(255, v + 28) for v in glass))
        draw.rectangle([0, h - int(h * 0.16), w, h], fill=(48, 52, 56))
        draw.rectangle([int(w * 0.35), h - int(h * 0.14), int(w * 0.65), h - 4], fill=glass)
        return
    if style == "industrial_shed":
        wall = pick("cladding")
        draw.rectangle([0, 0, w, h], fill=wall)
        dark = tuple(max(0, v - 22) for v in wall)
        for x in range(0, w, 9):
            draw.line([(x, 0), (x, h)], fill=dark, width=2)
        # Roller door + high strip window.
        dw = int(w * 0.42)
        dx = int(w * (0.1 + rng.random() * 0.4))
        draw.rectangle([dx, h - int(h * 0.48), dx + dw, h], fill=(92, 96, 100))
        for y in range(h - int(h * 0.48), h, 7):
            draw.line([(dx, y), (dx + dw, y)], fill=(70, 74, 78), width=1)
        draw.rectangle([8, int(h * 0.12), w - 9, int(h * 0.2)], fill=glass)
        return
    wall = pick("concrete")
    draw.rectangle([0, 0, w, h], fill=wall)
    seam = tuple(max(0, v - 30) for v in wall)
    plinth_h = int(h * 0.15)
    draw.rectangle([0, h - plinth_h, w, h], fill=tuple(max(0, v - 45) for v in wall))
    cols = 3 if style == "postwar_block" else 4
    floor_h = (h - plinth_h) / storeys
    for f in range(storeys):
        y0 = int(f * floor_h)
        y1 = int((f + 1) * floor_h)
        draw.line([(0, y1), (w, y1)], fill=seam, width=3)  # panel joint
        if style == "postwar_block":
            # Ribbon window across the bay, spandrel below.
            draw.rectangle([10, y0 + int(floor_h * 0.22), w - 11, y0 + int(floor_h * 0.68)], fill=glass)
            for c in range(1, cols):
                x = int(c * w / cols)
                draw.line([(x, y0 + int(floor_h * 0.22)), (x, y0 + int(floor_h * 0.68))], fill=(210, 205, 195), width=3)
        else:
            # Social block: punched windows + recessed balcony with a parapet band.
            for c in range(cols):
                cx0 = int(c * w / cols) + 8
                cx1 = int((c + 1) * w / cols) - 8
                draw.rectangle([cx0, y0 + int(floor_h * 0.2), cx1, y0 + int(floor_h * 0.72)], fill=glass)
            draw.rectangle([0, y1 - int(floor_h * 0.3), w, y1 - 2], fill=pick("cladding"))
    # Entrance.
    ex = int(w * (0.3 + rng.random() * 0.3))
    draw.rectangle([ex, h - plinth_h + 6, ex + int(w * 0.18), h - 4], fill=glass)


def _paint_elevation(
    fid: str, storeys: int, style: str, brief: dict[str, Any], district_id: str = ""
) -> "Any":
    """Return a PIL Image for one elevation."""
    from PIL import Image, ImageDraw

    w, h = kit.CELL_INNER_W, kit.CELL_INNER_H
    img = Image.new("RGB", (w, h), (40, 40, 45))
    draw = ImageDraw.Draw(img)
    rng = _rng(f"{district_id}:{fid}:{style}" if district_id else f"{fid}:{style}")
    pal = brief.get("palette") or BRIEF_2000["palette"]

    if style in MODERN_STYLES:
        _paint_modern(draw, w, h, storeys, style, pal, rng)
        return _finish(img, rng, fid, style, district_id)

    shop_styles = {
        "shopfront_meir",
        "shopfront_newsstand",
        "shopfront_kebab",
        "shopfront_frituur",
        "shopfront_pizza",
    }
    if style == "warehouse_quay":
        wall = _rgb(rng.choice(pal["quay"]))
    elif style in {"baroque_civic", *shop_styles}:
        wall = _rgb(rng.choice(pal["render"])) if style in {"baroque_civic", "shopfront_meir", "shopfront_pizza"} else _rgb(
            rng.choice(pal.get("brick") or pal["render"])
        )
    elif style in {"stepped_gable", "neck_gable", "neo_flemish"}:
        wall = _rgb(rng.choice(pal["brick"]))
    else:
        wall = _rgb(rng.choice(pal["brick"]))
    band = _rgb(rng.choice(pal["sandstone"]))
    glass = (30 + rng.randint(0, 25), 40 + rng.randint(0, 30), 50 + rng.randint(0, 40))

    draw.rectangle([0, 0, w, h], fill=wall)

    # Ground-floor shop / plinth
    plinth_h = int(h * 0.18)
    if style in shop_styles:
        # Fascia colours by archetype (METRO PRESS white/red, frituur yellow, kebab dark, pizza cream).
        if style == "shopfront_newsstand":
            fascia = (248, 246, 242)
            frame = (210, 40, 40) if rng.random() < 0.55 else (30, 30, 32)
            glass = (45, 48, 52)
            plinth_h = int(h * 0.22)
        elif style == "shopfront_frituur":
            fascia = (250, 200, 30) if rng.random() < 0.6 else (210, 40, 35)
            frame = (200, 30, 28) if fascia[0] > 200 else (250, 210, 40)
            glass = (70, 68, 60)
            plinth_h = int(h * 0.2)
        elif style == "shopfront_kebab":
            fascia = (22, 22, 26)
            frame = (240, 180, 40) if rng.random() < 0.5 else (200, 50, 40)
            glass = (80, 70, 50)
            plinth_h = int(h * 0.17)
        elif style == "shopfront_pizza":
            fascia = (245, 240, 230) if rng.random() < 0.5 else (200, 40, 40)
            frame = (180, 40, 40) if fascia[0] > 200 else (245, 240, 230)
            glass = (55, 50, 42)
            plinth_h = int(h * 0.19)
        else:
            fascia = (240, 235, 220)
            frame = (60, 40, 30)
        # Plinth + frame only — named lettering lives on the walker lightbox fascia
        # (viewer/shops.js). A tall painted board here doubles up and reads as a folded plane.
        draw.rectangle([4, h - plinth_h, w - 5, h - 4], fill=fascia)
        board_h = int(plinth_h * 0.08)
        draw.rectangle([6, h - plinth_h, w - 7, h - plinth_h + board_h], fill=frame)
        # Wide shop glazing
        draw.rectangle([10, h - plinth_h + board_h + 4, w - 11, h - 14], fill=glass)
        # Door (right on press shops, left otherwise — matches METRO PRESS reference).
        dw = int(w * (0.16 if style == "shopfront_newsstand" else 0.14))
        dx = int(w * 0.72) if style == "shopfront_newsstand" else int(w * 0.1)
        draw.rectangle([dx, h - plinth_h + board_h + 2, dx + dw, h - 6], fill=(60, 40, 30))
        if style == "shopfront_newsstand":
            # Shelf bands behind the glass (magazines / drinks).
            for k in range(3):
                y = h - plinth_h + board_h + 10 + k * int((plinth_h - board_h - 24) / 3)
                draw.rectangle([14, y, w - 15, y + 3], fill=(220, 220, 218))
    else:
        draw.rectangle([0, h - 10, w, h], fill=band)
        # Door
        dw = int(w * (0.12 + rng.random() * 0.06))
        dx = int(w * (0.15 + rng.random() * 0.5))
        draw.rectangle([dx, h - plinth_h, dx + dw, h - 4], fill=(55, 35, 28))
        if style != "warehouse_quay":
            # Small ground window
            gw = int(w * 0.22)
            gx = dx + dw + 12 if dx + dw + 12 + gw < w - 8 else 12
            draw.rectangle([gx, h - plinth_h + 10, gx + gw, h - 18], fill=glass)

    # Sandstone string courses
    for i in range(1, storeys):
        y = h - int(h * (i / storeys)) - plinth_h // 4
        draw.rectangle([0, y, w, y + 3], fill=band)

    # Window grid
    cols = 2 if storeys <= 3 and style == "narrow_plot" else (3 if w > 200 else 2)
    margin_x = 14
    cell_w = (w - 2 * margin_x) / cols
    win_w = int(cell_w * 0.55)
    for floor in range(storeys):
        y1 = h - plinth_h - int((h - plinth_h - 20) * (floor + 0.15) / storeys)
        y0 = h - plinth_h - int((h - plinth_h - 20) * (floor + 0.85) / storeys)
        if y0 >= y1:
            continue
        for c in range(cols):
            cx = margin_x + cell_w * (c + 0.5)
            x0 = int(cx - win_w / 2)
            x1 = int(cx + win_w / 2)
            # Stone surround
            draw.rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], fill=band)
            draw.rectangle([x0, y0, x1, y1], fill=glass)
            # Mullion
            mx = (x0 + x1) // 2
            draw.line([(mx, y0), (mx, y1)], fill=(200, 190, 170), width=2)
            # Sill
            draw.rectangle([x0 - 2, y1, x1 + 2, y1 + 4], fill=band)

    # Gable silhouette (sky painted slate so atlas clean_sky is less needed)
    sky = (55, 60, 68)
    if style in {"stepped_gable", "neck_gable", "neo_flemish"}:
        top = int(h * 0.08)
        mid = w // 2
        if style == "stepped_gable":
            steps = 4
            for s in range(steps):
                y = top + int((h * 0.22) * s / steps)
                half = int((w / 2) * (1 - s / steps))
                draw.rectangle([0, 0, mid - half, y + 8], fill=sky)
                draw.rectangle([mid + half, 0, w, y + 8], fill=sky)
        else:
            # Neck / bell gable curve approximation
            for x in range(w):
                t = abs(x - mid) / (w / 2)
                y_cut = int(top + (h * 0.2) * (t**1.6))
                draw.line([(x, 0), (x, y_cut)], fill=sky)

    return _finish(img, rng, fid, style, district_id)


def _finish(img, rng, fid: str, style: str, district_id: str):
    """Weathering noise + per-district watermark bits (hashes never collide across districts)."""
    w, h = img.size
    pixels = img.load()
    for _ in range(800):
        x = rng.randint(0, w - 1)
        y = rng.randint(0, h - 1)
        r, g, b = pixels[x, y]
        d = rng.randint(-12, 8)
        pixels[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))

    # Embed unique watermark bits in LSB of a few pixels so hashes never collide
    # with another district even if style RNG somehow matched.
    salt = f"{district_id}:" if district_id else ""
    digest = hashlib.sha256(f"district-facade:{salt}{fid}:{style}".encode()).digest()
    for i, byte in enumerate(digest[:16]):
        x = (i * 17) % w
        y = (i * 31) % h
        r, g, b = pixels[x, y]
        pixels[x, y] = (r, g, (b & 0xFE) | (byte & 1))

    return img


def generate_district_facades(
    district_id: str,
    *,
    count: int = 50,
    force: bool = False,
) -> dict[str, Any]:
    """Write facade_NN.jpg into the district elevations folder."""
    try:
        from PIL import Image  # noqa: F401
    except ImportError as exc:
        raise SystemExit("Pillow required: pip install pillow") from exc

    paths = district_paths(district_id)
    ensure_district_dirs(paths)
    doc = load_district(district_id) if paths.district_json.exists() else {}
    brief = dict(BRIEF_2000)
    profile_brief = (doc.get("profile") or {}).get("facade_brief") or {}
    from cityview.districts import DISTRICT_REGISTRY

    registry_styles = list((DISTRICT_REGISTRY.get(district_id) or {}).get("facade_styles") or [])
    if registry_styles or profile_brief.get("styles"):
        # Registry brief leads; the generic historic styles only fill in for old-town districts.
        tail = [] if registry_styles and all(s in MODERN_STYLES for s in registry_styles[:2]) else BRIEF_2000["styles"]
        brief["styles"] = registry_styles + list(profile_brief.get("styles") or []) + list(tail)
        # unique preserve order
        seen: set[str] = set()
        styles = []
        for s in brief["styles"]:
            if s not in seen:
                seen.add(s)
                styles.append(s)
        brief["styles"] = styles

    styles = brief["styles"]
    modern = [s for s in styles if s in MODERN_STYLES]
    classic = [s for s in styles if s not in MODERN_STYLES] or modern
    tall_seen = 0
    out_dir = paths.facade_elevations
    written = []
    meta = {"district_id": district_id, "elevations": {}}

    # Mirror kit facade table storeys/aspect so UV maths still match.
    for i, (storeys, aspect, tags) in enumerate(kit._FACADE_TABLE[:count], start=1):
        fid = f"facade_{i:02d}"
        dest = out_dir / f"{fid}.jpg"
        if dest.exists() and not force:
            written.append(str(dest))
            meta["elevations"][fid] = {"file": dest.name, "skipped": True}
            continue
        if storeys >= 5 and modern:
            # Mid-rise / tower slots: post-war and curtain-wall elevations.
            style = modern[tall_seen % len(modern)]
            tall_seen += 1
        else:
            style = classic[(i - 1) % len(classic)]
        # Bias tags toward brief for shop / quay indices
        if style in MODERN_STYLES:
            pass
        elif "supermarket" in tags or "restaurant" in tags:
            shop_cycle = [
                s
                for s in (
                    "shopfront_meir",
                    "shopfront_newsstand",
                    "shopfront_kebab",
                    "shopfront_frituur",
                    "shopfront_pizza",
                )
                if s in styles or s == "shopfront_meir"
            ]
            style = shop_cycle[(i - 1) % len(shop_cycle)] if shop_cycle else "shopfront_meir"
        elif i % 11 == 0 and "warehouse_quay" in styles:
            style = "warehouse_quay"
        # Historic centre / station belt: weight early atlas slots toward snack & press fronts.
        profile_shops = (doc.get("profile") or {}).get("shops") or []
        shop_pool = [
            s
            for s in (
                "shopfront_meir",
                "shopfront_newsstand",
                "shopfront_kebab",
                "shopfront_frituur",
                "shopfront_pizza",
            )
            if s in styles or s == "shopfront_meir"
        ]
        if (
            (district_id.startswith("2000") or district_id.startswith("2018"))
            and i <= max(16, count // 2)
            and shop_pool
            and (profile_shops or "restaurant" in tags or "shop" in tags)
            and style not in {"warehouse_quay", "baroque_civic", *MODERN_STYLES}
        ):
            if i % 2 == 1 or "restaurant" in tags:
                style = shop_pool[(i - 1) % len(shop_pool)]
        img = _paint_elevation(fid, storeys, style, brief, district_id)
        img.save(dest, quality=88, optimize=True)
        written.append(str(dest))
        meta["elevations"][fid] = {
            "file": dest.name,
            "storeys": storeys,
            "aspect": aspect,
            "style": style,
            "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
        }

    meta_path = paths.facades / "elevations_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    return {"written": len(written), "dir": str(out_dir), "meta": str(meta_path)}


def detect_door(img) -> tuple[float, float] | None:
    """(centre, width) as image-width fractions of the painted front door, or None.

    ``_paint_elevation`` draws the door as a flat dark-brown slab standing on the
    pavement line; modern / roller-door elevations have none and get no doorstep.
    """
    import numpy as np

    a = np.asarray(img.convert("RGB")).astype(int)
    h, w, _ = a.shape
    band = a[int(h * 0.84) : int(h * 0.97)]
    r, g, b = band[..., 0], band[..., 1], band[..., 2]
    brown = (r >= 30) & (r <= 95) & (g >= 15) & (g <= 65) & (b >= 10) & (b <= 55) & (r - b >= 12)
    cols = list(brown.mean(axis=0) > 0.6) + [False]
    best, start = (0, 0), None
    for x, hit in enumerate(cols):
        if hit and start is None:
            start = x
        elif not hit and start is not None:
            if x - start > best[1] - best[0]:
                best = (start, x)
            start = None
    if best[1] - best[0] < 0.05 * w:
        return None
    return round((best[0] + best[1]) / 2 / w, 3), round((best[1] - best[0]) / w, 3)


def write_door_table(district_id: str) -> Path:
    """Detect front doors in the district's elevations -> ``facades/atlas/facade_doors.json``."""
    from PIL import Image

    paths = district_paths(district_id)
    doors = {}
    for src in sorted(paths.facade_elevations.glob("facade_*.jpg")):
        door = detect_door(Image.open(src))
        if door is not None:
            doors[src.stem] = list(door)
    dest = paths.facade_atlas_dir / kit.DOORS_FILE
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(doors, indent=1, sort_keys=True) + "\n")
    return dest


def pack_district_atlas(district_id: str) -> Path:
    """Pack district elevations into facades/atlas/ (reuse facade_textures pipeline)."""
    from cityview import facade_textures as ft
    from cityview.district_pipeline import _configure_facade_paths

    paths = district_paths(district_id)
    _configure_facade_paths(paths)
    paths.facade_atlas_dir.mkdir(parents=True, exist_ok=True)
    # Wall tiles stay shared in assets/textures; only the atlas is district-local.
    atlas = ft.build_atlas(paths.facade_elevations, paths.facade_atlas_dir)
    ft.build_normal_atlas(atlas, paths.facade_atlas_dir)
    # Copy bands/windows from 2018 kit defaults when district has none yet, then rebuild bands.
    shared = Path(__file__).resolve().parent.parent / "assets" / "textures"
    for name in (kit.WINDOWS_FILE, kit.BANDS_FILE, kit.EMISSIVE_FILE):
        dest = paths.facade_atlas_dir / name
        if not dest.exists() and (shared / name).exists() and district_id.startswith("2018"):
            import shutil

            shutil.copy2(shared / name, dest)
    try:
        ft.build_bands(atlas, paths.facade_atlas_dir)
    except Exception as exc:  # noqa: BLE001
        print(f"bands skipped: {exc}")
    if not district_id.startswith("2018"):  # 2018 shows the shared elevations: kit.DOORS
        write_door_table(district_id)
    return atlas


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Generate district-local facade elevations")
    p.add_argument("district_id", help="e.g. 2000-antwerpen")
    p.add_argument("--force", action="store_true")
    p.add_argument("--pack", action="store_true", help="Also pack atlas")
    p.add_argument("--count", type=int, default=50)
    args = p.parse_args(argv)
    info = generate_district_facades(args.district_id, count=args.count, force=args.force)
    print(json.dumps(info, indent=2))
    if args.pack:
        atlas = pack_district_atlas(args.district_id)
        print(f"Packed {atlas}")
    # Uniqueness check vs other districts
    from cityview.district_pipeline import assert_facades_unique

    errors = assert_facades_unique(args.district_id)
    for e in errors:
        print(f"ERROR: {e}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
