"""Court lines and goals — no network."""

from __future__ import annotations

import math
import unittest

from cityview.courts import court_frame, court_kind, plan_court


def _rect(length: float, width: float) -> list[list[float]]:
    hl, hw = length / 2, width / 2
    return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]


class CourtFrameTests(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(court_kind("voetbalveld"), "football")
        self.assertEqual(court_kind("trapveld"), "trap")
        self.assertEqual(court_kind("basketbalveld (openbaar)"), "basket")
        self.assertIsNone(court_kind("tennisveld"))

    def test_long_axis_is_the_length(self):
        frame = court_frame(_rect(105, 68))
        self.assertIsNotNone(frame)
        assert frame is not None
        self.assertAlmostEqual(frame["length"], 105, delta=0.1)
        self.assertAlmostEqual(frame["width"], 68, delta=0.1)
        self.assertAlmostEqual(frame["cx"], 0, delta=0.1)
        self.assertAlmostEqual(frame["cy"], 0, delta=0.1)

    def test_rotated_rectangle_keeps_its_size(self):
        ring = []
        ang = math.radians(30)
        c, s = math.cos(ang), math.sin(ang)
        for x, y in _rect(40, 20):
            ring.append([x * c - y * s, x * s + y * c])
        frame = court_frame(ring)
        assert frame is not None
        self.assertAlmostEqual(frame["length"], 40, delta=0.2)
        self.assertAlmostEqual(frame["width"], 20, delta=0.2)


class MarkingTests(unittest.TestCase):
    def test_football_pitch_has_boxes_and_full_goals(self):
        court = plan_court(_rect(105, 68), "football", "Test")
        assert court is not None
        self.assertGreater(len(court["lines"]), 8)
        self.assertEqual(len(court["goals"]), 2)
        for goal in court["goals"]:
            self.assertEqual(goal["k"], "goal")
            self.assertAlmostEqual(goal["w"], 7.32, delta=0.05)
            self.assertAlmostEqual(abs(goal["y"]), 52.5, delta=0.2)
        # Mouths face each other: north goal (positive y) looks toward world +Z (yaw 0).
        north = max(court["goals"], key=lambda g: g["y"])
        south = min(court["goals"], key=lambda g: g["y"])
        self.assertAlmostEqual(north["yaw"], 0.0, delta=0.05)
        self.assertAlmostEqual(abs(south["yaw"]), math.pi, delta=0.05)

    def test_trapveld_uses_small_goals(self):
        court = plan_court(_rect(32, 18), "trap")
        assert court is not None
        self.assertEqual(len(court["goals"]), 2)
        for goal in court["goals"]:
            self.assertLess(goal["w"], 5.0)
            self.assertGreater(goal["w"], 3.0)

    def test_basket_has_two_hoops_inside_the_baselines(self):
        court = plan_court(_rect(28, 15), "basket", "Sint-Jansvliet")
        assert court is not None
        self.assertEqual(court["name"], "Sint-Jansvliet")
        hoops = court["goals"]
        self.assertEqual([h["k"] for h in hoops], ["hoop", "hoop"])
        for hoop in hoops:
            self.assertAlmostEqual(hoop["h"], 3.05, delta=0.01)
            self.assertLess(abs(hoop["y"]), 14.0)
            self.assertGreater(abs(hoop["y"]), 10.0)

    def test_tiny_patch_is_dropped(self):
        self.assertIsNone(plan_court(_rect(4, 3), "football"))


if __name__ == "__main__":
    unittest.main()
