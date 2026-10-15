from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from cityview.building_types import BUILDING_TYPES_PATH, attach_palettes, load_building_types, write_building_types
from cityview.glb_compress import compress_viewer_glb
from cityview.gtfs_delijn import enrich_layout_transit
from cityview.jobs import add_photo_building, load_scene, resolve_photo, write_job
from cityview.landmarks import viewer_landmark_index
from cityview.osm import fetch_osm, layout_from_osm
from cityview.paths import (
    BENCHES_CACHE,
    BLENDER_SCRIPTS,
    DEFAULT_BLENDER,
    DEFAULT_PLACES,
    DEFAULT_SCENE,
    GTFS_CACHE,
    OSM_CACHE,
    OUTPUT,
    ROOT,
    TREES_CACHE,
    VELO_CACHE,
    VIEWER,
)
from cityview.benches import attach_benches, summarize as summarize_benches
from cityview.barriers import attach_barriers, summarize as summarize_barriers
from cityview.courtyards import attach_courtyards, summarize as summarize_courtyards
from cityview.clutter import attach_clutter, summarize as summarize_clutter
from cityview.props import export_props_for_viewer
from cityview.interiors import export_interiors_for_viewer
from cityview.shops import export_shops_for_viewer, plan_shops
from cityview.trees import attach_trees, summarize as summarize_trees
from cityview.velo import (
    attach_velo,
    export_velo_for_viewer,
    summarize as summarize_velo,
)
from cityview.streetscape import (
    export_buildings_near_spawn,
    export_roads_near_spawn,
    export_transit_near_spawn,
    spawn_from_place,
)


def blender_bin() -> Path:
    override = os.environ.get("BLENDER_BIN")
    if override:
        return Path(override)
    return DEFAULT_BLENDER



def _publish_landmark_glbs(output_dir: Path) -> None:
    src = output_dir / "landmarks"
    if not src.is_dir():
        return
    dest = VIEWER / "landmarks"
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.glb"):
        old.unlink()
    for glb in sorted(src.glob("*.glb")):
        target = dest / glb.name
        shutil.copy2(glb, target)
        print(f"Copied {glb} -> {target}")
        compress_viewer_glb(target)


def _write_landmark_index(layout: dict, origin: tuple | None = None) -> None:
    if origin is not None and not layout.get("origin"):
        layout = {**layout, "origin": [origin[0], origin[1]]}
    payload = viewer_landmark_index(layout)
    path = VIEWER / "landmarks.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {path} ({len(payload['landmarks'])} streamed landmarks)")


