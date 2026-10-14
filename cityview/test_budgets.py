import json
import struct
import tempfile
import unittest
from pathlib import Path

from cityview import budgets


def _write_glb(path: Path, doc: dict, pad_bytes: int = 0) -> None:
    js = json.dumps(doc).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js
    if pad_bytes:
        body += struct.pack("<I4s", pad_bytes, b"BIN\x00") + b"\0" * pad_bytes
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


DOC = {
    "accessors": [{"count": 36}, {"count": 24}, {"count": 50}],
    "meshes": [
        {"primitives": [{"indices": 0, "attributes": {"POSITION": 1}}]},
        {"primitives": [{"attributes": {"POSITION": 1}, "mode": 1}]},  # lines: no triangles
    ],
    "nodes": [
        {"mesh": 0},
        {"mesh": 0, "extensions": {"EXT_mesh_gpu_instancing": {"attributes": {"TRANSLATION": 2}}}},
        {"mesh": 1},
        {"name": "empty"},
    ],
}


class TestBudgets(unittest.TestCase):
    def test_instances_count_per_copy(self):
        t = budgets.glb_triangles(DOC)
        self.assertEqual(t["tris"], 12 + 12 * 50)
        self.assertEqual(t["instanced_tris"], 600)

    def test_package_report_flags_heavy_chunk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "chunks").mkdir()
            _write_glb(root / "core.glb", DOC)
            _write_glb(root / "chunks" / "c_0_0.glb", DOC)
            heavy = dict(DOC, accessors=[{"count": 3 * budgets.CHUNK_MAX_TRIS + 3}, {"count": 3}, {"count": 1}])
            _write_glb(root / "chunks" / "c_1_0.glb", heavy)
            rep = budgets.package_report(root)
            self.assertEqual(rep["chunks"], 2)
            self.assertEqual(len(rep["errors"]), 1)
            self.assertIn("c_1_0.glb", rep["errors"][0])

    def test_rejects_non_glb(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "x.glb"
            p.write_bytes(b"nope" * 8)
            with self.assertRaises(ValueError):
                budgets.glb_json(p)


if __name__ == "__main__":
    unittest.main()
