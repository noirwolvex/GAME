from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAMEL_DB = ROOT / "data" / "camel-raw" / "candidates.sqlite"
AWN = ROOT / "data" / "arabic-wordnet" / "index.json"
AWN_EXPANDED = ROOT / "data" / "arabic-wordnet" / "expanded-game-index.json"
OMW_GAME = ROOT / "data" / "omw" / "game-index.json"
ELNER = ROOT / "data" / "elner-dz" / "candidates.json"
OUT = ROOT / "data" / "camel-raw" / "morphology-profile.json"

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
    entries = payload.get("entries", {})
    return {
        normalize(str(word)): str(item.get("category"))
        for word, item in entries.items()
        if isinstance(item, dict) and item.get("category") in CATEGORIES
    }


def add_entries(target: dict[str, str], path: Path) -> None:
    target.update(load_categories(path))


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


def main() -> int:
    if not CAMEL_DB.exists():
        raise SystemExit("Missing CAMeL candidate DB. Run: npm run validation:camelfreq")

    evidence: dict[str, str] = {}
    add_entries(evidence, AWN)
    add_entries(evidence, AWN_EXPANDED)
    add_entries(evidence, OMW_GAME)
    if ELNER.exists():
        payload = json.loads(ELNER.read_text(encoding="utf-8"))
        for item in payload.get("entries", {}).values():
            if not isinstance(item, dict):
                continue
            category = item.get("category_candidate")
            word = item.get("word")
            if category in CATEGORIES and word:
                evidence[normalize(str(word))] = category

    conn = sqlite3.connect(CAMEL_DB)
    try:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        table = "candidates" if "candidates" in tables else "words" if "words" in tables else None
        if table is None:
            raise SystemExit("Invalid CAMeL DB: expected candidates/words table")

        total = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        lemma_hits = 0
        affix_hits = 0
        conflicts = 0
        morph_review = 0
        by_category = {category: 0 for category in CATEGORIES}
        samples: list[dict[str, str]] = []

        for (raw_word,) in conn.execute(f"SELECT word FROM {table} ORDER BY rowid"):
            word = normalize(str(raw_word))
            matched = evidence.get(word)
            match_type = "lemma"
            if matched is None:
                for variant in strip_affixes(word):
                    if variant == word:
                        continue
                    category = evidence.get(variant)
                    if category:
                        matched = category
                        match_type = "affix"
                        break
            if matched in CATEGORIES:
                if match_type == "lemma":
                    lemma_hits += 1
                else:
                    affix_hits += 1
                by_category[matched] += 1
                if len(samples) < 100 and match_type == "affix":
                    samples.append({"word": word, "base": variant, "category": matched})
            else:
                morph_review += 1

        profile = {
            "source": "ImruQays/16-million-raw-arabic-words",
            "candidate_words": int(total),
            "direct_lemma_evidence": lemma_hits,
            "affix_variant_evidence": affix_hits,
            "morphology_review": morph_review,
            "evidence_conflicts": conflicts,
            "category_counts": by_category,
            "sample_affix_matches": samples,
            "status": "analysis-only",
            "note": "Affix stripping is a heuristic candidate generator; it is not auto-approval.",
        }
    finally:
        conn.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CAMeL candidates analyzed: {total:,}")
    print(f"Direct lemma evidence: {lemma_hits:,}")
    print(f"Affix-derived evidence: {affix_hits:,}")
    print(f"Remaining morphology review: {morph_review:,}")
    for category in ("human", "animal", "plant", "object", "country"):
        print(f"  {category:8s}: {by_category[category]:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
