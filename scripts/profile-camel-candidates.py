from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAMEL_DB = ROOT / "data" / "camel-raw" / "candidates.sqlite"
MASTER = ROOT / "data" / "validation" / "review-master-index.json"
OUT = ROOT / "data" / "camel-raw" / "candidate-profile.json"


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return re.sub(r"\s+", " ", value)


def main() -> int:
    if not CAMEL_DB.exists():
        raise SystemExit("Missing CAMeL candidate DB. Run: npm run validation:camelfreq")
    if not MASTER.exists():
        raise SystemExit("Missing GAME master index. Run: npm run validation:build-index")

    master = json.loads(MASTER.read_text(encoding="utf-8"))
    known = {
        normalize(str(word)): item.get("category")
        for word, item in master.get("entries", {}).items()
        if item.get("category")
    }

    connection = sqlite3.connect(CAMEL_DB)
    try:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "candidates" not in tables:
            raise SystemExit(
                "Invalid CAMeL candidate DB: expected table 'candidates'. "
                "Rebuild with: npm run validation:camelfreq"
            )

        total = connection.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        exact = 0
        unseen = 0
        short = 0
        very_long = 0
        lengths: dict[int, int] = {}
        unseen_by_initial: dict[str, int] = {}

        cursor = connection.execute("SELECT word FROM candidates ORDER BY rowid")
        for (word,) in cursor:
            normalized = normalize(str(word))
            if len(normalized) < 2:
                short += 1
                continue
            if len(normalized) >= 12:
                very_long += 1
            lengths[len(normalized)] = lengths.get(len(normalized), 0) + 1
            if normalized in known:
                exact += 1
            else:
                unseen += 1
                initial = normalized[0]
                unseen_by_initial[initial] = unseen_by_initial.get(initial, 0) + 1
    finally:
        connection.close()

    profile = {
        "source": "ImruQays/16-million-raw-arabic-words",
        "candidate_words": int(total),
        "matched_existing_game": exact,
        "unseen_candidates": unseen,
        "short_forms": short,
        "very_long_forms_12_plus_chars": very_long,
        "length_histogram": {str(k): v for k, v in sorted(lengths.items())},
        "unseen_by_initial": dict(sorted(unseen_by_initial.items())),
        "status": "profiled-only",
        "next_step": "semantic classification requires external lexical/ontology evidence; do not auto-approve unseen candidates",
    }
    OUT.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CAMeL candidate words profiled: {total:,}")
    print(f"Already matched GAME index: {exact:,}")
    print(f"New unseen candidates: {unseen:,}")
    print(f"Short forms (<2 chars): {short:,}")
    print(f"Very long forms (12+ chars): {very_long:,}")
    print(f"Done: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
