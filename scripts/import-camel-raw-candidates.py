from __future__ import annotations

import re
import sqlite3
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "camel-raw"
RAW = DATA_DIR / "words.txt"
DB = DATA_DIR / "candidates.sqlite"
URL = "https://huggingface.co/datasets/ImruQays/16-million-raw-arabic-words/resolve/main/words.txt"


def normalize(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]", "", value)
    value = re.sub(r"[إأآٱ]", "ا", value)
    value = value.replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    return value


def is_clean_arabic(value: str) -> bool:
    return len(value) >= 2 and all("\u0600" <= ch <= "\u06FF" for ch in value)


def download() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if RAW.exists():
        return
    print(f"Downloading CAMeL/raw Arabic words from {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": "GAME-validation/0.5"})
    with urllib.request.urlopen(request, timeout=300) as response, RAW.open("wb") as out:
        while True:
            chunk = response.read(4 * 1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def build_db() -> tuple[int, int]:
    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()

    conn = sqlite3.connect(DB)
    try:
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute(
            "CREATE TABLE candidates (word TEXT PRIMARY KEY, source TEXT NOT NULL, tier TEXT NOT NULL)"
        )

        batch: list[tuple[str, str, str]] = []
        total_lines = 0
        accepted = 0

        with RAW.open("r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                total_lines += 1
                word = normalize(line)
                if not is_clean_arabic(word):
                    continue
                batch.append((word, "ImruQays/16-million-raw-arabic-words", "broad-candidate"))
                accepted += 1
                if len(batch) >= 20_000:
                    conn.executemany(
                        "INSERT OR IGNORE INTO candidates(word, source, tier) VALUES (?, ?, ?)",
                        batch,
                    )
                    batch.clear()

        if batch:
            conn.executemany(
                "INSERT OR IGNORE INTO candidates(word, source, tier) VALUES (?, ?, ?)",
                batch,
            )

        conn.execute("CREATE INDEX idx_candidates_word ON candidates(word)")
        conn.commit()
        unique_count = conn.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
        return total_lines, int(unique_count)
    finally:
        conn.close()


def main() -> int:
    download()
    lines, unique_count = build_db()
    print(f"Raw lines processed: {lines:,}")
    print(f"Unique clean Arabic candidates: {unique_count:,}")
    print("This dataset is candidate-only and is NOT auto-approved for GAME categories.")
    print(f"Done: {DB}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
