"""Plaza aerial discovery + vegetation override application."""

from __future__ import annotations

import unittest

from cityview.plaza_aerial import (
    canopy_centroids_from_rgb,
    discover_plazas,
    looks_like_square_name,
    slugify,
)
from cityview.trees import apply_vegetation_overrides, plan_trees


ORIGIN = (51.22, 4.40)


def _node(i: int, lat: float, lon: float) -> dict:
    return {"type": "node", "id": i, "lat": lat, "lon": lon}


class PlazaDiscoverTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(slugify("Grote Markt"), "grote-markt")

    def test_square_name_filter(self):
        self.assertTrue(looks_like_square_name("Groenplaats"))
        self.assertTrue(looks_like_square_name("Grote Markt"))
        self.assertTrue(looks_like_square_name("Steenplein"))
        self.assertFalse(looks_like_square_name("Meir"))
        self.assertFalse(looks_like_square_name("Hoogstraat"))
        self.assertFalse(looks_like_square_name("Napoleonkaai"))

    def test_closed_pedestrian_square(self):
        # ~40 m square in metres ≈ 0.00036 deg lat
        d = 0.0004
        lat0, lon0 = ORIGIN
        nodes = [
            _node(1, lat0, lon0),
            _node(2, lat0, lon0 + d),
            _node(3, lat0 + d, lon0 + d),
            _node(4, lat0 + d, lon0),
            _node(5, lat0, lon0),
        ]
        osm = {
            "elements": nodes
            + [
                {
                    "type": "way",
                    "id": 99,
                    "nodes": [1, 2, 3, 4, 5],
                    "tags": {"highway": "pedestrian", "area": "yes", "name": "Testplein"},
                }
            ]
        }
        plazas = discover_plazas(osm, ORIGIN)
        self.assertTrue(any(p["name"] == "Testplein" for p in plazas))
        p = next(x for x in plazas if x["name"] == "Testplein")
        self.assertEqual(p["kind"], "closed")
        self.assertGreater(p["area_m2"], 1000)

    def test_named_bbox_from_open_ways(self):
        lat0, lon0 = ORIGIN
        d = 0.0005
        nodes = [
            _node(1, lat0, lon0),
            _node(2, lat0, lon0 + d),
            _node(3, lat0 + d, lon0),
            _node(4, lat0 + d, lon0 + d),
        ]
        osm = {
            "elements": nodes
            + [
                {
                    "type": "way",
                    "id": 10,
                    "nodes": [1, 2],
                    "tags": {"highway": "pedestrian", "name": "Groenplaats"},
                },
                {
                    "type": "way",
                    "id": 11,
                    "nodes": [3, 4],
                    "tags": {"highway": "pedestrian", "name": "Groenplaats"},
                },
            ]
        }
        plazas = discover_plazas(osm, ORIGIN)
        self.assertTrue(any(p["slug"] == "groenplaats" and p["kind"] == "named_bbox" for p in plazas))


class CanopyTests(unittest.TestCase):
    def test_green_blob_centroid(self):
        # 8x8 mostly grey with a green 3x3 blob
        grey = (80, 80, 80)
        green = (40, 120, 40)
        pixels = [[grey] * 8 for _ in range(8)]
        for r in range(2, 5):
            for c in range(2, 5):
                pixels[r][c] = green
        bbox = (51.0, 4.0, 51.001, 4.001)
        cents = canopy_centroids_from_rgb(pixels, bbox, ORIGIN, min_blob=4)
        self.assertEqual(len(cents), 1)


class OverrideTests(unittest.TestCase):
    def test_clear_and_replace(self):
        trees = [
            {"x": 0.0, "y": 0.0, "source": "antwerp", "radius": 2.0, "height": 8.0, "shape": "broadleaf"},
            {"x": 50.0, "y": 50.0, "source": "antwerp", "radius": 2.0, "height": 8.0, "shape": "broadleaf"},
        ]
        poly = [[-5.0, -5.0], [5.0, -5.0], [5.0, 5.0], [-5.0, 5.0]]
        out, stats = apply_vegetation_overrides(
            trees,
            {
                "plazas": [
                    {
                        "name": "Square",
                        "mode": "replace_inside",
                        "polygon": poly,
                        "trees": [{"x": 1.0, "y": 1.0, "species": "Platanus"}],
                    }
                ]
            },
        )
        self.assertEqual(stats["override_dropped"], 1)
        self.assertEqual(stats["override_added"], 1)
        self.assertEqual(len(out), 2)
        self.assertTrue(any(t.get("source") == "aerial_edit" for t in out))
        self.assertTrue(any(t["x"] == 50.0 for t in out))

    def test_plan_trees_honours_overrides(self):
        layout = {
            "buildings": [],
            "roads": [],
            "parks": [],
            "transit_lines": [],
        }
        payload = {
            "antwerp": [{"lat": ORIGIN[0], "lon": ORIGIN[1], "species": "Tilia"}],
        }
        # Clear everything near origin with a big polygon.
        poly = [[-20.0, -20.0], [20.0, -20.0], [20.0, 20.0], [-20.0, 20.0]]
        plan = plan_trees(
            layout,
            payload,
            ORIGIN,
            overrides={"plazas": [{"mode": "clear", "polygon": poly}]},
        )
        self.assertEqual(plan["stats"].get("override_dropped", 0), 1)
        self.assertEqual(len(plan["trees"]), 0)


if __name__ == "__main__":
    unittest.main()
