from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "wikidata" / "game.json"
ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "GAME-validation/0.1 (local development)"

CATEGORIES = {
    "human": ["Q5"],
    "animal": ["Q729"],
    "plant": ["Q756"],
    "object": ["Q223557"],
    "country": ["Q3624078", "Q6256"],
}


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def build_query(types: list[str], limit: int, offset: int) -> str:
    values = " ".join(f"wd:{q}" for q in types)
    return f"""
SELECT ?item ?itemLabel ?alias WHERE {{
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type {{ {values} }}
  ?item rdfs:label ?itemLabel .
  FILTER(LANG(?itemLabel) = \"ar\")
  OPTIONAL {{ ?item skos:altLabel ?alias . FILTER(LANG(?alias) = \"ar\") }}
}}
ORDER BY ?item
LIMIT {limit}
OFFSET {offset}
""".strip()


def query_wikidata(query: str) -> list[dict[str, str]]:
    encoded = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
    request = urllib.request.Request(
        ENDPOINT,
        data=encoded,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    rows: list[dict[str, str]] = []
    for row in payload.get("results", {}).get("bindings", []):
        rows.append({
            "id": row.get("item", {}).get("value", "").rsplit("/", 1)[-1],
            "word": row.get("itemLabel", {}).get("value", ""),
            "alias": row.get("alias", {}).get("value", ""),
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a bounded Arabic GAME subset from Wikidata")
    parser.add_argument("--limit", type=int, default=2000)
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--sleep", type=float, default=1.5)
    args = parser.parse_args()

    if args.limit <= 0 or args.pages <= 0:
        raise SystemExit("--limit and --pages must be greater than zero")

    data: dict[str, dict[str, object]] = {}
    total_requests = 0

    for category, types in CATEGORIES.items():
        for page in range(args.pages):
            offset = page * args.limit
            print(f"Wikidata: {category} page {page + 1}/{args.pages} (offset {offset})")
            rows = query_wikidata(build_query(types, args.limit, offset))
            total_requests += 1
            if not rows:
                print("  no more rows")
                break

            for row in rows:
                word = normalize(row["word"])
                if not word or len(word) < 2:
                    continue
                entry = data.setdefault(
                    word,
                    {
                        "categories": set(),
                        "aliases": set(),
                        "wikidata_ids": set(),
                        "source": "wikidata",
                        "confidence": 0.92,
                    },
                )
                entry["categories"].add(category)
                if row["alias"]:
                    entry["aliases"].add(normalize(row["alias"]))
                if row["id"]:
                    entry["wikidata_ids"].add(row["id"])

            print(f"  rows: {len(rows):,}; unique words: {len(data):,}")
            time.sleep(max(0.0, args.sleep))

    serializable = {}
    for word, entry in data.items():
        categories = sorted(entry["categories"])
        if len(categories) != 1:
            continue
        serializable[word] = {
            "category": categories[0],
            "aliases": sorted(a for a in entry["aliases"] if a and a != word),
            "wikidata_ids": sorted(entry["wikidata_ids"]),
            "source": entry["source"],
            "confidence": entry["confidence"],
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "source": "Wikidata",
                "source_url": "https://www.wikidata.org/",
                "license": "CC0 for structured data",
                "language": "ar",
                "requests": total_requests,
                "entries": serializable,
                "counts": {
                    category: sum(1 for item in serializable.values() if item["category"] == category)
                    for category in CATEGORIES
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Saved {len(serializable):,} unique Arabic GAME entries")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
