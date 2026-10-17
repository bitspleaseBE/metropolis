"""Municipal survey overlays — no network."""

from __future__ import annotations

import math
import unittest

from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon
from cityview.signals import in_carriageway
from cityview.survey import (
    city_clutter_items,
    classify_marking,
    enrich_roads_payload,
    export_quay,
    geometric_pole,
    overlay_speeds,
    parse_speed_kmh,
    pick_city_pole,
)

ORIGIN = (51.2, 4.4)


def _ll(x: float, y: float) -> tuple[float, float]:
    lat = ORIGIN[0] + y / METERS_PER_DEG_LAT
    lon = ORIGIN[1] + x / meters_per_deg_lon(ORIGIN[0])
    return lat, lon


def _road() -> dict:
    return {"id": 1, "kind": "residential", "width": 6.0, "points": [[-40.0, 0.0], [40.0, 0.0]]}


class ClassifyTests(unittest.TestCase):
    def test_speed_parses_zone_text(self):
        self.assertEqual(parse_speed_kmh("Zone 30"), 30.0)
        self.assertEqual(parse_speed_kmh("50 km/u"), 50.0)
        self.assertIsNone(parse_speed_kmh("wandelzone"))

    def test_marking_kinds(self):
        self.assertEqual(classify_marking("Zebrapad", "Wit"), "zebra")
        self.assertEqual(classify_marking("Stopstreep"), "stop")
        self.assertEqual(classify_marking("Haaientanden"), "give_way")
        self.assertEqual(classify_marking("Voorsorteerpijl"), "arrow")
        self.assertEqual(classify_marking("Fietssuggestiestrook"), "bike")


class PoleTests(unittest.TestCase):
    def test_city_pole_on_the_kerb_is_used(self):
        poles = [(0.0, 4.2, "P1"), (0.0, 0.0, "in-road")]
        used: set[int] = set()
        hit = pick_city_pole(0.0, 2.0, 0.0, 1.0, 3.0, poles, [_road()], used)
        self.assertIsNotNone(hit)
        self.assertEqual(hit[2], 0)
        self.assertFalse(in_carriageway(hit[0], hit[1], [_road()]))

    def test_in_road_pole_is_never_kept(self):
        poles = [(0.0, 0.1, "asphalt")]
        self.assertIsNone(pick_city_pole(0.0, 2.0, 0.0, 1.0, 3.0, poles, [_road()], set()))

    def test_geometric_pole_stays_off_asphalt(self):
        geo = geometric_pole(0.0, 2.4, 1.0, 0.0, 6.0, [_road()])
        self.assertIsNotNone(geo)
        self.assertFalse(in_carriageway(geo[0], geo[1], [_road()]))


class OverlayTests(unittest.TestCase):
    def test_city_speed_wins_over_the_urban_default(self):
        lat0, lon0 = _ll(-10.0, 0.0)
        lat1, lon1 = _ll(10.0, 0.0)
        roads = [{"points": [[-10.0, 0.0], [10.0, 0.0]], "speedKmh": 30.0, "maxspeedKmh": None}]
        stats = overlay_speeds(
            roads,
            [{"SNELHEID": "50", "line": [[lon0, lat0], [lon1, lat1]]}],
            ORIGIN,
        )
        self.assertEqual(roads[0]["speedKmh"], 50.0)
        self.assertEqual(stats["city"], 1)

    def test_enrich_folds_markings_and_share_zones(self):
        lat, lon = _ll(2.0, 3.0)
        payload = enrich_roads_payload(
            {"roads": [{"points": [[0.0, 0.0], [8.0, 0.0]], "speedKmh": 30.0}], "spawn": {"x": 0.0, "y": 0.0}},
            {
                "survey": {
                    "attribution": "Street survey: test",
                    "layers": {
                        "markings": [
                            {
                                "Type": "Zebrapad",
                                "Kleur": "Wit",
                                "ring": [[lon, lat], [lon + 0.00002, lat], [lon + 0.00002, lat + 0.00002]],
                            }
                        ],
                        "share_zones": [
                            {
                                "kind": "drop",
                                "ring": [[lon, lat], [lon + 0.00004, lat], [lon + 0.00004, lat + 0.00004]],
                            }
                        ],
                    },
                }
            },
            ORIGIN,
        )
        self.assertEqual(payload["markings"][0]["k"], "zebra")
        self.assertEqual(payload["shareZones"][0]["k"], "drop")
        self.assertIn("Street survey", payload["attribution"])
        self.assertEqual(payload["origin"], list(ORIGIN))


class ClutterAndQuayTests(unittest.TestCase):
    def test_city_clutter_skips_private_chargers_and_lockers(self):
        lat, lon = _ll(5.0, 6.0)
        items = city_clutter_items(
            {
                "layers": {
                    "chargers": [{"id": 1, "lat": lat, "lon": lon, "Publiek": "nee"}],
                    "bike_lockers": [
                        {"id": 2, "lat": lat, "lon": lon, "Type_fietsstalling": "fietslocker", "Aantal_plaatsen": 4}
                    ],
                    "shelters": [{"id": 3, "lat": lat, "lon": lon}],
                    "city_boards": [{"id": 4, "lat": lat, "lon": lon}],
                }
            }
        )
        kinds = [i["kind"] for i in items]
        self.assertEqual(kinds, ["shelter", "city_board"])
        self.assertTrue(all(i["source"] == "city" for i in items))

    def test_quay_projects_mooring_posts(self):
        lat, lon = _ll(12.0, -4.0)
        quay = export_quay(
            {"mooring_posts": [{"id": 1, "lat": lat, "lon": lon, "NUMMER": "12", "HOEK": 90}]},
            ORIGIN,
        )
        self.assertEqual(len(quay["bollards"]), 1)
        self.assertAlmostEqual(quay["bollards"][0]["x"], 12.0, places=1)
        self.assertAlmostEqual(quay["bollards"][0]["y"], -4.0, places=1)
        self.assertAlmostEqual(quay["bollards"][0]["yaw"], math.pi / 2, places=3)


if __name__ == "__main__":
    unittest.main()
