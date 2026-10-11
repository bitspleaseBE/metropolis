"""Picture references for landmarks and recognisable places.

Agents (and people) modelling a district need to see the real thing: the cathedral
from the Handschoenmarkt, the corner café on the Grote Markt, the chocolatier on the
Meir. This stage gathers freely licensed photos per subject and writes a reference
pack under ``districts/<id>/references/``:

- ``index.json``   one row per subject: OSM / Wikidata ids, position, and every image
                   (local file, Commons page, author, licence, distance, match reason)
- ``index.html``   contact sheet for a quick look
- ``<slug>/NN.jpg`` 640 px thumbnails

Subjects are the special-buildings dossier (landmarks), named sights and heritage
places, and named shops / horeca. Sources, best first:

1. Wikidata P18 of the subject's ``wikidata`` tag (the canonical photo)
2. OSM ``image`` / ``wikimedia_commons`` tags
3. Commons files geotagged near the subject whose title names it (one bbox sweep of
   the district, matched locally — no per-shop API calls)

Only Wikimedia Commons is used, so every image carries a free licence + author.
Pure stdlib.
"""

from __future__ import annotations

import html
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from cityview.geo import project

USER_AGENT = "metropolis/0.1 (city-view district pipeline; https://github.com/emielmasyn)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
THUMB_W = 640
GEO_LIMIT = 500  # Commons geosearch page cap

# Per subject kind: search radius (m) and max images kept.
KIND_RULES = {
    "landmark": {"radius": 120.0, "max": 4},
    "sight": {"radius": 60.0, "max": 3},
    "shopfront": {"radius": 35.0, "max": 2},
}
STOPWORDS = frozenset(
    """
    de het een van der den en t s d the of and a la le les du des am im
    cafe café restaurant bar pub brasserie bistro taverne taverna eethuis frituur
    antwerpen antwerp anvers belgie belgium belgique jpg jpeg png tif
    sint st onze lieve vrouw kerk church street straat plein markt
    """.split()
)


# ---------------------------------------------------------------- http


def _get_json(url: str, params: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2.0 * (attempt + 1))
    return {}


def _trusted_upload(url: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    return parts.scheme == "https" and parts.hostname == "upload.wikimedia.org"


def _download(url: str, dest: Path) -> bool:
    # Thumb URLs come back from the Commons API; only ever fetch Wikimedia uploads.
    if not _trusted_upload(url):
        print(f"reference download refused (not upload.wikimedia.org): {url}")
        return False
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            data = resp.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"reference download skipped {url}: {exc}")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    shrink_image(dest)
    return True


def shrink_image(path: Path, max_px: int = THUMB_W, quality: int = 80) -> None:
    """Commons serves fixed thumb buckets (960 px+); keep references at ``max_px``."""
    try:
        from PIL import Image

        with Image.open(path) as im:
            if max(im.size) <= max_px:
                return
            im.thumbnail((max_px, max_px))
            im.convert("RGB").save(path, "JPEG", quality=quality, optimize=True)
        return
    except ImportError:
        pass
    except OSError:
        return
    import shutil
    import subprocess

    if shutil.which("sips"):
        subprocess.run(
            ["sips", "-Z", str(max_px), "-s", "format", "jpeg", "-s", "formatOptions", str(quality), str(path)],
            check=False,
            capture_output=True,
        )


# ---------------------------------------------------------------- text


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in text if not unicodedata.combining(c)).lower()


def name_tokens(name: str) -> list[str]:
    """Significant lowercase tokens of a place name (stopwords and 1-2 letter bits dropped)."""
    toks = re.findall(r"[a-z0-9]+", _fold(name))
    return [t for t in toks if len(t) >= 3 and t not in STOPWORDS]


def title_match(name: str, title: str) -> float:
    """Fraction of the name's significant tokens present in a Commons file title."""
    want = name_tokens(name)
    if not want:
        return 0.0
    have = set(re.findall(r"[a-z0-9]+", _fold(title)))
    return sum(1 for t in want if t in have) / len(want)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", _fold(text)).strip("-")
    return s[:48] or "place"


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _commons_file(value: str | None) -> str | None:
    """``File:Foo.jpg`` from an OSM image / wikimedia_commons tag, or None."""
    if not value:
        return None
    v = value.strip()
    if v.startswith("Category:"):
        return None
    m = re.search(r"(?:commons\.wikimedia\.org/wiki/|^)(File:[^?#]+)$", v)
    if m:
        return urllib.parse.unquote(m.group(1)).replace("_", " ")
    m = re.search(r"upload\.wikimedia\.org/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?#]+)", v)
    if m:
        return "File:" + urllib.parse.unquote(m.group(1)).replace("_", " ")
    return None


