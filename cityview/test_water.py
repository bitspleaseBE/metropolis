"""Shallow vs deep water classification (Antwerp ponds vs Scheldt / docks)."""

from __future__ import annotations

import unittest

from cityview.water import annotate_water_entry, classify_water, export_water_for_viewer


class ClassifyWaterTests(unittest.TestCase):
    def test_stadsparkvijver_is_shallow_wade(self):
        info = classify_water(
            {"natural": "water", "water": "pond", "name": "Stadsparkvijver"},
            area_m2=17_000,
        )
        self.assertEqual(info["kind"], "pond")
        self.assertEqual(info["depth"], "shallow")
        self.assertTrue(info["wade"])
        self.assertGreater(info["depth_m"], 0.1)
        self.assertLess(info["bed_y"], 0.0)
        self.assertEqual(info["bank"], "natural")

    def test_fountain_basin_is_built_bank(self):
        info = classify_water({"landuse": "basin", "name": "Deep Fountain"}, 400)
        self.assertEqual(info["bank"], "built")
        self.assertTrue(info["wade"])
        self.assertLess(info["bed_y"], 0.0)

    def test_named_vijver_basin_stays_natural(self):
        info = classify_water({"landuse": "basin", "name": "Stadsparkvijver"}, 8_000)
        self.assertEqual(info["kind"], "pond")
        self.assertEqual(info["bank"], "natural")

    def test_schelde_by_name_is_deep(self):
        info = classify_water({"natural": "water", "water": "river", "name": "Schelde"}, 2e6)
        self.assertEqual(info["depth"], "deep")
        self.assertFalse(info["wade"])

    def test_escaut_relation_is_deep(self):
        info = classify_water({"waterway": "river", "name": "L'Escaut"}, 1e6)
        self.assertEqual(info["kind"], "river")
        self.assertFalse(info["wade"])

    def test_harbour_dock_is_deep(self):
        for tags in (
            {"water": "harbour", "name": "Bonapartedok"},
            {"waterway": "dock", "name": "Willemdok"},
            {"water": "canal"},
        ):
            info = classify_water(tags, 80_000)
            self.assertEqual(info["depth"], "deep", tags)
            self.assertFalse(info["wade"], tags)

    def test_deep_fountain_basin_stays_shallow(self):
        info = classify_water({"landuse": "basin", "name": "Deep Fountain"}, 400)
        self.assertEqual(info["depth"], "shallow")
        self.assertTrue(info["wade"])

    def test_large_industrial_basin_is_deep(self):
        info = classify_water({"landuse": "basin", "name": "Retentiebekken"}, 12_000)
        self.assertEqual(info["depth"], "deep")

    def test_large_untyped_open_water_is_deep(self):
        info = classify_water({"natural": "water"}, 55_000)
        self.assertEqual(info["depth"], "deep")

    def test_small_untyped_water_is_shallow(self):
        info = classify_water({"natural": "water"}, 200)
        self.assertEqual(info["depth"], "shallow")
        self.assertTrue(info["wade"])


class WaterHoleTests(unittest.TestCase):
    def test_pond_inside_park_becomes_hole(self):
        from cityview.water import water_holes_for_ring

        park = [[0, 0], [100, 0], [100, 100], [0, 100]]
        pond = {"id": 1, "ring": [[20, 20], [40, 20], [40, 40], [20, 40]]}
        holes = water_holes_for_ring(park, [pond])
        self.assertEqual(len(holes), 1)
        self.assertEqual(holes[0][0], [20.0, 20.0])

    def test_water_outside_park_is_not_a_hole(self):
        from cityview.water import water_holes_for_ring

        park = [[0, 0], [10, 0], [10, 10], [0, 10]]
        pond = {"id": 1, "ring": [[50, 50], [60, 50], [60, 60], [50, 60]]}
        self.assertEqual(water_holes_for_ring(park, [pond]), [])

    def test_water_as_large_as_park_is_skipped(self):
        from cityview.water import water_holes_for_ring

        park = [[0, 0], [10, 0], [10, 10], [0, 10]]
        # Same ring → would delete the whole park.
        self.assertEqual(water_holes_for_ring(park, [{"id": 1, "ring": park}]), [])


class ExportWaterTests(unittest.TestCase):
    def test_export_keeps_wade_fields(self):
        pond = annotate_water_entry(
            {"id": 145169574, "ring": [[0, 0], [100, 0], [100, 50], [0, 50]]},
            {"natural": "water", "water": "pond", "name": "Stadsparkvijver"},
        )
        river = annotate_water_entry(
            {"id": 1, "ring": [[0, 0], [1000, 0], [1000, 500], [0, 500]]},
            {"waterway": "river", "name": "Schelde"},
        )
        doc = export_water_for_viewer({"water": [pond, river]})
        self.assertEqual(len(doc["bodies"]), 2)
        by_id = {b["id"]: b for b in doc["bodies"]}
        self.assertTrue(by_id[145169574]["wade"])
        self.assertEqual(by_id[145169574]["depth"], "shallow")
        self.assertEqual(by_id[145169574]["bank"], "natural")
        self.assertLess(by_id[145169574]["bed_y"], 0.0)
        self.assertFalse(by_id[1]["wade"])
        self.assertEqual(by_id[1]["depth"], "deep")
        self.assertEqual(by_id[1]["bed_y"], 0.0)

    def test_survey_quay_is_folded_onto_water_json(self):
        pond = annotate_water_entry(
            {"id": 2, "ring": [[0, 0], [10, 0], [10, 10], [0, 10]]},
            {"natural": "water", "water": "pond", "name": "Dok"},
        )
        doc = export_water_for_viewer(
            {
                "water": [pond],
                "origin": [51.2, 4.4],
                "survey": {
                    "layers": {
                        "quay_numbers": [{"id": 1, "lat": 51.2, "lon": 4.4, "kaainummer": "12"}],
                    }
                },
            }
        )
        self.assertEqual(doc["quay"]["numbers"][0]["n"], "12")
        self.assertIn("Stad Antwerpen", doc["attribution"])


if __name__ == "__main__":

    unittest.main()
