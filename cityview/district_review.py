"""Per-run agent review pack: AGENT_REVIEW.md + buildings/catalog.html.

Every ``district build`` (and ``district review``) writes a checkbox prompt pack
injected with geo from ``special_buildings.json``, façade meta, and shops so an
agent can pick up unfinished visual work without rediscovering context.
"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cityview.districts import DistrictPaths, ID_2000, ID_2018, district_paths, load_district


def _run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default if default is not None else {}
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return default if default is not None else {}


def _parse_done_statuses(latest_md: Path) -> dict[str, bool]:
    """Read prior LATEST.md checkboxes so regenerating keeps done marks."""
    if not latest_md.exists():
        return {}
    text = latest_md.read_text()
    out: dict[str, bool] = {}
    current: str | None = None
    for line in text.splitlines():
        m = re.match(r"^###\s+`([^`]+)`", line)
        if m:
            current = m.group(1)
            continue
        if current and re.match(r"^Status:\s*\[([ xX])\]", line):
            out[current] = line.lower().startswith("status: [x]")
    return out


def _seed_tasks_2000(dossier: dict[str, Any], shops: list[dict], meta: dict) -> list[dict[str, Any]]:
    by_role = {b.get("role"): b for b in dossier.get("buildings") or [] if b.get("role")}
    by_custom = {
        b.get("manifest_custom") or b.get("expected_custom"): b
        for b in dossier.get("buildings") or []
        if b.get("manifest_custom") or b.get("expected_custom")
    }
    cat = by_role.get("cathedral") or by_custom.get("olv_cathedral") or {}
    steen = by_role.get("castle") or by_custom.get("het_steen") or {}
    hall = by_role.get("city_hall") or by_custom.get("stadhuis") or {}
    brabo = by_role.get("monument") or by_custom.get("brabo_fountain") or {}
    terrace = by_role.get("guild_terrace") or by_custom.get("grote_markt_terrace") or {}
    shop_names = [s.get("name") for s in shops if s.get("name")][:12]
    elev = meta.get("elevations") or {}
    procedural_slots = [
        fid
        for fid, info in elev.items()
        if isinstance(info, dict) and info.get("style") and not info.get("photo")
    ][:8]

    tasks: list[dict[str, Any]] = [
        {
            "id": "cathedral-gothic",
            "title": "Rework OLV cathedral Gothic massing",
            "goal": (
                "From Groenplaats the cathedral must read as Gothic (tower + nave), "
                "not a classical temple colonnade."
            ),
            "acceptance": (
                "Silhouette from spawn shows one tall north tower and nave; "
                "no colonnade of evenly spaced pillars; proof photo from Groenplaats."
            ),
            "geo": cat,
            "commands": [
                "Edit cityview/landmark_civic.py build_olv_cathedral",
                "python -m cityview district build 2000-antwerpen  # or re-export landmark GLB",
            ],
            "proof": "review/proofs/cathedral-gothic.jpg",
        },
        {
            "id": "het-steen-silhouette",
            "title": "Polish Het Steen gatehouse from the Scheldt",
            "goal": "Gatehouse massing readable from the quay approach.",
            "acceptance": "Distinct gatehouse + roof; proof from Scheldt / Steenplein side.",
            "geo": steen,
            "commands": ["Edit cityview/landmark_civic.py build_het_steen"],
            "proof": "review/proofs/het-steen-silhouette.jpg",
        },
        {
            "id": "grote-markt-setpiece",
            "title": "Grote Markt set-piece: Stadhuis + Brabo + guild terrace",
            "goal": "Square reads as city hall + Brabo fountain + guild fronts together.",
            "acceptance": (
                "Minimap gold pins for Stadhuis, Brabo, Huis Spaengien; "
                "walk proof facing Stadhuis with Brabo in frame."
            ),
            "geo": {"stadhuis": hall, "brabo": brabo, "terrace": terrace},
            "commands": [
                "Confirm districts/2000-antwerpen/landmarks/manifest.json nodes/by_id",
                "Rebuild streamed landmark GLBs for 22966134, 900000001, 496929324",
            ],
            "proof": "review/proofs/grote-markt-setpiece.jpg",
        },
        {
            "id": "centre-shopfront-facades",
            "title": "Centre shopfront / horeca façade batch",
            "goal": (
                "Replace procedural centre elevations with shopfront/horeca art "
                f"(nearby names: {', '.join(shop_names) or 'see shops.json'})."
            ),
            "acceptance": (
                "At least 8 near-spawn shopfront elevations; atlas re-packed; "
                "assert_facades_unique passes; hashes differ from 2018."
            ),
            "geo": {"facade_slots": procedural_slots, "shop_sample": shop_names},
            "commands": [
                "python -m cityview.district_facades 2000-antwerpen --force --pack",
                "python -m cityview district check 2000-antwerpen --no-sims",
            ],
            "proof": "review/proofs/centre-shopfront-facades.jpg",
            "facade_prompts": [
                {
                    "slot": fid,
                    "style": (elev.get(fid) or {}).get("style"),
                    "storeys": (elev.get(fid) or {}).get("storeys"),
                    "path": f"districts/2000-antwerpen/facades/elevations/{fid}.jpg",
                    "prompt": (
                        f"Antwerp historic-centre street elevation {fid}, "
                        f"{(elev.get(fid) or {}).get('storeys', 4)} storeys, "
                        f"style {(elev.get(fid) or {}).get('style') or 'shopfront_meir'}, "
                        "orthographic facade photo, ground-floor restaurant/cafe shopfront, "
                        "Flemish brick or render, no sky, no people."
                    ),
                }
                for fid in procedural_slots
            ],
        },
        {
            "id": "proof-screenshots",
            "title": "Capture proof screenshots (spawn, Grote Markt, Steen)",
            "goal": "Drop walk-mode stills into review/proofs/ and tick related tasks.",
            "acceptance": "Files exist for cathedral-gothic, grote-markt-setpiece, het-steen-silhouette.",
            "geo": dossier.get("spawn") or {},
            "commands": [
                "Open http://127.0.0.1:8767/?district=2000-antwerpen",
                "Save stills under districts/2000-antwerpen/review/proofs/",
            ],
            "proof": "review/proofs/spawn-groenplaats.jpg",
        },
        {
            "id": "minimap-district-scoped",
            "title": "Verify minimap is district-scoped (no Harmonie kiosk)",
            "goal": (
                "Gold pins only for 2000 landmarks; street caption uses Antwerpen · 2000; "
                "no Albertpark kiosk ghost pin near Groenplaats."
            ),
            "acceptance": "Minimap pins match viewer/districts/2000-antwerpen/landmarks.json.",
            "geo": {"note": "Groenplaats has no kiosk mesh — false positive was root landmarks.json"},
            "commands": ["Hard-reload viewer; compare pins to landmarks.json"],
            "proof": "review/proofs/minimap-district-scoped.jpg",
        },
    ]
    return tasks


def _seed_tasks_generic(dossier: dict[str, Any]) -> list[dict[str, Any]]:
    missing = [
        b
        for b in dossier.get("buildings") or []
        if b.get("mesh_status") == "missing_mesh"
    ][:10]
    tasks = [
        {
            "id": "wire-missing-customs",
            "title": "Wire missing custom meshes from dossier",
            "goal": "Every expected_custom in special_buildings.json has a manifest entry.",
            "acceptance": "No mesh_status=missing_mesh for canonical rows.",
            "geo": {"missing": missing},
            "commands": ["Edit districts/<id>/landmarks/manifest.json"],
            "proof": "review/proofs/wire-missing-customs.jpg",
        }
    ]
    return tasks


def _reference_tasks(district_id: str, pack: dict[str, Any], shops: list[dict]) -> list[dict[str, Any]]:
    """One "match the photos" task per modelled landmark + one shopfront-overrides task."""
    root = f"districts/{district_id}/references"
    tasks: list[dict[str, Any]] = []
    rows = pack.get("places") or []
    for s in rows:
        if s.get("kind") != "landmark" or not s.get("images"):
            continue
        files = [f"{root}/{im['file']}" for im in s["images"] if im.get("file")]
        if not files:
            continue
        slug = s.get("slug") or str(s.get("osm_id"))
        custom = s.get("custom")
        tasks.append(
            {
                "id": f"ref-{slug}",
                "title": f"Match {s['name']} to its reference photos",
                "goal": (
                    f"{s['name']} reads like the real building from the street: silhouette, proportions, "
                    "materials, colour, openings and orientation agree with the photos."
                ),
                "acceptance": (
                    "Side-by-side proof (street render from a matching viewpoint next to a reference) shows the "
                    "same massing and front; differences you chose to keep are listed in the proof note."
                ),
                "geo": {
                    "name": s["name"],
                    "osm_id": s.get("osm_id"),
                    "osm_type": s.get("osm_type"),
                    "lat": s.get("lat"),
                    "lon": s.get("lon"),
                    "xy": s.get("xy"),
                    "wikidata": s.get("wikidata"),
                    "manifest_custom": custom,
                    "spawn_distance_m": s.get("spawn_distance_m"),
                    "refs": {f"photo{n + 1}": f for n, f in enumerate(files)},
                },
                "commands": [f"Open {f}" for f in files]
                + (
                    [f"Edit the `{custom}` builder (cityview/landmark_civic.py / landmark_models.py)",
                     f"python3 -c \"from cityview.export_landmark_glbs import export_missing_landmark_glbs as e; e('{district_id}', force=True)\""]
                    if custom
                    else [f"Add a manifest custom for osm {s.get('osm_type')}/{s.get('osm_id')} or tune its façade"]
                ),
                "agent_prompt": (
                    f"Look at every photo for **{s['name']}** first (they are Wikimedia Commons, authors in "
                    f"`{root}/index.json`). Note which side faces which street, tower / gable positions, storey "
                    "count, window rhythm, roof shape and the dominant stone / brick colours. Then render the "
                    "current model from the same viewpoint and fix the largest mismatch first."
                ),
                "proof": f"review/proofs/ref-{slug}.jpg",
            }
        )
    shop_refs = [s for s in rows if s.get("kind") == "shopfront"]
    if shop_refs:
        ids = {(s.get("osm_type"), s.get("osm_id")) for s in shop_refs}
        overridden = sum(1 for sh in shops if sh.get("override"))
        tasks.append(
            {
                "id": "ref-shopfronts",
                "title": "Shopfronts that look like the real places",
                "goal": (
                    "Every shop / bar / restaurant with a reference photo has a shop_overrides.json entry so its "
                    "fascia colour, lettering, frame, awning and front type match the photo."
                ),
                "acceptance": (
                    f"{len(ids)} referenced places; each has an override (now {overridden} shops carry one) and a "
                    "walk proof of the busiest street shows them."
                ),
                "geo": {
                    "referenced": [
                        {
                            "name": s["name"],
                            "osm": f"{s['osm_type']}/{s['osm_id']}",
                            "category": s.get("category"),
                            "photos": [f"{root}/{im['file']}" for im in s.get("images") or [] if im.get("file")],
                            "links": s.get("links") or {},
                        }
                        for s in shop_refs[:60]
                    ]
                },
                "commands": [
                    f"Open {root}/index.html",
                    f"Edit districts/{district_id}/shop_overrides.json",
                    f"python -m cityview district build {district_id} --skip-blender",
                ],
                "agent_prompt": (
                    "For each referenced place open its photo (or Mapillary link) and write a `by_osm` override: "
                    "fascia = board colour, accent = lettering colour, frame = window joinery, front = archetype "
                    "(boutique / bar / cafe / restaurant / bakery / chocolatier / heritage / market / frituur / "
                    "fastfood / bank / pharmacy / office), awning = {colour, stripe} or false, terrace. Skip photos "
                    "that show an interior or a different object (statue, logo) — note them instead."
                ),
                "proof": "review/proofs/ref-shopfronts.jpg",
            }
        )
    return tasks


def _format_geo(geo: Any, indent: str = "") -> str:
    if not geo:
        return f"{indent}(none)\n"
    if isinstance(geo, dict) and ("lat" in geo or "osm_id" in geo or "xy" in geo):
        lines = []
        for k in (
            "name",
            "osm_id",
            "osm_type",
            "lat",
            "lon",
            "xy",
            "wikidata",
            "manifest_custom",
            "expected_custom",
            "mesh_status",
            "spawn_distance_m",
            "notes",
        ):
            if geo.get(k) is not None and geo.get(k) != "":
                lines.append(f"{indent}- **{k}**: {geo[k]}")
        refs = geo.get("refs") or {}
        for rk, rv in refs.items():
            lines.append(f"{indent}- **ref:{rk}**: {rv}")
        wd = geo.get("wikidata_label") or {}
        if wd:
            lines.append(
                f"{indent}- **wikidata_label**: {wd.get('label_en') or wd.get('label_nl')} — "
                f"{wd.get('description_en') or wd.get('description_nl')}"
            )
        return ("\n".join(lines) + "\n") if lines else f"{indent}{json.dumps(geo)}\n"
    return f"{indent}```json\n{indent}{json.dumps(geo, indent=2)}\n{indent}```\n"


def render_agent_review_md(
    district_id: str,
    doc: dict[str, Any],
    tasks: list[dict[str, Any]],
    done: dict[str, bool],
    run_id: str,
) -> str:
    title = doc.get("title") or district_id
    lines = [
        f"# Agent review — {title}",
        "",
        f"- **District**: `{district_id}`",
        f"- **Run**: `{run_id}`",
        f"- **Spawn**: {(doc.get('spawn') or {}).get('label')} "
        f"({(doc.get('spawn') or {}).get('lat')}, {(doc.get('spawn') or {}).get('lon')})",
        f"- **Instructions**: see [docs/district-agent.md](../../../docs/district-agent.md)",
        f"- **Dossier**: `districts/{district_id}/special_buildings.json`",
        f"- **Catalog**: `viewer/districts/{district_id}/buildings/catalog.html`",
        "",
        "Mark a task done by changing `Status: [ ] todo` → `Status: [x] done` and attaching proof.",
        "",
        "---",
        "",
    ]
    for t in tasks:
        tid = t["id"]
        checked = "x" if done.get(tid) else " "
        lines.append(f"### `{tid}` — {t['title']}")
        lines.append("")
        lines.append(f"**Goal:** {t['goal']}")
        lines.append("")
        lines.append(f"**Acceptance:** {t['acceptance']}")
        lines.append("")
        lines.append("**Geo / context:**")
        lines.append(_format_geo(t.get("geo")))
        lines.append("**Commands:**")
        for c in t.get("commands") or []:
            lines.append(f"- `{c}`")
        lines.append("")
        if t.get("facade_prompts"):
            lines.append("**Per-slot façade prompts:**")
            lines.append("")
            for fp in t["facade_prompts"]:
                lines.append(f"- `{fp['slot']}` ({fp.get('style')}, {fp.get('storeys')} storeys) → `{fp['path']}`")
                lines.append(f"  - Prompt: {fp['prompt']}")
            lines.append("")
        if t.get("aerial"):
            lines.append(f"**Aerial:** `{t['aerial']}` (cyan = inventory trunks, yellow = aerial canopy)")
            lines.append("")
        if t.get("agent_prompt"):
            lines.append(f"**Agent prompt:** {t['agent_prompt']}")
            lines.append("")
        lines.append(f"Status: [{checked}] {'done' if checked == 'x' else 'todo'}")
        lines.append(f"Proof: `{t.get('proof')}`")
        lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines)


def render_catalog_html(
    district_id: str,
    doc: dict[str, Any],
    dossier: dict[str, Any],
    tasks: list[dict[str, Any]],
    done: dict[str, bool],
    shops: list[dict],
    meta: dict,
    *,
    refs: dict[str, Any] | None = None,
    ref_base: str | None = None,
) -> str:
    title = html.escape(doc.get("title") or district_id)
    ref_by_osm = {
        (str(s.get("osm_type")), int(s["osm_id"])): s
        for s in (refs or {}).get("places") or []
        if s.get("osm_id")
    }

    def ref_src(im: dict[str, Any]) -> str:
        if ref_base is not None and im.get("file"):
            return ref_base + im["file"]
        return im.get("thumb") or ""

    cards = []
    for b in dossier.get("buildings") or []:
        if b.get("role") == "not_present":
            continue
        name = html.escape(str(b.get("name") or ""))
        status = html.escape(str(b.get("mesh_status") or ""))
        custom = html.escape(str(b.get("manifest_custom") or b.get("expected_custom") or "—"))
        wd = b.get("wikidata") or ""
        wd_link = (
            f'<a href="https://www.wikidata.org/wiki/{html.escape(wd)}">{html.escape(wd)}</a>'
            if wd
            else "—"
        )
        proof_candidates = [
            f"../review/proofs/{tid}.jpg"
            for tid, t in ((t["id"], t) for t in tasks)
            if b.get("manifest_custom") and b.get("manifest_custom") in str(t.get("geo"))
        ]
        thumb = proof_candidates[0] if proof_candidates else ""
        ref = ref_by_osm.get((str(b.get("osm_type")), int(b["osm_id"]))) if b.get("osm_id") else None
        ref_imgs = [im for im in (ref or {}).get("images") or [] if ref_src(im)]
        if thumb:
            img = f'<img src="{html.escape(thumb)}" alt="" loading="lazy" />'
        elif ref_imgs:
            img = f'<img src="{html.escape(ref_src(ref_imgs[0]))}" alt="reference" loading="lazy" />'
        else:
            img = '<div class="ph">no proof or reference yet</div>'
        strip = "".join(
            f'<a href="{html.escape(im.get("page") or "#")}" title="{html.escape((im.get("author") or "") + " · " + (im.get("license") or ""))}">'
            f'<img src="{html.escape(ref_src(im))}" alt="" loading="lazy" /></a>'
            for im in ref_imgs
        )
        cards.append(
            f'<article class="card"><div class="thumb">{img}</div>'
            + (f'<div class="refs">{strip}</div>' if strip else "")
            + f"<h3>{name}</h3>"
            f"<p>custom: <code>{custom}</code> · mesh: <code>{status}</code></p>"
            f"<p>OSM {b.get('osm_type')} {b.get('osm_id')} · Wikidata {wd_link}</p>"
            f"<p class='notes'>{html.escape(str(b.get('notes') or ''))}</p></article>"
        )

    facade_rows = []
    for fid, info in sorted((meta.get("elevations") or {}).items()):
        if not isinstance(info, dict):
            continue
        style = html.escape(str(info.get("style") or ""))
        facade_rows.append(
            f"<tr><td><code>{html.escape(fid)}</code></td>"
            f"<td>{info.get('storeys')}</td><td>{style}</td>"
            f"<td><code>{html.escape(str(info.get('file') or ''))}</code></td></tr>"
        )

    shop_lis = "".join(
        f"<li>{html.escape(s.get('name') or s.get('kind') or '')} "
        f"<span class='muted'>({html.escape(s.get('kind') or '')})</span></li>"
        for s in shops[:40]
        if s.get("name") or s.get("kind")
    )
    task_lis = "".join(
        f"<li class='{'done' if done.get(t['id']) else 'todo'}'>"
        f"<code>{html.escape(t['id'])}</code> — {html.escape(t['title'])}</li>"
        for t in tasks
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Building catalog — {title}</title>
<style>
  :root {{ --bg:#0f141c; --card:#1a2330; --ink:#e8eef6; --muted:#8a9bb0; --accent:#d4a017; }}
  body {{ margin:0; font:15px/1.45 system-ui,sans-serif; background:var(--bg); color:var(--ink); }}
  header {{ padding:1.5rem 2rem; border-bottom:1px solid #2a3545; }}
  h1 {{ margin:0 0 .35rem; font-size:1.6rem; }}
  main {{ padding:1.5rem 2rem 3rem; max-width:1100px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:1rem; }}
  .card {{ background:var(--card); border-radius:10px; padding:.9rem; }}
  .thumb {{ aspect-ratio:4/3; background:#0b1018; border-radius:6px; overflow:hidden; margin-bottom:.6rem;
            display:flex; align-items:center; justify-content:center; color:var(--muted); }}
  .thumb img {{ width:100%; height:100%; object-fit:cover; }}
  .refs {{ display:flex; gap:4px; margin:-.2rem 0 .5rem; overflow-x:auto; }}
  .refs img {{ height:54px; border-radius:4px; }}
  .ph {{ font-size:.8rem; }}
  code {{ color:var(--accent); }}
  .muted {{ color:var(--muted); }}
  .notes {{ color:var(--muted); font-size:.85rem; }}
  table {{ width:100%; border-collapse:collapse; margin:.5rem 0 1.5rem; }}
  th, td {{ text-align:left; padding:.35rem .5rem; border-bottom:1px solid #2a3545; }}
  li.done {{ opacity:.55; text-decoration:line-through; }}
  section {{ margin-bottom:2rem; }}
</style>
</head>
<body>
<header>
  <h1>{title}</h1>
  <p class="muted">Special buildings · façades · shops — generated by <code>district review</code>
  · picture references: <code>districts/{html.escape(district_id)}/references/index.html</code>
  ({int(((refs or {}).get("counts") or {}).get("images") or 0)} photos)</p>
</header>
<main>
  <section>
    <h2>Agent tasks</h2>
    <ul>{task_lis or '<li class="muted">none</li>'}</ul>
  </section>
  <section>
    <h2>Special buildings</h2>
    <div class="grid">{''.join(cards) or '<p class="muted">No dossier rows</p>'}</div>
  </section>
  <section>
    <h2>Façade elevations</h2>
    <table><thead><tr><th>id</th><th>storeys</th><th>style</th><th>file</th></tr></thead>
    <tbody>{''.join(facade_rows) or '<tr><td colspan="4" class="muted">no elevations_meta.json</td></tr>'}</tbody></table>
  </section>
  <section>
    <h2>Shop sample (fascia names)</h2>
    <ul>{shop_lis or '<li class="muted">shops.json empty — republish package</li>'}</ul>
  </section>
</main>
</body>
</html>
"""


