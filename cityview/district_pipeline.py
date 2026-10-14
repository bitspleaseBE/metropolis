"""District add / build / check pipeline.

``python3 -m cityview district add --postcode 2000``
``python3 -m cityview district build 2018-harmonie``
``python3 -m cityview district check 2000-antwerpen``
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from cityview.benches import attach_benches, summarize as summarize_benches
from cityview.barriers import attach_barriers, summarize as summarize_barriers
from cityview.building_types import BUILDING_TYPES_PATH, attach_palettes, load_building_types, write_building_types
from cityview.clutter import attach_clutter, summarize as summarize_clutter
from cityview.courtyards import attach_courtyards, summarize as summarize_courtyards
from cityview.district_boundary import (
    bbox_to_ring,
    clip_osm_to_ring,
    district_bbox_from_doc,
    find_nationale_bank_anchor,
    postcode_ring,
)
from cityview.district_profile import build_profile
from cityview.districts import (
    DISTRICTS_ROOT,
    ID_2000,
    ID_2018,
    DistrictPaths,
    district_paths,
    ensure_district_dirs,
    load_district,
    load_index,
    viewer_package_files,
    write_district,
    write_index,
)
from cityview.gtfs_delijn import enrich_layout_transit
from cityview.gtfs_nmbs import enrich_layout_trains
from cityview.landmarks import clear_manifest_cache, viewer_landmark_index
from cityview.road_surface import surfaces_from_layout
from cityview.osm import fetch_osm, layout_from_osm
from cityview.paths import BLENDER_SCRIPTS, OUTPUT, ROOT, VIEWER
from cityview.props import export_props_for_viewer
from cityview.water import export_water_for_viewer
from cityview.places import fetch_places
from cityview.shops import district_shop_inputs, export_shops_for_viewer, plan_shops
from cityview.streetscape import (
    export_walker_buildings,
    export_roads_near_spawn,
    export_transit_near_spawn,
    spawn_from_place,
)
from cityview.trees import attach_trees, summarize as summarize_trees
from cityview.velo import attach_velo, export_velo_for_viewer, summarize as summarize_velo
from cityview.walkability import check_viewer_walkability, osm_passages


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def facade_hashes(paths: DistrictPaths) -> dict[str, str]:
    out: dict[str, str] = {}
    elev = paths.facade_elevations
    if not elev.is_dir():
        return out
    for jpg in sorted(elev.glob("facade_*.jpg")):
        out[jpg.name] = _sha256_file(jpg)
    return out


def assert_facades_unique(district_id: str) -> list[str]:
    """Return error strings if this district reuses another district's elevation hashes."""
    mine = facade_hashes(district_paths(district_id))
    if not mine:
        return []
    my_hashes = set(mine.values())
    errors: list[str] = []
    for other in DISTRICTS_ROOT.iterdir():
        if not other.is_dir() or other.name == district_id:
            continue
        other_hashes = facade_hashes(district_paths(other.name))
        overlap = my_hashes & set(other_hashes.values())
        if overlap:
            errors.append(
                f"{district_id} shares {len(overlap)} facade elevation hash(es) with {other.name}"
            )
    return errors


