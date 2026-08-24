from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "validation" / "master-index.json"
ELNER = ROOT / "data" / "elner-dz" / "candidates.json"
OUT = ROOT / "data" / "validation" / "elner-master-index.json"

CATEGORIES = {"human", "animal", "plant", "object", "country"}


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def main() -> int:
    if not MASTER.exists():
        raise SystemExit("Missing master index. Run: npm run validation:merge")
    if not ELNER.exists():
        raise SystemExit("Missing ELNER candidates. Run: npm run validation:elner")

    master = json.loads(MASTER.read_text(encoding="utf-8"))
    entries = dict(master.get("entries", {}))
    payload = json.loads(ELNER.read_text(encoding="utf-8"))

    candidates = payload.get("safe_candidates", payload.get("entries", []))
    added = 0
    duplicates = 0
    conflicts = 0
    counts = {category: 0 for category in CATEGORIES}

    for item in candidates:
        word = item.get("word") if isinstance(item, dict) else None
        category = item.get("category") if isinstance(item, dict) else None
        if not word or category not in CATEGORIES:
            continue
        normalized = normalize(str(word))
        if not normalized:
            continue

        if normalized in entries:
            existing = entries[normalized]
            if existing.get("category") == category:
                sources = existing.setdefault("sources", [])
                if "elner-dz" not in sources:
                    sources.append("elner-dz")
                existing["confidence"] = min(0.99, max(float(existing.get("confidence", 0.8)), 0.78) + 0.02)
                duplicates += 1
            else:
                conflicts += 1
            continue

        entries[normalized] = {
            "word": normalized,
            "category": category,
            "confidence": float(item.get("confidence", 0.78)),
            "sources": ["elner-dz"],
            "tier": "linked-candidate",
        }
        added += 1
        counts[category] += 1

    counts_total = {
        category: sum(1 for item in entries.values() if item.get("category") == category)
        for category in CATEGORIES
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 1,
                "sources": ["master-index", "elner-dz"],
                "accepted_entries": master.get("accepted_entries", len(entries)),
                "linked_candidate_entries": len(entries) - int(master.get("accepted_entries", len(entries))),
                "elner_added": added,
                "elner_duplicates": duplicates,
                "elner_conflicts": conflicts,
                "counts": counts_total,
                "entries": dict(sorted(entries.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Master entries retained: {master.get('accepted_entries', 0):,}")
    print(f"ELNER new linked candidates: {added:,}")
    print(f"ELNER duplicates/merged: {duplicates:,}")
    print(f"ELNER category conflicts: {conflicts:,}")
    print(f"Combined entries: {len(entries):,}")
    for category, count in counts_total.items():
        print(f"  {category:8s}: {count:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
