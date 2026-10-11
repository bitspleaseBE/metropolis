"""Discover a district street profile from clipped OSM (+ optional aerial).

The profile drives which pipeline stages run and briefs facade / monument work.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from cityview.districts import point_in_ring


def _tags(el: dict[str, Any]) -> dict[str, Any]:
    return el.get("tags") or {}


def _name(tags: dict[str, Any]) -> str:
    return str(tags.get("name") or tags.get("name:nl") or "").strip()


def _has_rail(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        railway = tags.get("railway")
        if railway in {"rail", "station", "halt"}:
            return True
        if tags.get("building") == "train_station" or tags.get("public_transport") == "station":
            if "train" in (_name(tags) + " " + str(tags.get("network") or "")).lower():
                return True
            if railway == "station" and tags.get("subway") != "yes":
                return True
    return False


def _has_tram(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        if tags.get("railway") in {"tram", "light_rail"}:
            return True
        if tags.get("route") == "tram":
            return True
    return False


def _has_premetro(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        if tags.get("railway") == "subway":
            return True
        name = _name(tags).lower()
        if "premetro" in name or "pre-metro" in name:
            return True
    return False


def _has_bus_stop(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        if tags.get("highway") == "bus_stop":
            return True
        if tags.get("route") == "bus":
            return True
    return False


def _has_water(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        if tags.get("natural") == "water" or tags.get("waterway") in {"riverbank", "dock"}:
            return True
        if tags.get("water") or tags.get("landuse") == "basin":
            return True
    return False


def _has_port_industry(elements: list[dict[str, Any]]) -> bool:
    for el in elements:
        tags = _tags(el)
        landuse = tags.get("landuse")
        if landuse in {"industrial", "port"}:
            return True
        if tags.get("industrial") in {"port", "warehouse"}:
            return True
        if tags.get("man_made") in {"crane", "works"}:
            return True
        if tags.get("cargo") == "container" or "container" in str(tags.get("name") or "").lower():
            return True
    return False


def _building_era_counts(elements: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for el in elements:
        tags = _tags(el)
        if "building" not in tags:
            continue
        start = tags.get("start_date") or tags.get("building:architecture") or ""
        start = str(start)
        if re.search(r"1[6-7]\d\d|baroque|renaissance", start, re.I):
            counts["baroque_civic"] += 1
        elif re.search(r"18\d\d|neoclass|eclectic", start, re.I):
            counts["neoclassical"] += 1
        elif re.search(r"190|191|art.?nouveau|jugend", start, re.I):
            counts["art_nouveau"] += 1
        elif re.search(r"192|193|art.?deco", start, re.I):
            counts["art_deco"] += 1
        elif tags.get("building:material") == "brick" or tags.get("building") in {
            "house",
            "terrace",
            "apartments",
            "yes",
        }:
            counts["brick_townhouse"] += 1
        else:
            counts["other"] += 1
    return dict(counts.most_common())


def _material_counts(elements: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for el in elements:
        tags = _tags(el)
        if "building" not in tags:
            continue
        mat = tags.get("building:material") or tags.get("material")
        if mat:
            counts[str(mat)] += 1
    return dict(counts.most_common(12))


def _shop_names(elements: list[dict[str, Any]], limit: int = 40) -> list[str]:
    names: list[str] = []
    for el in elements:
        tags = _tags(el)
        if not (tags.get("shop") or tags.get("amenity") in {"cafe", "restaurant", "fast_food", "pub", "bar"}):
            continue
        n = _name(tags)
        if n:
            names.append(n)
    # Stable unique order.
    seen: set[str] = set()
    out: list[str] = []
    for n in names:
        key = n.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(n)
        if len(out) >= limit:
            break
    return out


def _rank_landmarks(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rank named / heritage buildings for custom monument consideration."""
    scored: list[tuple[float, dict[str, Any]]] = []
    nodes = {e["id"]: e for e in elements if e.get("type") == "node"}

    def _footprint_score(el: dict[str, Any]) -> float:
        if el.get("type") != "way":
            return 0.0
        nids = el.get("nodes") or []
        coords = []
        for nid in nids:
            n = nodes.get(nid)
            if n and "lat" in n:
                coords.append((n["lat"], n["lon"]))
        if len(coords) < 3:
            return 0.0
        # Rough area in deg² → relative only.
        area = 0.0
        for i in range(len(coords) - 1):
            area += coords[i][1] * coords[i + 1][0] - coords[i + 1][1] * coords[i][0]
        return abs(area) * 1e6

    for el in elements:
        tags = _tags(el)
        if el.get("type") not in {"way", "relation", "node"}:
            continue
        name = _name(tags)
        heritage = tags.get("heritage") or tags.get("heritage:operator") or tags.get("ref:OnroerendErfgoed")
        wikidata = tags.get("wikidata")
        historic = tags.get("historic")
        tourism = tags.get("tourism")
        building = tags.get("building")
        amenity = tags.get("amenity")
        if not (name or heritage or wikidata or historic in {"monument", "memorial", "castle"}):
            if building not in {"cathedral", "church", "chapel", "basilica", "castle", "civic", "public"}:
                continue
        score = 0.0
        if heritage:
            score += 40
        if wikidata:
            score += 25
        if building in {"cathedral", "basilica"}:
            score += 50
        elif building in {"church", "chapel"}:
            score += 20
        elif building in {"civic", "public", "castle"}:
            score += 35
        if amenity in {"townhall", "place_of_worship"}:
            score += 30
        if historic in {"monument", "memorial", "castle"}:
            score += 25
        if tourism in {"attraction", "museum"}:
            score += 15
        if name:
            score += min(20, len(name) * 0.4)
        score += min(30, _footprint_score(el))
        # Keyword boosts for known Antwerp identity buildings.
        blob = name.lower()
        for kw, boost in (
            ("nationale bank", 80),
            ("kathedraal", 90),
            ("onze-lieve-vrouw", 90),
            ("stadhuis", 85),
            ("steen", 70),
            ("grote markt", 40),
            ("cathedral", 90),
            ("city hall", 85),
        ):
            if kw in blob:
                score += boost
        if score < 15:
            continue
        scored.append(
            (
                score,
                {
                    "osm_id": el.get("id"),
                    "osm_type": el.get("type"),
                    "name": name or f"osm-{el.get('id')}",
                    "score": round(score, 1),
                    "heritage": bool(heritage),
                    "wikidata": wikidata,
                    "building": building,
                    "amenity": amenity,
                    "historic": historic,
                },
            )
        )
    scored.sort(key=lambda t: (-t[0], t[1].get("name") or ""))
    # Deduplicate by name.
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for _, item in scored:
        key = (item.get("name") or "").lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= 40:
            break
    return out


