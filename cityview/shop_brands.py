"""Shop / bank brand keys and fascia colours (no trademark logos — colour + label only)."""

from __future__ import annotations

import re
from typing import Any

# brand_key → display label + fascia / accent / glass RGBA + shopfront mood
BRAND_FASCIA: dict[str, dict[str, Any]] = {
    # Supermarkets (existing)
    "aldi": {
        "label": "ALDI",
        "fascia": (0.05, 0.22, 0.55, 1.0),
        "accent": (0.92, 0.45, 0.08, 1.0),
        "glass": (0.55, 0.65, 0.75, 1.0),
        "mood": "retail",
    },
    "lidl": {
        "label": "Lidl",
        "fascia": (0.05, 0.28, 0.62, 1.0),
        "accent": (0.95, 0.82, 0.08, 1.0),
        "glass": (0.55, 0.65, 0.75, 1.0),
        "mood": "retail",
    },
    "jumbo": {
        "label": "Jumbo",
        "fascia": (0.95, 0.78, 0.08, 1.0),
        "accent": (0.12, 0.12, 0.12, 1.0),
        "glass": (0.55, 0.65, 0.75, 1.0),
        "mood": "retail",
    },
    "carrefour": {
        "label": "Carrefour",
        "fascia": (0.05, 0.28, 0.62, 1.0),
        "accent": (0.85, 0.12, 0.14, 1.0),
        "glass": (0.55, 0.65, 0.75, 1.0),
        "mood": "retail",
    },
    # Belgian high-street banks — regional office look, muted corporate colours
    "belfius": {
        "label": "Belfius",
        "fascia": (0.55, 0.08, 0.42, 1.0),
        "accent": (1.0, 1.0, 1.0, 1.0),
        "glass": (0.72, 0.78, 0.85, 1.0),
        "mood": "bank",
    },
    "kbc": {
        "label": "KBC",
        "fascia": (0.00, 0.45, 0.28, 1.0),
        "accent": (0.95, 0.82, 0.10, 1.0),
        "glass": (0.70, 0.78, 0.82, 1.0),
        "mood": "bank",
    },
    "crelan": {
        "label": "Crelan",
        "fascia": (0.05, 0.38, 0.22, 1.0),
        "accent": (0.95, 0.95, 0.92, 1.0),
        "glass": (0.68, 0.76, 0.80, 1.0),
        "mood": "bank",
    },
    "bpost": {
        "label": "bpost bank",
        "fascia": (0.92, 0.55, 0.05, 1.0),
        "accent": (0.12, 0.12, 0.12, 1.0),
        "glass": (0.70, 0.75, 0.78, 1.0),
        "mood": "bank",
    },
    "ing": {
        "label": "ING",
        "fascia": (0.95, 0.55, 0.05, 1.0),
        "accent": (0.10, 0.10, 0.12, 1.0),
        "glass": (0.70, 0.75, 0.80, 1.0),
        "mood": "bank",
    },
    "argenta": {
        "label": "Argenta",
        "fascia": (0.72, 0.08, 0.18, 1.0),
        "accent": (1.0, 1.0, 1.0, 1.0),
        "glass": (0.70, 0.76, 0.82, 1.0),
        "mood": "bank",
    },
    "bnp": {
        "label": "BNP Paribas Fortis",
        "fascia": (0.05, 0.22, 0.55, 1.0),
        "accent": (0.85, 0.12, 0.18, 1.0),
        "glass": (0.70, 0.76, 0.82, 1.0),
        "mood": "bank",
    },
}



def _b(label: str, fascia, accent, mood: str = "retail", glass=(0.55, 0.62, 0.70), front: str | None = None, awning=None):
    out = {
        "label": label,
        "fascia": (*fascia, 1.0),
        "accent": (*accent, 1.0),
        "glass": (*glass, 1.0),
        "mood": mood,
    }
    if front:
        out["front"] = front
    if awning:
        out["awning"] = awning
    return out


