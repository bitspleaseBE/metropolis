import unittest

from cityview.place_refs import (
    _commons_file,
    _grid,
    _trusted_upload,
    collect_subjects,
    match_geo_files,
    name_tokens,
    title_match,
)
from cityview.places import is_place, places_as_elements, places_from_elements


class PlacesTests(unittest.TestCase):
    def test_is_place(self):
        self.assertTrue(is_place({"shop": "clothes"}))
        self.assertFalse(is_place({"shop": "vacant"}))
        self.assertTrue(is_place({"amenity": "pub"}))
        self.assertFalse(is_place({"amenity": "bench"}))
        self.assertFalse(is_place({"historic": "memorial"}))  # unnamed
        self.assertTrue(is_place({"historic": "memorial", "name": "Brabo"}))

    def test_way_centre_and_round_trip(self):
        els = [
            {"type": "node", "id": 1, "lat": 51.0, "lon": 4.0},
            {"type": "node", "id": 2, "lat": 51.0, "lon": 4.002},
            {"type": "node", "id": 3, "lat": 51.002, "lon": 4.002},
            {"type": "way", "id": 9, "nodes": [1, 2, 3, 1], "tags": {"shop": "books", "name": "Demian", "foo": "x"}},
            {"type": "node", "id": 4, "lat": 51.1, "lon": 4.1, "tags": {"amenity": "bench"}},
        ]
        places = places_from_elements(els)
        self.assertEqual(len(places), 1)
        p = places[0]
        self.assertAlmostEqual(p["lat"], 51.000667, places=5)
        self.assertNotIn("foo", p["tags"])
        el = places_as_elements({"places": places})[0]
        self.assertEqual(el["center"]["lon"], p["lon"])


class MatchTests(unittest.TestCase):
    def test_tokens_drop_generic_words(self):
        self.assertEqual(name_tokens("Café Den Engel"), ["engel"])
        self.assertEqual(name_tokens("Onze-Lieve-Vrouwekathedraal"), ["vrouwekathedraal"])

    def test_title_match_folds_accents(self):
        self.assertEqual(title_match("Horta Grand Café", "File:Horta Café Grand - Antwerpen (2).jpg"), 1.0)
        self.assertEqual(title_match("Bourla", "File:Antwerpen Stadhuis.jpg"), 0.0)

    def test_commons_file_forms(self):
        self.assertEqual(_commons_file("File:Foo bar.jpg"), "File:Foo bar.jpg")
        self.assertEqual(
            _commons_file("https://commons.wikimedia.org/wiki/File:Foo_bar.jpg"), "File:Foo bar.jpg"
        )
        self.assertEqual(
            _commons_file("https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo_bar.jpg"), "File:Foo bar.jpg"
        )
        self.assertIsNone(_commons_file("Category:Antwerp"))
        self.assertIsNone(_commons_file("https://images.mapillary.com/x/thumb-2048.jpg"))

    def test_downloads_only_from_wikimedia_uploads(self):
        self.assertTrue(_trusted_upload("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/640px-X.jpg"))
        self.assertFalse(_trusted_upload("http://upload.wikimedia.org/x.jpg"))
        self.assertFalse(_trusted_upload("https://upload.wikimedia.org.evil.test/x.jpg"))
        self.assertFalse(_trusted_upload("http://169.254.169.254/latest/meta-data"))

    def test_geo_match_needs_name_and_distance(self):
        files = [
            {"title": "File:Antwerpen - Café Chatleroi.jpg", "lat": 51.21410, "lon": 4.40850},
            {"title": "File:Chatleroi far away.jpg", "lat": 51.2300, "lon": 4.4300},
            {"title": "File:Random street.jpg", "lat": 51.21411, "lon": 4.40851},
        ]
        subject = {"kind": "shopfront", "name": "Chatleroi", "lat": 51.21405, "lon": 4.40845}
        hits = match_geo_files(subject, files, _grid(files))
        self.assertEqual([h["title"] for h in hits], ["File:Antwerpen - Café Chatleroi.jpg"])

    def test_short_shop_names_never_geo_match(self):
        files = [{"title": "File:Bar Oz.jpg", "lat": 51.0, "lon": 4.0}]
        subject = {"kind": "shopfront", "name": "Oz", "lat": 51.0, "lon": 4.0}
        self.assertEqual(match_geo_files(subject, files, _grid(files)), [])

    def test_subjects_merge_dossier_and_places(self):
        dossier = {"buildings": [{"name": "Vleeshuis", "osm_id": 5, "osm_type": "way", "lat": 51.2, "lon": 4.4}]}
        places = [
            {"type": "way", "id": 5, "lat": 51.2, "lon": 4.4, "tags": {"name": "Vleeshuis", "tourism": "museum"}},
            {"type": "node", "id": 6, "lat": 51.2, "lon": 4.4, "tags": {"name": "Den Engel", "amenity": "pub"}},
            {"type": "node", "id": 7, "lat": 51.2, "lon": 4.4, "tags": {"shop": "convenience"}},
        ]
        subjects = collect_subjects(dossier, places, {"lat": 51.2, "lon": 4.4})
        self.assertEqual([(s["kind"], s["name"]) for s in subjects], [("landmark", "Vleeshuis"), ("shopfront", "Den Engel")])
        self.assertEqual(subjects[0]["spawn_distance_m"], 0.0)


if __name__ == "__main__":
    unittest.main()
