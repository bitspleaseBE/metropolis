"""mesh_glb writes multi-material GLBs for streamed landmarks."""

from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path

from cityview.landmark_kit import Mesh
from cityview.mesh_glb import write_mesh_glb


def _read_gltf(path: Path) -> dict:
    data = path.read_bytes()
    assert data[:4] == b"glTF"
    jlen = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + jlen])


class MeshGlbTests(unittest.TestCase):
    def test_materials_survive_export(self):
        m = Mesh()
        m.face([(0, 0, 0), (2, 0, 0), (2, 0, 3), (0, 0, 3)], "stone_grey", normal=(0, -1, 0))
        m.face([(0, 0, 3), (2, 0, 3), (1, 0, 4)], "stone_white", normal=(0, -1, 0))
        with tempfile.TemporaryDirectory() as tmp:
            out = write_mesh_glb(m, Path(tmp) / "t.glb")
            gltf = _read_gltf(out)
        names = {mat["name"] for mat in gltf["materials"]}
        self.assertEqual(names, {"stone_grey", "stone_white"})
        prims = gltf["meshes"][0]["primitives"]
        self.assertEqual(len(prims), 2)
        self.assertTrue(all("material" in p for p in prims))
        grey = next(mat for mat in gltf["materials"] if mat["name"] == "stone_grey")
        rgb = grey["pbrMetallicRoughness"]["baseColorFactor"][:3]
        self.assertLess(rgb[0], 0.7)


if __name__ == "__main__":
    unittest.main()