def seed_district_json(district_id: str) -> dict[str, Any]:
    """district.json for a registry district: full postcode ring, registry spawn/policy.

    An existing district.json keeps its origin, profile and hand-tuned extras
    (population, landmark notes …) so a re-seed never shifts local coordinates.
    """
    from cityview.districts import bbox_of_ring, registry_entry

    entry = registry_entry(district_id)
    paths = district_paths(district_id)
    prev: dict[str, Any] = {}
    if paths.district_json.exists():
        prev = json.loads(paths.district_json.read_text())
    ring = postcode_ring(entry["postcode"])
    bbox = bbox_of_ring(ring)
    origin = prev.get("origin") or [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
    doc = dict(prev)
    doc.update(
        {
            "id": district_id,
            "title": entry["title"],
            "menu_name": entry["menu_name"],
            "postcode": entry["postcode"],
            "description": prev.get("description") or entry["summary"],
            "bbox": list(bbox),
            "boundary": ring,
            "origin": list(origin),
            "style_policy": entry["style_policy"],
            "spawn": entry["spawn"],
            "access": entry["access"],
            "standalone": bool(entry.get("standalone")),
            "viewer_glb": "city.glb",
        }
    )
    doc.setdefault("profile", {})
    doc.setdefault("stages", {})
    if entry.get("legacy_viewer_glb"):
        doc["legacy_viewer_glb"] = entry["legacy_viewer_glb"]
    write_district(district_id, doc)
    return doc


def seed_2018_district_json(*, extend_to_bank: bool = True) -> dict[str, Any]:
    """Back-compat alias: 2018 is now the full postcode (the bank lies on its border)."""
    _ = extend_to_bank
    return seed_district_json(ID_2018)


def seed_2000_district_json() -> dict[str, Any]:
    return seed_district_json(ID_2000)


def district_edges() -> list[dict[str, Any]]:
    """Neighbour edges from shared postcode borders (standalone districts excluded)."""
    from cityview.districts import DISTRICT_REGISTRY
    from cityview.postcodes import postcode_main_ring, shared_border_runs

    def thin(run: list[list[float]]) -> list[list[float]]:
        # ~15 m steps; the viewer tests distance to these segments.
        out = [run[0]]
        for p in run[1:]:
            q = out[-1]
            if math.hypot((p[0] - q[0]) * 110540.0, (p[1] - q[1]) * 69800.0) >= 15.0:
                out.append(p)
        if out[-1] != run[-1]:
            out.append(run[-1])
        return [[round(p[0], 6), round(p[1], 6)] for p in out]

    ids = [k for k, v in DISTRICT_REGISTRY.items() if not v.get("standalone")]
    rings = {k: postcode_main_ring(DISTRICT_REGISTRY[k]["postcode"]) for k in ids}
    edges: list[dict[str, Any]] = []
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            runs = shared_border_runs(rings[a], rings[b])
            if not runs:
                continue
            longest = max(runs, key=len)
            gate = longest[len(longest) // 2]
            borders = [thin(r) for r in runs]
            for src, dst in ((a, b), (b, a)):
                edges.append(
                    {
                        "from": src,
                        "to": dst,
                        "label": DISTRICT_REGISTRY[dst]["menu_name"],
                        "gate": {"lat": gate[0], "lon": gate[1]},
                        "border": thin(longest),
                        "borders": borders,
                    }
                )
    return edges


def _package_complete(pkg: Path) -> bool:
    """A package counts as built only once every chunk it lists is on disk (not mid-export)."""
    if (pkg / "city.glb").exists() and not (pkg / "core.glb").exists():
        return True
    if not (pkg / "core.glb").exists() or not (pkg / "chunks.json").exists():
        return False
    try:
        chunks = json.loads((pkg / "chunks.json").read_text()).get("chunks") or []
    except (OSError, ValueError):
        return False
    return all((pkg / str(c.get("file") or "")).is_file() for c in chunks)


def write_districts_index() -> Path:
    from cityview.districts import DISTRICT_REGISTRY, VIEWER_DISTRICTS

    districts = []
    for did, entry in DISTRICT_REGISTRY.items():
        built = _package_complete(VIEWER_DISTRICTS / did)
        districts.append(
            {
                "id": did,
                "title": entry["title"],
                "menu_name": entry["menu_name"],
                "postcode": entry["postcode"],
                "summary": entry["summary"],
                "style_policy": entry["style_policy"],
                "access": entry["access"],
                "standalone": bool(entry.get("standalone")),
                "built": built,
                # Locked until the package exists; gameplay unlock rules plug in here later.
                "unlocked": built,
            }
        )
    doc = {"default": ID_2018, "districts": districts, "edges": district_edges()}
    return write_index(doc)


def district_add(*, postcode: str, district_id: str | None = None, refresh: bool = False) -> dict[str, Any]:
    """Write district.json + profile without running Blender."""
    from cityview.districts import POSTCODE_TO_DISTRICT

    district_id = district_id or POSTCODE_TO_DISTRICT.get(str(postcode))
    if not district_id:
        raise ValueError(
            f"Unsupported postcode {postcode!r} (registry: {', '.join(sorted(POSTCODE_TO_DISTRICT))})"
        )
    doc = seed_district_json(district_id)

    paths = district_paths(district_id)
    ensure_district_dirs(paths)
    bbox = district_bbox_from_doc(doc)
    ring = doc.get("boundary") or bbox_to_ring(bbox)

    cache = paths.osm_cache
    if refresh and cache.exists():
        cache.unlink()
    # Fetch on bbox; clip to ring for the profile.
    osm = fetch_osm(bbox, cache)
    osm = clip_osm_to_ring(osm, ring)
    # Keep a clipped copy for reproducible builds.
    cache.write_text(json.dumps(osm))

    bank = find_nationale_bank_anchor(osm)
    doc.setdefault("seam", {})["nationale_bank"] = {"lat": bank[0], "lon": bank[1]}

    profile = build_profile(osm, ring=ring)
    doc["profile"] = profile
    doc["stages"] = profile.get("stages") or {}
    write_district(district_id, doc)
    write_districts_index()
    from cityview.special_buildings import write_special_buildings_dossier

    write_special_buildings_dossier(district_id, doc, osm)
    print(f"Wrote {paths.district_json}")
    print(f"Profile: {profile.get('summary')} | stages={sorted(k for k,v in doc['stages'].items() if v)}")
    print(f"Landmarks ranked: {len(profile.get('landmarks') or [])}")
    return doc


def _run_blender(job_path: Path) -> None:
    from cityview.cli import blender_bin, run_blender

    run_blender(job_path, BLENDER_SCRIPTS / "build_city.py")


def _compress_glb(path: Path) -> None:
    from cityview.cli import compress_viewer_glb

    compress_viewer_glb(path)


def _publish_package(
    paths: DistrictPaths,
    layout: dict,
    origin: tuple,
    output_dir: Path,
    scene_name: str,
    doc: dict,
    *,
    require_chunks: bool = False,
) -> None:
    from cityview.district_chunks import empty_chunks_manifest, write_chunks_manifest
    from cityview.districts import DISTRICTS_INDEX, VIEWER_DISTRICTS

    ensure_district_dirs(paths)
    # Only the district that owns the legacy Pages city may mirror into viewer/ root;
    # any other district would overwrite Klein Antwerpen's live data.
    mirror_root = bool(doc.get("legacy_viewer_glb"))
    # Viewer needs district.json for origin / seam (Pages only serves viewer/).
    (paths.viewer / "district.json").write_text(json.dumps(doc, indent=2) + "\n")
    write_districts_index()
    if DISTRICTS_INDEX.exists():
        VIEWER_DISTRICTS.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DISTRICTS_INDEX, VIEWER_DISTRICTS / "index.json")

    core_src = output_dir / "core.glb"
    scene_glb = output_dir / f"{scene_name}.glb"
    # Prefer core.glb from chunked export; fall back to scene GLB / legacy name.
    glb_src = core_src if core_src.exists() else scene_glb
    if glb_src.exists():
        dest_core = paths.viewer / "core.glb"
        dest_city = paths.viewer / "city.glb"
        shutil.copy2(glb_src, dest_core)
        shutil.copy2(glb_src, dest_city)
        print(f"Copied {glb_src} -> {dest_core} and {dest_city}")
        _compress_glb(dest_core)
        shutil.copy2(dest_core, dest_city)
        # Legacy Pages filename for 2018.
        if doc.get("legacy_viewer_glb"):
            legacy = VIEWER / doc["legacy_viewer_glb"]
            shutil.copy2(dest_city, legacy)
            print(f"Copied {dest_city} -> {legacy}")
    elif require_chunks:
        raise FileNotFoundError(f"missing core/city GLB under {output_dir} after Blender export")

    # Spatial chunks (always publish a manifest).
    chunks_json = output_dir / "chunks.json"
    if chunks_json.exists():
        shutil.copy2(chunks_json, paths.viewer / "chunks.json")
    else:
        write_chunks_manifest(paths.viewer / "chunks.json", empty_chunks_manifest())
        if require_chunks:
            print(
                f"WARNING: Blender did not write {chunks_json}; "
                f"published empty chunks.json",
                file=sys.stderr,
            )
    chunks_src = output_dir / "chunks"
    chunks_dest = paths.viewer / "chunks"
    if chunks_dest.exists():
        for old in chunks_dest.glob("*.glb"):
            old.unlink()
    chunks_dest.mkdir(parents=True, exist_ok=True)
    if chunks_src.is_dir():
        for glb_ch in sorted(chunks_src.glob("*.glb")):
            target = chunks_dest / glb_ch.name
            shutil.copy2(glb_ch, target)
            _compress_glb(target)
            print(f"Copied {glb_ch} -> {target}")

    # Landmark GLBs
    src_lm = output_dir / "landmarks"
    if src_lm.is_dir():
        for old in paths.viewer_landmarks.glob("*.glb"):
            old.unlink()
        for glb_lm in sorted(src_lm.glob("*.glb")):
            target = paths.viewer_landmarks / glb_lm.name
            shutil.copy2(glb_lm, target)
            _compress_glb(target)
        # Also mirror to viewer/landmarks for back-compat with current streamer.
        if mirror_root:
            legacy_lm = VIEWER / "landmarks"
            legacy_lm.mkdir(parents=True, exist_ok=True)
            for old in legacy_lm.glob("*.glb"):
                old.unlink()
            for glb_lm in paths.viewer_landmarks.glob("*.glb"):
                shutil.copy2(glb_lm, legacy_lm / glb_lm.name)

    layout_for_idx = dict(layout)
    if origin and not layout_for_idx.get("origin"):
        layout_for_idx["origin"] = [origin[0], origin[1]]
    clear_manifest_cache()
    # Point landmark resolver at this district's manifest for the index.
    idx = viewer_landmark_index(layout_for_idx)
    (paths.viewer / "landmarks.json").write_text(json.dumps(idx, indent=2) + "\n")
    if mirror_root:
        (VIEWER / "landmarks.json").write_text(json.dumps(idx, indent=2) + "\n")

    spawn = layout.get("spawn")
    if spawn:
        (paths.viewer / "spawn.json").write_text(json.dumps(spawn, indent=2) + "\n")
        if mirror_root:
            (VIEWER / "spawn.json").write_text(json.dumps(spawn, indent=2) + "\n")

    roads = export_roads_near_spawn(layout, spawn)
    road_surfaces = surfaces_from_layout(layout)
    buildings = export_walker_buildings(layout, spawn)
    transit = export_transit_near_spawn(layout, spawn)
    velo = export_velo_for_viewer(layout.get("velo_stations") or [])
    # shops need osm — stash on layout during build
    osm = layout.get("_osm") or {"elements": []}
    buildings["passages"] = osm_passages(buildings, osm, origin)
    if doc.get("style_policy") == "industrial":
        shops = export_shops_for_viewer([], spawn)
    else:
        shops = export_shops_for_viewer(plan_shops(osm, layout, origin, **district_shop_inputs(paths)), spawn)
    props = export_props_for_viewer(layout, spawn)
    water = export_water_for_viewer(layout)
    from cityview.viewer_map import export_viewer_map

    for name, payload in (
        ("map.json", export_viewer_map(layout)),
        ("roads.json", roads),
        ("road-surfaces.json", road_surfaces),
        ("buildings.json", buildings),
        ("transit.json", transit),
        ("velo.json", velo),
        ("shops.json", shops),
        ("props.json", props),
        ("water.json", water),
    ):
        text = json.dumps(payload) + "\n"
        (paths.viewer / name).write_text(text)
        if mirror_root:
            (VIEWER / name).write_text(text)
        print(f"Wrote {paths.viewer / name}")


def district_build(
    district_id: str,
    *,
    refresh: bool = False,
    no_render: bool = True,
    out: Path | None = None,
    skip_blender: bool = False,
) -> int:
    """Full district build: data → Blender → viewer package → checks."""
    paths = district_paths(district_id)
    from cityview.districts import DISTRICT_REGISTRY

    if not paths.district_json.exists():
        if district_id in DISTRICT_REGISTRY:
            district_add(postcode=DISTRICT_REGISTRY[district_id]["postcode"], district_id=district_id, refresh=refresh)
        else:
            raise FileNotFoundError(f"Run district add first for {district_id}")
    elif district_id in DISTRICT_REGISTRY:
        # Keep boundary / spawn / policy in sync with the registry (origin is preserved).
        seed_district_json(district_id)

    doc = load_district(district_id)
    ensure_district_dirs(paths)
    bbox = district_bbox_from_doc(doc)
    origin = tuple(doc.get("origin") or ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2))
    style_policy = doc.get("style_policy") or "historic"
    stages = doc.get("stages") or {}
    ring = doc.get("boundary")

    # Ensure landmark manifest is discoverable.
    if paths.landmarks_manifest.exists():
        import cityview.landmarks as lm

        lm.MANIFEST_PATH = paths.landmarks_manifest
        lm.LANDMARKS_DIR = paths.landmarks
        clear_manifest_cache()

    # Facades: configure kit to read this district's atlas when present.
    _configure_facade_paths(paths)

    cache = paths.osm_cache
    if refresh and cache.exists():
        cache.unlink()
    osm = fetch_osm(bbox, cache)
    # Clip dense Overpass expansions to the playable ring/bbox so layout stays tractable.
    if ring:
        clipped = clip_osm_to_ring(osm, ring)
        if len(clipped.get("elements") or []) < len(osm.get("elements") or []):
            osm = clipped
            cache.write_text(json.dumps(osm))

    # Every named shop / horeca / sight (the geometry query only whitelists a few shop types).
    try:
        fetch_places(bbox, paths.cache / "places.json", refresh=refresh)
    except Exception as exc:  # noqa: BLE001 — shops fall back to the geometry cache
        print(f"places fetch skipped: {exc}")

    # Refresh bank seam from live OSM when possible.
    bank = find_nationale_bank_anchor(osm)
    doc.setdefault("seam", {})["nationale_bank"] = {"lat": bank[0], "lon": bank[1]}

    city3d_buildings = None
    if stages.get("city3d", True) and doc.get("postcode"):
        from cityview.city3d import load_buildings

        city3d_buildings = load_buildings(doc, refresh=refresh)
        print(f"city3d: {len(city3d_buildings['buildings'])} LOD2 buildings "
              f"from {len(city3d_buildings['sectors'])} sectors")

    layout = layout_from_osm(osm, origin, style_policy=style_policy, city3d=city3d_buildings, ring=ring)
    layout["_osm"] = osm

    if stages.get("gtfs_delijn", True):
        gtfs_cache = paths.gtfs_cache
        if refresh and gtfs_cache.exists():
            gtfs_cache.unlink()
        enrich_layout_transit(layout, origin, bbox, gtfs_cache, refresh=refresh)

    if stages.get("gtfs_nmbs") or stages.get("train_meshes"):
        enrich_layout_trains(layout, origin, bbox, paths.nmbs_cache, refresh=refresh)

    if stages.get("trees", True):
        tree_plan = attach_trees(layout, bbox, origin, paths.trees_cache, refresh=refresh)
        print("trees: " + summarize_trees(tree_plan["stats"]))

    if stages.get("benches", True):
        bench_plan = attach_benches(
            layout, osm, bbox, origin, paths.benches_cache, refresh=refresh, postcode=doc.get("postcode")
        )
        print("benches: " + summarize_benches(bench_plan))

    if stages.get("velo", True):
        velo_plan = attach_velo(layout, bbox, origin, paths.velo_cache, refresh=refresh)
        print("velo: " + summarize_velo(velo_plan))

    # Refresh profile with real velo count.
    velo_n = len(layout.get("velo_stations") or [])
    profile = build_profile(osm, ring=ring, velo_stations=velo_n)
    doc["profile"] = profile
    doc["stages"] = profile.get("stages") or stages
    stages = doc["stages"]
    write_district(district_id, doc)

    if BUILDING_TYPES_PATH.exists():
        types_path = BUILDING_TYPES_PATH
        types_doc = load_building_types(types_path)
    else:
        types_path = write_building_types()
        types_doc = load_building_types(types_path)
    attach_palettes(layout, types_doc)

    # Spawn from district.json (place-shaped).
    place_like = {
        "spawn": doc.get("spawn"),
        "origin": list(origin),
        "bbox": list(bbox),
    }
    spawn = spawn_from_place(place_like, origin, layout) if doc.get("spawn") else None
    if spawn:
        layout["spawn"] = spawn
    spawn_xy = (spawn["x"], spawn["y"]) if spawn else None

    clutter_plan = attach_clutter(layout, osm, bbox, origin, spawn_xy)
    print("street clutter: " + summarize_clutter(clutter_plan))
    barrier_plan = attach_barriers(layout, osm, bbox, origin, spawn_xy)
    print("barriers: " + summarize_barriers(barrier_plan))
    courtyard_plan = attach_courtyards(layout, osm, bbox, origin)
    print("courtyards: " + summarize_courtyards(courtyard_plan))

    # Port props stage: mark layout flag; place containers when footprints exist.
    if stages.get("port_props"):
        layout["port_props"] = True
        from cityview.port_props import plan_port_containers

        n_c = len(plan_port_containers(layout, osm, origin))
        print(f"port_props: {n_c} container stacks, {len(layout.get('port_cranes') or [])} OSM cranes")
    else:
        layout["port_props"] = False
        print("port_props: skipped (no port industry in profile)")

    # Ensure district-local facades exist (2018 migrated; 2000 generated).
    if stages.get("facades", True):
        elev = list(paths.facade_elevations.glob("facade_*.jpg"))
        if len(elev) < 10:
            try:
                from cityview.district_facades import generate_district_facades, pack_district_atlas

                print(f"Generating facades for {district_id}…")
                generate_district_facades(district_id, force=False)
                if not (paths.facade_atlas_dir / "facade_atlas.jpg").exists():
                    pack_district_atlas(district_id)
            except SystemExit as exc:
                print(f"facade generation skipped: {exc}")

    edged = sum(1 for b in layout["buildings"] if b.get("street_edges"))
    print(
        f"{district_id}: {len(layout['buildings'])} buildings, "
        f"{len(layout['roads'])} roads, {edged} street facades, "
        f"{len(layout.get('transit_lines') or [])} transit lines"
    )

    # Per-district output so parallel builds do not clobber each other's landmarks.
    output_dir = Path(out or (OUTPUT / district_id)).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    scene_name = f"district_{district_id.replace('-', '_')}"
    layout_path = output_dir / f"{scene_name}_layout.json"
    # Strip non-JSON helper before write.
    layout_dump = {k: v for k, v in layout.items() if k != "_osm"}
    layout_path.write_text(json.dumps(layout_dump))

    from cityview.jobs import write_job

    job_path = output_dir / f"{scene_name}_job.json"
    job = {
        "root": str(ROOT),
        "output_dir": str(output_dir),
        "scene_name": scene_name,
        "render": not no_render,
        "layout_path": str(layout_path),
        "style_policy": style_policy,
        "building_types_path": str(types_path),
        "district_id": district_id,
        "facade_atlas_dir": str(paths.facade_atlas_dir),
        "landmarks_dir": str(paths.landmarks),
    }
    if spawn:
        job["spawn"] = spawn
    write_job(job_path, job)

    if not skip_blender:
        _run_blender(job_path)
    else:
        print("skip_blender: writing viewer JSON package only")
        # Still ensure a chunks.json exists for the viewer bootstrap.
        from cityview.district_chunks import empty_chunks_manifest, write_chunks_manifest

        if not (output_dir / "chunks.json").exists():
            write_chunks_manifest(output_dir / "chunks.json", empty_chunks_manifest())

    # Re-attach osm for shop export.
    layout["_osm"] = osm
    if spawn:
        layout["spawn"] = spawn
    _publish_package(
        paths,
        layout,
        origin,
        output_dir,
        scene_name,
        doc,
        require_chunks=not skip_blender,
    )

    # Copy atlas into viewer package for debugging (optional).
    if paths.facade_atlas_dir.exists():
        atlas_dest = paths.viewer / "facades"
        atlas_dest.mkdir(exist_ok=True)
        for f in paths.facade_atlas_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, atlas_dest / f.name)

    from cityview.special_buildings import write_special_buildings_dossier
    from cityview.district_review import write_district_review_pack

    write_special_buildings_dossier(district_id, doc, osm)
    write_district_review_pack(district_id, doc)

    errors = district_check(district_id, run_sims=False)
    if errors:
        print("Playability check warnings/errors:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        # Soft-fail when GLB missing (skip_blender); hard-fail otherwise.
        if not skip_blender:
            return 1
    write_districts_index()
    print(f"District {district_id} package at {paths.viewer}")
    return 0


def district_republish_roads(district_id: str) -> Path:
    """Rewrite viewer/districts/<id>/roads.json (walks + driveables) from cached OSM, no Blender.

    Walks use ``VIEWER_WALK_RADIUS_M`` so border handoffs still have a sidewalk graph;
    driveable roads stay spawn-clipped for traffic CPU. Skips City3D — only OSM roads
    matter for the walk graph (same footprint source as shop republish).
    """
    from cityview.road_surface import surfaces_from_layout

    paths = district_paths(district_id)
    doc = load_district(district_id)
    origin = tuple(doc["origin"])
    osm = json.loads(paths.osm_cache.read_text())
    layout = layout_from_osm(
        osm,
        origin,
        style_policy=doc.get("style_policy") or "historic",
        ring=doc.get("boundary"),
    )
    spawn_path = paths.viewer / "spawn.json"
    spawn = json.loads(spawn_path.read_text()) if spawn_path.exists() else layout.get("spawn")
    if spawn:
        layout["spawn"] = spawn
    roads = export_roads_near_spawn(layout, spawn)
    dest = paths.viewer / "roads.json"
    dest.write_text(json.dumps(roads) + "\n")
    print(
        f"Wrote {dest} ({len(roads.get('roads') or [])} roads, "
        f"{len(roads.get('walks') or [])} walks, "
        f"{len(roads.get('cycleways') or [])} cycleways)"
    )
    surfaces = surfaces_from_layout(layout)
    surf_dest = paths.viewer / "road-surfaces.json"
    surf_dest.write_text(json.dumps(surfaces) + "\n")
    print(f"Wrote {surf_dest}")
    return dest


def district_republish_shops(district_id: str) -> Path:
    """Rewrite viewer/districts/<id>/shops.json from cached OSM + places + overrides (no Blender).

    Also culls ``props.json`` colliders to ``VIEWER_PROP_RADIUS_M`` around spawn when that
    file already exists (far solids live in the streamed GLB).
    """
    import math

    from cityview.props import VIEWER_PROP_RADIUS_M

    paths = district_paths(district_id)
    doc = load_district(district_id)
    origin = tuple(doc["origin"])
    osm = json.loads(paths.osm_cache.read_text())
    layout = layout_from_osm(osm, origin, style_policy=doc.get("style_policy") or "historic")
    spawn_path = paths.viewer / "spawn.json"
    spawn = json.loads(spawn_path.read_text()) if spawn_path.exists() else None
    shops = export_shops_for_viewer(plan_shops(osm, layout, origin, **district_shop_inputs(paths)), spawn)
    dest = paths.viewer / "shops.json"
    dest.write_text(json.dumps(shops) + "\n")
    print(f"Wrote {dest} ({len(shops['shops'])} shopfronts)")

    props_path = paths.viewer / "props.json"
    if props_path.exists() and spawn:
        sx, sy = float(spawn["x"]), float(spawn["y"])
        r = VIEWER_PROP_RADIUS_M

        def near(x: float, y: float) -> bool:
            return math.hypot(x - sx, y - sy) <= r

        props = json.loads(props_path.read_text())
        before = sum(len(props.get(k) or []) for k in ("trunks", "boxes", "segments"))
        props["trunks"] = [t for t in (props.get("trunks") or []) if near(float(t[0]), float(t[1]))]
        props["boxes"] = [b for b in (props.get("boxes") or []) if near(float(b[0]), float(b[1]))]
        props["segments"] = [
            s
            for s in (props.get("segments") or [])
            if near(float(s[0]), float(s[1])) or near(float(s[2]), float(s[3]))
        ]
        after = sum(len(props[k]) for k in ("trunks", "boxes", "segments"))
        props_path.write_text(json.dumps(props) + "\n")
        print(f"Wrote {props_path} ({after} colliders, was {before}, ≤{r:.0f} m)")
    return dest


def district_republish_map(district_id: str) -> Path:
    """Rewrite map.json + district-wide buildings.json from cached OSM / CityJSON (no Blender)."""
    from cityview.viewer_map import export_viewer_map

    paths = district_paths(district_id)
    doc = load_district(district_id)
    origin = tuple(doc["origin"])
    osm = json.loads(paths.osm_cache.read_text())
    city3d_buildings = None
    if (doc.get("stages") or {}).get("city3d", True) and doc.get("postcode"):
        from cityview.city3d import load_buildings

        city3d_buildings = load_buildings(doc)
    layout = layout_from_osm(
        osm,
        origin,
        style_policy=doc.get("style_policy") or "historic",
        city3d=city3d_buildings,
        ring=doc.get("boundary"),
    )
    spawn_path = paths.viewer / "spawn.json"
    spawn = json.loads(spawn_path.read_text()) if spawn_path.exists() else None
    dest = paths.viewer / "map.json"
    payload = export_viewer_map(layout)
    dest.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"Wrote {dest} ({len(payload['roads'])} roads, {len(payload['water'])} water, "
          f"{len(payload['parks'])} parks)")
    buildings = export_walker_buildings(layout, spawn)
    buildings["passages"] = osm_passages(buildings, osm, origin)
    (paths.viewer / "buildings.json").write_text(json.dumps(buildings) + "\n")
    print(
        f"Wrote {paths.viewer / 'buildings.json'} ({len(buildings['buildings'])} footprints, "
        f"{len(buildings['passages'])} passage corridors)"
    )
    # The play ring + border handoff read the postcode boundary from the viewer copy.
    (paths.viewer / "district.json").write_text(json.dumps(doc, indent=2) + "\n")
    return dest


