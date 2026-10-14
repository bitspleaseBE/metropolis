import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cityview.geo import bbox_covers, project
from cityview.osm import (
    _make_building,
    building_type_for,
    height_for,
    join_pois_to_buildings,
    layout_from_osm,
    style_for,
)
from cityview.shop_brands import normalize_shop_brand as brand_from_tags


class GeoTests(unittest.TestCase):
    def test_origin_is_zero(self):
        self.assertEqual(project(51.22, 4.40, 51.22, 4.40), (0.0, 0.0))

    def test_north_is_positive_y(self):
        x, y = project(51.221, 4.40, 51.22, 4.40)
        self.assertAlmostEqual(x, 0.0, places=3)
        self.assertGreater(y, 100.0)


class CacheCoverageTests(unittest.TestCase):
    def test_bbox_covers(self):
        self.assertTrue(bbox_covers([51.0, 4.0, 51.3, 4.5], (51.1, 4.1, 51.2, 4.4)))
        self.assertFalse(bbox_covers([51.0, 4.0, 51.3, 4.43], (51.1, 4.1, 51.2, 4.44)))
        self.assertFalse(bbox_covers(None, (51.1, 4.1, 51.2, 4.4)))

    def test_fetch_osm_refetches_a_cache_from_a_smaller_box(self):
        import cityview.osm as osm_mod

        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "osm.json"
            cache.write_text(json.dumps({"elements": [{"type": "node", "id": 1}]}))
            bbox = (51.19, 4.38, 51.22, 4.45)
            with mock.patch.object(osm_mod, "_fetch_overpass", return_value={"elements": []}) as fetch:
                fresh = osm_mod.fetch_osm(bbox, cache)
                self.assertEqual(fetch.call_count, 1)
                self.assertEqual(fresh["bbox"], list(bbox))
                osm_mod.fetch_osm(bbox, cache)
                self.assertEqual(fetch.call_count, 1)


