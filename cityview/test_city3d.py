import unittest

from cityview.city3d import facade_floors, plan_outline, polygon_area_2d, roof_z_at, street_edge_eaves


def _two_level_solid() -> dict:
    """15 m street block (y 0..8) with a 4 m rear annex (y 8..14) in one LOD2 solid."""
    v = [
        [0, 0, 0], [10, 0, 0], [10, 0, 15], [0, 0, 15],  # 0-3 front wall
        [10, 8, 15], [0, 8, 15],  # 4-5 front block roof back edge
        [10, 8, 4], [0, 8, 4], [10, 14, 4], [0, 14, 4],  # 6-9 annex roof
        [10, 14, 0], [0, 14, 0],  # 10-11 rear ground
    ]
    return {
        "ring": [[0, 0], [10, 0], [10, 14], [0, 14]],
        "lod2": {
            "v": v,
            "wall": [[[0, 1, 2, 3]], [[11, 10, 8, 9]]],
            "roof": [[[3, 2, 4, 5]], [[7, 6, 8, 9]]],
        },
    }


class StreetEdgeEavesTests(unittest.TestCase):
    def test_front_wall_eaves_not_annex_roof(self):
        b = _two_level_solid()
        self.assertAlmostEqual(street_edge_eaves(b, [0, 0], [10, 0]), 15.0)
        self.assertAlmostEqual(street_edge_eaves(b, [0, 14], [10, 14]), 4.0)

    def test_roof_fallback_when_wall_removed(self):
        b = _two_level_solid()
        b["lod2"]["wall"] = []
        self.assertAlmostEqual(street_edge_eaves(b, [0, 0], [10, 0]), 15.0)

    def test_no_lod2(self):
        self.assertIsNone(street_edge_eaves({"ring": [[0, 0], [1, 0], [1, 1]]}, [0, 0], [1, 0]))

    def test_roof_z_at(self):
        b = _two_level_solid()
        self.assertAlmostEqual(roof_z_at(b, 5, 4), 15.0)
        self.assertAlmostEqual(roof_z_at(b, 5, 11), 4.0)
        self.assertIsNone(roof_z_at(b, 20, 20))


class PlanOutlineTests(unittest.TestCase):
    def test_triangulated_roof_gives_full_footprint(self):
        # Pilotis tower roof shipped as two triangles; the footprint is the square.
        v = [[0, 0, 40], [10, 0, 40], [10, 10, 40], [0, 10, 40]]
        ring = plan_outline([[[0, 1, 2]], [[0, 2, 3]]], v)
        self.assertEqual(len(ring), 4)
        self.assertAlmostEqual(polygon_area_2d(ring), 100.0)

    def test_stepped_roofs_share_edge(self):
        v = [[0, 0, 30], [10, 0, 30], [10, 5, 30], [0, 5, 30], [10, 12, 20], [0, 12, 20]]
        ring = plan_outline([[[0, 1, 2, 3]], [[3, 2, 4, 5]]], v)
        self.assertAlmostEqual(polygon_area_2d(ring), 120.0)

    def test_t_junction_is_not_a_clean_outline(self):
        # The lower facet's top edge is split by a vertex the upper facet does not have.
        v = [[0, 0, 9], [10, 0, 9], [10, 4, 9], [0, 4, 9], [5, 4, 9], [10, 8, 9], [0, 8, 9]]
        self.assertIsNone(plan_outline([[[0, 1, 2, 4, 3]], [[3, 2, 5, 6]]], v))


class FacadeFloorsTests(unittest.TestCase):
    def test_keeps_floors_when_heights_agree(self):
        self.assertEqual(facade_floors(5, 5, 15.0, 15.8), 5)

    def test_uses_storeys_when_plausible(self):
        self.assertEqual(facade_floors(6, 2, 3.8, 19.0), 6)

    def test_derives_from_height_otherwise(self):
        self.assertEqual(facade_floors(None, 1, 3.8, 19.0), 6)
        self.assertEqual(facade_floors(2, 1, 3.8, 30.0), 10)


if __name__ == "__main__":
    unittest.main()
