"""Render the tree leaf atlas → ``assets/trees/leaf_atlas.png`` (deterministic).

One 512x512 RGBA texture is shared by every tree mesh (``blender/trees_blender.py``):

    u 0.0-0.5, v 0.5-1.0   broadleaf cluster A        (top-left)
    u 0.5-1.0, v 0.5-1.0   broadleaf cluster B        (top-right)
    u 0.0-0.5, v 0.0-0.5   broadleaf cluster C        (bottom-left, sunnier)
    u 0.5-1.0, v 0.25-0.5  needle cluster             (conifers)
    u 0.5-1.0, v 0.0-0.25  bark strip, fully opaque   (trunks and limbs)

Colours are near-neutral light greens / greys: the mesh's vertex colour multiplies them,
so each crown archetype keeps its own hue. Each tile is a few overlapping bunches with
gaps, not a packed disc, so a card does not read as a green pancake. Colour is bled
into the transparent pixels so the viewer's mipmaps never fringe the leaf edges dark.

  .venv-img/bin/python scripts/make_leaf_atlas.py   # needs the ``textures`` extra
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "trees" / "leaf_atlas.png"
SIZE = 512
SS = 2  # supersampling factor
TILE = 256
GUTTER = 6  # px kept transparent around every leaf tile (mip bleed between tiles)


def _leaf_polygon(cx: float, cy: float, length: float, width: float, ang: float, n: int = 9):
    pts = []
    for side in (1, -1):
        rng = range(n + 1) if side == 1 else range(n, -1, -1)
        for i in rng:
            t = i / n
            w = width * 0.5 * math.sin(math.pi * t) ** 0.75 * side
            x, y = t * length, w
            pts.append(
                (cx + x * math.cos(ang) - y * math.sin(ang), cy + x * math.sin(ang) + y * math.cos(ang))
            )
    return pts


def _broadleaf_tile(seed: int, warmth: float) -> Image.Image:
    """A few overlapping leaf bunches with gaps, drawn at SS x resolution."""
    rnd = random.Random(seed)
    s = TILE * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s * 0.5
    pad = GUTTER * SS + s * 0.02
    n_clumps = 3
    clumps = []
    for k in range(n_clumps):
        a = k / n_clumps * math.tau + rnd.uniform(-0.35, 0.35)
        dist = s * rnd.uniform(0.03, 0.13)
        clumps.append((c + math.cos(a) * dist, c + math.sin(a) * dist, s * rnd.uniform(0.20, 0.30)))
    leaves = []
    for cx, cy, cr in clumps:
        n_twig = rnd.randint(5, 6)
        for k in range(n_twig):
            a = k / n_twig * math.tau + rnd.uniform(-0.4, 0.4)
            base = (cx + math.cos(a) * cr * 0.1, cy + math.sin(a) * cr * 0.1)
            tip = (cx + math.cos(a) * cr * rnd.uniform(0.72, 1.02), cy + math.sin(a) * cr * rnd.uniform(0.72, 1.02))
            d.line([base, tip], fill=(92, 78, 60, 255), width=max(2, int(SS * 2.1)))
            for i in range(13):
                t = 0.12 + 0.88 * i / 12
                px = base[0] + (tip[0] - base[0]) * t
                py = base[1] + (tip[1] - base[1]) * t
                for side in (1, -1):
                    ang = a + side * rnd.uniform(0.45, 1.15) + rnd.uniform(-0.25, 0.25)
                    length = s * rnd.uniform(0.06, 0.105) * (1.0 - 0.2 * t)
                    leaves.append((px, py, length, length * rnd.uniform(0.4, 0.58), ang, cx, cy, cr))
        for _ in range(70):
            rr = cr * rnd.random() ** 0.65
            a = rnd.uniform(0, math.tau)
            px, py = cx + math.cos(a) * rr, cy + math.sin(a) * rr
            length = s * rnd.uniform(0.055, 0.10)
            leaves.append((px, py, length, length * rnd.uniform(0.4, 0.58), rnd.uniform(0, math.tau), cx, cy, cr))
    placed = []
    for px, py, length, width, ang, cx, cy, cr in leaves:
        mid = math.hypot(px + math.cos(ang) * length * 0.5 - cx, py + math.sin(ang) * length * 0.5 - cy)
        placed.append((min(1.0, mid / max(cr, 1e-3)), rnd.uniform(-0.2, 0.2), (px, py, length, width, ang)))
    placed.sort(key=lambda p: p[1] - p[0])
    for rim, _, (px, py, length, width, ang) in placed:
        tx = px + math.cos(ang) * length
        ty = py + math.sin(ang) * length
        if not (pad < tx < s - pad and pad < ty < s - pad):
            continue
        v = rnd.uniform(0.72, 1.0) * (1.0 - 0.46 * rim**1.4)
        hue = rnd.uniform(-0.07, 0.07) + warmth
        col = (
            int(255 * min(1.0, v * (0.80 + hue))),
            int(255 * min(1.0, v * 0.97)),
            int(255 * min(1.0, v * (0.70 - hue * 0.5))),
            255,
        )
        d.polygon(_leaf_polygon(px, py, length, width, ang), fill=col)
        vein = tuple(int(ch * 0.78) for ch in col[:3]) + (255,)
        d.line(
            [(px, py), (px + math.cos(ang) * length * 0.9, py + math.sin(ang) * length * 0.9)],
            fill=vein,
            width=max(1, SS),
        )
    return img


def _needle_tile(seed: int) -> Image.Image:
    """Conifer sprays: a few branchlets densely set with short needles (2:1 tile)."""
    rnd = random.Random(seed)
    w, h = TILE * SS, TILE // 2 * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = GUTTER * SS
    for b in range(9):
        y0 = pad + (h - 2 * pad) * (b + 0.5) / 9 + rnd.uniform(-4, 4) * SS
        x0, x1 = pad + rnd.uniform(0, 20) * SS, w - pad - rnd.uniform(0, 20) * SS
        sag = rnd.uniform(-8, 8) * SS
        d.line([(x0, y0), ((x0 + x1) / 2, y0 + sag), (x1, y0)], fill=(80, 70, 56, 255), width=SS * 2)
        steps = 70
        for i in range(steps):
            t = i / (steps - 1)
            x = x0 + (x1 - x0) * t
            y = y0 + sag * math.sin(math.pi * t)
            for side in (1, -1):
                length = rnd.uniform(11, 18) * SS * (1.0 - 0.35 * abs(t - 0.5))
                ang = side * rnd.uniform(0.9, 1.4) + rnd.uniform(-0.2, 0.2)
                ex, ey = x + math.cos(ang) * length * 0.6, y + math.sin(ang) * length
                ey = min(h - pad, max(pad, ey))
                v = rnd.uniform(0.7, 1.0)
                col = (int(200 * v), int(240 * v), int(205 * v), 255)
                d.line([(x, y), (ex, ey)], fill=col, width=max(2, int(SS * 1.6)))
    return img


def _bark_strip(seed: int) -> Image.Image:
    """Opaque neutral bark: vertical fissures and mottling (tinted by vertex colour)."""
    rng = np.random.default_rng(seed)
    w, h = TILE * SS, TILE // 2 * SS
    base = rng.normal(0.0, 1.0, (h // 8 + 2, w // 4 + 2))
    noise = np.array(
        Image.fromarray(((base - base.min()) / (np.ptp(base) or 1.0) * 255).astype(np.uint8)).resize(
            (w, h), Image.BICUBIC
        ),
        dtype=np.float32,
    ) / 255.0
    cols = np.linspace(0.0, 1.0, w, endpoint=False)
    fissure = np.zeros(w, dtype=np.float32)
    for _ in range(18):
        x = rng.uniform(0, 1)
        fissure += np.exp(-((cols - x) ** 2) / (2 * rng.uniform(0.002, 0.006) ** 2)).astype(np.float32)
    fissure = np.clip(fissure, 0, 1)
    v = 0.78 + 0.22 * noise - 0.38 * fissure[None, :] * (0.6 + 0.4 * noise)
    v = np.clip(v, 0.25, 1.0)
    rgb = np.stack([v * 0.98, v * 0.94, v * 0.88], axis=-1)
    a = np.ones((h, w, 1), dtype=np.float32)
    return Image.fromarray((np.concatenate([rgb, a], axis=-1) * 255).astype(np.uint8), "RGBA")


def _downsample(img: Image.Image) -> Image.Image:
    """Premultiplied-alpha box downsample (keeps leaf edges clean)."""
    arr = np.asarray(img, dtype=np.float32) / 255.0
    rgb, a = arr[..., :3] * arr[..., 3:4], arr[..., 3:4]
    h, w = arr.shape[0] // SS, arr.shape[1] // SS
    rgb = rgb.reshape(h, SS, w, SS, 3).mean(axis=(1, 3))
    a = a.reshape(h, SS, w, SS, 1).mean(axis=(1, 3))
    rgb = np.where(a > 1e-4, rgb / np.maximum(a, 1e-4), 0.0)
    out = np.concatenate([rgb, a], axis=-1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def _bleed(img: Image.Image, passes: int = 24) -> Image.Image:
    """Spread opaque colour into transparent pixels (alpha untouched)."""
    arr = np.asarray(img, dtype=np.float32) / 255.0
    rgb, a = arr[..., :3].copy(), arr[..., 3]
    known = a > 0.02
    for _ in range(passes):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            k = np.roll(known, (dy, dx), axis=(0, 1))
            acc += np.roll(rgb, (dy, dx), axis=(0, 1)) * k[..., None]
            cnt += k
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        known = known | grow
    if (~known).any():
        rgb[~known] = rgb[known].mean(axis=0)
    out = np.concatenate([rgb, a[..., None]], axis=-1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def build() -> Image.Image:
    atlas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tiles = (
        (_broadleaf_tile(11, 0.0), (0, 0)),
        (_broadleaf_tile(23, -0.04), (TILE, 0)),
        (_broadleaf_tile(37, 0.07), (0, TILE)),
    )
    for img, at in tiles:
        atlas.alpha_composite(_downsample(img), at)
    atlas.alpha_composite(_downsample(_needle_tile(5)), (TILE, TILE))
    atlas.alpha_composite(_downsample(_bark_strip(7)), (TILE, TILE + TILE // 2))
    # Slight softening of single-pixel speckle so the 0.5 alpha cut stays stable.
    alpha = atlas.getchannel("A").filter(ImageFilter.GaussianBlur(0.4))
    atlas.putalpha(alpha)
    return _bleed(atlas)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    build().save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
