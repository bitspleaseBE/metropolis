import json
import tempfile
import unittest
from pathlib import Path

from cityview.interiors import (
    FootprintIndex,
    door_offset,
    export_interiors_for_viewer,
    interior_template,
    interior_variant,
    js_hash,
    load_interior_overrides,
    plan_interior,
    room_extent,
    size_class,
)

# 20 m street wall along y = 0 (outward normal -y), 12 m deep.
RING = [[0.0, 0.0], [20.0, 0.0], [20.0, 12.0], [0.0, 12.0]]


def _shop(sid=101, kind="cafe", **kw):
    rec = {"id": sid, "name": "Test", "kind": kind, "x": 10.0, "y": 0.0, "nx": 0.0, "ny": -1.0,
           "w": 5.0, "houseW": 6.0, "front": "cafe", "fascia": [0.2, 0.3, 0.4], "accent": [1, 1, 1]}
    rec.update(kw)
    return rec


class TemplateTests(unittest.TestCase):
    def test_kind_mapping(self):
        self.assertEqual(interior_template("supermarket"), "supermarket")
        self.assertEqual(interior_template("convenience"), "grocery")
        self.assertEqual(interior_template("fast_food"), "restaurant")
        self.assertEqual(interior_template("pub"), "bar_coffee")
        self.assertEqual(interior_template("bank"), "bank")
        self.assertEqual(interior_template("hospital"), "care")
        self.assertEqual(interior_template("car_repair"), "garage")
        self.assertIsNone(interior_template("clothes"))
        self.assertIsNone(interior_template(None))

    def test_churches_never_open(self):
        self.assertIsNone(interior_template("place_of_worship"))
        church = _shop(kind="place_of_worship")
        self.assertIsNone(plan_interior(church, None, {"by_osm": {"node/101": {"template": "bar_coffee"}}}))

    def test_former_hospital_stays_shut(self):
        self.assertIsNone(plan_interior(_shop(kind="hospital", name="voormalig ZNA Sint-Erasmus"), None))

    def test_variants(self):
        self.assertEqual(interior_variant("restaurant", _shop(kind="fast_food", front="frituur")), "frituur")
        self.assertEqual(interior_variant("restaurant", _shop(kind="fast_food", front="kebab")), "fastfood")
        self.assertEqual(interior_variant("bar_coffee", _shop(kind="pub")), "brown")
        self.assertEqual(interior_variant("bar_coffee", _shop(kind="cafe")), "coffee")
        self.assertEqual(interior_variant("care", _shop(kind="pharmacy")), "pharmacy")
        self.assertEqual(interior_variant("garage", _shop(kind="car_repair")), "workshop")
        self.assertEqual(interior_variant("garage", _shop(kind="car")), "showroom")


class GeometryTests(unittest.TestCase):
    def test_depth_from_footprint(self):
        depth, wall = room_extent(_shop(), FootprintIndex([{"ring": RING}]))
        self.assertAlmostEqual(depth, 12.0, places=2)
        self.assertAlmostEqual(wall, 20.0, places=2)

    def test_depth_clamped(self):
        deep = [[0.0, 0.0], [20.0, 0.0], [20.0, 80.0], [0.0, 80.0]]
        shallow = [[0.0, 0.0], [20.0, 0.0], [20.0, 2.0], [0.0, 2.0]]
        rec = plan_interior(_shop(kind="pub"), FootprintIndex([{"ring": deep}]))
        self.assertLessEqual(rec["d"], 18.0)
        rec = plan_interior(_shop(kind="pub"), FootprintIndex([{"ring": shallow}]))
        self.assertGreaterEqual(rec["d"], 5.0)

    def test_supermarket_takes_the_street_wall(self):
        rec = plan_interior(_shop(kind="supermarket", front="market"), FootprintIndex([{"ring": RING}]))
        self.assertEqual(rec["w"], 20.0)
        self.assertEqual(rec["template"], "supermarket")
        self.assertGreaterEqual(rec["staff"], 2)

    def test_size_classes(self):
        self.assertEqual(size_class(30.0), "S")
        self.assertEqual(size_class(100.0), "M")
        self.assertEqual(size_class(400.0), "L")


class DoorTests(unittest.TestCase):
    def test_js_hash_matches_viewer(self):
        # Values from viewer/shops.js hash() in node.
        self.assertAlmostEqual(js_hash(3), 0.052770972019061446, places=12)
        self.assertAlmostEqual(js_hash(2405486929 * 7 + 3), 0.9484185266774148, places=12)

    def test_door_is_stable_and_inside_the_bay(self):
        shop = _shop()
        a = door_offset(shop)
        self.assertEqual(a, door_offset(dict(shop)))
        self.assertLess(abs(a), 6.0 * 0.92 / 2)
        self.assertGreater(abs(a), 1.0)

    def test_narrow_front_has_centre_door(self):
        self.assertEqual(door_offset(_shop(houseW=2.5)), 0.0)


class OverrideTests(unittest.TestCase):
    def test_by_osm_beats_by_name_and_sets_fields(self):
        overrides = {
            "by_osm": {"node/101": {"variant": "cocktail", "staff": 4, "customers": 9, "locked": True}},
            "by_name": {"test": {"variant": "coffee"}},
        }
        rec = plan_interior(_shop(kind="bar"), None, overrides)
        self.assertEqual(rec["variant"], "cocktail")
        self.assertEqual((rec["staff"], rec["customers"]), (4, 9))
        self.assertTrue(rec["curated"])
        self.assertTrue(rec["locked"])
        rec = plan_interior(_shop(sid=7, kind="bar"), None, overrides)
        self.assertEqual(rec["variant"], "coffee")

    def test_load_overrides_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "interiors.json"
            p.write_text(json.dumps({"by_name": {"x": {"size": "L"}}}))
            self.assertEqual(load_interior_overrides(p)["by_name"]["x"]["size"], "L")
            self.assertEqual(load_interior_overrides(Path(tmp) / "missing.json"), {})


class ExportTests(unittest.TestCase):
    def test_export_stamps_door_and_skips_retail(self):
        shops = [_shop(sid=1, kind="cafe"), _shop(sid=2, kind="clothes", doorA=1.0, enter="x")]
        out = export_interiors_for_viewer(shops, [{"ring": RING}])
        self.assertEqual([r["id"] for r in out["interiors"]], [1])
        self.assertEqual(shops[0]["enter"], "bar_coffee")
        self.assertEqual(shops[0]["doorA"], out["interiors"][0]["doorA"])
        self.assertNotIn("doorA", shops[1])
        self.assertNotIn("enter", shops[1])

    def test_banks_always_have_an_atm(self):
        rec = plan_interior(_shop(kind="bank", front="bank"), None)
        self.assertTrue(rec["atm"])


if __name__ == "__main__":
    unittest.main()
