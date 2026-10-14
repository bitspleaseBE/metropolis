"""Tests for OSM wall / hedge / fence planning."""

from __future__ import annotations

import math
import unittest

from cityview import barriers as bw
from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon

ORIGIN = (51.2, 4.4)


def ll(x: float, y: float) -> tuple[float, float]:
    return (ORIGIN[0] + y / METERS_PER_DEG_LAT, ORIGIN[1] + x / meters_per_deg_lon(ORIGIN[0]))


def way(wid: int, kind: str, pts: list[tuple[float, float]], **tags):
    return {"id": wid, "kind": kind, "height": tags.pop("height", bw.DEFAULT_HEIGHT[kind]), "surface": "render", "pts": [ll(*p) for p in pts]}


def layout(buildings=(), roads=()):
    return {"buildings": [{"ring": r} for r in buildings], "roads": list(roads), "transit_lines": []}


def square(x, y, s=10.0):
    return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]


class ClassifyTests(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(bw.classify({"barrier": "wall"}), "wall")
        self.assertEqual(bw.classify({"barrier": "retaining_wall"}), "retaining")
        self.assertEqual(bw.classify({"barrier": "hedge"}), "hedge")
        self.assertEqual(bw.classify({"barrier": "fence"}), "fence")
        self.assertIsNone(bw.classify({"barrier": "gate"}))
        self.assertIsNone(bw.classify({"barrier": "wall", "location": "underground"}))
        self.assertIsNone(bw.classify({"barrier": "wall", "layer": "-1"}))
        self.assertIsNone(bw.classify({"highway": "residential"}))

    def test_height_and_surface(self):
        self.assertEqual(bw.parse_height({"height": "2.5"}, "wall"), 2.5)
        self.assertEqual(bw.parse_height({"height": "2,5 m"}, "wall"), 2.5)
        self.assertEqual(bw.parse_height({"height": "99"}, "wall"), bw.MAX_HEIGHT)
        self.assertEqual(bw.parse_height({"height": "tall"}, "hedge"), bw.DEFAULT_HEIGHT["hedge"])
        self.assertEqual(bw.parse_height({}, "fence"), bw.DEFAULT_HEIGHT["fence"])
        self.assertEqual(bw.surface({"material": "brick"}, "wall"), "brick")
        self.assertEqual(bw.surface({}, "wall"), "render")
        self.assertEqual(bw.surface({"material": "wood"}, "wall"), "render")
        self.assertEqual(bw.surface({}, "hedge"), "hedge")

    def test_osm_barriers_reads_ways(self):
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": 51.2, "lon": 4.4},
                {"type": "node", "id": 2, "lat": 51.2, "lon": 4.4005},
                {"type": "way", "id": 9, "nodes": [1, 2], "tags": {"barrier": "wall", "height": "2.2", "material": "brick"}},
                {"type": "way", "id": 10, "nodes": [1, 2], "tags": {"barrier": "gate"}},
                {"type": "way", "id": 11, "nodes": [1], "tags": {"barrier": "wall"}},
            ]
        }
        found = bw.osm_barriers(osm)
        self.assertEqual([f["id"] for f in found], [9])
        self.assertEqual((found[0]["height"], found[0]["surface"]), (2.2, "brick"))

    def test_osm_gates_reads_gate_nodes(self):
        osm = {
            "elements": [
                {"type": "node", "id": 1, "lat": ORIGIN[0], "lon": ORIGIN[1], "tags": {"barrier": "gate"}},
                {"type": "node", "id": 2, "lat": ORIGIN[0], "lon": ORIGIN[1], "tags": {"barrier": "fence"}},
            ]
        }
        gates = bw.osm_gates(osm, ORIGIN)
        self.assertEqual(len(gates), 1)
        self.assertAlmostEqual(gates[0][0], 0.0, delta=0.2)
        self.assertAlmostEqual(gates[0][1], 0.0, delta=0.2)


