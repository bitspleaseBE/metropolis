import json
import os
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from cityview import district_freshness as fr
from cityview.district_freshness import SHARED, classify

IDS = ("2018-harmonie", "2000-antwerpen")


def _glb(extensions):
    js = json.dumps({"asset": {"version": "2.0"}, "extensionsUsed": extensions}).encode()
    js += b" " * (-len(js) % 4)
    return struct.pack("<III", fr.GLB_MAGIC, 2, 20 + len(js)) + struct.pack("<II", len(js), fr.CHUNK_JSON) + js


class ClassifyTests(unittest.TestCase):
    def test_shared_pipeline_inputs(self):
        for rel in (
            "cityview/osm.py",
            "cityview/districts.py",
            "cityview/glb_compress.py",
            "blender/build_city.py",
            "assets/textures/facade_atlas.jpg",
            "assets/boundaries/antwerp_postcodes.geojson",
            "viewer/cars/bmw_5.glb",
            "scripts/compress_glb.mjs",
        ):
            self.assertEqual(classify(rel, IDS), SHARED, rel)

    def test_tests_tooling_and_viewer_code_are_not_inputs(self):
        for rel in (
            "cityview/test_osm.py",
            "cityview/testdata/landmark_footprints.json",
            "cityview/cli.py",
            "cityview/district_review.py",
            "cityview/district_freshness.py",
            "assets/references/klein-antwerpen/aerial_ortho.jpg",
            "viewer/index.html",
            "viewer/players.js",
            "viewer/districts/2018-harmonie/core.glb",
            "scripts/build_all_districts.py",
            "docs/city-pipeline.md",
            ".github/workflows/pages.yml",
            "districts/index.json",
        ):
            self.assertIsNone(classify(rel, IDS), rel)

    def test_district_sources_belong_to_their_district(self):
        self.assertEqual(classify("districts/2018-harmonie/cache/osm.json", IDS), "2018-harmonie")
        self.assertEqual(classify("districts/2000-antwerpen/shop_overrides.json", IDS), "2000-antwerpen")
        self.assertEqual(classify("districts/2000-antwerpen/facades/elevations/facade_01.jpg", IDS), "2000-antwerpen")
        self.assertIsNone(classify("districts/9999-nowhere/district.json", IDS))

    def test_review_outputs_are_not_district_inputs(self):
        for sub in ("review/LATEST.md", "references/index.json", "buildings/catalog.html", "special_buildings.json"):
            self.assertIsNone(classify(f"districts/2018-harmonie/{sub}", IDS), sub)


class DiffTests(unittest.TestCase):
    def test_diff_marks_added_removed_edited(self):
        old = {"a": "1", "b": "2", "c": "3"}
        new = {"a": "1", "b": "9", "d": "4"}
        self.assertEqual(fr.diff_inputs(old, new), ["~b", "-c", "+d"])


class StampTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self._write("cityview/osm.py", "x = 1\n")
        self._write("cityview/test_osm.py", "pass\n")
        self._write("districts/2018-harmonie/district.json", "{}\n")
        self._write("districts/2018-harmonie/shop_overrides.json", "{}\n")
        self._write("districts/2000-antwerpen/district.json", "{}\n")
        self._git("init", "-q")
        self._git("add", "-A")
        env = {k: v for k, v in os.environ.items() if not k.startswith("GITHUB_")}
        self._env = mock.patch.dict(os.environ, env, clear=True)
        self._env.start()

    def tearDown(self):
        self._env.stop()
        self._tmp.cleanup()

    def _write(self, rel, text):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def _git(self, *args):
        subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def _stale(self):
        return {s.district: s for s in fr.stale_districts(IDS, self.root)}

    def test_unstamped_packages_are_stale(self):
        self.assertEqual(set(self._stale()), set(IDS))

    def test_stamp_then_shared_edit_staleness(self):
        for did in IDS:
            fr.write_stamp(did, build_seconds=12.3, root=self.root)
        self.assertEqual(self._stale(), {})
        self._write("cityview/test_osm.py", "changed\n")
        self.assertEqual(self._stale(), {})
        self._write("cityview/osm.py", "x = 2\n")
        stale = self._stale()
        self.assertEqual(set(stale), set(IDS))
        self.assertEqual(stale["2018-harmonie"].changes, ["~cityview/osm.py"])
        self.assertTrue(stale["2018-harmonie"].shared_changed)

    def test_district_edit_only_stales_that_district(self):
        for did in IDS:
            fr.write_stamp(did, root=self.root)
        self._write("districts/2000-antwerpen/district.json", '{"spawn": 1}\n')
        self.assertEqual(set(self._stale()), {"2000-antwerpen"})

    def test_untracked_files_are_not_inputs(self):
        fr.write_stamp("2018-harmonie", root=self.root)
        self._write("districts/2018-harmonie/cache/new.json", "{}\n")
        self.assertNotIn("2018-harmonie", self._stale())
        self._git("add", "-A")
        self.assertEqual(self._stale()["2018-harmonie"].changes, ["+districts/2018-harmonie/cache/new.json"])

    def test_republish_restamps_only_covered_inputs(self):
        fr.write_stamp("2018-harmonie", root=self.root)
        self._write("districts/2018-harmonie/shop_overrides.json", '{"by_osm": {}}\n')
        self.assertFalse(fr.restamp_after_republish("2018-harmonie", "interiors", self.root))
        self.assertTrue(fr.restamp_after_republish("2018-harmonie", "shops", self.root))
        self.assertNotIn("2018-harmonie", self._stale())

        self._write("districts/2018-harmonie/shop_overrides.json", '{"by_name": {}}\n')
        self._write("cityview/osm.py", "x = 3\n")
        self.assertFalse(fr.restamp_after_republish("2018-harmonie", "shops", self.root))
        self.assertIn("2018-harmonie", self._stale())

    def test_uncompressed_glbs(self):
        pkg = self.root / "viewer" / "districts" / "2018-harmonie"
        (pkg / "chunks").mkdir(parents=True)
        (pkg / "core.glb").write_bytes(_glb(["EXT_meshopt_compression", "KHR_mesh_quantization"]))
        (pkg / "chunks" / "c_0_0.glb").write_bytes(_glb([]))
        (pkg / "chunks" / "c_0_0.glb.premeshopt.glb").write_bytes(_glb([]))
        self.assertEqual(
            fr.uncompressed_glbs("2018-harmonie", self.root),
            ["viewer/districts/2018-harmonie/chunks/c_0_0.glb"],
        )

    def test_report_exit_codes(self):
        with mock.patch("builtins.print"):
            for did in IDS:
                fr.write_stamp(did, root=self.root)
            self.assertEqual(fr.report(list(IDS), root=self.root), 0)
            self._write("cityview/osm.py", "x = 4\n")
            self.assertEqual(fr.report(list(IDS), root=self.root), 1)
            with mock.patch.dict(os.environ, {"ALLOW_STALE_DISTRICTS": "1"}):
                self.assertEqual(fr.report(list(IDS), root=self.root), 0)


if __name__ == "__main__":
    unittest.main()
