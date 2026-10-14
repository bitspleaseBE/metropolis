import unittest

from cityview.menu_map import menu_map_payload, water_rings
from cityview.viewer_map import export_viewer_map, is_underground_road_name


class ViewerMapTests(unittest.TestCase):
    def test_exports_every_street_not_just_spawn(self):
        layout = {
            "roads": [
                {"kind": "residential", "name": "Near", "width": 7, "points": [[0, 0], [50, 0]]},
                {"kind": "footway", "name": "", "width": 2, "points": [[3000, 0], [3010, 0], [3020, 0]]},
                {"kind": "motorway_link", "points": [[0, 0], [1, 1]]},
                {"kind": "residential", "tunnel": True, "points": [[0, 0], [1, 1]]},
            ],
            "transit_lines": [{"mode": "tram", "points": [[0, 0], [10, 0]], "tunnel": False}],
            "water": [{"ring": [[0, 0], [100, 0], [100, 100], [0, 100]]}],
            "parks": [{"ring": [[0, 0], [2, 0], [2, 2]]}],
        }
        doc = export_viewer_map(layout)
        names = [r["name"] for r in doc["roads"]]
        self.assertIn("Near", names)
        self.assertEqual(len(doc["roads"]), 2)
        far = next(r for r in doc["roads"] if r["kind"] == "footway")
        self.assertEqual(far["points"], [[3000.0, 0.0], [3020.0, 0.0]])  # collinear point dropped
        self.assertEqual(doc["rails"][0]["mode"], "tram")
        self.assertEqual(len(doc["water"]), 1)
        self.assertEqual(doc["parks"], [])  # below MIN_AREA_M2

    def test_tunnel_facility_names_stay_off_the_map(self):
        self.assertTrue(is_underground_road_name("Bolivartunnel"))
        self.assertTrue(is_underground_road_name("Sint-Annatunnel"))
        self.assertTrue(is_underground_road_name("Kennedyfietstunnel"))
        self.assertTrue(is_underground_road_name("Tunnel Demerstraat"))
        self.assertFalse(is_underground_road_name("Tunnelplaats"))
        self.assertFalse(is_underground_road_name("Frankrijklei"))
        layout = {
            "roads": [
                {"kind": "secondary", "name": "Van Eycktunnel", "width": 8, "points": [[0, 0], [40, 0]]},
                {"kind": "residential", "name": "Tunnelplaats", "width": 6, "points": [[0, 10], [40, 10]]},
                {"kind": "motorway", "name": "Bolivartunnel", "tunnel": True, "width": 16, "points": [[0, 20], [40, 20]]},
            ],
        }
        names = [r["name"] for r in export_viewer_map(layout)["roads"]]
        self.assertEqual(names, ["Tunnelplaats"])


class MenuWaterTests(unittest.TestCase):
    def test_relation_outer_ways_become_one_ring(self):
        a = [{"lon": 4.0, "lat": 51.0}, {"lon": 4.01, "lat": 51.0}, {"lon": 4.01, "lat": 51.01}]
        b = [{"lon": 4.01, "lat": 51.01}, {"lon": 4.0, "lat": 51.01}, {"lon": 4.0, "lat": 51.0}]
        osm = {
            "elements": [
                {
                    "type": "relation",
                    "members": [
                        {"type": "way", "role": "outer", "geometry": a},
                        {"type": "way", "role": "outer", "geometry": b},
                    ],
                },
                # A pond is too small for the atlas.
                {
                    "type": "way",
                    "geometry": [
                        {"lon": 4.2, "lat": 51.2},
                        {"lon": 4.2001, "lat": 51.2},
                        {"lon": 4.2001, "lat": 51.2001},
                        {"lon": 4.2, "lat": 51.2},
                    ],
                },
            ]
        }
        rings = water_rings(osm)
        self.assertEqual(len(rings), 1)
        self.assertEqual(rings[0][0], rings[0][-1])

    def test_payload_carries_water_path(self):
        ring = [[4.40, 51.21], [4.41, 51.21], [4.41, 51.22], [4.40, 51.21]]
        index = {"districts": [{"id": "2000-antwerpen", "postcode": "2000", "unlocked": True}]}
        doc = menu_map_payload(index, water=[ring])
        self.assertTrue(doc["water"].startswith("M"))
        self.assertTrue(doc["water"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
