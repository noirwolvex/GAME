from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AWN = ROOT / "data" / "arabic-wordnet" / "game-index.json"
AWN_EXPANDED = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"
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


def add_approved(merged: dict[str, dict[str, object]], word: str, item: dict[str, object], source: str) -> None:
    normalized = normalize(word)
    category = item.get("category")
    if not normalized or category not in CATEGORIES:
        return
    confidence = float(item.get("confidence", 0.8))
    existing = merged.get(normalized)
    if existing is None:
        merged[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": confidence,
            "tier": "approved",
            "sources": [source],
        }
        return
    if source not in existing["sources"]:
        existing["sources"].append(source)
    if existing["category"] == category:
        existing["confidence"] = min(0.99, max(float(existing["confidence"]), confidence) + 0.01)


def add_candidate(candidates: dict[str, dict[str, object]], word: str, item: dict[str, object], source: str) -> None:
    normalized = normalize(word)
    category = item.get("category")
    if not normalized or category not in CATEGORIES:
        return
    confidence = float(item.get("confidence", 0.72))
    existing = candidates.get(normalized)
    if existing is None:
        candidates[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": confidence,
            "tier": "verified-candidate",
            "sources": [source],
        }
        return
    if source not in existing["sources"]:
        existing["sources"].append(source)
    if existing["category"] == category:
        existing["confidence"] = max(float(existing["confidence"]), confidence)


def main() -> int:
    if not AWN.exists():
        raise SystemExit("Missing Arabic WordNet GAME index. Run: npm run validation:awn:classify")
    if not OMW.exists():
        raise SystemExit("Missing OMW Arabic index. Run: npm run validation:omw")
    if not OMW_GAME.exists():
        raise SystemExit("Missing OMW GAME index. Run: npm run validation:omw:classify")

    awn = json.loads(AWN.read_text(encoding="utf-8")).get("entries", {})
    awn_expanded = json.loads(AWN_EXPANDED.read_text(encoding="utf-8")).get("entries", {}) if AWN_EXPANDED.exists() else {}
    omw = json.loads(OMW.read_text(encoding="utf-8")).get("entries", {})
    omw_game = json.loads(OMW_GAME.read_text(encoding="utf-8")).get("entries", {})

    merged: dict[str, dict[str, object]] = {}
    candidates: dict[str, dict[str, object]] = {}
    omw_unclassified = 0
    omw_duplicates = 0
    omw_classified_new = 0
    omw_classified_conflicts = 0
    expanded_new = 0

    for word, item in awn.items():
        add_approved(merged, word, item, "arabic-wordnet")

    for word, item in awn_expanded.items():
        normalized = normalize(word)
        if not normalized or normalized in merged:
            continue
        add_candidate(candidates, word, item, "arabic-wordnet-expanded")
        expanded_new += 1

    for word, item in omw.items():
        normalized = normalize(word)
        if not normalized:
            continue
        if normalized in merged:
            merged[normalized]["sources"].append("omw-arb-2.0")
            merged[normalized]["confidence"] = min(0.99, max(float(merged[normalized]["confidence"]), 0.84) + 0.03)
            omw_duplicates += 1
        elif normalized not in omw_game:
            omw_unclassified += 1

    for word, item in omw_game.items():
        normalized = normalize(word)
        category = item.get("category")
        if not normalized or category not in CATEGORIES:
            continue
        if normalized in merged:
            if merged[normalized]["category"] != category:
                omw_classified_conflicts += 1
                continue
            merged[normalized]["sources"].append("omw-arb-2.0")
            merged[normalized]["confidence"] = min(0.99, max(float(merged[normalized]["confidence"]), float(item.get("confidence", 0.84))) + 0.02)
            continue
        add_approved(merged, word, item, "omw-arb-2.0")
        merged[normalized]["tier"] = "approved"
        omw_classified_new += 1
        candidates.pop(normalized, None)

    all_entries = {**merged, **candidates}
    counts = {category: sum(1 for item in merged.values() if item["category"] == category) for category in CATEGORIES}
    candidate_counts = {category: sum(1 for item in candidates.values() if item["category"] == category) for category in CATEGORIES}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 3,
                "sources": ["arabic-wordnet", "arabic-wordnet-expanded", "omw-arb-2.0"],
                "accepted_entries": len(merged),
                "candidate_entries": len(candidates),
                "total_index_entries": len(all_entries),
                "counts": counts,
                "candidate_counts": candidate_counts,
                "expanded_candidates_new": expanded_new,
                "omw_duplicates": omw_duplicates,
                "omw_classified_new": omw_classified_new,
                "omw_classified_conflicts": omw_classified_conflicts,
                "omw_unclassified": omw_unclassified,
                "entries": dict(sorted(all_entries.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Accepted master entries: {len(merged):,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  {category}: {counts[category]:,}")
    print(f"AWN expanded verified-candidates: {len(candidates):,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  candidate {category}: {candidate_counts[category]:,}")
    print(f"Total validation index entries: {len(all_entries):,}")
    print(f"OMW classified new: {omw_classified_new:,}")
    print(f"OMW duplicates/merged: {omw_duplicates:,}")
    print(f"OMW classification conflicts: {omw_classified_conflicts:,}")
    print(f"OMW unclassified review candidates: {omw_unclassified:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
