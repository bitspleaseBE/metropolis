"""District package layout, profile, facade uniqueness, civic builders."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from cityview.district_boundary import (
    NATIONALE_BANK_FALLBACK,
    bbox_to_ring,
    extend_bbox_north,
    load_postcodes,
    point_in_ring,
    postcode_ring,
)
from cityview.district_pipeline import assert_facades_unique, facade_hashes, seed_2018_district_json
from cityview.district_profile import build_profile
from cityview.districts import ID_2000, ID_2018, district_paths, load_index
from cityview.landmark_civic import BUILDERS, TRI_BUDGET, build_nationale_bank
from cityview.landmark_models import BUILDERS as ALL_BUILDERS
from cityview.paths import ROOT


class TestBoundaries(unittest.TestCase):
    def test_postcodes_present(self):
        doc = load_postcodes()
        ring = postcode_ring("2000", doc)
        self.assertGreaterEqual(len(ring), 4)
        # Grote Markt roughly inside 2000
        self.assertTrue(point_in_ring(51.2213, 4.3997, ring))

    def test_extend_bbox_north_to_bank(self):
        bbox = (51.197, 4.404, 51.2075, 4.4195)
        bank_lat = NATIONALE_BANK_FALLBACK[0]
        extended = extend_bbox_north(bbox, bank_lat, pad_deg=0.0012)
        self.assertGreater(extended[2], 51.212)
        ring = bbox_to_ring(extended)
        self.assertTrue(point_in_ring(bank_lat, NATIONALE_BANK_FALLBACK[1], ring))


class TestDistrictLayout(unittest.TestCase):
    def test_2018_package_exists(self):
        paths = district_paths(ID_2018)
        self.assertTrue(paths.root.is_dir())
        self.assertTrue(paths.facade_elevations.is_dir())
        self.assertTrue((paths.facade_elevations / "facade_01.jpg").exists())
        self.assertTrue(paths.landmarks_manifest.exists())

    def test_index_has_edge(self):
        index = load_index()
        self.assertEqual(index.get("default"), ID_2018)
        edges = index.get("edges") or []
        self.assertTrue(any(e.get("from") == ID_2018 and e.get("to") == ID_2000 for e in edges))


class TestProfile(unittest.TestCase):
    def test_profile_from_minimal_osm(self):
        osm = {
            "elements": [
                {
                    "type": "way",
                    "id": 1,
                    "tags": {"building": "yes", "building:material": "brick"},
                    "nodes": [1, 2, 3],
                },
                {
                    "type": "way",
                    "id": 2,
                    "tags": {"railway": "tram"},
                    "nodes": [1, 2],
                },
                {
                    "type": "node",
                    "id": 1,
                    "lat": 51.22,
                    "lon": 4.40,
                    "tags": {},
                },
                {
                    "type": "node",
                    "id": 2,
                    "lat": 51.221,
                    "lon": 4.401,
                    "tags": {"highway": "bus_stop", "name": "Test"},
                },
                {
                    "type": "node",
                    "id": 3,
                    "lat": 51.2205,
                    "lon": 4.4005,
                    "tags": {},
                },
                {
                    "type": "way",
                    "id": 9,
                    "tags": {
                        "building": "cathedral",
                        "name": "Onze-Lieve-Vrouwekathedraal",
                        "heritage": "4",
                    },
                    "nodes": [1, 2, 3],
                },
            ]
        }
        profile = build_profile(osm)
        self.assertTrue(profile["modes"]["tram"])
        self.assertTrue(profile["modes"]["bus"])
        self.assertTrue(profile["stages"]["gtfs_delijn"])
        self.assertFalse(profile["stages"]["port_props"])
        self.assertTrue(any("kathedraal" in (l.get("name") or "").lower() for l in profile["landmarks"]))


class TestOsmFetchTiling(unittest.TestCase):
    def test_map_tile_merges_and_subdivides(self):
        """Simulated 400 'too many nodes' triggers quad subdivision."""
        import urllib.error
        from cityview import osm as osm_mod

        calls: list[tuple[float, float, float, float]] = []

        def fake_tile(s, w, n, e):
            calls.append((s, w, n, e))
            area = (n - s) * (e - w)
            if area > 0.0002:
                raise urllib.error.HTTPError(
                    "http://x",
                    400,
                    "Bad Request",
                    hdrs=None,  # type: ignore[arg-type]
                    fp=__import__("io").BytesIO(b"You requested too many nodes (limit is 50000)."),
                )
            return [
                {"type": "node", "id": int(s * 1e6 + w * 1e3), "lat": s, "lon": w},
            ]

        orig = osm_mod._fetch_osm_map_tile
        osm_mod._fetch_osm_map_tile = fake_tile  # type: ignore[assignment]
        try:
            payload = osm_mod._fetch_osm_map(51.20, 4.38, 51.23, 4.42)
        finally:
            osm_mod._fetch_osm_map_tile = orig  # type: ignore[assignment]
        self.assertGreater(len(calls), 1)
        self.assertGreaterEqual(len(payload["elements"]), 1)


class TestFacadesUnique(unittest.TestCase):

    def test_2018_hashes(self):
        h = facade_hashes(district_paths(ID_2018))
        self.assertGreaterEqual(len(h), 40)

    def test_no_overlap_when_2000_missing(self):
        # Without 2000 elevations, uniqueness check is a no-op for 2018.
        errs = assert_facades_unique(ID_2018)
        self.assertEqual(errs, [])


class TestCivicBuilders(unittest.TestCase):
    def test_registered(self):
        for name in BUILDERS:
            self.assertIn(name, ALL_BUILDERS)
            self.assertIn(name, TRI_BUDGET)

    def test_nationale_bank_mesh(self):
        ring = [(0.0, 0.0), (40.0, 0.0), (40.0, -25.0), (0.0, -25.0)]
        lm = {"anchor_xy": (20.0, 0.0), "height_m": 18.0}
        mesh = build_nationale_bank(ring, [], lm)
        self.assertGreater(mesh.tri_count(), 20)
        self.assertLessEqual(mesh.tri_count(), TRI_BUDGET["nationale_bank"])


class TestDistrictChunks(unittest.TestCase):
    def test_cell_index_and_centre(self):
        from cityview.district_chunks import cell_centre, cell_index

        self.assertEqual(cell_index(10, 10, 256), (0, 0))
        self.assertEqual(cell_index(-1, 300, 256), (-1, 1))
        cx, cy = cell_centre(0, 1, 256)
        self.assertAlmostEqual(cx, 128.0)
        self.assertAlmostEqual(cy, 384.0)

    def test_assign_core_vs_cell(self):
        from cityview.district_chunks import assign_object

        spawn = (0.0, 0.0)
        self.assertEqual(assign_object("bldg_1", 10, 10, spawn_xy=spawn), "core")
        self.assertEqual(assign_object("road_main", 900, 900, spawn_xy=spawn), "core")
        self.assertEqual(assign_object("rooftop_brick", 900, 900, spawn_xy=spawn), "core")
        outer = assign_object("bldg_far", 900, 100, spawn_xy=spawn, core_r=320)
        self.assertIsInstance(outer, tuple)
        self.assertEqual(outer, (3, 0))

    def test_manifest_shape(self):
        from cityview.district_chunks import build_chunks_manifest, empty_chunks_manifest

        empty = empty_chunks_manifest()
        self.assertEqual(empty["chunks"], [])
        self.assertEqual(empty["core"], "core.glb")
        man = build_chunks_manifest([(0, 1), (-1, 0)])
        self.assertEqual(len(man["chunks"]), 2)
        self.assertEqual(man["chunks"][0]["id"], "c_-1_0")
        self.assertTrue(man["chunks"][0]["file"].startswith("chunks/"))


if __name__ == "__main__":
    unittest.main()