def run_blender(job_path: Path, script: Path) -> None:
    binary = blender_bin()
    if not binary.exists():
        raise FileNotFoundError(
            f"Blender not found at {binary}. Set BLENDER_BIN to the Blender executable."
        )
    cmd = [
        str(binary),
        "--background",
        "--python",
        str(script),
        "--",
        "--job",
        str(job_path),
    ]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def build_command(args: argparse.Namespace) -> int:
    scene = load_scene(Path(args.scene))
    if args.photo:
        photo = resolve_photo(ROOT, args.photo)
        crop = [float(v) for v in args.crop.split(",")] if args.crop else None
        if crop is not None and len(crop) != 4:
            raise ValueError("--crop must be u0,v0,u1,v1 in 0-1 image space")
        scene = add_photo_building(scene, photo, args.name, crop)

    output_dir = Path(args.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    job_path = output_dir / "job.json"
    write_job(
        job_path,
        {
            "root": str(ROOT),
            "output_dir": str(output_dir),
            "scene_name": args.street_name,
            "export_blend": True,
            "export_glb": True,
            "render": not args.no_render,
            "scene": scene,
        },
    )
    run_blender(job_path, BLENDER_SCRIPTS / "build_scene.py")

    glb = output_dir / f"{args.street_name}.glb"
    if glb.exists():
        dest = VIEWER / "antwerp_street.glb"
        shutil.copy2(glb, dest)
        print(f"Copied {glb} -> {dest}")
        compress_viewer_glb(dest)
    print(f"Outputs in {output_dir}")
    return 0


def city_command(args: argparse.Namespace) -> int:
    # Route Harmonie builds through the district package when requested (or when
    # the package already exists), so CI can migrate gradually.
    if getattr(args, "via_district", False) or (
        not args.bbox and (args.place or "") in {"harmonie", "klein-antwerpen"}
        and (ROOT / "districts" / "2018-harmonie" / "district.json").exists()
        and getattr(args, "via_district", None) is not False
    ):
        # Default: keep legacy city_command path unless --via-district is set,
        # so existing CI stays bit-identical until migrate+via-district.
        if getattr(args, "via_district", False):
            from cityview.district_pipeline import district_build
            from cityview.districts import ID_2018

            return district_build(
                ID_2018,
                refresh=bool(args.refresh),
                no_render=bool(args.no_render),
                out=Path(args.out) if args.out else None,
            )

    places = load_scene(Path(args.places))
    style_policy = "default"
    viewer_glb = "antwerp_street.glb"
    place: dict = {}
    if args.bbox:
        parts = [float(v) for v in args.bbox.split(",")]
        if len(parts) != 4:
            raise ValueError("--bbox must be south,west,north,east")
        bbox = (parts[0], parts[1], parts[2], parts[3])
        origin = ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)
        place_name = args.place or "custom"
        style_policy = args.style_policy or "default"
    else:
        place_name = args.place or "centrum"
        place = places.get(place_name)
        if not place:
            known = ", ".join(sorted(places))
            raise ValueError(f"Unknown place {place_name!r}. Known: {known}")
        bbox = tuple(place["bbox"])
        origin = tuple(place.get("origin") or ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0))
        style_policy = args.style_policy or place.get("style_policy") or "default"
        viewer_glb = place.get("viewer_glb") or (
            "klein_antwerpen.glb" if style_policy == "historic" else "antwerp_street.glb"
        )

    cache_key = place.get("osm_cache") if place else None
    # Prefer district package cache when present (extended 2018 bbox, etc.).
    district_id = place.get("district") if place else None
    cache = OSM_CACHE / f"{cache_key or place_name}.json"
    if district_id:
        from cityview.districts import district_paths as _dpaths

        dcache = _dpaths(district_id).osm_cache
        if dcache.exists() or not cache.exists():
            cache = dcache
    if args.refresh and cache.exists():
        cache.unlink()
    osm = fetch_osm(bbox, cache)
    # Keep legacy assets/osm/harmonie.json in sync for CI when building Harmonie.
    if district_id == "2018-harmonie" and cache != OSM_CACHE / "harmonie.json":
        OSM_CACHE.mkdir(parents=True, exist_ok=True)
        legacy = OSM_CACHE / "harmonie.json"
        if cache.exists():
            import shutil as _shutil

            _shutil.copy2(cache, legacy)
    layout = layout_from_osm(osm, origin, style_policy=style_policy)
    gtfs_key = (place.get("osm_cache") if place else None) or place_name
    gtfs_cache = GTFS_CACHE / f"delijn_{gtfs_key}.json"
    if args.refresh and gtfs_cache.exists():
        gtfs_cache.unlink()
    enrich_layout_transit(
        layout,
        origin,
        bbox,
        gtfs_cache,
        refresh=bool(args.refresh),
    )
    # Surveyed trees (Stad Antwerpen Groeninventaris + OSM); cached under assets/trees.
    trees_cache = TREES_CACHE / f"{cache_key or place_name}.json"
    tree_plan = attach_trees(layout, bbox, origin, trees_cache, refresh=bool(args.refresh))
    print("trees: " + summarize_trees(tree_plan["stats"]))
    # Surveyed benches (OSM amenity=bench + Stad Antwerpen park furniture); cached under assets/benches.
    benches_cache = BENCHES_CACHE / f"{cache_key or place_name}.json"
    bench_plan = attach_benches(layout, osm, bbox, origin, benches_cache, refresh=bool(args.refresh))
    print("benches: " + summarize_benches(bench_plan))
    # Velo Antwerpen docking stations (Clear Channel GBFS); cached under assets/velo.
    velo_cache = VELO_CACHE / f"{cache_key or place_name}.json"
    velo_plan = attach_velo(layout, bbox, origin, velo_cache, refresh=bool(args.refresh))
    print("velo: " + summarize_velo(velo_plan))
    # Prefer committed photo-remix JSON (CI has no macOS sips / may lack Pillow).
    if BUILDING_TYPES_PATH.exists():
        types_path = BUILDING_TYPES_PATH
        types_doc = load_building_types(types_path)
    else:
        types_path = write_building_types()
        types_doc = load_building_types(types_path)
    attach_palettes(layout, types_doc)
    spawn = spawn_from_place(place, origin, layout) if place else None
    if spawn:
        layout["spawn"] = spawn
    spawn_xy = (spawn["x"], spawn["y"]) if spawn else None
    # OSM-mapped street clutter (bins, bike hoops, bollards, hydrants, post boxes, ...); no network.
    clutter_plan = attach_clutter(layout, osm, bbox, origin, spawn_xy)
    print("street clutter: " + summarize_clutter(clutter_plan))
    # OSM-mapped garden walls, hedges, fences, retaining walls (courtyard / plot boundaries); no network.
    barrier_plan = attach_barriers(layout, osm, bbox, origin, spawn_xy)
    print("barriers: " + summarize_barriers(barrier_plan))
    # OSM-mapped courtyard ground (car parks, playgrounds, pitches, building sites, pools, woods).
    courtyard_plan = attach_courtyards(layout, osm, bbox, origin)
    print("courtyards: " + summarize_courtyards(courtyard_plan))
    edged = sum(1 for b in layout["buildings"] if b.get("street_edges"))
    type_counts: dict[str, int] = {}
    for b in layout["buildings"]:
        tid = b.get("building_type") or b.get("style") or "?"
        type_counts[tid] = type_counts.get(tid, 0) + 1
    n_lines = len(layout.get("transit_lines") or [])
    n_stops = len(layout.get("transit_stops") or [])
    meta = layout.get("transit_meta") or {}
    print(
        f"{place_name}: {len(layout['buildings'])} buildings, "
        f"{len(layout['roads'])} roads, {len(layout['water'])} water, "
        f"{len(layout.get('parks') or [])} parks, "
        f"{edged} with street facades, "
        f"{n_lines} transit lines, {n_stops} stops "
        f"(style_policy={style_policy})"
    )
    if meta:
        print(
            f"De Lijn: matched {meta.get('matched_stops', 0)}/{meta.get('gtfs_stops', 0)} stops, "
            f"{meta.get('bus_paths_added', 0)} bus paths from GTFS"
        )
    print(f"building types: {types_path.name} — " + ", ".join(f"{k}={v}" for k, v in sorted(type_counts.items())))
    if spawn:
        print(
            f"spawn {spawn['label']}: "
            f"({spawn['x']:.1f}, {spawn['y']:.1f}, {spawn['z']:.1f}) "
            f"yaw={spawn['yaw']:.2f} rad"
        )

    output_dir = Path(args.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    default_scene = "antwerp_harmonie" if place_name in {"harmonie", "klein-antwerpen"} else f"antwerp_{place_name}"
    scene_name = args.street_name or default_scene
    layout_path = output_dir / f"{scene_name}_layout.json"
    layout_path.write_text(json.dumps(layout))
    job_path = output_dir / f"{scene_name}_job.json"
    job = {
        "root": str(ROOT),
        "output_dir": str(output_dir),
        "scene_name": scene_name,
        "render": not args.no_render,
        "layout_path": str(layout_path),
        "style_policy": style_policy,
        "building_types_path": str(types_path),
    }
    if spawn:
        job["spawn"] = spawn
    write_job(job_path, job)
    run_blender(job_path, BLENDER_SCRIPTS / "build_city.py")
    glb = output_dir / f"{scene_name}.glb"
    if glb.exists():
        dest = VIEWER / viewer_glb
        shutil.copy2(glb, dest)
        print(f"Copied {glb} -> {dest}")
        # Keep a stable Pages filename for the Klein Antwerpen hero.
        if viewer_glb != "klein_antwerpen.glb" and style_policy == "historic":
            hero = VIEWER / "klein_antwerpen.glb"
            shutil.copy2(glb, hero)
            print(f"Copied {glb} -> {hero}")
        compress_viewer_glb(VIEWER / viewer_glb)
        if viewer_glb != "klein_antwerpen.glb" and style_policy == "historic":
            compress_viewer_glb(VIEWER / "klein_antwerpen.glb")
        _publish_landmark_glbs(output_dir)
    _write_landmark_index(layout, origin)
    if spawn:
        spawn_path = VIEWER / "spawn.json"
        spawn_path.write_text(json.dumps(spawn, indent=2) + "\n")
        print(f"Wrote {spawn_path}")
    roads_payload = export_roads_near_spawn(layout, spawn)
    roads_path = VIEWER / "roads.json"
    roads_path.write_text(json.dumps(roads_payload) + "\n")
    print(
        f"Wrote {roads_path} ({len(roads_payload['roads'])} roads, "
        f"{len(roads_payload.get('walks') or [])} walks near spawn)"
    )
    buildings_payload = export_buildings_near_spawn(layout, spawn)
    buildings_path = VIEWER / "buildings.json"
    buildings_path.write_text(json.dumps(buildings_payload) + "\n")
    print(
        f"Wrote {buildings_path} "
        f"({len(buildings_payload['buildings'])} building footprints near spawn)"
    )
    transit_payload = export_transit_near_spawn(layout, spawn)
    transit_path = VIEWER / "transit.json"
    transit_path.write_text(json.dumps(transit_payload) + "\n")
    print(
        f"Wrote {transit_path} "
        f"({len(transit_payload['paths'])} paths, {len(transit_payload['stops'])} stops near spawn)"
    )
    velo_payload = export_velo_for_viewer(layout.get("velo_stations") or [])
    velo_path = VIEWER / "velo.json"
    velo_path.write_text(json.dumps(velo_payload) + "\n")
    print(f"Wrote {velo_path} ({len(velo_payload['stations'])} Velo stations)")
    shop_inputs: dict = {}
    interior_overrides: dict = {}
    if district_id:
        from cityview.districts import district_paths as _dpaths
        from cityview.interiors import district_interior_overrides
        from cityview.shops import district_shop_inputs

        shop_inputs = district_shop_inputs(_dpaths(district_id))
        interior_overrides = district_interior_overrides(_dpaths(district_id))
    shops_payload = export_shops_for_viewer(plan_shops(osm, layout, origin, **shop_inputs), spawn)
    interiors_payload = export_interiors_for_viewer(
        shops_payload["shops"], layout.get("buildings") or [], interior_overrides
    )
    shops_path = VIEWER / "shops.json"
    shops_path.write_text(json.dumps(shops_payload) + "\n")
    print(f"Wrote {shops_path} ({len(shops_payload['shops'])} shopfronts)")
    interiors_path = VIEWER / "interiors.json"
    interiors_path.write_text(json.dumps(interiors_payload) + "\n")
    print(f"Wrote {interiors_path} ({len(interiors_payload['interiors'])} enterable)")
    props_payload = export_props_for_viewer(layout, spawn)
    props_path = VIEWER / "props.json"
    props_path.write_text(json.dumps(props_payload) + "\n")
    print(f"Wrote {props_path} ({', '.join(f'{len(v)} {k}' for k, v in props_payload.items())})")
    print(f"Outputs in {output_dir}")
    return 0


def serve_command(args: argparse.Namespace) -> int:
    from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
    from urllib.parse import urlsplit

    from cityview.pad_bridge import PadBridge

    bridge = PadBridge()
    bridge.start()

    class RevalidatingHandler(SimpleHTTPRequestHandler):
        # Re-baked GLBs and edited modules must show up on reload, not from a stale cache.
        def end_headers(self) -> None:
            self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def do_GET(self) -> None:
            if urlsplit(self.path).path == "/pad-state":
                body = bridge.snapshot()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def log_message(self, fmt: str, *log_args) -> None:
            if log_args and "/pad-state" in str(log_args[0]):
                return
            super().log_message(fmt, *log_args)

    os.chdir(VIEWER)
    server = ThreadingHTTPServer((args.host, args.port), RevalidatingHandler)
    print(f"Street viewer at http://{args.host}:{args.port}/")
    server.serve_forever()
    return 0


def _district_refs(district_id: str, doc: dict, *, refresh: bool) -> None:
    """Places (when not cached) + picture-reference pack for a district."""
    import json as _json

    from cityview.districts import district_paths
    from cityview.place_refs import build_reference_pack
    from cityview.places import fetch_places

    paths = district_paths(district_id)
    try:
        places = fetch_places(tuple(doc["bbox"]), paths.cache / "places.json")["places"]
    except Exception as exc:  # noqa: BLE001 — refs still work from the dossier alone
        print(f"places fetch skipped: {exc}")
        places = []
    dossier_path = paths.root / "special_buildings.json"
    dossier = _json.loads(dossier_path.read_text()) if dossier_path.exists() else {"buildings": []}
    try:
        build_reference_pack(district_id, doc, dossier, places, paths.root, paths.cache, refresh=refresh)
    except Exception as exc:  # noqa: BLE001 — offline review packs must still write
        print(f"picture references skipped: {exc}")


def district_command(args: argparse.Namespace) -> int:
    from cityview.district_pipeline import (
        district_add,
        district_build,
        district_check,
        district_rechunk,
        migrate_legacy_viewer_to_2018,
        seed_2018_district_json,
        write_districts_index,
    )
    from cityview.districts import ID_2018, PLACE_TO_DISTRICT, load_district
    from cityview.district_review import write_district_review_pack
    from cityview.special_buildings import write_special_buildings_dossier
    import json as _json

    action = args.district_action
    if action == "add":
        district_add(postcode=str(args.postcode), district_id=args.id, refresh=bool(args.refresh))
        return 0
    if action == "build":
        did = args.id or PLACE_TO_DISTRICT.get(args.place or "")
        if not did:
            raise ValueError("district build needs <id> or --place")
        return district_build(
            did,
            refresh=bool(args.refresh),
            no_render=bool(args.no_render),
            out=Path(args.out) if args.out else None,
            skip_blender=bool(args.skip_blender),
        )
    if action == "chunks":
        return district_rechunk(
            args.id,
            out=Path(args.out) if getattr(args, "out", None) else None,
        )
    if action == "check":
        errors = district_check(args.id, run_sims=not args.no_sims)
        if errors:
            for e in errors:
                print(f"FAIL: {e}", file=sys.stderr)
            return 1
        print(f"OK: {args.id}")
        return 0
    if action == "review":
        from cityview.districts import district_paths

        did = args.id
        paths = district_paths(did)
        doc = load_district(did)
        osm = {}
        if paths.osm_cache.exists():
            osm = _json.loads(paths.osm_cache.read_text())
        write_special_buildings_dossier(did, doc, osm)
        if not getattr(args, "no_refs", False):
            _district_refs(did, doc, refresh=False)
        write_district_review_pack(did, doc)
        print(f"OK: review pack for {did}")
        return 0
    if action == "places":
        from cityview.districts import district_paths
        from cityview.places import fetch_places

        doc = load_district(args.id)
        fetch_places(tuple(doc["bbox"]), district_paths(args.id).cache / "places.json", refresh=True)
        return 0
    if action == "refs":
        _district_refs(args.id, load_district(args.id), refresh=bool(args.refresh))
        return 0
    if action == "shops":
        from cityview.district_freshness import restamp_after_republish
        from cityview.district_pipeline import district_republish_shops

        district_republish_shops(args.id)
        restamp_after_republish(args.id, "shops")
        return 0
    if action == "interiors":
        from cityview.district_freshness import restamp_after_republish
        from cityview.district_pipeline import district_republish_interiors

        district_republish_interiors(args.id)
        restamp_after_republish(args.id, "interiors")
        return 0
    if action == "stale":
        from cityview.district_freshness import report

        return report(args.ids or None, as_json=bool(args.json))
    if action == "roads":
        from cityview.district_pipeline import district_republish_roads

        district_republish_roads(args.id)
        return 0
    if action == "map":
        from cityview.district_pipeline import district_republish_map

        district_republish_map(args.id)
        return 0
    if action == "postcodes":
        from cityview.menu_map import write_menu_map
        from cityview.postcodes import refresh_postcodes

        refresh_postcodes(use_osm=not args.no_osm)
        write_districts_index()
        write_menu_map()
        return 0
    if action == "migrate":
        seed_2018_district_json(extend_to_bank=True)
        write_districts_index()
        migrate_legacy_viewer_to_2018()
        print(f"Migrated legacy viewer into districts/{ID_2018}")
        return 0
    raise ValueError(f"Unknown district action {action!r}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build an Antwerp 70s-80s street in Blender from facade photos."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Generate the street .blend, .glb, and preview render")
    build.add_argument("--scene", default=str(DEFAULT_SCENE), help="Street JSON preset")
    build.add_argument("--photo", help="Replace the hero building with this facade photo")
    build.add_argument("--name", default="r-maes-15", help="Name for a --photo building")
    build.add_argument(
        "--crop",
        help="Optional UV crop u0,v0,u1,v1 (Blender UV space, origin bottom-left)",
    )
    build.add_argument("--out", default=str(OUTPUT), help="Output directory")
    build.add_argument("--street-name", default="antwerp_street")
    build.add_argument("--no-render", action="store_true")
    build.set_defaults(func=build_command)

    serve = sub.add_parser("serve", help="Serve the Three.js street viewer")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.set_defaults(func=serve_command)

    city = sub.add_parser("city", help="Build an Antwerp district from OpenStreetMap")
    city.add_argument("--place", default="centrum", help="Preset from scenes/antwerp_places.json")
    city.add_argument("--places", default=str(DEFAULT_PLACES))
    city.add_argument("--bbox", help="south,west,north,east in WGS84")
    city.add_argument(
        "--style-policy",
        choices=("default", "historic"),
        default=None,
        help="Facade palette policy (default: from place preset)",
    )
    city.add_argument("--out", default=str(OUTPUT))
    city.add_argument("--street-name", default="")
    city.add_argument("--refresh", action="store_true", help="Ignore cached OSM download")
    city.add_argument("--no-render", action="store_true")
    city.add_argument(
        "--via-district",
        action="store_true",
        help="Route klein-antwerpen / harmonie through the district pipeline",
    )
    city.set_defaults(func=city_command)

    district = sub.add_parser("district", help="Add / build / check a district package")
    dsub = district.add_subparsers(dest="district_action", required=True)

    d_add = dsub.add_parser("add", help="Write district.json + profile (no Blender)")
    d_add.add_argument("--postcode", required=True, help="Belgian postcode, e.g. 2000")
    d_add.add_argument("--id", default=None, help="District id override")
    d_add.add_argument("--refresh", action="store_true")
    d_add.set_defaults(func=district_command)

    d_build = dsub.add_parser("build", help="Full district build into viewer/districts/<id>/")
    d_build.add_argument("id", nargs="?", default=None, help="District id (e.g. 2018-harmonie)")
    d_build.add_argument("--place", default=None, help="Legacy place alias")
    # Default: output/<id>/ so parallel district builds never share a chunks/ folder.
    d_build.add_argument("--out", default=None)
    d_build.add_argument("--refresh", action="store_true")
    d_build.add_argument("--no-render", action="store_true", default=True)
    d_build.add_argument("--skip-blender", action="store_true", help="Export JSON package only")
    d_build.set_defaults(func=district_command)

    d_check = dsub.add_parser("check", help="Playability checks for a district package")
    d_check.add_argument("id", help="District id")
    d_check.add_argument("--no-sims", action="store_true", help="Skip headless Node sims")
    d_check.set_defaults(func=district_command)

    d_stale = dsub.add_parser(
        "stale",
        help="List packages whose build stamp no longer matches pipeline code / district sources "
        "(the PR check; exit 1 when any)",
    )
    d_stale.add_argument("ids", nargs="*", help="District ids (default: all)")
    d_stale.add_argument("--json", action="store_true")
    d_stale.set_defaults(func=district_command)

    d_chunks = dsub.add_parser(
        "chunks",
        help="Migration: peel spatial chunks from an existing .blend (normal builds do this automatically)",
    )
    d_chunks.add_argument("id", help="District id")
    d_chunks.add_argument("--out", default=str(OUTPUT), help="Output directory containing the .blend")
    d_chunks.set_defaults(func=district_command)

    d_review = dsub.add_parser(
        "review",
        help="Regenerate special_buildings dossier + AGENT_REVIEW.md + buildings/catalog.html",
    )
    d_review.add_argument("id", help="District id")
    d_review.add_argument("--no-refs", action="store_true", help="Skip the picture-reference stage")
    d_review.set_defaults(func=district_command)

    d_places = dsub.add_parser("places", help="Re-download named shops / horeca / sights into cache/places.json")
    d_places.add_argument("id", help="District id")
    d_places.set_defaults(func=district_command)

    d_refs = dsub.add_parser(
        "refs",
        help="Picture references (Wikidata P18, OSM image tags, geotagged Commons) → districts/<id>/references/",
    )
    d_refs.add_argument("id", help="District id")
    d_refs.add_argument("--refresh", action="store_true", help="Re-query Commons / Wikidata caches")
    d_refs.set_defaults(func=district_command)

    d_shops = dsub.add_parser(
        "shops",
        help="Re-plan shopfronts (places + shop_overrides.json) into viewer/districts/<id>/shops.json, no Blender",
    )
    d_shops.add_argument("id", help="District id")
    d_shops.set_defaults(func=district_command)

    d_interiors = dsub.add_parser(
        "interiors",
        help="Plan enterable interiors onto the published shops.json (keeps sign positions) "
        "into viewer/districts/<id>/interiors.json, no Blender",
    )
    d_interiors.add_argument("id", help="District id")
    d_interiors.set_defaults(func=district_command)

    d_roads = dsub.add_parser(
        "roads",
        help="Rewrite roads.json walks + driveables from cached OSM (district-wide ped walks), no Blender",
    )
    d_roads.add_argument("id", help="District id")
    d_roads.set_defaults(func=district_command)

    d_map = dsub.add_parser(
        "map",
        help="Rewrite district-wide map.json + buildings.json (radar, street names, collision), no Blender",
    )
    d_map.add_argument("id", help="District id")
    d_map.set_defaults(func=district_command)

    d_mig = dsub.add_parser("migrate", help="Seed 2018 package from current viewer/ assets")
    d_mig.set_defaults(func=district_command)

    d_pc = dsub.add_parser(
        "postcodes",
        help="Refresh Antwerp postcode rings (OSM) and the Maps-menu payload",
    )
    d_pc.add_argument("--no-osm", action="store_true", help="Dissolve 3D sectors instead of OSM")
    d_pc.set_defaults(func=district_command)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (FileNotFoundError, ValueError, subprocess.CalledProcessError) as exc:
        print(exc, file=sys.stderr)
        return 1
