"""Aerial orthophoto crops for named squares — evidence for agent tree edits.

Historic plazas are not thinned with place-specific hardcodes. Instead:

1. Discover named pedestrian squares / large pedestrian areas from OSM.
2. Fetch a Digitaal Vlaanderen winter orthophoto crop per plaza.
3. Overlay current inventory tree trunks (cyan) and green-canopy blob
   centroids from the aerial (yellow).
4. Emit review-pack tasks so an agent writes ``vegetation_overrides.json``
   matching the real canopy layout (Grote Markt may be almost bare;
   Steenplein may use a different formation than Groenplaats).

Pure geometry helpers stay importable without Pillow; imaging needs the
same Pillow+numpy stack as ``cityview.aerial``.
"""

from __future__ import annotations

import io
import json
import math
import re
import urllib.request
from pathlib import Path
from typing import Any, Iterable

from cityview.aerial import SOURCE_NOTE, WMS_LAYER, is_vegetation, latlon_to_pixel, wms_url
from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon, project
from cityview.trees import _point_in_ring, _real_candidates, load_vegetation_overrides

MIN_PLAZA_AREA_M2 = 1200.0
MIN_NAMED_SPAN_M = 45.0
MAX_NAMED_ASPECT = 3.2  # streets are long/thin; squares are closer to 1:1
PAD_M = 18.0
TARGET_M_PER_PX = 0.35
MAX_PX = 900
MIN_PX = 280
# Flemish / Dutch square name endings (not *straat / *lei corridors).
_SQUARE_NAME_RE = re.compile(
    r"(plaats|markt|plein|square|pl\.)(\s|$)",
    re.IGNORECASE,
)
_STREET_NAME_RE = re.compile(
    r"(straat|lei|kaai|steeg|gang|rui|weg|laan|dreef|vest)(\s|$)",
    re.IGNORECASE,
)


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "plaza"


def looks_like_square_name(name: str) -> bool:
    n = (name or "").strip()
    if not n or _STREET_NAME_RE.search(n):
        return False
    return bool(_SQUARE_NAME_RE.search(n))


def unproject(x: float, y: float, origin: tuple[float, float]) -> tuple[float, float]:
    lat = origin[0] + y / METERS_PER_DEG_LAT
    lon = origin[1] + x / meters_per_deg_lon(origin[0])
    return lat, lon


def ring_area_m2(ring: list[list[float]]) -> float:
    if len(ring) < 3:
        return 0.0
    a = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % len(ring)]
        a += x0 * y1 - x1 * y0
    return abs(a) * 0.5


