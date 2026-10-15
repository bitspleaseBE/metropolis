"""District packages: on-disk layout, index, and path helpers.

Each district lives under ``districts/<id>/`` with:

- ``district.json`` — boundary, origin, spawn, profile, stages
- ``cache/`` — OSM, GTFS, trees, benches, Velo, aerial
- ``facades/`` — elevations + atlas used only by this district
- ``landmarks/manifest.json`` — custom monuments for this district
- ``props/`` — place-specific meshes (containers, harbour gear)

Built viewer data lands in ``viewer/districts/<id>/``.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cityview.paths import ROOT, VIEWER

DISTRICTS_ROOT = ROOT / "districts"
DISTRICTS_INDEX = DISTRICTS_ROOT / "index.json"
VIEWER_DISTRICTS = VIEWER / "districts"

# Stable ids used by the pipeline and viewer.
ID_2018 = "2018-harmonie"
ID_2000 = "2000-antwerpen"
ID_2020 = "2020-kiel"
ID_2140 = "2140-borgerhout"
ID_2050 = "2050-linkeroever"
ID_2060 = "2060-noord"
ID_2030 = "2030-haven"

# One entry per playable postcode. ``standalone`` districts have no border handoff
# (entered from the Maps menu; later via metro or an unlock). ``access`` is how the
# player reaches the district: ``border`` (walk across), ``menu``, later ``metro`` /
# ``unlock``.
DISTRICT_REGISTRY: dict[str, dict[str, Any]] = {
    ID_2000: {
        "postcode": "2000",
        "menu_name": "Antwerpen City",
        "title": "Antwerpen · 2000",
        "summary": "Historic core, Meir, Scheldt quays",
        "style_policy": "historic",
        # Handschoenmarkt, off the Grote Markt, facing the cathedral's west front.
        "spawn": {"label": "Grote Markt · Kathedraal", "lat": 51.220482, "lon": 4.399963, "eye_height": 1.7,
                  "yaw": -1.7467, "snap_road": False},
        "facade_styles": [
            "baroque_civic", "stepped_gable", "shopfront_meir",
            "shopfront_newsstand", "shopfront_kebab", "shopfront_frituur", "shopfront_pizza",
            "warehouse_quay", "postwar_block", "glass_tower",
        ],
        "access": "border",
    },
    ID_2018: {
        "postcode": "2018",
        "menu_name": "Klein Antwerpen",
        "title": "Klein Antwerpen · 2018",
        "summary": "19th-century belt, Harmonie, Zuid, Stadspark",
        "style_policy": "historic",
        # Footpath at the west tip of the Stadspark pond, looking down the water.
        "spawn": {"label": "Stadspark", "lat": 51.211471, "lon": 4.412035, "eye_height": 1.7,
                  "yaw": -1.5797, "snap_road": False},
        "facade_styles": [
            "neo_flemish", "art_nouveau", "brick_sandstone_band",
            "shopfront_meir", "shopfront_newsstand", "shopfront_kebab", "shopfront_frituur", "shopfront_pizza",
            "postwar_block", "glass_tower",
        ],
        "access": "border",
        "legacy_viewer_glb": "klein_antwerpen.glb",
    },
    ID_2020: {
        "postcode": "2020",
        "menu_name": "'t Kiel",
        "title": "'t Kiel · 2020",
        "summary": "Kielpark, post-war social blocks and 19th-century terraces",
        "style_policy": "default",
        "spawn": {"label": "Kielpark", "lat": 51.1918, "lon": 4.3925, "eye_height": 1.7},
        "facade_styles": ["postwar_block", "brick_sandstone_band", "narrow_plot", "social_block"],
        "access": "border",
    },
    ID_2140: {
        "postcode": "2140",
        "menu_name": "Borgerhout",
        "title": "Borgerhout · 2140",
        "summary": "Turnhoutsebaan, dense brick terraces and shopfronts",
        "style_policy": "historic",
        "spawn": {"label": "Moorkensplein", "lat": 51.2152, "lon": 4.4378, "eye_height": 1.7},
        "facade_styles": ["narrow_plot", "brick_sandstone_band", "shopfront_meir", "neo_flemish", "postwar_block"],
        "access": "border",
    },
    ID_2060: {
        "postcode": "2060",
        "menu_name": "Noord",
        "title": "Antwerpen Noord · 2060",
        "summary": "Sint-Jansplein, Seefhoek terraces, Park Spoor Noord",
        "style_policy": "historic",
        "spawn": {"label": "Sint-Jansplein", "lat": 51.2282, "lon": 4.4176, "eye_height": 1.7},
        "facade_styles": ["narrow_plot", "brick_sandstone_band", "warehouse_quay", "postwar_block", "glass_tower"],
        "access": "border",
    },
    ID_2050: {
        "postcode": "2050",
        "menu_name": "Left Bank",
        "title": "Linkeroever · 2050",
        "summary": "Modernist slabs and towers across the Scheldt",
        "style_policy": "default",
        "spawn": {"label": "Frederik van Eedenplein", "lat": 51.2212, "lon": 4.3878, "eye_height": 1.7},
        "facade_styles": ["social_block", "postwar_block", "glass_tower"],
        "access": "menu",
        "standalone": True,
    },
    ID_2030: {
        "postcode": "2030",
        "menu_name": "Port of Antwerp",
        "title": "Haven · 2030",
        "summary": "Docks, warehouses and cranes north of Eilandje",
        "style_policy": "industrial",
        "spawn": {"label": "Havenhuis", "lat": 51.2386, "lon": 4.4036, "eye_height": 1.7},
        "facade_styles": ["warehouse_quay", "industrial_shed", "postwar_block"],
        "access": "menu",
        "standalone": True,
    },
}

POSTCODE_TO_DISTRICT = {v["postcode"]: k for k, v in DISTRICT_REGISTRY.items()}

PLACE_TO_DISTRICT = {
    "harmonie": ID_2018,
    "klein-antwerpen": ID_2018,
    "centrum": ID_2000,
    "kiel": ID_2020,
    "borgerhout": ID_2140,
    "noord": ID_2060,
    "linkeroever": ID_2050,
    "haven": ID_2030,
}


def registry_entry(district_id: str) -> dict[str, Any]:
    if district_id not in DISTRICT_REGISTRY:
        raise ValueError(f"Unknown district {district_id!r}")
    return DISTRICT_REGISTRY[district_id]


@dataclass(frozen=True)
class DistrictPaths:
    """Resolved paths for one district package."""

    id: str
    root: Path

    @property
    def district_json(self) -> Path:
        return self.root / "district.json"

    @property
    def cache(self) -> Path:
        return self.root / "cache"

    @property
    def osm_cache(self) -> Path:
        return self.cache / "osm.json"

    @property
    def gtfs_cache(self) -> Path:
        return self.cache / "gtfs_delijn.json"

    @property
    def nmbs_cache(self) -> Path:
        return self.cache / "gtfs_nmbs.json"

    @property
    def trees_cache(self) -> Path:
        return self.cache / "trees.json"

    @property
    def benches_cache(self) -> Path:
        return self.cache / "benches.json"

    @property
    def velo_cache(self) -> Path:
        return self.cache / "velo.json"

    @property
    def aerial_dir(self) -> Path:
        return self.cache / "aerial"

    @property
    def facades(self) -> Path:
        return self.root / "facades"

    @property
    def facade_elevations(self) -> Path:
        return self.facades / "elevations"

    @property
    def facade_atlas_dir(self) -> Path:
        return self.facades / "atlas"

    @property
    def landmarks(self) -> Path:
        return self.root / "landmarks"

    @property
    def landmarks_manifest(self) -> Path:
        return self.landmarks / "manifest.json"

    @property
    def props(self) -> Path:
        return self.root / "props"

    @property
    def viewer(self) -> Path:
        return VIEWER_DISTRICTS / self.id

    @property
    def viewer_landmarks(self) -> Path:
        return self.viewer / "landmarks"


def district_paths(district_id: str) -> DistrictPaths:
    root = DISTRICTS_ROOT / district_id
    if not root.is_dir() and district_id not in DISTRICT_REGISTRY:
        raise ValueError(f"Unknown district {district_id!r}")
    return DistrictPaths(id=district_id, root=root)


def ensure_district_dirs(paths: DistrictPaths) -> None:
    for p in (
        paths.root,
        paths.cache,
        paths.aerial_dir,
        paths.facade_elevations,
        paths.facade_atlas_dir,
        paths.landmarks,
        paths.props,
        paths.viewer,
        paths.viewer_landmarks,
    ):
        p.mkdir(parents=True, exist_ok=True)


def load_district(district_id: str) -> dict[str, Any]:
    paths = district_paths(district_id)
    path = paths.district_json
    if not path.exists():
        raise FileNotFoundError(f"Missing {path}")
    return json.loads(path.read_text())


def write_district(district_id: str, doc: dict[str, Any]) -> Path:
    paths = district_paths(district_id)
    ensure_district_dirs(paths)
    path = paths.district_json
    path.write_text(json.dumps(doc, indent=2) + "\n")
    return path


def load_index() -> dict[str, Any]:
    if not DISTRICTS_INDEX.exists():
        return {"districts": [], "edges": []}
    return json.loads(DISTRICTS_INDEX.read_text())


def _replace_text(path: Path, text: str) -> None:
    # Parallel district builds rewrite and read the index concurrently; never expose a half-written file.
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def write_index(doc: dict[str, Any]) -> Path:
    DISTRICTS_ROOT.mkdir(parents=True, exist_ok=True)
    text = json.dumps(doc, indent=2) + "\n"
    _replace_text(DISTRICTS_INDEX, text)
    if VIEWER_DISTRICTS.exists():
        _replace_text(VIEWER_DISTRICTS / "index.json", text)
    return DISTRICTS_INDEX


def resolve_district_id(place: str | None = None, district_id: str | None = None) -> str:
    if district_id:
        return district_id
    if place and place in PLACE_TO_DISTRICT:
        return PLACE_TO_DISTRICT[place]
    if place:
        # Allow raw district ids via --place for back-compat.
        candidate = DISTRICTS_ROOT / place
        if candidate.is_dir():
            return place
    raise ValueError(f"Cannot resolve district from place={place!r} district={district_id!r}")


def bbox_of_ring(ring: list[list[float]]) -> tuple[float, float, float, float]:
    """Ring of [lon, lat] → (south, west, north, east)."""
    lats = [p[1] for p in ring]
    lons = [p[0] for p in ring]
    return (min(lats), min(lons), max(lats), max(lons))


def point_in_ring(lat: float, lon: float, ring: list[list[float]]) -> bool:
    """Ray-cast point-in-polygon. Ring is [[lon, lat], ...] (GeoJSON order)."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi
        ):
            inside = not inside
        j = i
    return inside


def viewer_package_files() -> tuple[str, ...]:
    return (
        "city.glb",
        "roads.json",
        "road-surfaces.json",
        "buildings.json",
        "transit.json",
        "velo.json",
        "shops.json",
        "interiors.json",
        "props.json",
        "water.json",
        "spawn.json",
        "landmarks.json",
    )