def facade_brief(eras: dict[str, int], materials: dict[str, int], has_water: bool) -> dict[str, Any]:
    """Human/machine brief for district-local facade generation."""
    top_eras = list(eras.keys())[:5]
    top_mats = list(materials.keys())[:5]
    styles = []
    if "baroque_civic" in eras:
        styles.extend(["baroque_civic", "stepped_gable", "neck_gable"])
    if "neoclassical" in eras or "brick_townhouse" in eras:
        styles.extend(["brick_sandstone_band", "narrow_plot", "neo_flemish"])
    if "art_nouveau" in eras:
        styles.append("art_nouveau")
    if "art_deco" in eras:
        styles.append("art_deco")
    if has_water:
        styles.append("warehouse_quay")
    if not styles:
        styles = ["brick_sandstone_band", "narrow_plot", "shopfront_meir"]
    return {
        "styles": styles,
        "eras": top_eras,
        "materials": top_mats,
        "notes": (
            "District-local elevations only. Do not reuse another district's facade files. "
            "Variety from frontage width, gable type, storey bands, shop inserts, roof tint."
        ),
    }


def build_profile(
    osm: dict[str, Any],
    *,
    ring: list[list[float]] | None = None,
    velo_stations: int = 0,
    roof_mix: dict[str, Any] | None = None,
) -> dict[str, Any]:
    all_elements = list(osm.get("elements") or [])
    # Mode detection uses the full download: tram/rail ways often have nodes
    # just outside a postcode ring after clip, which would falsely disable GTFS.
    has_tram = _has_tram(all_elements)
    has_premetro = _has_premetro(all_elements)
    has_bus = _has_bus_stop(all_elements)
    has_train = _has_rail(all_elements)
    has_water = _has_water(all_elements)
    has_port = _has_port_industry(all_elements)

    elements = all_elements
    if ring:
        # Soft filter: keep elements with a node inside, or unlocated ways (relations).
        nodes = {
            e["id"]: e
            for e in elements
            if e.get("type") == "node" and "lat" in e and point_in_ring(e["lat"], e["lon"], ring)
        }
        filtered: list[dict[str, Any]] = list(nodes.values())
        for e in elements:
            if e.get("type") == "way":
                if any(nid in nodes for nid in (e.get("nodes") or [])):
                    filtered.append(e)
            elif e.get("type") == "relation":
                filtered.append(e)
            elif e.get("type") == "node" and e["id"] not in nodes:
                continue
        elements = filtered

    eras = _building_era_counts(elements)
    materials = _material_counts(elements)
    landmarks = _rank_landmarks(elements)
    shops = _shop_names(elements)

    stages = {
        "osm": True,
        "gtfs_delijn": has_tram or has_premetro or has_bus,
        "gtfs_nmbs": has_train,
        "velo": True,  # GBFS always worth checking; empty slice is fine
        "trees": True,
        "benches": True,
        "aerial": True,
        "facades": True,
        "monuments": bool(landmarks),
        "port_props": has_port,
        "train_meshes": has_train,
    }

    one_liner_parts = []
    if has_water:
        one_liner_parts.append("Scheldt quays")
    if "baroque_civic" in eras or any("stadhuis" in (l.get("name") or "").lower() for l in landmarks[:8]):
        one_liner_parts.append("historic core")
    if has_tram or has_premetro:
        one_liner_parts.append("trams")
    if has_train:
        one_liner_parts.append("trains")
    if has_port:
        one_liner_parts.append("port industry")
    if not one_liner_parts:
        one_liner_parts.append("city streets")

    return {
        "summary": ", ".join(one_liner_parts),
        "modes": {
            "tram": has_tram,
            "premetro": has_premetro,
            "bus": has_bus,
            "velo": velo_stations > 0,
            "train": has_train,
            "water": has_water,
            "port": has_port,
        },
        "velo_stations_hint": velo_stations,
        "building_eras": eras,
        "materials": materials,
        "roof_mix": roof_mix or {},
        "shops": shops,
        "landmarks": landmarks,
        "facade_brief": facade_brief(eras, materials, has_water),
        "stages": stages,
        "building_count": sum(1 for e in elements if "building" in _tags(e)),
        "highway_count": sum(1 for e in elements if "highway" in _tags(e)),
    }