# ---------------------------------------------------------------- sources


def commons_geo_index(
    bbox: tuple[float, float, float, float],
    cache_path: Path,
    *,
    refresh: bool = False,
) -> list[dict[str, Any]]:
    """Every geotagged Commons file in the bbox: ``[{title, lat, lon}]`` (cached)."""
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text())["files"]
    seen: dict[str, dict[str, Any]] = {}

    def sweep(s: float, w: float, n: float, e: float, depth: int = 0) -> None:
        data = _get_json(
            COMMONS_API,
            {
                "action": "query",
                "list": "geosearch",
                "gsbbox": f"{n:.6f}|{w:.6f}|{s:.6f}|{e:.6f}",
                "gsnamespace": 6,
                "gslimit": GEO_LIMIT,
                "format": "json",
            },
        )
        hits = (data.get("query") or {}).get("geosearch") or []
        for h in hits:
            seen[h["title"]] = {"title": h["title"], "lat": h["lat"], "lon": h["lon"]}
        if len(hits) >= GEO_LIMIT and depth < 7:
            ml, mo = (s + n) / 2, (w + e) / 2
            for q in ((s, w, ml, mo), (s, mo, ml, e), (ml, w, n, mo), (ml, mo, n, e)):
                sweep(*q, depth=depth + 1)

    sweep(*bbox)
    files = sorted(seen.values(), key=lambda f: f["title"])
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"bbox": list(bbox), "files": files}) + "\n")
    print(f"Commons geo index: {len(files)} files in {cache_path}")
    return files


def wikidata_images(qids: list[str], cache_path: Path, *, refresh: bool = False) -> dict[str, dict[str, Any]]:
    """``{qid: {"p18": [File:..], "p373": category}}`` (cached)."""
    cache: dict[str, dict[str, Any]] = {}
    if cache_path.exists() and not refresh:
        cache = json.loads(cache_path.read_text())
    missing = sorted({q for q in qids if q and re.fullmatch(r"Q\d+", q) and q not in cache})
    for i in range(0, len(missing), 40):
        batch = missing[i : i + 40]
        try:
            data = _get_json(
                WIKIDATA_API,
                {"action": "wbgetentities", "ids": "|".join(batch), "props": "claims", "format": "json"},
            )
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"wikidata images skipped: {exc}")
            break
        for qid, ent in (data.get("entities") or {}).items():
            claims = ent.get("claims") or {}

            def vals(prop: str) -> list[str]:
                out = []
                for c in claims.get(prop) or []:
                    v = ((c.get("mainsnak") or {}).get("datavalue") or {}).get("value")
                    if isinstance(v, str):
                        out.append(v)
                return out

            cache[qid] = {
                "p18": ["File:" + v for v in vals("P18")],
                "p373": (vals("P373") or [None])[0],
            }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=2) + "\n")
    return cache


def commons_imageinfo(titles: list[str], cache_path: Path) -> dict[str, dict[str, Any]]:
    """Thumb URL, size, author and licence per ``File:`` title (cached)."""
    cache: dict[str, dict[str, Any]] = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text())
    missing = sorted({t for t in titles if t and t not in cache})
    for i in range(0, len(missing), 50):
        batch = missing[i : i + 50]
        try:
            data = _get_json(
                COMMONS_API,
                {
                    "action": "query",
                    "titles": "|".join(batch),
                    "prop": "imageinfo",
                    "iiprop": "url|size|extmetadata|mime",
                    "iiurlwidth": THUMB_W,
                    "iiextmetadatafilter": "Artist|LicenseShortName|DateTimeOriginal|ImageDescription",
                    "format": "json",
                },
            )
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"commons imageinfo skipped: {exc}")
            break
        q = data.get("query") or {}
        norm = {n["to"]: n["from"] for n in q.get("normalized") or []}
        for page in (q.get("pages") or {}).values():
            title = page.get("title") or ""
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}

            def m(key: str) -> str:
                raw = (meta.get(key) or {}).get("value") or ""
                return html.unescape(re.sub(r"<[^>]+>", "", str(raw))).strip()[:200]

            rec = {
                "thumb": info.get("thumburl"),
                "page": info.get("descriptionurl"),
                "width": info.get("width"),
                "height": info.get("height"),
                "mime": info.get("mime"),
                "author": m("Artist"),
                "license": m("LicenseShortName"),
                "date": m("DateTimeOriginal")[:10],
                "description": m("ImageDescription")[:160],
            }
            cache[title] = rec
            if title in norm:
                cache[norm[title]] = rec
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=1) + "\n")
    return cache