class OsmLayoutTests(unittest.TestCase):
    def test_height_from_levels(self):
        self.assertAlmostEqual(height_for({"building:levels": "4"}), 12.6, places=1)

    def test_industrial_style(self):
        self.assertEqual(style_for(1, {"building": "warehouse"}), "prefab-70s")

    def test_historic_church_style(self):
        self.assertEqual(style_for(42, {"building": "church"}, policy="historic"), "church")

    def test_monastery_is_not_a_second_church(self):
        # Heilig Hart klooster is tagged place_of_worship as well as monastery.
        tags = {"building": "monastery", "amenity": "place_of_worship"}
        self.assertEqual(building_type_for(432190363, tags, "historic"), "school")
        ring = [[0.0, 0.0], [40.0, 0.0], [40.0, 16.0], [0.0, 16.0]]
        bldg = _make_building(432190363, ring, tags, "historic")
        self.assertEqual(bldg["building_type"], "school")
        self.assertLess(bldg["height"], 20.0)

    def test_basilica_is_church(self):
        self.assertEqual(
            building_type_for(1, {"building": "basilica", "amenity": "place_of_worship"}, "historic"),
            "church",
        )

    def test_school_and_hospital(self):
        self.assertEqual(building_type_for(1, {"building": "school"}, "historic"), "school")
        self.assertEqual(building_type_for(2, {"building": "hospital"}, "historic"), "hospital")
        self.assertEqual(building_type_for(3, {"amenity": "hospital"}, "default"), "hospital")

    def test_restaurant_and_supermarket(self):
        self.assertEqual(building_type_for(1, {"amenity": "restaurant"}, "historic"), "restaurant")
        self.assertEqual(
            building_type_for(2, {"shop": "supermarket", "brand": "ALDI"}, "historic"),
            "supermarket",
        )

    def test_brand_normalize_exported(self):
        # Re-export convenience: osm helpers use shop_brands
        self.assertEqual(brand_from_tags({"brand": "Lidl"}), "lidl")

    def test_historic_residential_stable(self):
        a = style_for(1001, {"building": "terrace"}, policy="historic")
        b = style_for(1001, {"building": "terrace"}, policy="historic")
        self.assertEqual(a, b)
        self.assertIn(
            a,
            {
                "eclectic",
                "neoclassical",
                "neo-flemish",
                "cream-tile",
                "yellow-brick",
                "red-brick",
                "art-nouveau",
                "art-deco",
                "international",
                "modern-infill",
            },
        )

    def test_historic_tall_apartments(self):
        self.assertIn(
            style_for(9, {"building": "apartments", "building:levels": "8"}, policy="historic"),
            {"art-deco", "international"},
        )

    def test_parses_building_and_road(self):
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": 51.221, "lon": 4.400},
                {"type": "node", "id": 2, "lat": 51.221, "lon": 4.4003},
                {"type": "node", "id": 3, "lat": 51.2212, "lon": 4.4003},
                {"type": "node", "id": 4, "lat": 51.2212, "lon": 4.400},
                {
                    "type": "way",
                    "id": 10,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"building": "yes", "building:levels": "3"},
                },
                {
                    "type": "way",
                    "id": 11,
                    "nodes": [1, 2],
                    "tags": {"highway": "residential"},
                },
                {
                    "type": "way",
                    "id": 12,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"leisure": "park", "name": "Harmoniepark"},
                },
            ]
        }
        layout = layout_from_osm(osm, (51.221, 4.400))
        self.assertEqual(len(layout["buildings"]), 1)
        self.assertEqual(len(layout["roads"]), 1)
        self.assertEqual(len(layout["parks"]), 1)
        self.assertGreater(layout["buildings"][0]["height"], 8.0)
        self.assertIn("street_edges", layout["buildings"][0])
        self.assertIn("roof_shape", layout["buildings"][0])
        self.assertGreaterEqual(layout["buildings"][0]["floors"], 1)

    def test_poi_join_marks_supermarket(self):
        # Square ~30m footprint around origin in local metres via tiny lat/lon delta.
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": 51.2000, "lon": 4.4000},
                {"type": "node", "id": 2, "lat": 51.2000, "lon": 4.4004},
                {"type": "node", "id": 3, "lat": 51.2003, "lon": 4.4004},
                {"type": "node", "id": 4, "lat": 51.2003, "lon": 4.4000},
                {
                    "type": "node",
                    "id": 99,
                    "lat": 51.20015,
                    "lon": 4.4002,
                    "tags": {"shop": "supermarket", "brand": "ALDI", "name": "ALDI"},
                },
                {
                    "type": "way",
                    "id": 10,
                    "nodes": [1, 2, 3, 4, 1],
                    "tags": {"building": "yes", "building:levels": "2"},
                },
            ]
        }
        layout = layout_from_osm(osm, (51.2000, 4.4000), style_policy="historic")
        self.assertEqual(len(layout["buildings"]), 1)
        bldg = layout["buildings"][0]
        self.assertEqual(bldg["building_type"], "supermarket")
        self.assertEqual(bldg.get("brand_key"), "aldi")
        self.assertEqual(bldg.get("name"), "ALDI")
        self.assertTrue(bldg.get("walker_solid"))

    def test_join_pois_helper(self):
        buildings = [
            {
                "id": 1,
                "ring": [[0.0, 0.0], [20.0, 0.0], [20.0, 20.0], [0.0, 20.0]],
                "name": "12",
                "_tags": {"building": "yes"},
            }
        ]
        pois = [{"id": 2, "x": 10.0, "y": 10.0, "tags": {"amenity": "restaurant", "name": "Finch"}}]
        join_pois_to_buildings(buildings, pois)
        self.assertEqual(buildings[0]["_tags"].get("amenity"), "restaurant")
        self.assertEqual(buildings[0]["name"], "Finch")



def _grid_nodes(pts, base=1000, lat0=51.2000, lon0=4.4000):
    """Nodes for local-metre points (x east, y north) near (lat0, lon0)."""
    out = []
    for i, (x, y) in enumerate(pts):
        out.append({"type": "node", "id": base + i, "lat": lat0 + y / 110540.0, "lon": lon0 + x / 69900.0})
    return out