def _configure_facade_paths(paths: DistrictPaths) -> None:
    """Point facade_kit / facade_textures at this district's elevations + atlas."""
    import cityview.facade_kit as kit

    kit.DISTRICT_FACADE_ELEVATIONS = paths.facade_elevations
    kit.DISTRICT_FACADE_ATLAS = paths.facade_atlas_dir
    # Prefer district atlas when present.
    atlas = paths.facade_atlas_dir / kit.ATLAS_FILE
    if atlas.exists():
        kit.ACTIVE_ATLAS_DIR = paths.facade_atlas_dir
    else:
        kit.ACTIVE_ATLAS_DIR = None


def district_rechunk(district_id: str, *, out: Path | None = None) -> int:
    """Migration helper: peel spatial chunks from an existing .blend without a full rebuild.

    Normal path is ``district build`` (Blender export peels automatically). Use this only
    when a pre-chunk ``.blend`` already exists (e.g. Antwerpen 2000).
    """
    from cityview.jobs import write_job

    paths = district_paths(district_id)
    if not paths.district_json.exists():
        raise FileNotFoundError(paths.district_json)
    doc = load_district(district_id)
    scene_name = f"district_{district_id.replace('-', '_')}"
    output_dir = Path(out or OUTPUT).resolve()
    # Prefer per-district output dir, then flat legacy path used by earlier builds.
    candidates = [
        (OUTPUT / district_id).resolve() / f"{scene_name}.blend",
        output_dir / district_id / f"{scene_name}.blend",
        output_dir / f"{scene_name}.blend",
        OUTPUT / f"{scene_name}.blend",
    ]
    blend = next((p for p in candidates if p.exists()), None)
    if blend is None:
        raise FileNotFoundError(
            f"No {scene_name}.blend found under {OUTPUT} — run district build first"
        )
    work_dir = blend.parent
    layout_path = work_dir / f"{scene_name}_layout.json"
    if not layout_path.exists():
        raise FileNotFoundError(layout_path)
    layout = json.loads(layout_path.read_text())
    job_path = work_dir / f"{scene_name}_chunks_job.json"
    job = {
        "root": str(ROOT),
        "output_dir": str(work_dir),
        "scene_name": scene_name,
        "render": False,
        "layout_path": str(layout_path),
        "chunks_only": True,
        "blend_path": str(blend),
        "district_id": district_id,
        "landmarks_dir": str(paths.landmarks),
        "facade_atlas_dir": str(paths.facade_atlas_dir),
    }
    if layout.get("spawn"):
        job["spawn"] = layout["spawn"]
    write_job(job_path, job)
    print(f"Re-peeling chunks from {blend} …")
    _run_blender(job_path)
    core_out = work_dir / "core.glb"
    chunks_json = work_dir / "chunks.json"
    if not core_out.exists() or not chunks_json.exists():
        raise RuntimeError(
            f"Blender chunks peel did not write core.glb / chunks.json under {work_dir}"
        )
    origin = tuple(doc["origin"]) if doc.get("origin") else (0.0, 0.0)
    _publish_package(
        paths,
        layout,
        origin,
        work_dir,
        scene_name,
        doc,
        require_chunks=True,
    )
    errors = district_check(district_id, run_sims=False)
    if errors:
        print("Playability check warnings/errors:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(f"District {district_id} chunks published at {paths.viewer}")
    return 0


def district_check(district_id: str, *, run_sims: bool = True) -> list[str]:
    """Return a list of error strings (empty = pass)."""
    paths = district_paths(district_id)
    errors: list[str] = []
    if not paths.district_json.exists():
        return [f"missing {paths.district_json}"]

    doc = load_district(district_id)
    profile = doc.get("profile") or {}
    stages = doc.get("stages") or profile.get("stages") or {}
    modes = profile.get("modes") or {}

    for name in viewer_package_files():
        if name == "city.glb":
            continue  # checked below
        p = paths.viewer / name
        if not p.exists():
            # Fall back to legacy viewer root for gradual migration.
            if not (VIEWER / name).exists():
                errors.append(f"missing viewer file {name}")

    core = paths.viewer / "core.glb"
    glb = paths.viewer / "city.glb"
    legacy = VIEWER / (doc.get("legacy_viewer_glb") or "klein_antwerpen.glb")
    if not core.exists() and not glb.exists() and not legacy.exists():
        errors.append("missing core.glb / city.glb (and legacy GLB)")

    chunks_path = paths.viewer / "chunks.json"
    if not chunks_path.exists():
        errors.append("missing chunks.json (district build should always emit it)")
    else:
        try:
            cdoc = json.loads(chunks_path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"chunks.json invalid: {exc}")
            cdoc = {}
        for ch in cdoc.get("chunks") or []:
            rel = ch.get("file") or ""
            if not rel:
                errors.append(f"chunk entry missing file: {ch!r}")
                continue
            if not (paths.viewer / rel).exists():
                errors.append(f"missing chunk GLB {rel}")

    if core.exists():
        from cityview.budgets import package_report, summarize

        try:
            budget = package_report(paths.viewer)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            errors.append(f"budget report failed: {exc}")
        else:
            print(f"Budget: {summarize(budget)}")
            errors.extend(budget["errors"])

    spawn_path = paths.viewer / "spawn.json"
    if not spawn_path.exists():
        spawn_path = VIEWER / "spawn.json"
    if spawn_path.exists():
        spawn = json.loads(spawn_path.read_text())
        buildings_path = paths.viewer / "buildings.json"
        if not buildings_path.exists():
            buildings_path = VIEWER / "buildings.json"
        if buildings_path.exists():
            bdoc = json.loads(buildings_path.read_text())
            sx, sy = spawn.get("x"), spawn.get("y")
            if sx is not None and sy is not None:
                for b in bdoc.get("buildings") or []:
                    ring = b.get("ring") or b.get("points") or []
                    if not _point_in_local_ring(sx, sy, ring):
                        continue
                    if any(_point_in_local_ring(sx, sy, h) for h in b.get("holes") or []):
                        continue
                    errors.append("spawn sits inside a building footprint")
                    break
    else:
        errors.append("missing spawn.json")

    transit_path = paths.viewer / "transit.json"
    if not transit_path.exists():
        transit_path = VIEWER / "transit.json"
    if transit_path.exists():
        tdoc = json.loads(transit_path.read_text())
        path_modes = {p.get("mode") for p in (tdoc.get("paths") or [])}
        for mode, wanted in modes.items():
            if mode in {"water", "port", "velo", "premetro"}:
                continue
            if wanted and mode not in path_modes and mode != "bus":
                # bus may be absent in small tiles; only require when stage says so
                if mode == "train" and stages.get("gtfs_nmbs"):
                    # Soft: NMBS may be empty in historic core without Centraal in polygon
                    pass
                elif mode == "tram" and stages.get("gtfs_delijn"):
                    if "tram" not in path_modes and "subway" not in path_modes:
                        errors.append(f"profile wants {mode} but transit.json has no such paths")
            if not wanted and mode in path_modes and mode == "train":
                errors.append("profile has no train but transit.json has train paths")

    # Streamed landmarks must have GLBs when listed.
    lm_path = paths.viewer / "landmarks.json"
    if not lm_path.exists():
        lm_path = VIEWER / "landmarks.json"
    if lm_path.exists():
        ldoc = json.loads(lm_path.read_text())
        for lm in ldoc.get("landmarks") or []:
            if not lm.get("stream") and not lm.get("custom"):
                continue
            lid = str(lm.get("id") or "")
            glb_lm = paths.viewer_landmarks / f"{lid}.glb"
            legacy_lm = VIEWER / "landmarks" / f"{lid}.glb"
            if not glb_lm.exists() and not legacy_lm.exists():
                # Only error for explicitly streamed entries.
                if lm.get("stream"):
                    errors.append(f"missing landmark GLB for streamed id {lid}")

    errors.extend(assert_facades_unique(district_id))

    osm_doc: dict[str, Any] = {}
    if paths.osm_cache.exists():
        try:
            osm_doc = json.loads(paths.osm_cache.read_text())
        except json.JSONDecodeError:
            osm_doc = {}
    origin = tuple(doc.get("origin") or (0.0, 0.0))
    errors.extend(
        check_viewer_walkability(
            paths.viewer,
            osm=osm_doc or None,
            origin=origin if origin != (0.0, 0.0) else None,
        )
    )

    shops_path = paths.viewer / "shops.json"
    if shops_path.exists():
        try:
            sdoc = json.loads(shops_path.read_text())
        except json.JSONDecodeError:
            sdoc = {}
        named_profile = [s for s in (doc.get("profile") or {}).get("shops") or [] if s]
        if named_profile and not (sdoc.get("shops") or []) and doc.get("style_policy") != "industrial":
            errors.append(
                "shops.json is empty but profile.shops lists named places — re-publish with OSM POIs"
            )

    # Gate reachability: neighbour gates should sit inside (or on) the district bbox.
    # roads.json is spawn-radius clipped, so we do not require a near-spawn road hit.
    index = load_index()
    if doc.get("bbox"):
        south, west, north, east = (float(v) for v in doc["bbox"])
        pad = 0.002  # ~200 m
        for edge in index.get("edges") or []:
            if edge.get("from") != district_id:
                continue
            gate = edge.get("gate") or {}
            if "lat" not in gate:
                continue
            glat, glon = float(gate["lat"]), float(gate["lon"])
            if not (south - pad <= glat <= north + pad and west - pad <= glon <= east + pad):
                errors.append(
                    f"neighbour gate {edge.get('label')} is outside the district bbox "
                    f"(extend tile / rebuild)"
                )

    if run_sims and (glb.exists() or legacy.exists()):
        env = {"VIEWER_ROOT": str(VIEWER), "DATA_ROOT": str(paths.viewer if glb.exists() else VIEWER)}
        for script in (
            "scripts/sim_directions.mjs",
            "scripts/sim_flow.mjs",
        ):
            script_path = ROOT / script
            if not script_path.exists():
                continue
            try:
                r = subprocess.run(
                    ["node", str(script_path), "3", "--seeds=1"],
                    cwd=ROOT,
                    env={**dict(**{k: v for k, v in __import__("os").environ.items()}), **env},
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if r.returncode != 0:
                    errors.append(f"{script} failed: {(r.stderr or r.stdout)[-400:]}")
            except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
                errors.append(f"{script}: {exc}")

    return errors


def _point_in_local_ring(x: float, y: float, ring: list) -> bool:
    if len(ring) < 3:
        return False
    # ring may be [[x,y],...] or [{"x","y"}]
    pts: list[tuple[float, float]] = []
    for p in ring:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            pts.append((float(p[0]), float(p[1])))
        elif isinstance(p, dict):
            pts.append((float(p["x"]), float(p["y"])))
    inside = False
    n = len(pts)
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi):
            inside = not inside
        j = i
    return inside


def _near_any_road(x: float, y: float, roads_doc: dict, max_dist: float) -> bool:
    import math

    for road in roads_doc.get("roads") or []:
        pts = road.get("points") or []
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            ax, ay = a[0], a[1]
            bx, by = b[0], b[1]
            # Point–segment distance.
            dx, dy = bx - ax, by - ay
            if dx == dy == 0:
                d = math.hypot(x - ax, y - ay)
            else:
                t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
                d = math.hypot(x - (ax + t * dx), y - (ay + t * dy))
            if d <= max_dist:
                return True
    return False


def migrate_legacy_viewer_to_2018() -> None:
    """Copy current viewer/*.json + klein_antwerpen.glb into the 2018 package."""
    paths = district_paths(ID_2018)
    ensure_district_dirs(paths)
    mapping = {
        "klein_antwerpen.glb": "city.glb",
        "roads.json": "roads.json",
        "buildings.json": "buildings.json",
        "transit.json": "transit.json",
        "velo.json": "velo.json",
        "shops.json": "shops.json",
        "props.json": "props.json",
        "spawn.json": "spawn.json",
        "landmarks.json": "landmarks.json",
    }
    for src_name, dest_name in mapping.items():
        src = VIEWER / src_name
        if src.exists():
            shutil.copy2(src, paths.viewer / dest_name)
            print(f"Migrated {src} -> {paths.viewer / dest_name}")
    lm_src = VIEWER / "landmarks"
    if lm_src.is_dir():
        for glb in lm_src.glob("*.glb"):
            shutil.copy2(glb, paths.viewer_landmarks / glb.name)
