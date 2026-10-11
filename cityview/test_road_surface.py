"""OSM surface tags decide cobble vs asphalt."""

import unittest

from cityview.road_surface import carriageway_material, surfaces_from_layout, surfaces_from_osm


class CarriagewayMaterialTests(unittest.TestCase):
    def test_main_roads_stay_asphalt(self):
        self.assertEqual(carriageway_material({"highway": "secondary", "surface": "asphalt"}), "asphalt")
        self.assertEqual(carriageway_material({"highway": "residential"}), "asphalt")
        self.assertEqual(carriageway_material({"highway": "tertiary", "surface": "concrete"}), "asphalt")

    def test_stone_tags_are_cobble(self):
        for surface in ("sett", "cobblestone", "paving_stones", "pebblestone", "paving_stones:30"):
            self.assertEqual(
                carriageway_material({"highway": "residential", "surface": surface}),
                "cobble",
                surface,
            )

    def test_untagged_living_street_and_pedestrian_are_cobble(self):
        self.assertEqual(carriageway_material({"highway": "living_street"}), "cobble")
        self.assertEqual(carriageway_material({"highway": "pedestrian", "surface": "paved"}), "cobble")
        self.assertEqual(
            carriageway_material({"highway": "living_street", "surface": "asphalt"}),
            "asphalt",
        )

    def test_index_omits_asphalt(self):
        layout = {
            "roads": [
                {"id": 1, "surface": "asphalt"},
                {"id": 2, "surface": "cobble"},
            ]
        }
        self.assertEqual(surfaces_from_layout(layout), {"2": "cobble"})
        osm = {
            "elements": [
                {"type": "way", "id": 9, "tags": {"highway": "residential", "surface": "sett"}},
                {"type": "way", "id": 10, "tags": {"highway": "secondary", "surface": "asphalt"}},
                {"type": "node", "id": 1, "tags": {"highway": "street_lamp"}},
            ]
        }
        self.assertEqual(surfaces_from_osm(osm), {"9": "cobble"})


if __name__ == "__main__":
    unittest.main()
