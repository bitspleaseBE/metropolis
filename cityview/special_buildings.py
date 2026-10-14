"""Special-buildings dossier: OSM + optional Wikidata for agent recognition.

Written on every ``district add`` / ``district build`` so agents can match
cathedral / Stadhuis / Steen / Brabo / etc. without rediscovering OSM ids.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from cityview.districts import DistrictPaths, ID_2000, district_paths
from cityview.geo import project

# Canonical 2000 rows agents should always see (OSM id → expected custom builder).
CANONICAL_2000: list[dict[str, Any]] = [
    {
        "osm_id": 26495164,
        "osm_type": "way",
        "name": "Onze-Lieve-Vrouwekathedraal",
        "expected_custom": "olv_cathedral",
        "role": "cathedral",
        "notes": "Gothic from Groenplaats — not a classical temple colonnade.",
        "wikidata": "Q5901",
        "refs": {
            "inventaris": "https://inventaris.onroerenderfgoed.be/erfgoedobjecten/4183",
            "wikidata": "https://www.wikidata.org/wiki/Q5901",
        },
    },
    {
        "osm_id": 22966134,
        "osm_type": "way",
        "name": "Stadhuis Antwerpen",
        "expected_custom": "stadhuis",
        "role": "city_hall",
        "notes": "Renaissance city hall on Grote Markt west side.",
        "wikidata": "Q2005868",
        "refs": {
            "wikidata": "https://www.wikidata.org/wiki/Q2005868",
        },
    },
    {
        "osm_id": 29067925,
        "osm_type": "way",
        "name": "Het Steen",
        "expected_custom": "het_steen",
        "role": "castle",
        "notes": "Medieval gatehouse on the Scheldt — silhouette from the quay.",
        "wikidata": "Q1014126",
        "refs": {
            "wikidata": "https://www.wikidata.org/wiki/Q1014126",
        },
    },
    {
        "osm_id": 900000001,
        "osm_type": "node",
        "name": "Brabo fountain",
        "expected_custom": "brabo_fountain",
        "role": "monument",
        "notes": "Brabo on Grote Markt; synthetic node (not in OSM extract as memorial).",
        "lat": 51.22111,
        "lon": 4.39972,
        "wikidata": "Q3911365",
        "refs": {
            "wikidata": "https://www.wikidata.org/wiki/Q3911365",
        },
    },
    {
        "osm_id": 496929324,
        "osm_type": "way",
        "name": "Huis Spaengien (Grote Markt 7)",
        "expected_custom": "guild_house",
        "role": "guild_terrace",
        "notes": "Tallest guild house on the north row; every Grote Markt frontage has its own spec in grote_markt_houses.json.",
        "refs": {},
    },
    {
        "osm_id": 497130589,
        "osm_type": "way",
        "name": "Hansahuis (Suikerrui 11)",
        "expected_custom": "hansahuis",
        "role": "dome",
        "notes": "Domed corner building on Suikerrui seen from the Grote Markt (photo 03).",
        "refs": {},
    },
    {
        "osm_id": None,
        "osm_type": None,
        "name": "Groenplaats kiosk (false positive)",
        "expected_custom": None,
        "role": "not_present",
        "notes": (
            "There is no Groenplaats kiosk mesh in the 2000 manifest. "
            "Ghost pins came from the viewer loading root landmarks.json "
            "(2018 Albertpark kiosk). Fix: district-scoped minimap landmarksUrl."
        ),
        "refs": {},
    },
]


def _tags(el: dict[str, Any]) -> dict[str, str]:
    return {str(k): str(v) for k, v in (el.get("tags") or {}).items()}


def _element_lat_lon(
    el: dict[str, Any] | None,
    nodes: dict[int, dict[str, Any]],
    fallback: tuple[float, float] | None = None,
) -> tuple[float, float] | None:
    if el is None:
        return fallback
    if el.get("type") == "node" and "lat" in el:
        return float(el["lat"]), float(el["lon"])
    if el.get("type") == "way":
        coords = []
        for nid in el.get("nodes") or []:
            n = nodes.get(int(nid))
            if n and "lat" in n:
                coords.append((float(n["lat"]), float(n["lon"])))
        if coords:
            return (
                sum(c[0] for c in coords) / len(coords),
                sum(c[1] for c in coords) / len(coords),
            )
    return fallback


def _load_manifest(paths: DistrictPaths) -> dict[str, Any]:
    p = paths.landmarks_manifest
    if not p.exists():
        return {"by_id": {}, "nodes": {}}
    return json.loads(p.read_text())


def _manifest_custom(manifest: dict[str, Any], osm_id: int | None) -> str | None:
    if osm_id is None:
        return None
    by_id = manifest.get("by_id") or {}
    entry = by_id.get(str(osm_id)) or by_id.get(osm_id)
    if isinstance(entry, dict) and entry.get("custom"):
        return str(entry["custom"])
    nodes = manifest.get("nodes") or {}
    entry = nodes.get(str(osm_id)) or nodes.get(osm_id)
    if isinstance(entry, dict) and entry.get("custom"):
        return str(entry["custom"])
    return None


def fetch_wikidata_labels(
    qids: list[str],
    cache_path: Path,
    *,
    refresh: bool = False,
) -> dict[str, dict[str, str]]:
    """Fetch English/Dutch labels + descriptions; cache under district cache/."""
    cache: dict[str, dict[str, str]] = {}
    if cache_path.exists() and not refresh:
        try:
            cache = json.loads(cache_path.read_text())
        except json.JSONDecodeError:
            cache = {}
    missing = [q for q in qids if q and q not in cache]
    if not missing:
        return cache
    # Batches of 40.
    for i in range(0, len(missing), 40):
        batch = missing[i : i + 40]
        ids = "|".join(batch)
        url = (
            "https://www.wikidata.org/w/api.php?"
            + urllib.parse.urlencode(
                {
                    "action": "wbgetentities",
                    "ids": ids,
                    "props": "labels|descriptions",
                    "languages": "en|nl",
                    "format": "json",
                }
            )
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "city-view/district-dossier"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            print(f"wikidata fetch skipped: {exc}")
            break
        for qid, ent in (data.get("entities") or {}).items():
            labels = ent.get("labels") or {}
            descs = ent.get("descriptions") or {}
            cache[qid] = {
                "label_en": (labels.get("en") or {}).get("value") or "",
                "label_nl": (labels.get("nl") or {}).get("value") or "",
                "description_en": (descs.get("en") or {}).get("value") or "",
                "description_nl": (descs.get("nl") or {}).get("value") or "",
            }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=2) + "\n")
    return cache


def build_special_buildings_dossier(
    district_id: str,
    doc: dict[str, Any],
    osm: dict[str, Any],
    *,
    refresh_wikidata: bool = False,
) -> dict[str, Any]:
    """Merge profile landmarks + manifest + canonical seeds into one dossier."""
    paths = district_paths(district_id)
    manifest = _load_manifest(paths)
    origin = tuple(doc.get("origin") or (0.0, 0.0))
    spawn = doc.get("spawn") or {}
    elements = osm.get("elements") or []
    nodes = {int(e["id"]): e for e in elements if e.get("type") == "node" and "id" in e}
    by_key: dict[tuple[str, int], dict[str, Any]] = {}
    for e in elements:
        if e.get("type") in {"way", "node", "relation"} and "id" in e:
            by_key[(e["type"], int(e["id"]))] = e

    rows: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    def _add_row(base: dict[str, Any]) -> None:
        osm_id = base.get("osm_id")
        osm_type = base.get("osm_type") or "way"
        el = None
        if osm_id is not None:
            el = by_key.get((str(osm_type), int(osm_id)))
            seen_ids.add(int(osm_id))
        lat_lon = _element_lat_lon(
            el,
            nodes,
            (base["lat"], base["lon"]) if base.get("lat") is not None else None,
        )
        tags = _tags(el) if el else {}
        custom = _manifest_custom(manifest, int(osm_id) if osm_id is not None else None)
        expected = base.get("expected_custom")
        # Prefer OSM tags when present (canonical seeds are a fallback).
        wikidata = tags.get("wikidata") or base.get("wikidata")
        xy = None
        if lat_lon and origin[0]:
            xy = list(project(lat_lon[0], lat_lon[1], float(origin[0]), float(origin[1])))
        dist_spawn = None
        if xy and spawn.get("lat") is not None:
            sx, sy = project(float(spawn["lat"]), float(spawn["lon"]), float(origin[0]), float(origin[1]))
            dist_spawn = round(((xy[0] - sx) ** 2 + (xy[1] - sy) ** 2) ** 0.5, 1)
        mesh_status = "not_applicable"
        if expected or custom:
            if custom and (not expected or custom == expected):
                mesh_status = "manifest_custom"
            elif expected and not custom:
                mesh_status = "missing_mesh"
            else:
                mesh_status = "manifest_custom"
        row = {
            "name": base.get("name") or tags.get("name") or f"osm-{osm_id}",
            "osm_id": osm_id,
            "osm_type": osm_type if osm_id is not None else None,
            "role": base.get("role") or "",
            "score": base.get("score"),
            "wikidata": wikidata,
            "heritage": bool(tags.get("heritage") or tags.get("ref:OnroerendErfgoed")),
            "building": tags.get("building") or base.get("building"),
            "amenity": tags.get("amenity"),
            "historic": tags.get("historic"),
            "lat": lat_lon[0] if lat_lon else None,
            "lon": lat_lon[1] if lat_lon else None,
            "xy": [round(xy[0], 3), round(xy[1], 3)] if xy else None,
            "spawn_distance_m": dist_spawn,
            "expected_custom": expected,
            "manifest_custom": custom,
            "mesh_status": mesh_status,
            "notes": base.get("notes") or "",
            "refs": base.get("refs") or {},
            "canonical": bool(base.get("canonical")),
        }
        if wikidata and not row["refs"].get("wikidata"):
            row["refs"]["wikidata"] = f"https://www.wikidata.org/wiki/{wikidata}"
        rows.append(row)

    if district_id == ID_2000:
        for seed in CANONICAL_2000:
            _add_row({**seed, "canonical": True})

    for item in doc.get("profile", {}).get("landmarks") or []:
        oid = item.get("osm_id")
        if oid is None or int(oid) in seen_ids:
            continue
        _add_row(
            {
                "osm_id": int(oid),
                "osm_type": item.get("osm_type") or "way",
                "name": item.get("name"),
                "score": item.get("score"),
                "wikidata": item.get("wikidata"),
                "building": item.get("building"),
                "canonical": False,
            }
        )

    # Manifest-only customs not yet listed.
    for key, entry in (manifest.get("by_id") or {}).items():
        try:
            oid = int(key)
        except (TypeError, ValueError):
            continue
        if oid in seen_ids:
            continue
        if not isinstance(entry, dict):
            continue
        _add_row(
            {
                "osm_id": oid,
                "osm_type": "way",
                "name": entry.get("name"),
                "expected_custom": entry.get("custom"),
                "canonical": False,
            }
        )
    for key, entry in (manifest.get("nodes") or {}).items():
        try:
            oid = int(key)
        except (TypeError, ValueError):
            continue
        if oid in seen_ids:
            continue
        if not isinstance(entry, dict):
            continue
        lat = lon = None
        if entry.get("lat") is not None:
            lat, lon = float(entry["lat"]), float(entry["lon"])
        elif isinstance(entry.get("anchor"), (list, tuple)) and len(entry["anchor"]) >= 2:
            lat, lon = float(entry["anchor"][0]), float(entry["anchor"][1])
        _add_row(
            {
                "osm_id": oid,
                "osm_type": "node",
                "name": entry.get("name"),
                "expected_custom": entry.get("custom"),
                "lat": lat,
                "lon": lon,
                "canonical": False,
            }
        )

    qids = [r["wikidata"] for r in rows if r.get("wikidata")]
    wd = fetch_wikidata_labels(qids, paths.cache / "wikidata.json", refresh=refresh_wikidata)
    for r in rows:
        q = r.get("wikidata")
        if q and q in wd:
            r["wikidata_label"] = wd[q]

    dossier = {
        "district_id": district_id,
        "spawn": {
            "label": spawn.get("label"),
            "lat": spawn.get("lat"),
            "lon": spawn.get("lon"),
        },
        "count": len(rows),
        "buildings": rows,
    }
    return dossier


def write_special_buildings_dossier(
    district_id: str,
    doc: dict[str, Any],
    osm: dict[str, Any],
    *,
    refresh_wikidata: bool = False,
) -> Path:
    """Build and write dossier under districts/ and viewer/districts/."""
    paths = district_paths(district_id)
    dossier = build_special_buildings_dossier(
        district_id, doc, osm, refresh_wikidata=refresh_wikidata
    )
    dest = paths.root / "special_buildings.json"
    dest.write_text(json.dumps(dossier, indent=2) + "\n")
    paths.viewer.mkdir(parents=True, exist_ok=True)
    (paths.viewer / "special_buildings.json").write_text(json.dumps(dossier, indent=2) + "\n")
    print(f"Wrote {dest} ({dossier['count']} buildings)")
    return dest