class PlanTests(unittest.TestCase):
    def plan(self, items, lay=None, spawn=None, bbox=None, gates=None):
        return bw.plan_barriers(lay or layout(), items, ORIGIN, bbox, spawn, gates)

    def test_free_wall_is_one_run_with_its_length(self):
        out = self.plan([way(1, "wall", [(0, 0), (20, 0)])])
        self.assertEqual(len(out["barriers"]), 1)
        run = out["barriers"][0]
        self.assertAlmostEqual(math.hypot(run["x1"] - run["x0"], run["y1"] - run["y0"]), 20.0, delta=0.1)
        self.assertEqual(run["h"], bw.DEFAULT_HEIGHT["wall"])

    def test_wall_through_a_house_is_split_not_drawn_through_it(self):
        lay = layout(buildings=[square(8, -5, 10)])
        out = self.plan([way(1, "wall", [(0, 0), (30, 0)])], lay)
        self.assertEqual(len(out["barriers"]), 2)
        for run in out["barriers"]:
            for x in (run["x0"], run["x1"]):
                self.assertFalse(8 - bw.BUILDING_MARGIN < x < 18 + bw.BUILDING_MARGIN)
        self.assertGreater(out["stats"]["dropped_building"], 0)

    def test_wall_hugging_a_facade_is_dropped(self):
        lay = layout(buildings=[square(0, 0, 20)])
        out = self.plan([way(1, "wall", [(0, -0.1), (20, -0.1)])], lay)
        self.assertEqual(out["barriers"], [])

    def test_gate_node_opens_a_gap_in_the_fence(self):
        out = self.plan([way(1, "fence", [(0, 0), (24, 0)])], gates=[(12.0, 0.0)])
        self.assertGreaterEqual(len(out["barriers"]), 2)
        self.assertGreater(out["stats"]["dropped_gate"], 0)
        for run in out["barriers"]:
            mid_x = 0.5 * (run["x0"] + run["x1"])
            mid_y = 0.5 * (run["y0"] + run["y1"])
            self.assertGreater(math.hypot(mid_x - 12.0, mid_y - 0.0), bw.GATE_CLEAR_M - 0.2)

    def test_footway_crossing_opens_a_gap_in_the_fence(self):
        path = {"id": 9, "kind": "footway", "width": 2.4, "points": [[12.0, -8.0], [12.0, 8.0]]}
        out = self.plan([way(1, "fence", [(0, 0), (24, 0)])], layout(roads=[path]))
        self.assertGreaterEqual(len(out["barriers"]), 2)
        self.assertGreater(out["stats"]["dropped_path"], 0)

    def test_wall_on_a_carriageway_is_dropped(self):
        road = {"id": 5, "kind": "residential", "width": 8.0, "points": [[0.0, 0.0], [40.0, 0.0]]}
        out = self.plan([way(1, "wall", [(0, 0), (30, 0)]), way(2, "wall", [(0, 6.5), (30, 6.5)])], layout(roads=[road]))
        self.assertEqual([r["id"] for r in out["barriers"]], [2])

    def test_hedge_on_the_kerb_side_sidewalk_is_dropped(self):
        road = {"id": 5, "kind": "residential", "width": 8.0, "points": [[0.0, 0.0], [40.0, 0.0]]}
        out = self.plan([way(1, "hedge", [(0, 5), (30, 5)]), way(2, "hedge", [(0, 7), (30, 7)])], layout(roads=[road]))
        self.assertEqual([r["id"] for r in out["barriers"]], [2])
        self.assertGreater(out["stats"]["dropped_sidewalk"], 0)

    def test_hedges_and_fences_are_lod_culled_but_walls_are_not(self):
        items = [way(1, "hedge", [(900, 0), (910, 0)]), way(2, "fence", [(900, 5), (910, 5)]), way(3, "wall", [(900, 10), (910, 10)])]
        out = self.plan(items, spawn=(0.0, 0.0))
        self.assertEqual([r["kind"] for r in out["barriers"]], ["wall"])
        near = self.plan([way(1, "hedge", [(10, 0), (20, 0)])], spawn=(0.0, 0.0))
        self.assertEqual(len(near["barriers"]), 1)

    def test_outside_bbox_dropped(self):
        bbox = (ORIGIN[0] - 0.0005, ORIGIN[1] - 0.0005, ORIGIN[0] + 0.0005, ORIGIN[1] + 0.0005)
        out = self.plan([way(1, "wall", [(-80, 0), (80, 0)])], bbox=bbox)
        self.assertEqual(len(out["barriers"]), 1)
        run = out["barriers"][0]
        self.assertLess(math.hypot(run["x1"] - run["x0"], run["y1"] - run["y0"]), 120.0)

    def test_deterministic_and_attach(self):
        items = [way(1, "wall", [(0, 0), (20, 0)]), way(2, "hedge", [(0, 5), (9, 5)])]
        self.assertEqual(self.plan(items), self.plan(items))
        lay = layout()
        osm = {"elements": []}
        plan = bw.attach_barriers(lay, osm, (51.0, 4.0, 51.4, 4.8), ORIGIN)
        self.assertEqual(lay["barriers"], [])
        self.assertIn("0 runs", bw.summarize(plan))

    def test_overpass_query_fetches_barriers_and_clutter(self):
        from cityview.osm import overpass_query

        q = overpass_query(51.19, 4.40, 51.21, 4.42)
        for kind in bw.BARRIER_KIND:
            self.assertIn(kind, q)
        for needle in (
            'node["barrier"="bollard"]',
            "waste_basket",
            'node["emergency"="fire_hydrant"]',
            "playground",
            'way["amenity"="parking"]',
        ):
            self.assertIn(needle, q)


if __name__ == "__main__":
    unittest.main()
