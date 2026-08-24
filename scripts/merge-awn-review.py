from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data" / "validation" / "elner-master-index.json"
REVIEW = ROOT / "data" / "arabic-wordnet" / "review-game-index.json"
OUT = ROOT / "data" / "validation" / "review-master-index.json"

CATEGORIES = {"human", "animal", "plant", "object", "country"}


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def main() -> int:
    if not BASE.exists():
        raise SystemExit("Missing ELNER master index. Run: npm run validation:merge-elner")
    if not REVIEW.exists():
        raise SystemExit("Missing AWN review index. Run: npm run validation:awn:review")

    base = json.loads(BASE.read_text(encoding="utf-8"))
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = dict(base.get("entries", {}))

    added = 0
    duplicates = 0
    conflicts = 0
    counts = {category: 0 for category in CATEGORIES}

    for word, item in review.get("entries", {}).items():
        normalized = normalize(str(word))
        category = item.get("category")
        if not normalized or category not in CATEGORIES:
            continue

        if normalized in entries:
            existing = entries[normalized]
            if existing.get("category") == category:
                sources = existing.setdefault("sources", [])
                if "arabic-wordnet-review" not in sources:
                    sources.append("arabic-wordnet-review")
                existing["confidence"] = min(
                    0.99,
                    max(float(existing.get("confidence", 0.8)), float(item.get("confidence", 0.75))) + 0.01,
                )
                duplicates += 1
            else:
                conflicts += 1
            continue

        entries[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": float(item.get("confidence", 0.75)),
            "sources": ["arabic-wordnet-review"],
            "tier": "second-pass-candidate",
        }
        added += 1
        counts[category] += 1

    totals = {
        category: sum(1 for item in entries.values() if item.get("category") == category)
        for category in CATEGORIES
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 1,
                "sources": ["review-master-index", "arabic-wordnet-review"],
                "base_entries": len(base.get("entries", {})),
                "awn_review_added": added,
                "awn_review_duplicates": duplicates,
                "awn_review_conflicts": conflicts,
                "counts": totals,
                "entries": dict(sorted(entries.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Base entries retained: {len(base.get('entries', {})):,}")
    print(f"AWN review new candidates: {added:,}")
    print(f"AWN review duplicates/merged: {duplicates:,}")
    print(f"AWN review conflicts: {conflicts:,}")
    print(f"Combined review index entries: {len(entries):,}")
    for category, count in totals.items():
        print(f"  {category:8s}: {count:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