# Belgian high street + horeca chains: house colours as seen on the street (label only).
BRAND_FASCIA.update(
    {
        "delhaize": _b("Delhaize", (0.80, 0.08, 0.14), (1.0, 1.0, 1.0)),
        "colruyt": _b("Colruyt", (0.85, 0.12, 0.12), (1.0, 1.0, 1.0)),
        "okay": _b("OKay", (0.86, 0.14, 0.18), (1.0, 1.0, 1.0)),
        "spar": _b("SPAR", (0.0, 0.48, 0.25), (0.92, 0.12, 0.14)),
        "albert_heijn": _b("Albert Heijn", (0.0, 0.62, 0.88), (1.0, 1.0, 1.0)),
        "proxy": _b("Proxy Delhaize", (0.80, 0.08, 0.14), (1.0, 1.0, 1.0)),
        "night_shop": _b("Night Shop", (0.10, 0.10, 0.14), (0.98, 0.84, 0.18)),
        "kruidvat": _b("Kruidvat", (0.86, 0.06, 0.20), (1.0, 1.0, 1.0)),
        "hema": _b("HEMA", (0.86, 0.08, 0.14), (1.0, 1.0, 1.0)),
        "action": _b("Action", (0.0, 0.32, 0.64), (1.0, 1.0, 1.0)),
        "zeeman": _b("Zeeman", (0.0, 0.33, 0.62), (1.0, 1.0, 1.0)),
        "di": _b("Di", (0.88, 0.10, 0.48), (1.0, 1.0, 1.0)),
        "ici_paris": _b("ICI PARIS XL", (0.06, 0.06, 0.07), (1.0, 1.0, 1.0), front="boutique"),
        "douglas": _b("DOUGLAS", (0.05, 0.05, 0.06), (0.62, 0.86, 0.84), front="boutique"),
        "rituals": _b("RITUALS...", (0.12, 0.11, 0.10), (0.85, 0.72, 0.48), front="boutique"),
        "lush": _b("LUSH", (0.05, 0.05, 0.05), (1.0, 1.0, 1.0), front="boutique"),
        "zara": _b("ZARA", (0.06, 0.06, 0.06), (1.0, 1.0, 1.0), front="boutique", glass=(0.70, 0.72, 0.72)),
        "hm": _b("H&M", (1.0, 1.0, 1.0), (0.88, 0.06, 0.10), front="boutique", glass=(0.70, 0.72, 0.72)),
        "primark": _b("PRIMARK", (0.0, 0.62, 0.86), (1.0, 1.0, 1.0), front="boutique"),
        "c_and_a": _b("C&A", (0.0, 0.25, 0.60), (1.0, 1.0, 1.0), front="boutique"),
        "jbc": _b("JBC", (0.10, 0.10, 0.10), (1.0, 1.0, 1.0), front="boutique"),
        "mango": _b("MANGO", (0.08, 0.08, 0.08), (1.0, 1.0, 1.0), front="boutique"),
        "uniqlo": _b("UNIQLO", (0.90, 0.0, 0.07), (1.0, 1.0, 1.0), front="boutique"),
        "nike": _b("NIKE", (0.05, 0.05, 0.05), (1.0, 1.0, 1.0), front="boutique"),
        "torfs": _b("TORFS", (0.10, 0.10, 0.12), (1.0, 1.0, 1.0), front="boutique"),
        "pandora": _b("PANDORA", (0.98, 0.94, 0.94), (0.12, 0.10, 0.10), front="boutique"),
        "apple": _b("Apple", (0.92, 0.92, 0.93), (0.20, 0.20, 0.22), front="boutique", glass=(0.75, 0.78, 0.80)),
        "media_markt": _b("MediaMarkt", (0.86, 0.0, 0.0), (1.0, 1.0, 1.0)),
        "fnac": _b("fnac", (0.98, 0.72, 0.0), (0.10, 0.10, 0.10)),
        "standaard_boekhandel": _b("Standaard Boekhandel", (0.0, 0.55, 0.30), (1.0, 1.0, 1.0)),
        "club": _b("Club", (0.10, 0.36, 0.66), (1.0, 1.0, 1.0)),
        "proximus": _b("Proximus", (0.36, 0.16, 0.56), (1.0, 1.0, 1.0)),
        "orange": _b("orange", (0.0, 0.0, 0.0), (1.0, 0.47, 0.0)),
        "base": _b("BASE", (0.0, 0.0, 0.0), (0.62, 0.86, 0.20)),
        "telenet": _b("Telenet", (1.0, 0.83, 0.0), (0.10, 0.10, 0.10)),
        "leonidas": _b("Leonidas", (0.10, 0.12, 0.30), (0.88, 0.74, 0.40), mood="cafe", front="chocolatier"),
        "neuhaus": _b("NEUHAUS", (0.20, 0.13, 0.10), (0.88, 0.74, 0.40), front="chocolatier"),
        "godiva": _b("GODIVA", (0.12, 0.09, 0.07), (0.86, 0.72, 0.38), front="chocolatier"),
        "jeff_de_bruges": _b("Jeff de Bruges", (0.36, 0.18, 0.10), (0.94, 0.86, 0.70), front="chocolatier"),
        "multatuli": _b("Multatuli", (0.18, 0.18, 0.20), (0.92, 0.88, 0.80)),
        "starbucks": _b("STARBUCKS", (0.0, 0.38, 0.27), (1.0, 1.0, 1.0), mood="cafe", front="cafe"),
        "mcdonalds": _b("McDonald's", (0.80, 0.08, 0.06), (1.0, 0.78, 0.0), front="fastfood"),
        "burger_king": _b("BURGER KING", (0.31, 0.15, 0.08), (0.96, 0.62, 0.12), front="fastfood"),
        "quick": _b("QUICK", (0.85, 0.08, 0.10), (1.0, 1.0, 1.0), front="fastfood"),
        "kfc": _b("KFC", (0.70, 0.04, 0.10), (1.0, 1.0, 1.0), front="fastfood"),
        "subway": _b("SUBWAY", (0.0, 0.50, 0.25), (1.0, 0.80, 0.0), front="fastfood"),
        "dominos": _b("Domino's", (0.0, 0.40, 0.65), (0.90, 0.12, 0.20), front="fastfood"),
        "pizza_hut": _b("Pizza Hut", (0.78, 0.06, 0.12), (1.0, 1.0, 1.0), front="restaurant"),
        "panos": _b("PANOS", (0.70, 0.10, 0.12), (1.0, 0.92, 0.70), front="bakery"),
        "exki": _b("EXKi", (0.30, 0.42, 0.18), (1.0, 1.0, 1.0), mood="cafe", front="cafe"),
        "le_pain_quotidien": _b("LE PAIN QUOTIDIEN", (0.90, 0.86, 0.78), (0.30, 0.24, 0.18), mood="cafe", front="cafe"),
        "paul": _b("PAUL", (0.10, 0.10, 0.10), (0.92, 0.84, 0.66), front="bakery"),
        "balls_glory": _b("Balls & Glory", (0.06, 0.06, 0.06), (1.0, 1.0, 1.0), front="restaurant"),
        "lunch_garden": _b("Lunch Garden", (0.0, 0.50, 0.30), (1.0, 1.0, 1.0), front="restaurant"),
        "ellis": _b("ELLIS", (0.10, 0.10, 0.12), (0.98, 0.78, 0.10), front="restaurant"),
        "sushi_shop": _b("Sushi Shop", (0.06, 0.06, 0.06), (1.0, 1.0, 1.0), front="restaurant"),
        "wok_to_walk": _b("WOK TO WALK", (0.86, 0.12, 0.10), (1.0, 1.0, 1.0), front="fastfood"),
        "o_tacos": _b("O'TACOS", (0.05, 0.05, 0.05), (0.98, 0.80, 0.0), front="fastfood"),
        "deli_traiteur": _b("Délifrance", (0.06, 0.24, 0.48), (0.96, 0.84, 0.56), front="bakery"),
        "bakker_aernoudt": _b("Aernoudt", (0.36, 0.20, 0.12), (0.96, 0.88, 0.70), front="bakery"),
        "copy_center": _b("Copy", (0.0, 0.32, 0.62), (1.0, 1.0, 1.0)),
    }
)

