"""Tests for OSM cranes and container stacks in port districts."""

from __future__ import annotations

import math
import unittest

from cityview import port_props as pp
from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon
from cityview.props import export_props_for_viewer

ORIGIN = (51.24, 4.40)


def ll(x: float, y: float) -> tuple[float, float]:
    return (ORIGIN[0] + y / METERS_PER_DEG_LAT, ORIGIN[1] + x / meters_per_deg_lon(ORIGIN[0]))


def node(nid: int, x: float, y: float, **tags):
    lat, lon = ll(x, y)
    return {"type": "node", "id": nid, "lat": lat, "lon": lon, "tags": tags}


class CraneTests(unittest.TestCase):
    def test_node_crane_and_gantry_way(self):
        osm = {
            "elements": [
                node(1, 10.0, 20.0, man_made="crane", **{"crane:type": "portal_crane", "height": "28"}),
                node(2, 0.0, 0.0),
                node(3, 40.0, 0.0),
                {"type": "way", "id": 9, "nodes": [2, 3], "tags": {"man_made": "crane", "crane:type": "container_crane"}},
                node(4, 5.0, 5.0, man_made="crane", **{"crane:type": "tower_crane"}),
            ]
        }
        cranes = pp.plan_port_cranes(osm, ORIGIN)
        self.assertEqual(len(cranes), 2)
        portal = next(c for c in cranes if c["kind"] == "portal")
        self.assertAlmostEqual(portal["x"], 10.0, places=1)
        self.assertEqual(portal["height"], 28.0)
        gantry = next(c for c in cranes if c["kind"] == "gantry")
        self.assertAlmostEqual(gantry["x"], 20.0, places=1)
        self.assertAlmostEqual(gantry["yaw"], 0.0, places=3)
        self.assertAlmostEqual(gantry["span"], 40.0, places=0)
        self.assertEqual(gantry["height"], pp.CRANE_HEIGHT["container_crane"])

    def test_gantry_legs_sit_on_both_rails(self):
        legs = pp.crane_legs({"kind": "gantry", "x": 0.0, "y": 0.0, "yaw": 0.0, "span": 30.0})
        self.assertEqual(len(legs), 4)
        self.assertEqual({round(abs(x)) for x, _, _ in legs}, {15})
        self.assertEqual({round(abs(y)) for _, y, _ in legs}, {round(pp.GANTRY_GAUGE / 2)})


class ContainerTests(unittest.TestCase):
    def _yard(self, tags):
        pts = [(0, 0), (60, 0), (60, 30), (0, 30), (0, 0)]
        elements = [node(10 + i, x, y) for i, (x, y) in enumerate(pts[:-1])]
        ids = [10, 11, 12, 13, 10]
        elements.append({"type": "way", "id": 99, "nodes": ids, "tags": tags})
        return {"elements": elements}

    def test_stack_on_container_yard_aligned_with_its_long_side(self):
        layout = {"port_props": True, "buildings": []}
        out = pp.plan_port_containers(layout, self._yard({"landuse": "industrial", "industrial": "port"}), ORIGIN)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(math.sin(out[0]["yaw"]), 0.0, places=3)
        self.assertEqual(layout["port_cranes"], [])

    def test_generic_industrial_land_gets_no_containers(self):
        layout = {"port_props": True, "buildings": []}
        self.assertEqual(pp.plan_port_containers(layout, self._yard({"landuse": "industrial"}), ORIGIN), [])

    def test_no_stack_inside_a_shed(self):
        layout = {"port_props": True, "buildings": [{"ring": [[10, 5], [50, 5], [50, 25], [10, 25]]}]}
        self.assertEqual(pp.plan_port_containers(layout, self._yard({"landuse": "port"}), ORIGIN), [])

    def test_props_export_collides_with_stacks_and_crane_legs(self):
        layout = {
            "port_containers": [{"kind": "container_stack", "x": 5.0, "y": 5.0, "yaw": 0.0, "rows": 3}],
            "port_cranes": [{"kind": "gantry", "x": 0.0, "y": 0.0, "yaw": 0.0, "span": 20.0}],
        }
        props = export_props_for_viewer(layout, {"x": 0.0, "y": 0.0})
        self.assertEqual(len(props["boxes"]), 1)
        self.assertAlmostEqual(props["boxes"][0][3], pp.CONTAINER_L / 2, places=2)
        self.assertEqual(len(props["trunks"]), 4)


if __name__ == "__main__":
    unittest.main()
