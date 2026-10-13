"""Walker collision policy and post-build reachability checks."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from cityview.walkability import check_viewer_walkability, walker_gate_from_tags, walker_solid_from_tags


class WalkerSolidTests(unittest.TestCase):
    def test_ordinary_house_is_solid(self):
        self.assertTrue(walker_solid_from_tags({"building": "yes"}))
        self.assertTrue(walker_solid_from_tags({"building": "apartments"}))

    def test_only_public_at_grade_gates_open(self):
        self.assertTrue(walker_gate_from_tags({"barrier": "gate"}))
        self.assertTrue(walker_gate_from_tags({"barrier": "gate", "foot": "yes", "access": "private"}))
        self.assertFalse(walker_gate_from_tags({"barrier": "gate", "access": "no"}))
        self.assertFalse(walker_gate_from_tags({"barrier": "lift_gate", "parking": "underground", "layer": "-1"}))

    def test_open_or_buried_masses_are_not_solid(self):
        self.assertFalse(walker_solid_from_tags({"building": "yes", "location": "underground"}))
        self.assertFalse(walker_solid_from_tags({"building": "yes", "layer": "-1"}))
        self.assertFalse(walker_solid_from_tags({"building": "roof"}))
        self.assertFalse(walker_solid_from_tags({"building": "yes", "leisure": "bandstand"}))
        self.assertFalse(walker_solid_from_tags({"building": "yes", "min_height": "4"}))


class ViewerCheckTests(unittest.TestCase):
    def _write(self, root: Path, name: str, payload: dict) -> None:
        (root / name).write_text(json.dumps(payload) + "\n")

    def test_open_street_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write(root, "buildings.json", {"spawn": {"x": 0, "y": 0}, "buildings": []})
            self._write(
                root,
                "roads.json",
                {
                    "spawn": {"x": 0, "y": 0},
                    "walks": [{"id": 1, "kind": "footway", "width": 3.0, "points": [[0, 0], [20, 0]]}],
                    "roads": [],
                },
            )
            self._write(root, "props.json", {"trunks": [], "boxes": [], "segments": []})
            self._write(root, "velo.json", {"stations": []})
            self.assertEqual(check_viewer_walkability(root), [])

    def test_fence_across_a_path_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write(root, "buildings.json", {"spawn": {"x": 0, "y": 0}, "buildings": []})
            self._write(
                root,
                "roads.json",
                {
                    "spawn": {"x": 0, "y": 0},
                    "walks": [{"id": 7, "kind": "footway", "width": 2.0, "points": [[0, 0], [20, 0]]}],
                    "roads": [],
                },
            )
            self._write(
                root,
                "props.json",
                {"trunks": [], "boxes": [], "segments": [[0.0, 0.0, 20.0, 0.0, 1.2]]},
            )
            self._write(root, "velo.json", {"stations": []})
            errors = check_viewer_walkability(root)
            self.assertTrue(any("footway 7" in e for e in errors), errors)

    def test_courtyard_hole_is_not_a_building_hit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ring = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
            hole = [[-4, -4], [4, -4], [4, 4], [-4, 4]]
            self._write(
                root,
                "buildings.json",
                {"spawn": {"x": 0, "y": 0}, "buildings": [{"id": 1, "ring": ring, "holes": [hole]}]},
            )
            self._write(
                root,
                "roads.json",
                {
                    "spawn": {"x": 0, "y": 0},
                    "walks": [{"id": 2, "kind": "footway", "width": 2.0, "points": [[-2, 0], [2, 0]]}],
                    "roads": [],
                },
            )
            self._write(root, "props.json", {"trunks": [], "boxes": [], "segments": []})
            self._write(root, "velo.json", {"stations": []})
            self.assertEqual(check_viewer_walkability(root), [])

    def test_sealed_gate_fails_when_osm_is_given(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write(root, "buildings.json", {"spawn": {"x": 0, "y": 0}, "buildings": []})
            self._write(root, "roads.json", {"spawn": {"x": 0, "y": 0}, "walks": [], "roads": []})
            self._write(root, "props.json", {"trunks": [], "boxes": [], "segments": [[-8, 0, 8, 0, 0.12]]})
            self._write(root, "velo.json", {"stations": []})
            osm = {
                "elements": [
                    {"type": "node", "id": 1, "lat": 51.2, "lon": 4.4, "tags": {"barrier": "gate"}},
                ]
            }
            errors = check_viewer_walkability(root, osm=osm, origin=(51.2, 4.4))
            self.assertTrue(any("gate" in e for e in errors), errors)

    def test_sealed_path_crossing_fails_when_osm_is_given(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write(root, "buildings.json", {"spawn": {"x": 0, "y": 0}, "buildings": []})
            self._write(root, "roads.json", {"spawn": {"x": 0, "y": 0}, "walks": [], "roads": []})
            self._write(root, "props.json", {"trunks": [], "boxes": [], "segments": [[-8, 0, 8, 0, 0.12]]})
            self._write(root, "velo.json", {"stations": []})
            osm = {
                "elements": [
                    {"type": "node", "id": 1, "lat": 51.2, "lon": 4.4},
                    {"type": "node", "id": 2, "lat": 51.2002, "lon": 4.4},
                    {"type": "node", "id": 3, "lat": 51.2, "lon": 4.4002},
                    {"type": "way", "id": 10, "nodes": [2, 1], "tags": {"highway": "footway"}},
                    {"type": "way", "id": 11, "nodes": [3, 1], "tags": {"barrier": "fence"}},
                ]
            }
            errors = check_viewer_walkability(root, osm=osm, origin=(51.2, 4.4))
            self.assertTrue(any("crossing" in e for e in errors), errors)


class FullRingTests(unittest.TestCase):
    ORIGIN = (51.2, 4.4)

    def _osm(self, extra_tags=None):
        from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon

        def node(i, x, y):
            lat = self.ORIGIN[0] + y / METERS_PER_DEG_LAT
            lon = self.ORIGIN[1] + x / meters_per_deg_lon(self.ORIGIN[0])
            return {"type": "node", "id": i, "lat": lat, "lon": lon}

        tags = {"highway": "residential", **(extra_tags or {})}
        return {
            "elements": [
                node(1, -50.0, 0.0),
                node(2, 50.0, 0.0),
                {"type": "way", "id": 10, "nodes": [1, 2], "tags": tags},
            ]
        }

    BLOCK = {"coverage": "district", "buildings": [{"ring": [[-10, -10], [10, -10], [10, 10], [-10, 10]]}]}

    def test_building_across_street_fails(self):
        from cityview.walkability import check_full_ring_walkability

        errors, stats = check_full_ring_walkability(self.BLOCK, self._osm(), self.ORIGIN)
        self.assertEqual(stats["sealed"], 1)
        self.assertTrue(errors and "full ring" in errors[0])

    def test_building_passage_and_clear_street_pass(self):
        from cityview.walkability import check_full_ring_walkability

        errors, stats = check_full_ring_walkability(self.BLOCK, self._osm({"tunnel": "building_passage"}), self.ORIGIN)
        self.assertEqual((errors, stats["ways"]), ([], 0))
        clear = {"coverage": "district", "buildings": [{"ring": [[-10, 5], [10, 5], [10, 20], [-10, 20]]}]}
        errors, stats = check_full_ring_walkability(clear, self._osm(), self.ORIGIN)
        self.assertEqual((errors, stats["sealed"]), ([], 0))


if __name__ == "__main__":
    unittest.main()