# Hipster Antwerp café defaults (rotated by shop id) — no brand needed
CAFE_PALETTES: list[dict[str, Any]] = [
    {
        "fascia": (0.14, 0.22, 0.18, 1.0),
        "accent": (0.92, 0.78, 0.42, 1.0),
        "glass": (0.55, 0.48, 0.38, 1.0),
        "mood": "cafe",
    },
    {
        "fascia": (0.42, 0.12, 0.14, 1.0),
        "accent": (0.94, 0.88, 0.72, 1.0),
        "glass": (0.48, 0.42, 0.36, 1.0),
        "mood": "cafe",
    },
    {
        "fascia": (0.18, 0.16, 0.14, 1.0),
        "accent": (0.85, 0.55, 0.28, 1.0),
        "glass": (0.42, 0.40, 0.36, 1.0),
        "mood": "cafe",
    },
    {
        "fascia": (0.12, 0.28, 0.32, 1.0),
        "accent": (0.90, 0.82, 0.62, 1.0),
        "glass": (0.45, 0.50, 0.48, 1.0),
        "mood": "cafe",
    },
]

GENERIC_SUPERMARKET = {
    "label": "",
    "fascia": (0.28, 0.42, 0.34, 1.0),
    "accent": (0.72, 0.74, 0.70, 1.0),
    "glass": (0.55, 0.65, 0.75, 1.0),
    "mood": "retail",
}

