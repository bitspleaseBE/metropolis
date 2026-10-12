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

PLACE_TO_DISTRICT = {
    "harmonie": ID_2018,
    "klein-antwerpen": ID_2018,
    "centrum": ID_2000,
}


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
    if not root.is_dir() and district_id not in (ID_2018, ID_2000):
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


def write_index(doc: dict[str, Any]) -> Path:
    DISTRICTS_ROOT.mkdir(parents=True, exist_ok=True)
    DISTRICTS_INDEX.write_text(json.dumps(doc, indent=2) + "\n")
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
        "props.json",
        "spawn.json",
        "landmarks.json",
    )