def _menu_preview_bbox(
    doc: dict[str, Any], half_m: float = 720.0
) -> tuple[float, float, float, float]:
    """Square lat/lon bbox around spawn (fallback: origin) for the Maps aerial."""
    from cityview.geo import METERS_PER_DEG_LAT, meters_per_deg_lon

    spawn = doc.get("spawn") or {}
    origin = doc.get("origin") or [0.0, 0.0]
    lat = float(spawn.get("lat") or origin[0])
    lon = float(spawn.get("lon") or origin[1])
    dlat = half_m / METERS_PER_DEG_LAT
    dlon = half_m / meters_per_deg_lon(lat)
    return (lat - dlat, lon - dlon, lat + dlat, lon + dlon)


def _fetch_ortho_tiles(
    bbox: tuple[float, float, float, float],
    tiles: int = 3,
    tile_px: int = 480,
) -> Any:
    """Download a Digitaal Vlaanderen ortho mosaic for ``bbox`` (needs Pillow)."""
    import io
    import urllib.request

    from PIL import Image

    from cityview.aerial import wms_url

    south, west, north, east = bbox
    dlat = (north - south) / tiles
    dlon = (east - west) / tiles
    full = Image.new("RGB", (tiles * tile_px, tiles * tile_px))
    for ty in range(tiles):
        for tx in range(tiles):
            t_north = north - ty * dlat
            t_south = t_north - dlat
            t_west = west + tx * dlon
            url = wms_url((t_south, t_west, t_north, t_west + dlon), tile_px, tile_px)
            with urllib.request.urlopen(url, timeout=120) as resp:
                data = resp.read()
            tile = Image.open(io.BytesIO(data)).convert("RGB")
            full.paste(tile, (tx * tile_px, ty * tile_px))
    return full


