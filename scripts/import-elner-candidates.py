from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "elner-dz"
PARQUET = DATA_DIR / "train.parquet"
OUTPUT = DATA_DIR / "candidates.json"
URL = "https://huggingface.co/datasets/HadjerHaninebgt7878/ELNER-DZ/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def is_arabic_form(value: str) -> bool:
    return bool(value) and all(("\u0600" <= ch <= "\u06FF") or ch.isspace() for ch in value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if PARQUET.exists():
        return
    print(f"Downloading ELNER-DZ parquet from {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": "GAME-validation/0.3"})
    with urllib.request.urlopen(request, timeout=180) as response, PARQUET.open("wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def main() -> int:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        raise SystemExit("Missing pyarrow. Install it with: python -m pip install pyarrow")

    download()
    table = pq.read_table(PARQUET, columns=["entities"])
    rows = table.column("entities").to_pylist()

    candidates: dict[str, dict[str, object]] = {}
    label_counts: dict[str, int] = {}
    skipped_non_arabic = 0

    # Safe GAME mappings only:
    # PER -> human, PROD -> object. LOC/GPE are retained as location candidates
    # because a location is not necessarily a country and must be verified later.
    safe_map = {"PER": "human", "PROD": "object"}

    for entities in rows:
        if not entities:
            continue
        for entity in entities:
            if not isinstance(entity, dict):
                continue
            label = str(entity.get("label") or "").upper()
            value = normalize(str(entity.get("entity") or ""))
            if not is_arabic_form(value) or len(value) < 2:
                if value:
                    skipped_non_arabic += 1
                continue

            label_counts[label] = label_counts.get(label, 0) + 1
            category = safe_map.get(label)
            item = {
                "word": value,
                "label": label,
                "wikidata_id": entity.get("wikidata_id"),
                "source": "ELNER-DZ",
                "license": "CC BY 4.0",
                "tier": "linked-candidate",
            }
            if category:
                item["category_candidate"] = category
            elif label in {"LOC", "GPE"}:
                item["category_candidate"] = "location-review"
            else:
                item["category_candidate"] = "review"

            existing = candidates.get(value)
            if existing is None:
                candidates[value] = item
            else:
                # Prefer safe categories when the same surface form appears with
                # multiple labels, but keep the Wikidata identifier when present.
                if existing.get("category_candidate") == "review" and item.get("category_candidate") != "review":
                    candidates[value] = item
                elif not existing.get("wikidata_id") and item.get("wikidata_id"):
                    existing["wikidata_id"] = item["wikidata_id"]

    accepted_candidate_categories = {"human", "object"}
    safe_candidates = sum(1 for item in candidates.values() if item.get("category_candidate") in accepted_candidate_categories)
    location_review = sum(1 for item in candidates.values() if item.get("category_candidate") == "location-review")

    OUTPUT.write_text(
        json.dumps(
            {
                "source": "ELNER-DZ",
                "source_url": "https://huggingface.co/datasets/HadjerHaninebgt7878/ELNER-DZ",
                "license": "CC BY 4.0",
                "status": "linked-candidate-only",
                "rows": len(rows),
                "unique_candidates": len(candidates),
                "safe_category_candidates": safe_candidates,
                "location_review_candidates": location_review,
                "label_counts": label_counts,
                "skipped_non_arabic": skipped_non_arabic,
                "entries": dict(sorted(candidates.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"ELNER-DZ rows: {len(rows):,}")
    print(f"Unique Arabic entity candidates: {len(candidates):,}")
    print(f"Safe human/object candidates: {safe_candidates:,}")
    print(f"Location review candidates: {location_review:,}")
    print(f"Skipped non-Arabic/non-lexical forms: {skipped_non_arabic:,}")
    print(f"Done: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