def _bbox_ring(xs: list[float], ys: list[float], pad: float = PAD_M) -> list[list[float]]:
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def _way_local_points(
    way: dict[str, Any], nodes: dict[int, dict[str, Any]], origin: tuple[float, float]
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for nid in way.get("nodes") or []:
        n = nodes.get(int(nid))
        if not n or "lat" not in n:
            continue
        out.append(project(float(n["lat"]), float(n["lon"]), origin[0], origin[1]))
    return out


def discover_plazas(osm: dict[str, Any], origin: tuple[float, float]) -> list[dict[str, Any]]:
    """Named squares / large pedestrian areas suitable for aerial tree review."""
    nodes = {int(e["id"]): e for e in osm.get("elements") or [] if e.get("type") == "node"}
    ways = [e for e in osm.get("elements") or [] if e.get("type") == "way"]

    closed: list[dict[str, Any]] = []
    named_pts: dict[str, list[tuple[float, float]]] = {}
    named_way_ids: dict[str, list[int]] = {}

    for way in ways:
        tags = way.get("tags") or {}
        name = (tags.get("name") or "").strip()
        pts = _way_local_points(way, nodes, origin)
        if len(pts) < 2:
            continue
        highway = tags.get("highway") or ""
        place = tags.get("place") or ""
        area_yes = tags.get("area") == "yes"
        # Skip tram platforms / railway platforms even when named.
        if tags.get("railway") or tags.get("public_transport") == "platform":
            continue

        closed_ring = len(pts) >= 3 and pts[0] == pts[-1]
        is_square = place == "square" or (
            highway == "pedestrian" and area_yes and closed_ring and looks_like_square_name(name)
        )
        if is_square and closed_ring:
            ring = [[x, y] for x, y in pts[:-1]] if pts[0] == pts[-1] else [[x, y] for x, y in pts]
            area = ring_area_m2(ring)
            label = name if name else (f"square-{way.get('id')}" if place == "square" else "")
            if not label:
                continue
            if area >= MIN_PLAZA_AREA_M2 or place == "square":
                closed.append(
                    {
                        "name": label,
                        "slug": slugify(label),
                        "osm_way_ids": [int(way["id"])],
                        "polygon": ring,
                        "area_m2": round(area, 1),
                        "kind": "closed",
                    }
                )
                continue

        if name and highway == "pedestrian" and looks_like_square_name(name):
            named_pts.setdefault(name, []).extend(pts)
            named_way_ids.setdefault(name, []).append(int(way["id"]))

    # Named squares assembled from open pedestrian ways (e.g. Groenplaats).
    seen_slugs = {p["slug"] for p in closed}
    for name, pts in named_pts.items():
        slug = slugify(name)
        if slug in seen_slugs:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        w_m = max(xs) - min(xs)
        h_m = max(ys) - min(ys)
        span = max(w_m, h_m)
        aspect = (max(w_m, h_m) / max(1.0, min(w_m, h_m))) if min(w_m, h_m) > 1.0 else 99.0
        ring = _bbox_ring(xs, ys, pad=PAD_M)
        area = ring_area_m2(ring)
        if span < MIN_NAMED_SPAN_M or area < MIN_PLAZA_AREA_M2 or aspect > MAX_NAMED_ASPECT:
            continue
        closed.append(
            {
                "name": name,
                "slug": slug,
                "osm_way_ids": named_way_ids.get(name) or [],
                "polygon": ring,
                "area_m2": round(area, 1),
                "kind": "named_bbox",
            }
        )
        seen_slugs.add(slug)

    closed.sort(key=lambda p: (-float(p["area_m2"]), p["name"]))
    return closed


def plaza_geo_bbox(
    polygon: list[list[float]], origin: tuple[float, float]
) -> tuple[float, float, float, float]:
    """Return WMS bbox (south, west, north, east) covering ``polygon``."""
    lats, lons = [], []
    for x, y in polygon:
        lat, lon = unproject(float(x), float(y), origin)
        lats.append(lat)
        lons.append(lon)
    return (min(lats), min(lons), max(lats), max(lons))


def fetch_bbox_png(
    bbox: tuple[float, float, float, float],
    width: int,
    height: int,
    timeout: float = 90.0,
) -> bytes:
    url = wms_url(bbox, width, height)
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp.read()


def canopy_centroids_from_rgb(
    pixels: list[list[tuple[int, int, int]]],
    bbox: tuple[float, float, float, float],
    origin: tuple[float, float],
    min_blob: int = 12,
) -> list[tuple[float, float]]:
    """Connected green blobs → local-metre centroids (no numpy)."""
    if not pixels:
        return []
    h = len(pixels)
    w = len(pixels[0])
    south, west, north, east = bbox
    veg = [[False] * w for _ in range(h)]
    for r in range(h):
        for c in range(w):
            pr, pg, pb = pixels[r][c]
            veg[r][c] = is_vegetation((pr / 255.0, pg / 255.0, pb / 255.0))

    seen = [[False] * w for _ in range(h)]
    centroids: list[tuple[float, float]] = []
    for r0 in range(h):
        for c0 in range(w):
            if not veg[r0][c0] or seen[r0][c0]:
                continue
            stack = [(r0, c0)]
            seen[r0][c0] = True
            cells: list[tuple[int, int]] = []
            while stack:
                r, c = stack.pop()
                cells.append((r, c))
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < h and 0 <= cc < w and veg[rr][cc] and not seen[rr][cc]:
                        seen[rr][cc] = True
                        stack.append((rr, cc))
            if len(cells) < min_blob:
                continue
            cr = sum(r for r, _c in cells) / len(cells)
            cc = sum(c for _r, c in cells) / len(cells)
            # pixel (col,row) → lat/lon via plate carrée of this crop
            lon = west + (cc + 0.5) / w * (east - west)
            lat = north - (cr + 0.5) / h * (north - south)
            centroids.append(project(lat, lon, origin[0], origin[1]))
    return centroids


def _image_size_for_bbox(bbox: tuple[float, float, float, float]) -> tuple[int, int]:
    south, west, north, east = bbox
    height_m = (north - south) * METERS_PER_DEG_LAT
    width_m = (east - west) * meters_per_deg_lon((south + north) * 0.5)
    w = int(max(MIN_PX, min(MAX_PX, round(width_m / TARGET_M_PER_PX))))
    h = int(max(MIN_PX, min(MAX_PX, round(height_m / TARGET_M_PER_PX))))
    return w, h


def annotate_plaza_aerial(
    png_bytes: bytes,
    bbox: tuple[float, float, float, float],
    origin: tuple[float, float],
    inventory_xy: list[tuple[float, float]],
    out_jpg: Path,
    polygon: list[list[float]] | None = None,
) -> dict[str, Any]:
    """Write annotated JPEG; return canopy suggestions + tree counts."""
    from PIL import Image, ImageDraw

    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    # Sample for canopy (downsample for speed).
    sample = img.resize((max(40, w // 4), max(40, h // 4)), Image.Resampling.BILINEAR)
    sw, sh = sample.size
    # sample.load() avoids Pillow 14 getdata deprecation
    spx = sample.load()
    grid = [[spx[c, r] for c in range(sw)] for r in range(sh)]
    canopy = canopy_centroids_from_rgb(grid, bbox, origin, min_blob=8)

    draw = ImageDraw.Draw(img)

    def local_to_colrow(x: float, y: float) -> tuple[float, float]:
        lat, lon = unproject(x, y, origin)
        return latlon_to_pixel(lat, lon, (w, h), bbox)

    if polygon and len(polygon) >= 3:
        poly_px = [local_to_colrow(float(p[0]), float(p[1])) for p in polygon]
        draw.line(poly_px + [poly_px[0]], fill=(255, 220, 40), width=2)

    inside_inv = []
    for x, y in inventory_xy:
        if polygon and not _point_in_ring(x, y, [[float(p[0]), float(p[1])] for p in polygon]):
            continue
        inside_inv.append((x, y))
        col, row = local_to_colrow(x, y)
        r = 4
        draw.ellipse([col - r, row - r, col + r, row + r], outline=(0, 220, 255), width=2)

    for x, y in canopy:
        if polygon and not _point_in_ring(x, y, [[float(p[0]), float(p[1])] for p in polygon]):
            continue
        col, row = local_to_colrow(x, y)
        r = 5
        draw.ellipse([col - r, row - r, col + r, row + r], outline=(255, 210, 0), width=2)

    out_jpg.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_jpg, quality=85, optimize=True)
    return {
        "inventory_inside": len(inside_inv),
        "canopy_blobs": len(canopy),
        "canopy_xy": [[round(x, 2), round(y, 2)] for x, y in canopy],
    }


def inventory_xy_from_cache(
    trees_cache: Path, origin: tuple[float, float]
) -> list[tuple[float, float]]:
    if not trees_cache.exists():
        return []
    try:
        payload = json.loads(trees_cache.read_text())
    except json.JSONDecodeError:
        return []
    return [(c["x"], c["y"]) for c in _real_candidates(payload, origin)]


def build_plaza_aerial_pack(
    district_id: str,
    *,
    fetch: bool = True,
    force: bool = False,
) -> list[dict[str, Any]]:
    """Discover plazas, write aerial crops under cache/aerial/plazas/, return review tasks."""
    from cityview.districts import district_paths, load_district

    paths = district_paths(district_id)
    doc = load_district(district_id) if paths.district_json.exists() else {}
    origin = tuple(doc.get("origin") or (0.0, 0.0))  # type: ignore[assignment]
    if not paths.osm_cache.exists():
        return []
    osm = json.loads(paths.osm_cache.read_text())
    plazas = discover_plazas(osm, origin)  # type: ignore[arg-type]
    inv = inventory_xy_from_cache(paths.trees_cache, origin)  # type: ignore[arg-type]
    overrides = load_vegetation_overrides(paths.root / "vegetation_overrides.json")
    overridden = {slugify(str(p.get("name") or p.get("slug") or "")) for p in (overrides.get("plazas") or [])}

    out_dir = paths.aerial_dir / "plazas"
    out_dir.mkdir(parents=True, exist_ok=True)
    index: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []

    for plaza in plazas:
        slug = plaza["slug"]
        poly = plaza["polygon"]
        bbox = plaza_geo_bbox(poly, origin)  # type: ignore[arg-type]
        width, height = _image_size_for_bbox(bbox)
        jpg = out_dir / f"{slug}.jpg"
        meta_path = out_dir / f"{slug}.json"
        meta: dict[str, Any] = {
            "name": plaza["name"],
            "slug": slug,
            "kind": plaza["kind"],
            "area_m2": plaza["area_m2"],
            "osm_way_ids": plaza["osm_way_ids"],
            "polygon": poly,
            "bbox": list(bbox),
            "source": SOURCE_NOTE,
            "wms_layer": WMS_LAYER,
        }
        ann: dict[str, Any] = {}
        if fetch and (force or not jpg.exists()):
            try:
                png = fetch_bbox_png(bbox, width, height)
                ann = annotate_plaza_aerial(png, bbox, origin, inv, jpg, poly)  # type: ignore[arg-type]
                meta.update(ann)
                meta_path.write_text(json.dumps(meta, indent=2) + "\n")
            except Exception as exc:  # noqa: BLE001 — review pack continues offline
                meta["fetch_error"] = str(exc)
                meta_path.write_text(json.dumps(meta, indent=2) + "\n")
        elif meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                ann = {
                    "inventory_inside": meta.get("inventory_inside"),
                    "canopy_blobs": meta.get("canopy_blobs"),
                    "canopy_xy": meta.get("canopy_xy") or [],
                }
            except json.JSONDecodeError:
                pass

        index.append(meta)
        inv_n = ann.get("inventory_inside")
        canopy_n = ann.get("canopy_blobs")
        # Skip plazas that already have an override, or where inventory ≈ canopy.
        if slug in overridden:
            continue
        if (
            inv_n is not None
            and canopy_n is not None
            and inv_n <= max(3, int(canopy_n) + 2)
            and abs(int(inv_n) - int(canopy_n)) <= 4
        ):
            continue

        rel_aerial = f"districts/{district_id}/cache/aerial/plazas/{slug}.jpg"
        ov_path = f"districts/{district_id}/vegetation_overrides.json"
        prompt = (
            f"Open `{rel_aerial}` (Digitaal Vlaanderen winter orthophoto — leafless crowns still cast "
            "shadows / dark circles). Cyan rings = current inventory trunks (often a carpet). "
            "Yellow rings = auto green-canopy blobs (sparse in winter; trust the photo, not the yellow). "
            f"Match trees on **{plaza['name']}** to what you see — each square differs "
            "(Grote Markt nearly bare; Steenplein its own rows; Groenplaats not a full forest). "
            "Do **not** invent a uniform ring rule. "
            f"Write/merge a plaza entry into `{ov_path}` with mode `clear` or `replace_inside`, "
            f"polygon from `{rel_aerial.replace('.jpg', '.json')}` (`polygon` field), and `trees` as "
            "local XY matching visible crowns (or `[]` / mode `clear` when bare). "
            f"Rebuild: `python -m cityview district build {district_id}` so the GLB applies the override."
        )
        tasks.append(
            {
                "id": f"plaza-trees-{slug}",
                "title": f"Match plaza trees to aerial — {plaza['name']}",
                "goal": (
                    f"Tree layout on {plaza['name']} must follow the orthophoto canopy, "
                    "not a carpeted inventory or a one-size ring rule."
                ),
                "acceptance": (
                    f"vegetation_overrides.json has a `{slug}` / `{plaza['name']}` plaza; "
                    "rebuild includes override stats; walk proof shows aerial-matching trees."
                ),
                "geo": {
                    "name": plaza["name"],
                    "slug": slug,
                    "area_m2": plaza["area_m2"],
                    "osm_way_ids": plaza["osm_way_ids"],
                    "inventory_inside": inv_n,
                    "canopy_blobs": canopy_n,
                    "aerial": rel_aerial,
                    "notes": "cyan=inventory trunks, yellow=aerial canopy blobs",
                },
                "aerial": rel_aerial,
                "agent_prompt": prompt,
                "commands": [
                    f"Open {rel_aerial}",
                    f"Edit {ov_path}",
                    f"python -m cityview district build {district_id}",
                ],
                "proof": f"review/proofs/plaza-trees-{slug}.jpg",
            }
        )

    (out_dir / "index.json").write_text(
        json.dumps({"source": SOURCE_NOTE, "plazas": index}, indent=2) + "\n"
    )
    # Worst mismatches first; keep the review pack readable.
    def _mismatch_key(t: dict[str, Any]) -> float:
        g = t.get("geo") or {}
        inv = g.get("inventory_inside")
        can = g.get("canopy_blobs")
        if inv is None or can is None:
            return 0.0
        return abs(float(inv) - float(can)) + float(inv) * 0.01

    tasks.sort(key=_mismatch_key, reverse=True)
    return tasks[:24]


def main(argv: Iterable[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("district_id")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(list(argv) if argv is not None else None)
    tasks = build_plaza_aerial_pack(args.district_id, fetch=not args.no_fetch, force=args.force)
    print(f"{len(tasks)} plaza tree review task(s)")
    for t in tasks:
        print("-", t["id"], t.get("aerial"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