def _apply_menu_vignette(img: Any, strength: float = 0.88) -> Any:
    """Dark circular vignette matching the Klein Antwerpen Maps plate."""
    from PIL import Image, ImageDraw, ImageFilter

    w, h = img.size
    vignette = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(vignette)
    # Slightly oversized ellipse so the centre stays bright.
    pad = int(min(w, h) * 0.06)
    draw.ellipse([-pad, -pad, w + pad, h + pad], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=max(24, min(w, h) // 8)))
    # Mix toward near-black using inverted vignette as alpha.
    dark = Image.new("RGB", (w, h), (6, 10, 16))
    # Strength: how hard the corners crush.
    mask = vignette.point(lambda p: int(255 - (255 - p) * strength))
    return Image.composite(img, dark, mask)


def write_menu_preview_png(
    paths: DistrictPaths,
    roads: dict[str, Any],
    doc: dict[str, Any] | None = None,
    *,
    force: bool = False,
) -> Path | None:
    """Maps-selector plate: Digitaal Vlaanderen aerial + vignette (Klein style).

    Road strokes / spawn pin stay on the client canvas (``menu.js``) with
    ``mix-blend-mode: screen`` over this underlay — do not bake a dark schematic.
    """
    try:
        from PIL import Image
    except ImportError:
        return None

    menu_dir = Path(__file__).resolve().parent.parent / "viewer" / "menu"
    menu_dir.mkdir(parents=True, exist_ok=True)
    # Stable public name used by viewer/menu.js (2000 → map-2000-antwerpen.jpg).
    dest = menu_dir / f"map-{paths.id}.jpg"
    # Klein Antwerpen plate is hand-authored; never overwrite it from the pipeline.
    if paths.id == ID_2018 and dest.exists() and not force:
        return dest

    doc = doc or (load_district(paths.id) if paths.district_json.exists() else {})
    bbox = _menu_preview_bbox(doc)
    cache_dir = paths.aerial_dir
    cache_dir.mkdir(parents=True, exist_ok=True)
    ortho_path = cache_dir / "menu_ortho.jpg"
    try:
        if force or not ortho_path.exists():
            ortho = _fetch_ortho_tiles(bbox)
            ortho.save(ortho_path, quality=86, optimize=True)
        else:
            ortho = Image.open(ortho_path).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        print(f"menu aerial fetch failed ({exc}); keeping existing preview")
        return dest if dest.exists() else None

    side = 640
    plate = ortho.resize((side, side), Image.Resampling.LANCZOS)
    plate = _apply_menu_vignette(plate)
    plate.save(dest, quality=88, optimize=True)
    return dest


def write_district_review_pack(district_id: str, doc: dict[str, Any] | None = None) -> Path:
    """Write review/<run>/AGENT_REVIEW.md, LATEST.md, catalog.html, optional menu map."""
    paths = district_paths(district_id)
    doc = doc or (load_district(district_id) if paths.district_json.exists() else {})
    run_id = _run_id()
    review_root = paths.root / "review"
    run_dir = review_root / run_id
    proofs = review_root / "proofs"
    run_dir.mkdir(parents=True, exist_ok=True)
    proofs.mkdir(parents=True, exist_ok=True)

    dossier = _load_json(paths.root / "special_buildings.json", {"buildings": []})
    shops_doc = _load_json(paths.viewer / "shops.json", {"shops": []})
    shops = shops_doc.get("shops") or []
    meta = _load_json(paths.facades / "elevations_meta.json", {})
    roads = _load_json(paths.viewer / "roads.json", {})

    if district_id == ID_2000:
        tasks = _seed_tasks_2000(dossier, shops, meta)
    else:
        tasks = _seed_tasks_generic(dossier)

    try:
        from cityview.plaza_aerial import build_plaza_aerial_pack

        plaza_tasks = build_plaza_aerial_pack(district_id, fetch=True, force=False)
        # Prefer aerial plaza tasks first so tree layout is fixed before set-piece polish.
        tasks = plaza_tasks + tasks
    except Exception as exc:  # noqa: BLE001 — review pack must still write without WMS
        print(f"plaza aerial pack skipped: {exc}")

    refs = _load_json(paths.root / "references" / "index.json", {"places": []})
    tasks = tasks + _reference_tasks(district_id, refs, shops)

    done = _parse_done_statuses(review_root / "LATEST.md")
    md = render_agent_review_md(district_id, doc, tasks, done, run_id)
    md_path = run_dir / "AGENT_REVIEW.md"
    md_path.write_text(md)
    (review_root / "LATEST.md").write_text(md)

    buildings_dir = paths.root / "buildings"
    buildings_dir.mkdir(parents=True, exist_ok=True)
    (buildings_dir / "catalog.html").write_text(
        render_catalog_html(district_id, doc, dossier, tasks, done, shops, meta, refs=refs, ref_base="../references/")
    )
    paths.viewer.mkdir(parents=True, exist_ok=True)
    v_buildings = paths.viewer / "buildings"
    v_buildings.mkdir(parents=True, exist_ok=True)
    # The viewer copy is served without districts/, so it shows Commons thumbs instead.
    (v_buildings / "catalog.html").write_text(
        render_catalog_html(district_id, doc, dossier, tasks, done, shops, meta, refs=refs, ref_base=None)
    )
    v_review = paths.viewer / "review"
    v_review.mkdir(parents=True, exist_ok=True)
    (v_review / "AGENT_REVIEW.md").write_text(md)

    preview = write_menu_preview_png(paths, roads, doc)
    if preview:
        print(f"Wrote menu preview {preview}")

    try:
        from cityview.export_landmark_glbs import export_missing_landmark_glbs

        export_missing_landmark_glbs(district_id)
    except Exception as exc:  # noqa: BLE001 — review pack should not abort on GLB export
        print(f"landmark GLB export skipped: {exc}")

    print(f"Wrote review pack {md_path}")
    return md_path
