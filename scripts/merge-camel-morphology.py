from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAMEL_DB = ROOT / "data" / "camel-raw" / "candidates.sqlite"
MASTER = ROOT / "data" / "validation" / "review-master-index.json"
AWN = ROOT / "data" / "arabic-wordnet" / "index.json"
AWN_EXPANDED = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"
OMW_GAME = ROOT / "data" / "omw" / "game-index.json"
ELNER = ROOT / "data" / "elner-dz" / "candidates.json"
OUT = ROOT / "data" / "validation" / "camel-master-index.json"
AFFIX_OUT = ROOT / "data" / "camel-raw" / "affix-candidates.sqlite"
CATEGORIES = {"human", "animal", "plant", "object", "country"}
PREFIXES = ("وال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ك", "ل")
SUFFIXES = ("يات", "ات", "ون", "ين", "ان", "ة", "ه", "ها", "هم", "هن", "كما", "كم", "نا", "ي")


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def load_categories(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, str] = {}
    for word, item in payload.get("entries", {}).items():
        if isinstance(item, dict) and item.get("category") in CATEGORIES:
            result[normalize(str(word))] = str(item["category"])
    return result


def load_sources() -> tuple[dict[str, set[str]], dict[str, dict[str, str]]]:
    source_map: dict[str, set[str]] = {}
    category_by_source: dict[str, dict[str, str]] = {}
    for name, path in (("arabic-wordnet", AWN), ("arabic-wordnet-expanded", AWN_EXPANDED), ("omw", OMW_GAME)):
        categories = load_categories(path)
        category_by_source[name] = categories
        for word in categories:
            source_map.setdefault(word, set()).add(name)
    if ELNER.exists():
        elner_categories: dict[str, str] = {}
        payload = json.loads(ELNER.read_text(encoding="utf-8"))
        raw_entries = payload.get("entries", {})
        values = raw_entries.values() if isinstance(raw_entries, dict) else raw_entries
        for item in values:
            if not isinstance(item, dict):
                continue
            category = item.get("category_candidate")
            word = item.get("word")
            if category in CATEGORIES and word:
                normalized = normalize(str(word))
                elner_categories[normalized] = str(category)
                source_map.setdefault(normalized, set()).add("elner")
        category_by_source["elner"] = elner_categories
    return source_map, category_by_source


def strip_affixes(word: str) -> set[str]:
    variants = {word}
    changed = True
    while changed:
        changed = False
        for current in list(variants):
            for prefix in PREFIXES:
                if current.startswith(prefix) and len(current) - len(prefix) >= 3:
                    candidate = current[len(prefix):]
                    if candidate not in variants:
                        variants.add(candidate)
                        changed = True
            for suffix in SUFFIXES:
                if current.endswith(suffix) and len(current) - len(suffix) >= 3:
                    candidate = current[:-len(suffix)]
                    if candidate not in variants:
                        variants.add(candidate)
                        changed = True
    return variants


def consensus_category(word: str, source_map: dict[str, set[str]], category_by_source: dict[str, dict[str, str]]) -> tuple[str | None, int]:
    categories: set[str] = set()
    for source in source_map.get(word, set()):
        category = category_by_source.get(source, {}).get(word)
        if category in CATEGORIES:
            categories.add(category)
    if len(categories) == 1:
        return next(iter(categories)), len(source_map.get(word, set()))
    return None, len(categories)


def main() -> int:
    for path in (CAMEL_DB, MASTER, AWN, OMW_GAME):
        if not path.exists():
            raise SystemExit(f"Missing {path}")

    master = json.loads(MASTER.read_text(encoding="utf-8"))
    entries = dict(master.get("entries", {}))
    source_map, category_by_source = load_sources()

    direct_added = 0
    direct_duplicates = 0
    conflicts = 0
    affix_candidates = 0

    conn = sqlite3.connect(CAMEL_DB)
    affix_db = sqlite3.connect(AFFIX_OUT)
    try:
        affix_db.execute("DROP TABLE IF EXISTS candidates")
        affix_db.execute(
            "CREATE TABLE candidates(word TEXT PRIMARY KEY, base_word TEXT NOT NULL, category TEXT NOT NULL, evidence_sources TEXT NOT NULL, confidence REAL NOT NULL)"
        )

        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        table = "candidates" if "candidates" in tables else "words" if "words" in tables else None
        if table is None:
            raise SystemExit("Invalid CAMeL DB: expected candidates/words table")

        for (raw_word,) in conn.execute(f"SELECT word FROM {table} ORDER BY rowid"):
            word = normalize(str(raw_word))
            category, source_count = consensus_category(word, source_map, category_by_source)
            if category is not None:
                if word in entries:
                    direct_duplicates += 1
                else:
                    entries[word] = {
                        "word": word,
                        "category": category,
                        "confidence": 0.93 if source_count >= 2 else 0.89,
                        "sources": sorted(source_map.get(word, set())),
                        "tier": "approved",
                    }
                    direct_added += 1
                continue

            if word in source_map:
                conflicts += 1
                continue

            matched = None
            matched_base = None
            for variant in strip_affixes(word):
                if variant == word:
                    continue
                base_category, _ = consensus_category(variant, source_map, category_by_source)
                if base_category is not None:
                    matched = base_category
                    matched_base = variant
                    break
            if matched:
                affix_candidates += 1
                sources = sorted(source_map.get(matched_base, set()))
                confidence = 0.74 if len(sources) >= 2 else 0.70
                affix_db.execute(
                    "INSERT OR REPLACE INTO candidates(word, base_word, category, evidence_sources, confidence) VALUES (?, ?, ?, ?, ?)",
                    (word, matched_base, matched, ",".join(sources), confidence),
                )

        affix_db.commit()
        affix_db.execute("CREATE INDEX IF NOT EXISTS idx_category ON candidates(category)")
        affix_db.execute("CREATE INDEX IF NOT EXISTS idx_base_word ON candidates(base_word)")
        affix_db.commit()
    finally:
        conn.close()
        affix_db.close()

    counts = {category: sum(1 for item in entries.values() if item.get("category") == category) for category in CATEGORIES}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": 1,
                "base": str(MASTER.relative_to(ROOT)),
                "direct_lexical_additions": direct_added,
                "direct_duplicates": direct_duplicates,
                "direct_category_conflicts": conflicts,
                "affix_candidate_count": affix_candidates,
                "counts": counts,
                "entries": dict(sorted(entries.items())),
                "affix_candidates_db": str(AFFIX_OUT.relative_to(ROOT)),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"Base master entries: {len(master.get('entries', {})):,}")
    print(f"CAMeL direct lexical additions: {direct_added:,}")
    print(f"CAMeL direct duplicates: {direct_duplicates:,}")
    print(f"CAMeL direct category conflicts: {conflicts:,}")
    print(f"CAMeL affix-derived candidates stored: {affix_candidates:,}")
    print(f"Combined approved index entries: {len(entries):,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  {category:8s}: {counts[category]:,}")
    print(f"Done: {OUT}")
    print(f"Affix candidates DB: {AFFIX_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