# ---------------------------------------------------------------- subjects


def _place_kind(tags: dict[str, str]) -> str:
    if tags.get("tourism") or tags.get("historic"):
        return "sight"
    return "shopfront"


def collect_subjects(dossier: dict[str, Any], places: list[dict[str, Any]], spawn: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Landmarks from the dossier, then named sights / shops / horeca from places."""
    subjects: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for b in dossier.get("buildings") or []:
        if b.get("role") == "not_present" or b.get("lat") is None:
            continue
        key = (str(b.get("osm_type") or "way"), int(b.get("osm_id") or 0))
        seen.add(key)
        subjects.append(
            {
                "kind": "landmark",
                "name": b.get("name") or "",
                "osm_type": key[0],
                "osm_id": key[1] or None,
                "wikidata": b.get("wikidata"),
                "lat": float(b["lat"]),
                "lon": float(b["lon"]),
                "custom": b.get("manifest_custom") or b.get("expected_custom"),
                "tags": {},
            }
        )
    for p in places:
        tags = p.get("tags") or {}
        name = tags.get("name") or ""
        key = (p["type"], int(p["id"]))
        if key in seen or not (name or tags.get("wikidata")):
            continue
        seen.add(key)
        subjects.append(
            {
                "kind": _place_kind(tags),
                "name": name,
                "osm_type": p["type"],
                "osm_id": int(p["id"]),
                "wikidata": tags.get("wikidata"),
                "lat": float(p["lat"]),
                "lon": float(p["lon"]),
                "category": tags.get("shop") or tags.get("amenity") or tags.get("tourism") or tags.get("historic"),
                "address": " ".join(x for x in (tags.get("addr:street"), tags.get("addr:housenumber")) if x),
                "tags": tags,
            }
        )
    if spawn and spawn.get("lat") is not None:
        slat, slon = float(spawn["lat"]), float(spawn["lon"])
        for s in subjects:
            s["spawn_distance_m"] = round(_haversine(s["lat"], s["lon"], slat, slon), 1)
    return subjects


def match_geo_files(subject: dict[str, Any], files: list[dict[str, Any]], grid: dict) -> list[dict[str, Any]]:
    """Geotagged Commons files near the subject whose title names it, best first."""
    rule = KIND_RULES[subject["kind"]]
    name = subject.get("name") or ""
    toks = name_tokens(name)
    if not toks:
        return []
    # A one-word shop name ("Bourla") must be distinctive; landmarks may share words.
    need = 1.0 if subject["kind"] == "shopfront" else 0.5
    if subject["kind"] == "shopfront" and max(len(t) for t in toks) < 5:
        return []
    lat, lon = subject["lat"], subject["lon"]
    cell = _cell(lat, lon)
    reach = int(math.ceil(rule["radius"] / 100.0))
    out = []
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            for f in grid.get((cell[0] + dy, cell[1] + dx), ()):
                d = _haversine(lat, lon, f["lat"], f["lon"])
                if d > rule["radius"]:
                    continue
                score = title_match(name, f["title"])
                if score < need:
                    continue
                out.append({"title": f["title"], "dist_m": round(d, 1), "score": round(score, 2), "source": "commons-geo"})
    out.sort(key=lambda r: (-r["score"], r["dist_m"]))
    return out


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return int(math.floor(lat / 0.0009)), int(math.floor(lon / 0.00144))  # ~100 m cells


def _grid(files: list[dict[str, Any]]) -> dict[tuple[int, int], list[dict[str, Any]]]:
    g: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for f in files:
        g.setdefault(_cell(f["lat"], f["lon"]), []).append(f)
    return g


# ---------------------------------------------------------------- pack


def build_reference_pack(
    district_id: str,
    doc: dict[str, Any],
    dossier: dict[str, Any],
    places: list[dict[str, Any]],
    root: Path,
    cache: Path,
    *,
    download: bool = True,
    refresh: bool = False,
    max_downloads: int = 360,
) -> dict[str, Any]:
    """Write ``root/references/index.json`` (+ thumbnails, contact sheet) and return it."""
    bbox = tuple(doc.get("bbox") or ())
    origin = tuple(doc.get("origin") or (0.0, 0.0))
    subjects = collect_subjects(dossier, places, doc.get("spawn"))

    files = commons_geo_index(bbox, cache / "commons_geo.json", refresh=refresh) if len(bbox) == 4 else []
    grid = _grid(files)
    qids = [s["wikidata"] for s in subjects if s.get("wikidata")]
    wd = wikidata_images(qids, cache / "wikidata_images.json", refresh=refresh)

    for s in subjects:
        cands: list[dict[str, Any]] = []
        for t in (wd.get(s.get("wikidata") or "") or {}).get("p18") or []:
            cands.append({"title": t, "source": "wikidata-p18", "score": 1.0})
        for key in ("image", "wikimedia_commons"):
            t = _commons_file((s.get("tags") or {}).get(key))
            if t:
                cands.append({"title": t, "source": f"osm-{key}", "score": 1.0})
        cands.extend(match_geo_files(s, files, grid))
        uniq, titles = [], set()
        for c in cands:
            if c["title"] in titles or re.search(r"\blogo\b|\.svg$|\.pdf$|\.webm$|\.ogv$", c["title"], re.I):
                continue
            titles.add(c["title"])
            uniq.append(c)
        s["images"] = uniq[: KIND_RULES[s["kind"]]["max"]]
        tags = s.get("tags") or {}
        links = {}
        if re.fullmatch(r"\d{6,20}", tags.get("mapillary") or ""):
            links["mapillary"] = f"https://www.mapillary.com/app/?pKey={tags['mapillary']}&focus=photo"
        if (tags.get("website") or "").startswith(("http://", "https://")):
            links["website"] = tags["website"]
        if links:
            s["links"] = links
        cat = (wd.get(s.get("wikidata") or "") or {}).get("p373")
        if cat:
            s["commons_category"] = f"https://commons.wikimedia.org/wiki/Category:{urllib.parse.quote(cat.replace(' ', '_'))}"

    with_images = [s for s in subjects if s["images"] or "mapillary" in (s.get("links") or {})]
    info = commons_imageinfo([im["title"] for s in with_images for im in s["images"]], cache / "commons_imageinfo.json")

    ref_dir = root / "references"
    ref_dir.mkdir(parents=True, exist_ok=True)
    budget = max_downloads
    order = {"landmark": 0, "sight": 1, "shopfront": 2}
    with_images.sort(key=lambda s: (order[s["kind"]], s.get("spawn_distance_m") or 1e9))
    slugs: set[str] = set()
    for s in with_images:
        slug = slugify(s["name"] or f"{s['osm_type']}-{s['osm_id']}")
        if slug in slugs:
            slug = f"{slug}-{s['osm_id']}"
        slugs.add(slug)
        s["slug"] = slug
        kept = []
        for n, im in enumerate(s["images"], start=1):
            meta = info.get(im["title"]) or {}
            if not meta.get("thumb") or not str(meta.get("mime") or "").startswith("image/"):
                continue
            im.update({k: meta.get(k) for k in ("thumb", "page", "width", "height", "author", "license", "date", "description")})
            rel = f"{slug}/{n:02d}.jpg"
            dest = ref_dir / rel
            if dest.exists():
                im["file"] = rel
            elif download and budget > 0 and _download(meta["thumb"], dest):
                im["file"] = rel
                budget -= 1
                time.sleep(0.1)
            kept.append(im)
        s["images"] = kept
        if origin[0]:
            x, y = project(s["lat"], s["lon"], float(origin[0]), float(origin[1]))
            s["xy"] = [round(x, 2), round(y, 2)]
        s.pop("tags", None)

    rows = [s for s in with_images if s["images"] or s.get("links")]
    pack = {
        "district_id": district_id,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "attribution": "Photos: Wikimedia Commons contributors (see per-image author + licence)",
        "counts": {
            "subjects": len(subjects),
            "with_images": len(rows),
            "landmark": sum(1 for s in rows if s["kind"] == "landmark"),
            "sight": sum(1 for s in rows if s["kind"] == "sight"),
            "shopfront": sum(1 for s in rows if s["kind"] == "shopfront"),
            "images": sum(len(s["images"]) for s in rows),
            "mapillary_links": sum(1 for s in rows if "mapillary" in (s.get("links") or {})),
        },
        "without_images": [
            {"kind": s["kind"], "name": s["name"], "osm_type": s["osm_type"], "osm_id": s["osm_id"]}
            for s in subjects
            if not s["images"] and s["kind"] != "shopfront"
        ],
        "places": rows,
    }
    (ref_dir / "index.json").write_text(json.dumps(pack, indent=1, ensure_ascii=False) + "\n")
    (ref_dir / "index.html").write_text(render_contact_sheet(doc.get("title") or district_id, rows))
    print(
        f"Wrote {ref_dir / 'index.json'}: {pack['counts']['with_images']} places, "
        f"{pack['counts']['images']} images"
    )
    return pack


def render_contact_sheet(title: str, rows: list[dict[str, Any]], *, base: str = "") -> str:
    """HTML grid of every reference image (local file when present, else Commons thumb)."""
    sections = []
    for kind, label in (("landmark", "Landmarks"), ("sight", "Sights & heritage"), ("shopfront", "Shops & horeca")):
        cards = []
        for s in rows:
            if s["kind"] != kind:
                continue
            imgs = "".join(
                f'<a href="{html.escape(im.get("page") or "#")}" title="{html.escape((im.get("author") or "") + " · " + (im.get("license") or ""))}">'
                f'<img loading="lazy" src="{html.escape(base + im["file"] if im.get("file") else im.get("thumb") or "")}" alt=""></a>'
                for im in s["images"]
            )
            sub = " · ".join(
                str(x)
                for x in (s.get("category"), s.get("address"), s.get("custom") and f"mesh {s['custom']}", s.get("wikidata"))
                if x
            )
            sub_html = html.escape(sub) + "".join(
                f' · <a href="{html.escape(url)}">{html.escape(label_)}</a>'
                for label_, url in (s.get("links") or {}).items()
            )
            cards.append(
                f'<article><div class="imgs">{imgs}</div><h3>{html.escape(s["name"])}</h3>'
                f'<p>{sub_html}</p><p class="m">{s["osm_type"]} {s["osm_id"]} · '
                f'{s.get("spawn_distance_m", "?")} m from spawn</p></article>'
            )
        if cards:
            sections.append(f"<h2>{label} ({len(cards)})</h2><div class='grid'>{''.join(cards)}</div>")
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>References — {html.escape(title)}</title>
<style>
body{{margin:0;padding:1.5rem 2rem;background:#0f141c;color:#e8eef6;font:14px/1.4 system-ui,sans-serif}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}}
article{{background:#1a2330;border-radius:10px;padding:.7rem}}
.imgs{{display:flex;gap:4px;overflow-x:auto}} .imgs img{{height:150px;border-radius:4px}}
h3{{margin:.5rem 0 .2rem;font-size:1rem}} p{{margin:.1rem 0;color:#a9b7c8}} .m{{font-size:.8rem;color:#7d8da0}}
</style></head><body><h1>Picture references — {html.escape(title)}</h1>
<p>Wikimedia Commons photos, matched by Wikidata, OSM tags, and geotag + title. Hover for author / licence; click for the file page.</p>
{''.join(sections)}
</body></html>
"""


def references_by_osm(pack: dict[str, Any] | None) -> dict[tuple[str, int], dict[str, Any]]:
    out = {}
    for s in (pack or {}).get("places") or []:
        if s.get("osm_id"):
            out[(str(s["osm_type"]), int(s["osm_id"]))] = s
    return out