GENERIC_BANK = {
    "label": "",
    "fascia": (0.12, 0.18, 0.28, 1.0),
    "accent": (0.90, 0.90, 0.88, 1.0),
    "glass": (0.70, 0.76, 0.82, 1.0),
    "mood": "bank",
}

_BRAND_ALIASES: list[tuple[str, str]] = [
    ("aldi", "aldi"),
    ("lidl", "lidl"),
    ("jumbo", "jumbo"),
    ("carrefour express", "carrefour"),
    ("carrefour market", "carrefour"),
    ("carrefour", "carrefour"),
    ("belfius", "belfius"),
    ("kbc brussels", "kbc"),
    ("kbc", "kbc"),
    ("crelan", "crelan"),
    ("bpost bank", "bpost"),
    ("bpost", "bpost"),
    ("ing bank", "ing"),
    ("ing", "ing"),
    ("argenta", "argenta"),
    ("bnp paribas fortis", "bnp"),
    ("bnp paribas", "bnp"),
    ("fortis", "bnp"),
    ("proxy delhaize", "proxy"),
    ("ad delhaize", "delhaize"),
    ("shop & go", "delhaize"),
    ("delhaize", "delhaize"),
    ("colruyt", "colruyt"),
    ("okay", "okay"),
    ("spar", "spar"),
    ("albert heijn", "albert_heijn"),
    ("ah to go", "albert_heijn"),
    ("night shop", "night_shop"),
    ("nightshop", "night_shop"),
    ("kruidvat", "kruidvat"),
    ("hema", "hema"),
    ("action", "action"),
    ("zeeman", "zeeman"),
    ("ici paris xl", "ici_paris"),
    ("douglas", "douglas"),
    ("rituals", "rituals"),
    ("lush", "lush"),
    ("zara", "zara"),
    ("h&m", "hm"),
    ("h & m", "hm"),
    ("primark", "primark"),
    ("c&a", "c_and_a"),
    ("jbc", "jbc"),
    ("mango", "mango"),
    ("uniqlo", "uniqlo"),
    ("nike", "nike"),
    ("torfs", "torfs"),
    ("pandora", "pandora"),
    ("apple store", "apple"),
    ("mediamarkt", "media_markt"),
    ("media markt", "media_markt"),
    ("fnac", "fnac"),
    ("standaard boekhandel", "standaard_boekhandel"),
    ("proximus", "proximus"),
    ("orange", "orange"),
    ("telenet", "telenet"),
    ("leonidas", "leonidas"),
    ("neuhaus", "neuhaus"),
    ("godiva", "godiva"),
    ("jeff de bruges", "jeff_de_bruges"),
    ("multatuli", "multatuli"),
    ("starbucks", "starbucks"),
    ("mcdonald's", "mcdonalds"),
    ("mcdonalds", "mcdonalds"),
    ("burger king", "burger_king"),
    ("quick", "quick"),
    ("kfc", "kfc"),
    ("subway", "subway"),
    ("domino's", "dominos"),
    ("dominos", "dominos"),
    ("pizza hut", "pizza_hut"),
    ("panos", "panos"),
    ("exki", "exki"),
    ("le pain quotidien", "le_pain_quotidien"),
    ("paul", "paul"),
    ("balls & glory", "balls_glory"),
    ("lunch garden", "lunch_garden"),
    ("ellis gourmet burger", "ellis"),
    ("sushi shop", "sushi_shop"),
    ("wok to walk", "wok_to_walk"),
    ("o'tacos", "o_tacos"),
    ("délifrance", "deli_traiteur"),
    ("delifrance", "deli_traiteur"),
    ("aernoudt", "bakker_aernoudt"),
]
# Short / common-word brands only count from brand= / operator=, never a shop name
# ("Paul's Boutique", "Base Camp", "Action Tattoo").
_TAG_ONLY_BRANDS = frozenset({"paul", "base", "orange", "action", "club", "quick", "subway", "spar", "okay", "nike", "mango", "di"})
# Bank keys must not hitch a ride on everyday words ("Voeding", "Printing", …).
_BANK_BRANDS = frozenset({"belfius", "kbc", "crelan", "bpost", "ing", "argenta", "bnp"})


