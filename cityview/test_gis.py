"""Compact GeoJSON records from the Stad Antwerpen MapServer client."""

from __future__ import annotations

import unittest

from cityview.gis import compact_feature


class CompactFeatureTests(unittest.TestCase):
    def test_point_uses_geojson_lon_lat(self):
        rec = compact_feature(
            {
                "geometry": {"type": "Point", "coordinates": [4.4, 51.22]},
                "properties": {"OBJECTID": 9, "PID": "P-1"},
            },
            geom="point",
            keep=("PID",),
        )
        self.assertEqual(rec["lat"], 51.22)
        self.assertEqual(rec["lon"], 4.4)
        self.assertEqual(rec["PID"], "P-1")
        self.assertEqual(rec["id"], 9)

    def test_line_keeps_lon_lat_order(self):
        rec = compact_feature(
            {
                "geometry": {"type": "LineString", "coordinates": [[4.4, 51.2], [4.401, 51.2]]},
                "properties": {"SNELHEID": "30"},
            },
            geom="line",
            keep=("SNELHEID",),
        )
        self.assertEqual(rec["line"][0], [4.4, 51.2])
        self.assertEqual(rec["SNELHEID"], "30")

    def test_ring_drops_closing_vertex(self):
        rec = compact_feature(
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[4.4, 51.2], [4.401, 51.2], [4.401, 51.201], [4.4, 51.2]]],
                },
                "properties": {"Type": "Zebra"},
            },
            geom="ring",
            keep=("Type",),
        )
        self.assertEqual(len(rec["ring"]), 3)
        self.assertEqual(rec["Type"], "Zebra")


if __name__ == "__main__":
    unittest.main()
