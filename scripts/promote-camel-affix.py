from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data" / "validation" / "review-master-index.json"
AFFIX_DB = ROOT / "data" / "camel-raw" / "affix-candidates.sqlite"
OUT = ROOT / "data" / "validation" / "camel-promoted-index.json"

CATEGORIES = {"human", "animal", "plant", "object", "country"}


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def main() -> int:
    if not BASE.exists():
        raise SystemExit("Missing review master index. Run: npm run validation:merge-review")
    if not AFFIX_DB.exists():
        raise SystemExit("Missing affix candidates. Run: npm run validation:camelfreq:merge")

    payload = json.loads(BASE.read_text(encoding="utf-8"))
    entries = dict(payload.get("entries", {}))

    promoted = 0
    duplicates = 0
    rejected = 0
    counts = {category: 0 for category in CATEGORIES}

    conn = sqlite3.connect(AFFIX_DB)
    try:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "candidates" not in tables:
            raise SystemExit("Invalid affix candidate DB: missing candidates table")

        for word, base_word, category, evidence_sources, confidence in conn.execute(
            "SELECT word, base_word, category, evidence_sources, confidence FROM candidates ORDER BY rowid"
        ):
            if category not in CATEGORIES:
                rejected += 1
                continue
            sources = [s for s in str(evidence_sources).split(",") if s]
            # Promote only when the base lemma has evidence from >=2 independent lexical sources.
            # Single-source affix matches remain review-only to avoid false positives.
            if len(set(sources)) < 2 or float(confidence) < 0.74:
                rejected += 1
                continue

            normalized = normalize(str(word))
            if not normalized:
                rejected += 1
                continue
            if normalized in entries:
                duplicates += 1
                continue

            entries[normalized] = {
                "word": normalized,
                "category": category,
                "confidence": min(0.90, float(confidence) + 0.08),
                "sources": sorted(set(sources + ["camel-affix"])) ,
                "base_word": normalize(str(base_word)),
                "tier": "verified-candidate",
            }
            promoted += 1
            counts[category] += 1
    finally:
        conn.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 1,
                "base": str(BASE.relative_to(ROOT)),
                "promoted_from_camel_affix": promoted,
                "duplicates": duplicates,
                "rejected_single_source_or_low_confidence": rejected,
                "counts": counts,
                "entries": dict(sorted(entries.items())),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Base entries retained: {len(payload.get('entries', {})):,}")
    print(f"CAMeL affix candidates promoted: {promoted:,}")
    print(f"CAMeL affix duplicates: {duplicates:,}")
    print(f"CAMeL affix rejected/review-only: {rejected:,}")
    print(f"Combined verified-candidate index entries: {len(entries):,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  {category:8s}: {counts[category]:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