def _phrase_in_text(needle: str, text: str) -> bool:
    """True when ``needle`` appears as whole word(s), not a substring of a longer token."""
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", text) is not None


def normalize_shop_brand(tags: dict[str, str]) -> str | None:
    """Map OSM brand/name/operator tags to a known brand_key, or None."""
    amenity = (tags.get("amenity") or "").lower()
    shop = (tags.get("shop") or "").lower()
    is_bank = amenity == "bank" or shop == "bank"
    for key in ("brand", "operator", "name"):
        raw = (tags.get(key) or "").strip().lower()
        if not raw:
            continue
        name_says_bank = key == "name" and _phrase_in_text("bank", raw)
        for needle, brand_key in _BRAND_ALIASES:
            if not _phrase_in_text(needle, raw):
                continue
            # Bank fascia only for real banks, brand=/operator=, or a name that says "bank".
            if brand_key in _BANK_BRANDS and key == "name" and not is_bank and not name_says_bank:
                continue
            if brand_key in _TAG_ONLY_BRANDS and key == "name" and raw != needle:
                continue
            return brand_key
    return None


def fascia_for_brand(brand_key: str | None) -> dict[str, Any]:
    if brand_key and brand_key in BRAND_FASCIA:
        return dict(BRAND_FASCIA[brand_key])
    return dict(GENERIC_SUPERMARKET)


def shopfront_style(
    tags: dict[str, str] | None,
    kind: str,
    category: str,
    shop_id: int = 0,
) -> dict[str, Any]:
    """Viewer / Blender shopfront look: brand when known, else mood from kind."""
    tags = tags or {}
    brand = normalize_shop_brand(tags)
    if brand and brand in BRAND_FASCIA:
        out = dict(BRAND_FASCIA[brand])
        out["brand"] = brand
        out.setdefault("front", "bank" if out.get("mood") == "bank" else front_for(tags, kind, category))
        return out
    if kind == "bank" or category == "service" and kind == "bank":
        out = dict(GENERIC_BANK)
        out["label"] = (tags.get("name") or tags.get("brand") or "Bank")[:22]
        out["brand"] = None
        out["front"] = "bank"
        return out
    front = front_for(tags, kind, category)
    if kind in {"cafe", "coffee"} or (category == "horeca" and kind in {"cafe", "bar"}):
        out = dict(CAFE_PALETTES[shop_id % len(CAFE_PALETTES)])
        out["label"] = (tags.get("name") or tags.get("brand") or "")[:22]
        out["brand"] = None
        out["front"] = front
        return out
    if kind == "supermarket" or category == "food" and kind == "supermarket":
        out = dict(GENERIC_SUPERMARKET)
        out["front"] = "market"
        return out
    palettes = FRONT_PALETTES.get(front)
    if palettes:
        fascia, accent, glass = palettes[shop_id % len(palettes)]
        return {
            "label": (tags.get("name") or "")[:22],
            "fascia": (*fascia, 1.0),
            "accent": (*accent, 1.0),
            "glass": (*glass, 1.0),
            "mood": "cafe" if category == "horeca" else "retail",
            "brand": None,
            "front": front,
        }
    return {
        "label": (tags.get("name") or "")[:22],
        "fascia": (0.22, 0.18, 0.16, 1.0),
        "accent": (0.92, 0.84, 0.62, 1.0),
        "glass": (0.50, 0.48, 0.44, 1.0),
        "mood": "retail",
        "brand": None,
        "front": front,
    }


