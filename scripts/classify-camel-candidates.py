from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAMEL_DB = ROOT / "data" / "camel-raw" / "candidates.sqlite"
AWN_EXPANDED = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"
OMW_GAME = ROOT / "data" / "omw" / "game-index.json"
ELNER = ROOT / "data" / "elner-dz" / "candidates.json"
MASTER = ROOT / "data" / "validation" / "review-master-index.json"
OUT = ROOT / "data" / "camel-raw" / "semantic-candidates.sqlite"

CATEGORIES = {"human", "animal", "plant", "object", "country"}


def normalize(value: str) -> str:
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", str(value))
    value = value.strip().lower()
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def load_category_map(path: Path, value_key: str = "category") -> dict[str, tuple[str, str]]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw = payload.get("entries", {})
    result: dict[str, tuple[str, str]] = {}
    values = raw.values() if isinstance(raw, dict) else raw
    for item in values:
        if not isinstance(item, dict):
            continue
        word = item.get("word")
        category = item.get(value_key)
        if not word or category not in CATEGORIES:
            continue
        result[normalize(word)] = (category, path.name)
    return result


def load_elner() -> dict[str, tuple[str, str]]:
    if not ELNER.exists():
        return {}
    payload = json.loads(ELNER.read_text(encoding="utf-8"))
    raw = payload.get("entries", {})
    values = raw.values() if isinstance(raw, dict) else raw
    result: dict[str, tuple[str, str]] = {}
    for item in values:
        if not isinstance(item, dict):
            continue
        word = item.get("word")
        category = item.get("category_candidate")
        if not word or category not in CATEGORIES:
            continue
        result[normalize(word)] = (category, "elner-dz")
    return result


def load_master() -> set[str]:
    if not MASTER.exists():
        return set()
    payload = json.loads(MASTER.read_text(encoding="utf-8"))
    raw = payload.get("entries", {})
    return {normalize(word) for word in raw.keys()} if isinstance(raw, dict) else set()


def main() -> int:
    if not CAMEL_DB.exists():
        raise SystemExit("Missing CAMeL candidate DB. Run: npm run validation:camelfreq")

    evidence: dict[str, list[tuple[str, str]]] = {}
    sources = [
        load_category_map(AWN_EXPANDED),
        load_category_map(OMW_GAME),
        load_elner(),
    ]
    for mapping in sources:
        for word, item in mapping.items():
            evidence.setdefault(word, []).append(item)

    approved = load_master()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    conn = sqlite3.connect(OUT)
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute(
        "CREATE TABLE candidates (word TEXT PRIMARY KEY, category TEXT NOT NULL, confidence REAL NOT NULL, evidence TEXT NOT NULL, tier TEXT NOT NULL)"
    )

    scanned = 0
    new_with_evidence = 0
    single_source = 0
    multi_source = 0
    conflicts = 0
    skipped_approved = 0
    counts = {category: 0 for category in CATEGORIES}
    batch: list[tuple[str, str, float, str, str]] = []

    connection = sqlite3.connect(CAMEL_DB)
    try:
        cursor = connection.execute("SELECT word FROM candidates ORDER BY rowid")
        for (raw_word,) in cursor:
            scanned += 1
            word = normalize(raw_word)
            if not word:
                continue
            if word in approved:
                skipped_approved += 1
                continue
            matches = evidence.get(word, [])
            if not matches:
                continue
            categories = {category for category, _source in matches}
            if len(categories) != 1:
                conflicts += 1
                continue
            category = next(iter(categories))
            source_names = sorted({source for _category, source in matches})
            confidence = 0.84 if len(source_names) == 1 else 0.93
            tier = "linked-candidate" if len(source_names) == 1 else "multi-source-candidate"
            if len(source_names) == 1:
                single_source += 1
            else:
                multi_source += 1
            counts[category] += 1
            new_with_evidence += 1
            batch.append((word, category, confidence, ",".join(source_names), tier))
            if len(batch) >= 5000:
                conn.executemany("INSERT OR IGNORE INTO candidates(word, category, confidence, evidence, tier) VALUES (?, ?, ?, ?, ?)", batch)
                conn.commit()
                batch.clear()
    finally:
        connection.close()

    if batch:
        conn.executemany("INSERT OR IGNORE INTO candidates(word, category, confidence, evidence, tier) VALUES (?, ?, ?, ?, ?)", batch)
    conn.execute("CREATE INDEX idx_candidates_category ON candidates(category)")
    conn.execute("CREATE INDEX idx_candidates_tier ON candidates(tier)")
    conn.commit()
    stored = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
    conn.close()

    print(f"CAMeL candidates scanned: {scanned:,}")
    print(f"Already in GAME master: {skipped_approved:,}")
    print(f"New candidates with semantic evidence: {new_with_evidence:,}")
    print(f"  single-source: {single_source:,}")
    print(f"  multi-source:  {multi_source:,}")
    print(f"  evidence conflicts: {conflicts:,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  {category:8s}: {counts[category]:,}")
    print(f"Stored semantic candidates: {stored:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
