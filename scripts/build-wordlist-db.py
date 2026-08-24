from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data" / "arabic-wordlist" / "index.json"
DB = ROOT / "data" / "arabic-wordlist" / "candidates.sqlite"

BATCH = 10_000


def main() -> int:
    if not INDEX.exists():
        raise SystemExit("Missing broad Arabic word index. Run: npm run validation:wordlist")

    payload = json.loads(INDEX.read_text(encoding="utf-8"))
    words = payload.get("entries", [])
    if not isinstance(words, list):
        raise SystemExit("Invalid wordlist index: entries must be a list")

    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()

    conn = sqlite3.connect(DB)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("CREATE TABLE words (word TEXT PRIMARY KEY, source TEXT NOT NULL, status TEXT NOT NULL)")
        conn.execute("CREATE INDEX idx_words_status ON words(status)")

        rows = ((str(word), payload.get("source", "arabic-wordlist"), "broad-candidate") for word in words)
        while True:
            batch = []
            for _ in range(BATCH):
                try:
                    batch.append(next(rows))
                except StopIteration:
                    break
            if not batch:
                break
            conn.executemany("INSERT OR IGNORE INTO words(word, source, status) VALUES (?, ?, ?)", batch)
            conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        conn.execute("VACUUM")
        print(f"Built Arabic candidate DB: {count:,} words")
        print(f"Done: {DB}")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