# Shopfront archetypes, as they read from the pavement in Antwerp.
BOUTIQUE_KINDS = frozenset(
    {
        "clothes", "shoes", "jewelry", "boutique", "fashion_accessories", "cosmetics", "perfumery",
        "bag", "watches", "leather", "beauty", "optician", "fashion", "lingerie", "hairdresser",
        "mobile_phone", "electronics", "interior_decoration", "furniture", "houseware",
    }
)
HERITAGE_KINDS = frozenset(
    {
        "books", "gift", "art", "antiques", "second_hand", "music", "musical_instrument", "toys",
        "games", "stationery", "frame", "craft", "tobacco", "wine", "alcohol", "tea", "coffee",
        "cheese", "deli", "florist", "hats", "comics", "collector", "variety_store",
    }
)
BAKERY_KINDS = frozenset({"bakery", "pastry", "confectionery", "ice_cream"})
MARKET_KINDS = frozenset({"supermarket", "convenience", "greengrocer", "butcher", "seafood", "kiosk", "chemist", "variety_store"})


def front_for(tags: dict[str, str], kind: str, category: str) -> str:
    """Shopfront archetype for a kind: drives frame, glazing, door and awning in the viewer."""
    name = (tags.get("name") or "").lower()
    if kind == "bank":
        return "bank"
    if category == "pharmacy":
        return "pharmacy"
    if kind in {"bar", "pub", "biergarten", "nightclub"}:
        return "bar"
    if kind == "cafe":
        return "cafe"
    if kind == "restaurant":
        return "restaurant"
    if kind == "fast_food":
        if re.search(r"fri(t|e)", name) or (tags.get("cuisine") or "").find("friture") >= 0:
            return "frituur"
        return "fastfood"
    if kind == "chocolate":
        return "chocolatier"
    if kind in BAKERY_KINDS:
        return "bakery"
    if kind in MARKET_KINDS:
        return "market"
    if kind in BOUTIQUE_KINDS:
        return "boutique"
    if kind in HERITAGE_KINDS:
        return "heritage"
    if category == "care" or category == "service":
        return "office"
    return "plain"