class MultipolygonTests(unittest.TestCase):
    def _osm(self, with_campus=False):
        outer = [(0, 0), (60, 0), (60, 40), (0, 40)]
        hole = [(20, 15), (40, 15), (40, 25), (20, 25)]
        els = _grid_nodes(outer, 1000) + _grid_nodes(hole, 2000)
        els += [
            {"type": "way", "id": 10, "nodes": [1000, 1001, 1002], "tags": {}},
            {"type": "way", "id": 11, "nodes": [1002, 1003, 1000], "tags": {}},
            {"type": "way", "id": 12, "nodes": [2000, 2001, 2002, 2003, 2000], "tags": {}},
            {
                "type": "relation",
                "id": 77,
                "tags": {"type": "multipolygon", "building": "hospital", "building:levels": "3"},
                "members": [
                    {"type": "way", "ref": 10, "role": "outer"},
                    {"type": "way", "ref": 11, "role": "outer"},
                    {"type": "way", "ref": 12, "role": "inner"},
                ],
            },
        ]
        if with_campus:
            campus = [(-20, -20), (90, -20), (90, 70), (-20, 70)]
            els += _grid_nodes(campus, 3000)
            els.append({"type": "way", "id": 20, "nodes": [3000, 3001, 3002, 3003, 3000], "tags": {"amenity": "hospital"}})
        return {"elements": els}

    def test_relation_building_with_hole(self):
        layout = layout_from_osm(self._osm(), (51.2000, 4.4000), style_policy="historic")
        rel = [b for b in layout["buildings"] if b.get("osm_type") == "relation"]
        self.assertEqual(len(rel), 1)
        self.assertEqual(rel[0]["id"], 77)
        self.assertEqual(len(rel[0]["holes"]), 1)
        self.assertEqual(layout["multipolygon_stats"]["holes_added"], 1)

    def test_district_ring_survives_building_loops(self):
        # Postcode ring in [lon, lat]: a 200 m square around the origin.
        ring = [[4.4 + x / 69900.0, 51.2 + y / 110540.0] for x, y in ((-100, -100), (100, -100), (100, 100), (-100, 100))]
        layout = layout_from_osm(self._osm(), (51.2000, 4.4000), style_policy="historic", ring=ring)
        xs = [p[0] for p in layout["boundary_local"]]
        ys = [p[1] for p in layout["boundary_local"]]
        self.assertAlmostEqual(min(xs), -100.0, delta=1.0)
        self.assertAlmostEqual(max(ys), 100.0, delta=1.0)

    def test_campus_outline_not_extruded_when_buildings_inside(self):
        layout = layout_from_osm(self._osm(with_campus=True), (51.2000, 4.4000), style_policy="historic")
        ids = {b["id"] for b in layout["buildings"]}
        self.assertNotIn(20, ids)
        self.assertEqual(layout["multipolygon_stats"]["campus_outlines_dropped"], 1)


class Lod2OnRoadTests(unittest.TestCase):
    BOX = [[-5.0, -5.0], [5.0, -5.0], [5.0, 5.0], [-5.0, 5.0]]

    def _bldg(self, host):
        return {"id": 1, "ring": [list(p) for p in self.BOX], "city3d": {"osm_host": host}}

    def test_unmatched_part_across_a_road_is_dropped(self):
        from cityview.osm import drop_unmatched_lod2_on_roads

        buildings = [self._bldg(None)]
        self.assertEqual(drop_unmatched_lod2_on_roads(buildings, [[[-20.0, 0.0], [20.0, 0.0]]]), [1])
        self.assertEqual(buildings, [])

    def test_matched_part_and_kerb_graze_are_kept(self):
        from cityview.osm import drop_unmatched_lod2_on_roads

        matched = [self._bldg(42)]
        self.assertEqual(drop_unmatched_lod2_on_roads(matched, [[[-20.0, 0.0], [20.0, 0.0]]]), [])
        grazed = [self._bldg(None)]
        # Clips a 1.5 m corner: below the seal length.
        self.assertEqual(drop_unmatched_lod2_on_roads(grazed, [[[4.0, 6.0], [6.5, 3.5]]]), [])
        self.assertEqual(len(grazed), 1)


if __name__ == "__main__":
    unittest.main()
