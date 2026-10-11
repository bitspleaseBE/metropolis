from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
PHOTOS = ASSETS / "photos"
MAPS = ASSETS / "maps"
OSM_CACHE = ASSETS / "osm"
GTFS_CACHE = ASSETS / "gtfs"
TREES_CACHE = ASSETS / "trees"
BENCHES_CACHE = ASSETS / "benches"
VELO_CACHE = ASSETS / "velo"
BOUNDARIES = ASSETS / "boundaries"
DISTRICTS = ROOT / "districts"
SCENES = ROOT / "scenes"
BLENDER_SCRIPTS = ROOT / "blender"
OUTPUT = ROOT / "output"
VIEWER = ROOT / "viewer"
VIEWER_DISTRICTS = VIEWER / "districts"

DEFAULT_BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
DEFAULT_SCENE = SCENES / "antwerp_side_street.json"
DEFAULT_PLACES = SCENES / "antwerp_places.json"


def is_allowed_cache_json(path: Path, legacy_root: Path) -> bool:
    """True if ``path`` is a .json under the legacy assets cache or ``districts/*/cache/``."""
    resolved = Path(path).resolve()
    if resolved.suffix != ".json":
        return False
    root = legacy_root.resolve()
    if root in resolved.parents:
        return True
    districts = DISTRICTS.resolve()
    try:
        rel = resolved.relative_to(districts)
    except ValueError:
        return False
    parts = rel.parts
    # districts/<id>/cache/<name>.json
    return len(parts) >= 3 and parts[1] == "cache"