# front → [(fascia, accent, glass)] rotated by shop id
FRONT_PALETTES: dict[str, list[tuple[tuple[float, float, float], ...]]] = {
    "bar": [
        ((0.22, 0.12, 0.08), (0.94, 0.78, 0.44), (0.62, 0.42, 0.20)),  # varnished oak
        ((0.30, 0.06, 0.08), (0.95, 0.86, 0.62), (0.58, 0.38, 0.18)),  # oxblood
        ((0.07, 0.16, 0.11), (0.92, 0.80, 0.50), (0.56, 0.40, 0.20)),  # bottle green
        ((0.06, 0.06, 0.07), (0.90, 0.72, 0.36), (0.60, 0.40, 0.18)),  # lacquer black
    ],
    "restaurant": [
        ((0.12, 0.12, 0.13), (0.95, 0.92, 0.86), (0.55, 0.46, 0.36)),
        ((0.40, 0.08, 0.10), (0.96, 0.90, 0.78), (0.55, 0.44, 0.32)),
        ((0.10, 0.20, 0.16), (0.94, 0.88, 0.72), (0.52, 0.46, 0.36)),
        ((0.10, 0.14, 0.26), (0.95, 0.90, 0.80), (0.52, 0.48, 0.42)),
        ((0.84, 0.80, 0.72), (0.18, 0.14, 0.12), (0.52, 0.46, 0.38)),
    ],
    "frituur": [
        ((0.96, 0.78, 0.08), (0.78, 0.08, 0.06), (0.80, 0.78, 0.70)),
        ((0.82, 0.10, 0.08), (1.0, 0.86, 0.20), (0.80, 0.78, 0.70)),
    ],
    "fastfood": [
        ((0.80, 0.10, 0.10), (1.0, 1.0, 1.0), (0.78, 0.76, 0.70)),
        ((0.08, 0.08, 0.10), (0.98, 0.76, 0.12), (0.76, 0.74, 0.68)),
        ((0.06, 0.40, 0.30), (1.0, 1.0, 1.0), (0.76, 0.74, 0.68)),
    ],
    "bakery": [
        ((0.92, 0.86, 0.74), (0.42, 0.24, 0.14), (0.72, 0.66, 0.56)),
        ((0.62, 0.78, 0.80), (0.20, 0.18, 0.18), (0.72, 0.68, 0.60)),
        ((0.90, 0.72, 0.74), (0.30, 0.16, 0.16), (0.72, 0.66, 0.58)),
    ],
    "chocolatier": [
        ((0.24, 0.13, 0.08), (0.88, 0.74, 0.42), (0.62, 0.50, 0.36)),
        ((0.10, 0.09, 0.08), (0.86, 0.72, 0.40), (0.60, 0.50, 0.38)),
    ],
    "market": [
        ((0.18, 0.40, 0.24), (1.0, 1.0, 1.0), (0.70, 0.74, 0.74)),
        ((0.80, 0.14, 0.12), (1.0, 1.0, 1.0), (0.70, 0.74, 0.74)),
        ((0.14, 0.22, 0.42), (0.98, 0.84, 0.30), (0.70, 0.74, 0.74)),
    ],
    "boutique": [
        ((0.06, 0.06, 0.06), (1.0, 1.0, 1.0), (0.66, 0.68, 0.68)),
        ((0.92, 0.90, 0.86), (0.10, 0.10, 0.10), (0.66, 0.68, 0.68)),
        ((0.46, 0.42, 0.36), (1.0, 0.98, 0.94), (0.64, 0.66, 0.66)),
        ((0.16, 0.20, 0.24), (0.92, 0.86, 0.72), (0.64, 0.66, 0.66)),
    ],
    "heritage": [
        ((0.10, 0.20, 0.18), (0.92, 0.80, 0.52), (0.52, 0.48, 0.40)),
        ((0.36, 0.10, 0.10), (0.94, 0.86, 0.66), (0.52, 0.46, 0.40)),
        ((0.12, 0.16, 0.28), (0.92, 0.84, 0.62), (0.52, 0.48, 0.44)),
        ((0.28, 0.20, 0.12), (0.94, 0.88, 0.72), (0.52, 0.46, 0.38)),
    ],
    "office": [
        ((0.22, 0.24, 0.27), (0.92, 0.94, 0.96), (0.62, 0.68, 0.72)),
        ((0.92, 0.92, 0.90), (0.16, 0.30, 0.48), (0.64, 0.68, 0.72)),
    ],
}

# front → awning (None = flush fascia only)
AWNING_FRONTS = frozenset({"restaurant", "cafe", "bakery", "market", "frituur", "chocolatier"})
STRIPED_KINDS = frozenset({"greengrocer", "butcher", "ice_cream", "seafood", "fishmonger"})


def awning_for(front: str, kind: str, fascia, accent, shop_id: int, terrace: bool) -> dict[str, Any] | None:
    """Canvas awning spec ``{colour, stripe}`` or None. Terraces nearly always have one."""
    if front not in AWNING_FRONTS and not terrace:
        return None
    # Not every café has a sunshade: deterministic ~65% share.
    if front in {"cafe", "restaurant", "bar"} and ((shop_id * 2654435761) >> 7) % 100 >= 65:
        return None
    colour = tuple(fascia[:3])
    if sum(colour) > 2.4:  # white / cream boards: a darker canvas reads better
        colour = tuple(accent[:3])
    stripe = (0.96, 0.95, 0.90) if kind in STRIPED_KINDS else None
    return {"colour": [round(c, 3) for c in colour], "stripe": stripe and [round(c, 3) for c in stripe]}
