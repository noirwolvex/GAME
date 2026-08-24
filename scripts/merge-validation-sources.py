from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AWN = ROOT / "data" / "arabic-wordnet" / "game-index.json"
OMW = ROOT / "data" / "omw" / "arabic.json"
OMW_GAME = ROOT / "data" / "omw" / "game-index.json"
OUT = ROOT / "data" / "validation" / "master-index.json"

CATEGORIES = {"human", "animal", "plant", "object", "country"}


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def main() -> int:
    if not AWN.exists():
        raise SystemExit("Missing Arabic WordNet GAME index. Run: npm run validation:awn:classify")
    if not OMW.exists():
        raise SystemExit("Missing OMW Arabic index. Run: npm run validation:omw")
    if not OMW_GAME.exists():
        raise SystemExit("Missing OMW GAME index. Run: npm run validation:omw:classify")

    awn = json.loads(AWN.read_text(encoding="utf-8")).get("entries", {})
    omw = json.loads(OMW.read_text(encoding="utf-8")).get("entries", {})
    omw_game = json.loads(OMW_GAME.read_text(encoding="utf-8")).get("entries", {})

    merged: dict[str, dict[str, object]] = {}
    omw_unclassified = 0
    omw_duplicates = 0
    omw_classified_new = 0
    omw_classified_conflicts = 0

    for word, item in awn.items():
        normalized = normalize(word)
        category = item.get("category")
        if not normalized or category not in CATEGORIES:
            continue
        merged[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": float(item.get("confidence", 0.8)),
            "sources": ["arabic-wordnet"],
        }

    for word, item in omw.items():
        normalized = normalize(word)
        if not normalized:
            continue
        if normalized in merged:
            merged[normalized]["sources"].append("omw-arb-2.0")
            merged[normalized]["confidence"] = min(
                0.99,
                max(float(merged[normalized]["confidence"]), 0.84) + 0.03,
            )
            omw_duplicates += 1
        elif normalized not in omw_game:
            omw_unclassified += 1

    for word, item in omw_game.items():
        normalized = normalize(word)
        category = item.get("category")
        if not normalized or category not in CATEGORIES:
            continue

        if normalized in merged:
            existing_category = merged[normalized]["category"]
            if existing_category != category:
                # Keep the higher-confidence AWN classification; never silently
                # replace an existing category with a conflicting one.
                omw_classified_conflicts += 1
                continue
            merged[normalized]["sources"].append("omw-arb-2.0")
            merged[normalized]["confidence"] = min(
                0.99,
                max(float(merged[normalized]["confidence"]), float(item.get("confidence", 0.84))) + 0.03,
            )
            if "omw-arb-2.0" not in merged[normalized]["sources"][:-1]:
                omw_duplicates += 1
            continue

        merged[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": min(0.95, float(item.get("confidence", 0.84))),
            "sources": ["omw-arb-2.0"],
        }
        omw_classified_new += 1

    counts = {category: sum(1 for item in merged.values() if item["category"] == category) for category in CATEGORIES}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 2,
                "sources": ["arabic-wordnet", "omw-arb-2.0"],
                "accepted_entries": len(merged),
                "counts": counts,
                "omw_duplicates": omw_duplicates,
                "omw_classified_new": omw_classified_new,
                "omw_classified_conflicts": omw_classified_conflicts,
                "omw_unclassified": omw_unclassified,
                "entries": dict(sorted(merged.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Accepted master entries: {len(merged):,}")
    print("  human:", counts["human"])
    print("  animal:", counts["animal"])
    print("  plant:", counts["plant"])
    print("  object:", counts["object"])
    print("  country:", counts["country"])
    print(f"OMW classified new: {omw_classified_new:,}")
    print(f"OMW duplicates/merged: {omw_duplicates:,}")
    print(f"OMW classification conflicts: {omw_classified_conflicts:,}")
    print(f"OMW unclassified review candidates: {omw_unclassified:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
